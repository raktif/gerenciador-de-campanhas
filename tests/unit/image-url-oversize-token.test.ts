import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ImageProcessingInput,
  ImageProcessingResult,
} from '../../src/core/contracts/image-processing';
import type {
  AttachmentRepository,
  InsertCampaignCoverInput,
} from '../../src/db/repositories/attachment-repository';
import { ImageImportService } from '../../src/main/services/image-import-service';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('token de continuação de URL oversize', () => {
  it('persiste os bytes já validados sem novo download e consome o token uma vez', async () => {
    const fixture = await createFixture();
    const pendingImportId = await startPending(fixture.service);
    fixture.remoteBytes = new Uint8Array([9, 9, 9]);

    await expect(
      fixture.service.importUrl({ ...identity(), pendingImportId, oversizeMode: 'resize' }),
    ).resolves.toMatchObject({ status: 'imported' });

    expect(fixture.download).toHaveBeenCalledOnce();
    expect(fixture.persist).toHaveBeenCalledOnce();
    expect(fixture.persist.mock.calls[0]?.[0].attachment.checksumSha256).toBe(
      createHash('sha256').update(originalBytes).digest('hex'),
    );
    await expect(
      fixture.service.importUrl({ ...identity(), pendingImportId, oversizeMode: 'crop' }),
    ).rejects.toMatchObject({ code: 'IMAGE_PENDING_IMPORT_INVALID' });
  });

  it('rejeita token em outra campanha e com revisão obsoleta', async () => {
    const crossCampaign = await createFixture();
    const crossToken = await startPending(crossCampaign.service);
    await expect(
      crossCampaign.service.importUrl({
        campaignId: '00000000-0000-4000-8000-000000000002',
        revision: 1,
        pendingImportId: crossToken,
        oversizeMode: 'resize',
      }),
    ).rejects.toMatchObject({ code: 'IMAGE_PENDING_IMPORT_INVALID' });

    const staleRevision = await createFixture();
    const staleToken = await startPending(staleRevision.service);
    await expect(
      staleRevision.service.importUrl({
        ...identity(),
        revision: 2,
        pendingImportId: staleToken,
        oversizeMode: 'resize',
      }),
    ).rejects.toMatchObject({ code: 'IMAGE_PENDING_IMPORT_INVALID' });
    expect(crossCampaign.persist).not.toHaveBeenCalled();
    expect(staleRevision.persist).not.toHaveBeenCalled();
  });

  it('expira e elimina tokens após o TTL curto', async () => {
    const fixture = await createFixture();
    const pendingImportId = await startPending(fixture.service);
    fixture.now = new Date('2026-10-28T12:06:00.000Z');

    await expect(
      fixture.service.importUrl({ ...identity(), pendingImportId, oversizeMode: 'resize' }),
    ).rejects.toMatchObject({ code: 'IMAGE_PENDING_IMPORT_INVALID' });
    expect(fixture.persist).not.toHaveBeenCalled();
  });
});

const originalBytes = new Uint8Array([1, 2, 3]);
const oversizeResult: ImageProcessingResult = {
  status: 'oversize_choice_required' as const,
  detectedMimeType: 'image/png' as const,
  originalWidth: 1600,
  originalHeight: 1200,
  maximumWidth: 1280 as const,
  maximumHeight: 1024 as const,
  allowedModes: ['resize', 'crop'],
};
const processedResult: ImageProcessingResult = {
  status: 'processed' as const,
  detectedMimeType: 'image/png' as const,
  originalWidth: 1600,
  originalHeight: 1200,
  selectedOversizeMode: 'resize' as const,
  image: {
    bytes: new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
    mimeType: 'image/webp' as const,
    width: 1280,
    height: 960,
  },
  thumbnail: {
    bytes: new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
    mimeType: 'image/webp' as const,
    width: 320,
    height: 240,
  },
};

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'image-url-token-'));
  roots.push(root);
  const state = {
    remoteBytes: originalBytes,
    now: new Date('2026-10-28T12:00:00.000Z'),
  };
  const download = vi.fn(() =>
    Promise.resolve({
      bytes: state.remoteBytes,
      contentType: 'image/png' as const,
      sourceUrl: 'https://cdn.example/final.png',
      originalFilename: 'mapa.png',
    }),
  );
  const process = vi.fn((input: ImageProcessingInput) =>
    Promise.resolve(input.oversizeMode === undefined ? oversizeResult : processedResult),
  );
  const persist = vi.fn((input: InsertCampaignCoverInput) => ({
    campaign: {
      id: input.campaignId,
      name: 'Ethéria',
      systemName: null,
      concept: null,
      genre: null,
      tone: null,
      summary: null,
      coverAttachmentId: input.attachment.id,
      status: 'active' as const,
      createdAt: input.campaignUpdatedAt,
      updatedAt: input.campaignUpdatedAt,
      archivedAt: null,
      revision: input.campaignRevision + 1,
    },
    attachment: {
      id: input.attachment.id,
      campaignId: input.attachment.campaignId,
      originalFilename: input.attachment.originalFilename,
      mimeType: input.attachment.mimeType,
      fileSize: input.attachment.fileSize,
      checksumSha256: input.attachment.checksumSha256,
      visibility: input.attachment.visibility,
      width: input.attachment.width,
      height: input.attachment.height,
      sourceKind: input.attachment.sourceKind,
      processedMimeType: input.attachment.processedMimeType,
      processingStatus: input.attachment.processingStatus,
      createdAt: input.attachment.createdAt,
      updatedAt: input.attachment.updatedAt,
      revision: input.attachment.revision,
    },
  }));
  const service = new ImageImportService({
    repository: { insertAndSetCampaignCover: persist } as unknown as AttachmentRepository,
    processor: { process },
    downloader: { download },
    directories: {
      attachments: path.join(root, 'attachments'),
      thumbnails: path.join(root, 'thumbnails'),
      temporary: path.join(root, 'tmp'),
    },
    selectImageFile: () => Promise.resolve(null),
    now: () => state.now,
  });
  return {
    service,
    download,
    persist,
    get remoteBytes() {
      return state.remoteBytes;
    },
    set remoteBytes(value: Uint8Array) {
      state.remoteBytes = new Uint8Array(value);
    },
    get now() {
      return state.now;
    },
    set now(value: Date) {
      state.now = value;
    },
  };
}

async function startPending(service: ImageImportService): Promise<string> {
  const result = await service.importUrl({
    ...identity(),
    url: 'https://images.example/mapa.png',
  });
  if (result.status !== 'oversize_choice_required' || result.pendingImportId === undefined) {
    throw new Error('O teste esperava um token de continuação oversize.');
  }
  expect(JSON.stringify(result)).not.toMatch(/bytes|https?:\/\//u);
  return result.pendingImportId;
}

function identity() {
  return { campaignId: '00000000-0000-4000-8000-000000000001', revision: 1 };
}
