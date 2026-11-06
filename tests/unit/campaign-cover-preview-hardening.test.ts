import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  campaignCoverPreviewSchema,
  maximumCampaignCoverPreviewBytes,
} from '../../src/core/contracts/campaign-covers';
import type { AttachmentRepository } from '../../src/db/repositories/attachment-repository';
import { CampaignCoverService } from '../../src/main/services/campaign-cover-service';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('hardening do preview público', () => {
  it('rejeita bytes sem magic WebP no contrato público', () => {
    expect(() =>
      campaignCoverPreviewSchema.parse({
        attachmentId,
        mimeType: 'image/webp',
        bytes: new Uint8Array(12),
      }),
    ).toThrow();
  });

  it('recusa miniatura acima de 2 MB antes de transferi-la', async () => {
    const fixture = await createFixture(new Uint8Array(maximumCampaignCoverPreviewBytes + 1));
    await expect(fixture.service.getPreview({ campaignId })).rejects.toMatchObject({
      code: 'CAMPAIGN_COVER_PREVIEW_INVALID',
    });
  });
});

async function createFixture(bytes: Uint8Array) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cover-preview-hardening-'));
  roots.push(root);
  const directories = {
    attachments: path.join(root, 'attachments'),
    thumbnails: path.join(root, 'thumbnails'),
    temporary: path.join(root, 'tmp'),
  };
  const thumbnailRelativePath = `${campaignId}/${attachmentId}-thumb.webp`;
  await mkdir(path.join(directories.thumbnails, campaignId), { recursive: true });
  await writeFile(path.join(directories.thumbnails, ...thumbnailRelativePath.split('/')), bytes);
  const repository = {
    getCampaignCover: () => ({
      campaign: {
        id: campaignId,
        name: 'Ethéria',
        systemName: null,
        concept: null,
        genre: null,
        tone: null,
        summary: null,
        coverAttachmentId: attachmentId,
        status: 'active' as const,
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: null,
        revision: 1,
      },
      attachment: {
        id: attachmentId,
        campaignId,
        originalFilename: 'capa.png',
        mimeType: 'image/png' as const,
        fileSize: 100,
        checksumSha256: 'a'.repeat(64),
        visibility: 'gm' as const,
        width: 800,
        height: 600,
        sourceKind: 'file' as const,
        processedMimeType: 'image/webp' as const,
        processingStatus: 'ready' as const,
        createdAt: timestamp,
        updatedAt: timestamp,
        revision: 1,
      },
    }),
    findAttachmentDeletionIdentity: () => ({
      attachmentId,
      campaignId,
      revision: 1,
      relativePath: `${campaignId}/${attachmentId}.webp`,
      thumbnailRelativePath,
    }),
  } as unknown as AttachmentRepository;
  return {
    service: new CampaignCoverService({ repository, directories }),
  };
}

const campaignId = '00000000-0000-4000-8000-000000000001';
const attachmentId = '10000000-0000-4000-8000-000000000001';
const timestamp = '2026-10-28T10:00:00.000Z';
