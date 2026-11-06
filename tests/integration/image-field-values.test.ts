import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import { AttachmentRepository } from '../../src/db/repositories/attachment-repository';
import { ImageFieldValueRepository } from '../../src/db/repositories/image-field-value-repository';
import { ImageFieldValueService } from '../../src/main/services/image-field-value-service';
import { ImageImportService } from '../../src/main/services/image-import-service';
import { ImageProcessingService } from '../../src/main/services/image-processing-service';
import { TestLogger } from '../helpers/test-logger';

const roots: string[] = [];
const contexts: DatabaseContext[] = [];

afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('persistencia de valores de campos de imagem', () => {
  it('importa, lista, previsualiza, atualiza, reordena e remove com revisao otimista', async () => {
    const fixture = await createFixture();
    const first = await importImage(fixture, 'Primeira', 'Texto alternativo');
    const second = await importImage(fixture, 'Segunda', 'Segunda imagem');

    expect(fixture.values.list(fixture.target).map(({ value }) => value.id)).toEqual([
      first.value.id,
      second.value.id,
    ]);
    const preview = await fixture.service.getPreview({
      campaignId: fixture.target.campaignId,
      id: first.value.id,
    });
    if (preview === null) throw new Error('Miniatura deveria estar disponivel.');
    expect(preview.mimeType).toBe('image/webp');
    expect(preview.bytes.byteLength).toBeGreaterThan(0);
    const display = await fixture.service.getDisplay({
      campaignId: fixture.target.campaignId,
      id: first.value.id,
    });
    expect(display).toMatchObject({ attachmentId: first.attachment.id, mimeType: 'image/webp' });
    expect(display.bytes.byteLength).toBeGreaterThan(0);

    const updated = fixture.service.update({
      campaignId: fixture.target.campaignId,
      id: first.value.id,
      revision: 1,
      patch: { caption: null },
    });
    expect(updated.value).toMatchObject({
      caption: null,
      altText: 'Texto alternativo',
      revision: 2,
    });
    expect(() =>
      fixture.service.update({
        campaignId: fixture.target.campaignId,
        id: first.value.id,
        revision: 1,
        patch: { caption: 'Conflito' },
      }),
    ).toThrow(/alterada/iu);

    const moved = fixture.service.move({
      ...fixture.target,
      sourceId: second.value.id,
      sourceRevision: 1,
      targetId: first.value.id,
      targetRevision: 2,
      placement: 'before',
    });
    expect(moved.map(({ value }) => value.id)).toEqual([second.value.id, first.value.id]);
    const currentFirst = moved.find(({ value }) => value.id === first.value.id);
    if (currentFirst === undefined) throw new Error('Valor ausente apos reordenacao.');
    fixture.service.remove({
      campaignId: fixture.target.campaignId,
      id: first.value.id,
      revision: currentFirst.value.revision,
    });
    expect(fixture.values.findById(fixture.target.campaignId, first.value.id)).toBeNull();
    expect(
      fixture.attachments.findById(fixture.target.campaignId, first.attachment.id),
    ).not.toBeNull();
  });

  it('isola campanhas e compensa arquivos quando o alvo nao pertence a campanha', async () => {
    const fixture = await createFixture();
    const imported = await importImage(fixture, 'Valida', 'Imagem válida');
    expect(fixture.values.findById(fixture.foreignCampaignId, imported.value.id)).toBeNull();
    expect(() =>
      fixture.values.list({ ...fixture.target, campaignId: fixture.foreignCampaignId }),
    ).toThrow(/campanha/iu);

    const beforeAttachments = await filesBelow(fixture.directories.attachments);
    const beforeThumbnails = await filesBelow(fixture.directories.thumbnails);
    await expect(
      fixture.importer.importImageFieldBytes({
        ...fixture.target,
        campaignId: fixture.foreignCampaignId,
        caption: null,
        altText: 'Imagem inválida',
        bytes: await imageBytes(),
        metadata: { originalFilename: 'invalida.png', sourceKind: 'clipboard' },
      }),
    ).rejects.toMatchObject({ code: 'IMAGE_FIELD_TARGET_NOT_FOUND' });
    expect(await filesBelow(fixture.directories.attachments)).toEqual(beforeAttachments);
    expect(await filesBelow(fixture.directories.thumbnails)).toEqual(beforeThumbnails);
    expect(fixture.context.native.pragma('foreign_key_check')).toEqual([]);
  });
});

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'image-field-values-'));
  roots.push(root);
  const directories = getDataDirectories(root);
  await ensureDataDirectories(directories);
  const context = await openApplicationDatabase(directories, new TestLogger());
  contexts.push(context);
  const target = seedTarget(context, 'Primeira');
  const foreignCampaignId = seedTarget(context, 'Segunda').campaignId;
  const attachments = new AttachmentRepository(context.native);
  const values = new ImageFieldValueRepository(context.native);
  const ids = Array.from({ length: 20 }, () => randomUUID());
  const importer = new ImageImportService({
    repository: attachments,
    imageFieldValues: values,
    processor: new ImageProcessingService(),
    directories,
    selectImageFile: () => Promise.resolve(null),
    createId: () => ids.shift() ?? randomUUID(),
    now: () => new Date('2026-11-04T10:00:00.000Z'),
  });
  const service = new ImageFieldValueService({
    repository: values,
    attachments,
    directories,
    now: () => new Date('2026-11-04T11:00:00.000Z'),
  });
  return {
    context,
    directories,
    target,
    foreignCampaignId,
    attachments,
    values,
    importer,
    service,
  };
}

function seedTarget(context: DatabaseContext, name: string) {
  const campaignId = randomUUID();
  const entityTypeId = randomUUID();
  const entityId = randomUUID();
  const fieldDefinitionId = randomUUID();
  const now = '2026-11-04T09:00:00.000Z';
  context.native
    .prepare('INSERT INTO campaigns (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(campaignId, name, now, now);
  context.native
    .prepare(
      'INSERT INTO entity_types (id, campaign_id, name, singular_name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      entityTypeId,
      campaignId,
      'Pessoas',
      'Pessoa',
      `pessoas-${campaignId.slice(0, 8)}`,
      now,
      now,
    );
  context.native
    .prepare(
      'INSERT INTO entities (id, campaign_id, entity_type_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(entityId, campaignId, entityTypeId, `${name} pessoa`, now, now);
  context.native
    .prepare(
      "INSERT INTO field_definitions (id, entity_type_id, key, label, data_type, created_at, updated_at) VALUES (?, ?, 'retrato', 'Retrato', 'image', ?, ?)",
    )
    .run(fieldDefinitionId, entityTypeId, now, now);
  return { campaignId, entityId, fieldDefinitionId };
}

async function importImage(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  caption: string,
  altText: string,
) {
  const result = await fixture.importer.importImageFieldBytes({
    ...fixture.target,
    caption,
    altText,
    bytes: await imageBytes(),
    metadata: { originalFilename: 'retrato.png', sourceKind: 'clipboard' },
  });
  if (result.status !== 'imported') throw new Error('Importacao deveria estar concluida.');
  expect(JSON.stringify(result)).not.toMatch(/relativePath|storedFilename|thumbnailRelativePath/u);
  return result;
}

async function imageBytes(): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp(
      Buffer.from('<svg width="64" height="48"><rect width="64" height="48" fill="blue"/></svg>'),
    )
      .png()
      .toBuffer(),
  );
}

async function filesBelow(root: string): Promise<string[]> {
  const result: string[] = [];
  async function visit(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(child);
      else result.push(path.relative(root, child));
    }
  }
  await visit(root);
  return result.sort();
}
