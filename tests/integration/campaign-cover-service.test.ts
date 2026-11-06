import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { campaignSchema, type Campaign } from '../../src/core/contracts/campaigns';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import { AttachmentRepository } from '../../src/db/repositories/attachment-repository';
import { CampaignRepository } from '../../src/db/repositories/campaign-repository';
import { CampaignCoverService } from '../../src/main/services/campaign-cover-service';
import { TestLogger } from '../helpers/test-logger';

const roots: string[] = [];
const contexts: DatabaseContext[] = [];

afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('CampaignCoverService', () => {
  it('associa, recupera, substitui e remove a capa com revisão exata e resultado público', async () => {
    const fixture = await createFixture();
    const firstAttachment = await fixture.insertAttachment({ id: attachmentId(1) });
    const secondAttachment = await fixture.insertAttachment({
      id: attachmentId(2),
      sourceKind: 'url',
    });

    expect(fixture.service.get({ campaignId: fixture.first.id })).toEqual({
      campaign: fixture.first,
      attachment: null,
    });
    const associated = fixture.service.set({
      campaignId: fixture.first.id,
      attachmentId: firstAttachment.id,
      revision: 1,
    });
    expect(associated).toMatchObject({
      campaign: { coverAttachmentId: firstAttachment.id, revision: 2 },
      attachment: { id: firstAttachment.id },
    });
    const replaced = fixture.service.set({
      campaignId: fixture.first.id,
      attachmentId: secondAttachment.id,
      revision: 2,
    });
    expect(replaced.campaign).toMatchObject({
      coverAttachmentId: secondAttachment.id,
      revision: 3,
    });
    expect(fixture.service.get({ campaignId: fixture.first.id })).toEqual(replaced);
    expect(JSON.stringify(replaced)).not.toMatch(
      /sourceUrl|relativePath|storedFilename|images\.example/u,
    );

    const removed = fixture.service.remove({ campaignId: fixture.first.id, revision: 3 });
    expect(removed).toMatchObject({
      campaign: { coverAttachmentId: null, revision: 4 },
      attachment: null,
    });
  });

  it('rejeita campanha cruzada, anexo não pronto e revisão obsoleta sem alterar capa', async () => {
    const fixture = await createFixture();
    const foreign = await fixture.insertAttachment({
      id: attachmentId(3),
      campaignId: fixture.second.id,
    });
    const pending = await fixture.insertAttachment({
      id: attachmentId(4),
      processingStatus: 'pending',
    });
    expect(() =>
      fixture.service.set({
        campaignId: fixture.first.id,
        attachmentId: foreign.id,
        revision: 1,
      }),
    ).toThrow(/não pertence/iu);
    expect(() =>
      fixture.service.set({
        campaignId: fixture.first.id,
        attachmentId: pending.id,
        revision: 1,
      }),
    ).toThrow(/pronto/iu);
    fixture.context.native
      .prepare('UPDATE campaigns SET revision = 2 WHERE id = ?')
      .run(fixture.first.id);
    expect(() =>
      fixture.service.set({
        campaignId: fixture.first.id,
        attachmentId: pending.id,
        revision: 1,
      }),
    ).toThrow(/alterado/iu);
    expect(
      fixture.service.get({ campaignId: fixture.first.id }).campaign.coverAttachmentId,
    ).toBeNull();
  });

  it('protege anexo usado como capa e limpa principal e miniatura após dissociação', async () => {
    const fixture = await createFixture();
    const attachment = await fixture.insertAttachment({ id: attachmentId(5) });
    fixture.service.set({
      campaignId: fixture.first.id,
      attachmentId: attachment.id,
      revision: 1,
    });
    await expect(
      fixture.service.deleteAttachment({
        campaignId: fixture.first.id,
        attachmentId: attachment.id,
        revision: 1,
      }),
    ).rejects.toMatchObject({ code: 'ATTACHMENT_IN_USE' });
    expect(await readFile(attachment.imagePath, 'utf8')).toBe('image');
    fixture.service.remove({ campaignId: fixture.first.id, revision: 2 });
    await expect(
      fixture.service.deleteAttachment({
        campaignId: fixture.first.id,
        attachmentId: attachment.id,
        revision: 1,
      }),
    ).resolves.toEqual({ campaignId: fixture.first.id, attachmentId: attachment.id });
    await expect(readFile(attachment.imagePath)).rejects.toThrow();
    await expect(readFile(attachment.thumbnailPath)).rejects.toThrow();
    expect(fixture.attachments.findById(fixture.first.id, attachment.id)).toBeNull();
  });

  it('preserva arquivos e metadados em revisão obsoleta ou campanha cruzada', async () => {
    const fixture = await createFixture();
    const attachment = await fixture.insertAttachment({ id: attachmentId(6), revision: 2 });
    for (const input of [
      { campaignId: fixture.first.id, attachmentId: attachment.id, revision: 1 },
      { campaignId: fixture.second.id, attachmentId: attachment.id, revision: 2 },
    ]) {
      await expect(fixture.service.deleteAttachment(input)).rejects.toBeDefined();
      expect(await readFile(attachment.imagePath, 'utf8')).toBe('image');
      expect(fixture.attachments.findById(fixture.first.id, attachment.id)).not.toBeNull();
    }
  });
});

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'campaign-cover-integration-'));
  roots.push(root);
  const directories = getDataDirectories(root);
  await ensureDataDirectories(directories);
  const context = await openApplicationDatabase(directories, new TestLogger());
  contexts.push(context);
  const campaigns = new CampaignRepository(context.orm);
  const first = createCampaign(campaignId(1), 'Primeira');
  const second = createCampaign(campaignId(2), 'Segunda');
  campaigns.insert(first);
  campaigns.insert(second);
  const attachments = new AttachmentRepository(context.native);
  const service = new CampaignCoverService({
    repository: attachments,
    directories,
    now: () => new Date('2026-10-28T12:00:00.000Z'),
    createId: () => '00000000-0000-4000-8000-000000000099',
  });

  const insertAttachment = async (options: {
    id: string;
    campaignId?: string;
    processingStatus?: 'pending' | 'ready';
    revision?: number;
    sourceKind?: 'file' | 'url';
  }) => {
    const ownerId = options.campaignId ?? first.id;
    const relativePath = `${ownerId}/${options.id}.webp`;
    const thumbnailRelativePath = `${ownerId}/${options.id}-thumb.webp`;
    const imagePath = path.join(directories.attachments, ...relativePath.split('/'));
    const thumbnailPath = path.join(directories.thumbnails, ...thumbnailRelativePath.split('/'));
    await Promise.all([
      mkdir(path.dirname(imagePath), { recursive: true }),
      mkdir(path.dirname(thumbnailPath), { recursive: true }),
    ]);
    await Promise.all([writeFile(imagePath, 'image'), writeFile(thumbnailPath, 'thumbnail')]);
    const sourceKind = options.sourceKind ?? 'file';
    context.native
      .prepare(
        `INSERT INTO attachments (
          id, campaign_id, original_filename, stored_filename, relative_path, mime_type,
          file_size, checksum_sha256, visibility, width, height, thumbnail_relative_path,
          source_kind, source_url, processed_mime_type, processing_status, created_at,
          updated_at, revision
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        options.id,
        ownerId,
        'capa.png',
        `${options.id}.webp`,
        relativePath,
        'image/png',
        1024,
        options.id.replaceAll('-', '').padEnd(64, 'a').slice(0, 64),
        'gm',
        800,
        600,
        thumbnailRelativePath,
        sourceKind,
        sourceKind === 'url' ? 'https://images.example/private.png' : null,
        'image/webp',
        options.processingStatus ?? 'ready',
        '2026-10-28T11:00:00.000Z',
        '2026-10-28T11:00:00.000Z',
        options.revision ?? 1,
      );
    return { id: options.id, imagePath, thumbnailPath };
  };
  return { context, directories, first, second, attachments, service, insertAttachment };
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
    createdAt: '2026-10-28T10:00:00.000Z',
    updatedAt: '2026-10-28T10:00:00.000Z',
    archivedAt: null,
    revision: 1,
  });
}

function campaignId(sequence: number): string {
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
}

function attachmentId(sequence: number): string {
  return `10000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
}
