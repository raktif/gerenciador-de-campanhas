import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { campaignSchema, type Campaign } from '../../src/core/contracts/campaigns';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import { AttachmentRepository } from '../../src/db/repositories/attachment-repository';
import { CampaignRepository } from '../../src/db/repositories/campaign-repository';
import { ImageImportService } from '../../src/main/services/image-import-service';
import { ImageProcessingService } from '../../src/main/services/image-processing-service';
import { TestLogger } from '../helpers/test-logger';

const roots: string[] = [];
const contexts: DatabaseContext[] = [];

afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('ingresso e persistência local de imagens', () => {
  it('importa arquivo do diálogo, publica WebP e não expõe caminhos', async () => {
    const fixture = await createFixture();
    const source = path.join(fixture.root, 'capa legítima.png');
    await writeFile(source, await sharp(createSvg(640, 360)).png().toBuffer());
    fixture.selectedPath.value = source;

    const result = await fixture.service.selectLocal({
      campaignId: fixture.first.id,
      revision: 1,
    });

    expect(result.status).toBe('imported');
    if (result.status !== 'imported') throw new Error('Importação inesperadamente incompleta.');
    expect(result.campaign).toMatchObject({ coverAttachmentId: result.attachment.id, revision: 2 });
    expect(result.attachment).toMatchObject({
      campaignId: fixture.first.id,
      originalFilename: 'capa legítima.png',
      mimeType: 'image/png',
      processedMimeType: 'image/webp',
      processingStatus: 'ready',
    });
    expect(JSON.stringify(result)).not.toMatch(
      /relativePath|storedFilename|sourceUrl|\\|attachments/iu,
    );

    const storedFilename = `${result.attachment.id}.webp`;
    expect(
      await readFile(path.join(fixture.directories.attachments, fixture.first.id, storedFilename)),
    ).not.toHaveLength(0);
    expect(
      await readFile(
        path.join(
          fixture.directories.thumbnails,
          fixture.first.id,
          `${result.attachment.id}-thumb.webp`,
        ),
      ),
    ).not.toHaveLength(0);
    expect(fixture.attachments.findById(fixture.second.id, result.attachment.id)).toBeNull();
  });

  it('importa bytes estritos e limpa publicação quando a revisão da campanha conflita', async () => {
    const fixture = await createFixture();
    const bytes = new Uint8Array(await sharp(createSvg(320, 200)).webp().toBuffer());
    const firstResult = await fixture.service.importBytes({
      campaignId: fixture.first.id,
      revision: 1,
      bytes,
      metadata: { originalFilename: 'clipboard.webp', sourceKind: 'clipboard' },
    });
    expect(firstResult.status).toBe('imported');
    const before = await allFiles(fixture.directories.attachments);

    await expect(
      fixture.service.importBytes({
        campaignId: fixture.first.id,
        revision: 1,
        bytes,
        metadata: { originalFilename: 'arrasto.webp', sourceKind: 'drag_drop' },
      }),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect(await allFiles(fixture.directories.attachments)).toEqual(before);
    expect(await allFiles(fixture.directories.temporary)).not.toContainEqual(
      expect.stringMatching(/\.webp$/u),
    );
  });

  it('isola consultas e muta status apenas com campanha e revisão corretas', async () => {
    const fixture = await createFixture();
    const bytes = new Uint8Array(await sharp(createSvg(200, 100)).jpeg().toBuffer());
    const result = await fixture.service.importBytes({
      campaignId: fixture.first.id,
      revision: 1,
      bytes,
      metadata: { originalFilename: 'capa.jpg', sourceKind: 'clipboard' },
    });
    if (result.status !== 'imported') throw new Error('Importação inesperadamente incompleta.');
    fixture.context.native
      .prepare('UPDATE campaigns SET cover_attachment_id = NULL WHERE id = ?')
      .run(fixture.first.id);

    expect(() =>
      fixture.attachments.updateProcessingStatus({
        campaignId: fixture.second.id,
        id: result.attachment.id,
        revision: 1,
        processingStatus: 'failed',
        updatedAt: '2026-10-27T13:00:00.000Z',
      }),
    ).toThrow(/anexo/iu);
    const updated = fixture.attachments.updateProcessingStatus({
      campaignId: fixture.first.id,
      id: result.attachment.id,
      revision: 1,
      processingStatus: 'failed',
      updatedAt: '2026-10-27T13:00:00.000Z',
    });
    expect(updated).toMatchObject({ processingStatus: 'failed', revision: 2 });
    expect(() =>
      fixture.attachments.updateProcessingStatus({
        campaignId: fixture.first.id,
        id: result.attachment.id,
        revision: 1,
        processingStatus: 'ready',
        updatedAt: '2026-10-27T14:00:00.000Z',
      }),
    ).toThrow(/alterado/iu);
  });

  it('persiste URL somente internamente após resize/crop e compensa conflito de revisão', async () => {
    const fixture = await createFixture();
    const bytes = new Uint8Array(await sharp(createSvg(1600, 1200)).png().toBuffer());
    const sourceUrl = 'https://images.example/mapas/capa.png?versao=1';
    const service = new ImageImportService({
      repository: fixture.attachments,
      processor: new ImageProcessingService(),
      downloader: {
        download: () =>
          Promise.resolve({
            bytes,
            contentType: 'image/png' as const,
            sourceUrl,
            originalFilename: 'capa.png',
          }),
      },
      directories: fixture.directories,
      selectImageFile: () => Promise.resolve(null),
      createId: (() => {
        let sequence = 50;
        return () => `00000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`;
      })(),
      now: () => new Date('2026-10-27T15:00:00.000Z'),
    });

    const noChoice = await service.importUrl({
      campaignId: fixture.first.id,
      revision: 1,
      url: sourceUrl,
    });
    expect(noChoice.status).toBe('oversize_choice_required');
    expect(
      fixture.context.native.prepare('SELECT count(*) AS count FROM attachments').get(),
    ).toEqual({ count: 0 });

    const resized = await service.importUrl({
      campaignId: fixture.first.id,
      revision: 1,
      url: sourceUrl,
      oversizeMode: 'resize',
    });
    const cropped = await service.importUrl({
      campaignId: fixture.second.id,
      revision: 1,
      url: sourceUrl,
      oversizeMode: 'crop',
    });
    if (resized.status !== 'imported' || cropped.status !== 'imported') {
      throw new Error('As importações remotas deveriam estar concluídas.');
    }
    expect(resized.attachment).toMatchObject({ width: 1280, height: 960, sourceKind: 'url' });
    expect(cropped.attachment).toMatchObject({ width: 1280, height: 1024, sourceKind: 'url' });
    expect(JSON.stringify({ resized, cropped })).not.toContain(sourceUrl);
    expect(JSON.stringify({ resized, cropped })).not.toMatch(
      /relativePath|sourceUrl|storedFilename/u,
    );
    expect(
      fixture.context.native
        .prepare('SELECT source_url FROM attachments ORDER BY campaign_id')
        .all(),
    ).toEqual([{ source_url: sourceUrl }, { source_url: sourceUrl }]);
    const filesBeforeConflict = await allFiles(fixture.directories.attachments);
    await expect(
      service.importUrl({
        campaignId: fixture.first.id,
        revision: 1,
        url: sourceUrl,
        oversizeMode: 'resize',
      }),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect(await allFiles(fixture.directories.attachments)).toEqual(filesBeforeConflict);
  });
});

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'image-import-integration-'));
  roots.push(root);
  const directories = getDataDirectories(root);
  await ensureDataDirectories(directories);
  const context = await openApplicationDatabase(directories, new TestLogger());
  contexts.push(context);
  const campaigns = new CampaignRepository(context.orm);
  const first = createCampaign('00000000-0000-4000-8000-000000000001', 'Primeira');
  const second = createCampaign('00000000-0000-4000-8000-000000000002', 'Segunda');
  campaigns.insert(first);
  campaigns.insert(second);
  const attachments = new AttachmentRepository(context.native);
  const selectedPath: { value: string | null } = { value: null };
  const ids = Array.from(
    { length: 20 },
    (_, index) => `00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
  );
  const service = new ImageImportService({
    repository: attachments,
    processor: new ImageProcessingService(),
    directories,
    selectImageFile: () => Promise.resolve(selectedPath.value),
    createId: () => ids.shift() ?? '00000000-0000-4000-8000-000000000099',
    now: () => new Date('2026-10-27T12:00:00.000Z'),
  });
  return { root, directories, context, first, second, attachments, selectedPath, service };
}

function createCampaign(id: string, name: string): Campaign {
  return campaignSchema.parse({
    id,
    name,
    systemName: null,
    concept: null,
    genre: null,
    tone: null,
    summary: null,
    coverAttachmentId: null,
    status: 'active',
    createdAt: '2026-10-27T12:00:00.000Z',
    updatedAt: '2026-10-27T12:00:00.000Z',
    archivedAt: null,
    revision: 1,
  });
}

function createSvg(width: number, height: number): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}"><rect width="100%" height="100%" fill="#345"/></svg>`,
  );
}

async function allFiles(root: string): Promise<string[]> {
  try {
    return (await readdir(root, { recursive: true })).sort();
  } catch {
    return [];
  }
}
