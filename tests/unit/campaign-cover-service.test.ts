import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Attachment } from '../../src/core/contracts/attachments';
import { AppError } from '../../src/core/errors/app-error';
import { CampaignCoverService } from '../../src/main/services/campaign-cover-service';

const roots: string[] = [];
const webpBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('CampaignCoverService', () => {
  it('entrega somente bytes públicos da miniatura da capa da campanha', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cover-preview-'));
    roots.push(root);
    const campaignId = '00000000-0000-4000-8000-000000000001';
    const attachmentId = '10000000-0000-4000-8000-000000000001';
    const relativePath = `${campaignId}/${attachmentId}.webp`;
    const thumbnailRelativePath = `${campaignId}/${attachmentId}-thumb.webp`;
    const directories = {
      attachments: path.join(root, 'attachments'),
      thumbnails: path.join(root, 'thumbnails'),
      temporary: path.join(root, 'tmp'),
    };
    await mkdir(path.join(directories.thumbnails, campaignId), { recursive: true });
    await writeFile(
      path.join(directories.thumbnails, ...thumbnailRelativePath.split('/')),
      webpBytes,
    );
    const attachment = createAttachment(campaignId, attachmentId);
    const service = new CampaignCoverService({
      repository: {
        getCampaignCover: () => ({
          campaign: createCampaign(campaignId, attachmentId),
          attachment,
        }),
        findAttachmentDeletionIdentity: () => ({
          attachmentId,
          campaignId,
          revision: 1,
          relativePath,
          thumbnailRelativePath,
        }),
        setCampaignCover: () => {
          throw new Error('não usado');
        },
        removeCampaignCover: () => {
          throw new Error('não usado');
        },
        prepareAttachmentDeletion: () => {
          throw new Error('não usado');
        },
        deleteUnusedAttachment: () => {
          throw new Error('não usado');
        },
      },
      directories,
    });

    const preview = await service.getPreview({ campaignId });

    expect(preview).toEqual({
      attachmentId,
      mimeType: 'image/webp',
      bytes: webpBytes,
    });
    expect(JSON.stringify(preview)).not.toMatch(/relativePath|thumbnail|sourceUrl|[A-Z]:\\/u);
  });

  it('restaura principal e miniatura quando a transação de metadados falha', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cover-delete-compensation-'));
    roots.push(root);
    const campaignId = '00000000-0000-4000-8000-000000000001';
    const attachmentId = '10000000-0000-4000-8000-000000000001';
    const relativePath = `${campaignId}/${attachmentId}.webp`;
    const thumbnailRelativePath = `${campaignId}/${attachmentId}-thumb.webp`;
    const directories = {
      attachments: path.join(root, 'attachments'),
      thumbnails: path.join(root, 'thumbnails'),
      temporary: path.join(root, 'tmp'),
    };
    const image = path.join(directories.attachments, ...relativePath.split('/'));
    const thumbnail = path.join(directories.thumbnails, ...thumbnailRelativePath.split('/'));
    await Promise.all([
      mkdir(path.dirname(image), { recursive: true }),
      mkdir(path.dirname(thumbnail), { recursive: true }),
    ]);
    await Promise.all([writeFile(image, 'image'), writeFile(thumbnail, 'thumbnail')]);
    const service = new CampaignCoverService({
      repository: {
        getCampaignCover: () => {
          throw new Error('não usado');
        },
        setCampaignCover: () => {
          throw new Error('não usado');
        },
        removeCampaignCover: () => {
          throw new Error('não usado');
        },
        findAttachmentDeletionIdentity: () => null,
        prepareAttachmentDeletion: () => ({
          attachment: createAttachment(campaignId, attachmentId),
          relativePath,
          thumbnailRelativePath,
        }),
        deleteUnusedAttachment: () => {
          throw new AppError('REVISION_CONFLICT', 'Conflito de teste.');
        },
      },
      directories,
      createId: () => '00000000-0000-4000-8000-000000000099',
    });

    await expect(
      service.deleteAttachment({ campaignId, attachmentId, revision: 1 }),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect(await readFile(image, 'utf8')).toBe('image');
    expect(await readFile(thumbnail, 'utf8')).toBe('thumbnail');
    expect(await recursiveEntries(directories.temporary)).not.toContainEqual(
      expect.stringMatching(/\.webp$/u),
    );
  });
});

function createAttachment(campaignId: string, id: string): Attachment {
  return {
    id,
    campaignId,
    originalFilename: 'capa.png',
    mimeType: 'image/png',
    fileSize: 1024,
    checksumSha256: 'a'.repeat(64),
    visibility: 'gm',
    width: 800,
    height: 600,
    sourceKind: 'file',
    processedMimeType: 'image/webp',
    processingStatus: 'ready',
    createdAt: '2026-10-28T10:00:00.000Z',
    updatedAt: '2026-10-28T10:00:00.000Z',
    revision: 1,
  };
}

function createCampaign(campaignId: string, attachmentId: string) {
  return {
    id: campaignId,
    name: 'Ethéria',
    systemName: null,
    concept: null,
    genre: null,
    tone: null,
    summary: null,
    coverAttachmentId: attachmentId,
    status: 'active' as const,
    createdAt: '2026-10-28T10:00:00.000Z',
    updatedAt: '2026-10-28T10:00:00.000Z',
    archivedAt: null,
    revision: 1,
  };
}

async function recursiveEntries(root: string): Promise<string[]> {
  try {
    return await readdir(root, { recursive: true });
  } catch {
    return [];
  }
}
