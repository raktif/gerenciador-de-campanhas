import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { maximumImageBytes } from '../../src/core/contracts/image-processing';
import type { AttachmentRepository } from '../../src/db/repositories/attachment-repository';
import { ImageImportService } from '../../src/main/services/image-import-service';
import { ImageProcessingService } from '../../src/main/services/image-processing-service';
import type { ImageDownloader } from '../../src/main/services/secure-image-download-service';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('ImageImportService', () => {
  it('encerra sem processar ou persistir quando o diálogo é cancelado', async () => {
    const fixture = await createFixture();
    expect(await fixture.service.selectLocal(identity())).toEqual({ status: 'cancelled' });
    expect(fixture.process).not.toHaveBeenCalled();
    expect(fixture.persist).not.toHaveBeenCalled();
  });

  it('rejeita bytes acima do limite e metadados que tentam transportar paths', async () => {
    const fixture = await createFixture();
    await expect(
      fixture.service.importBytes({
        ...identity(),
        bytes: new Uint8Array(maximumImageBytes + 1),
        metadata: { originalFilename: 'capa.png', sourceKind: 'clipboard' },
      }),
    ).rejects.toThrow();
    await expect(
      fixture.service.importBytes({
        ...identity(),
        bytes: new Uint8Array([1]),
        metadata: {
          originalFilename: 'C:\\privado\\capa.png',
          sourceKind: 'drag_drop',
        },
      }),
    ).rejects.toThrow();
    expect(fixture.process).not.toHaveBeenCalled();
  });

  it('rejeita conteúdo cujo formato não é uma imagem aceita antes de persistir', async () => {
    const fixture = await createFixture();
    const service = new ImageImportService({
      repository: { insertAndSetCampaignCover: fixture.persist } as unknown as AttachmentRepository,
      processor: new ImageProcessingService(),
      directories: fixture.directories,
      selectImageFile: () => Promise.resolve(null),
    });
    await expect(
      service.importBytes({
        ...identity(),
        bytes: new Uint8Array([1, 2, 3, 4]),
        metadata: { originalFilename: 'falso.png', sourceKind: 'clipboard' },
      }),
    ).rejects.toMatchObject({ code: 'IMAGE_FORMAT_UNSUPPORTED' });
    expect(fixture.persist).not.toHaveBeenCalled();
  });

  it('devolve a escolha tipada de oversize sem criar arquivos ou metadados', async () => {
    const fixture = await createFixture({ processingResult: oversizeResult });
    await expect(
      fixture.service.importBytes({
        ...identity(),
        bytes: new Uint8Array([1, 2, 3]),
        metadata: { originalFilename: 'mapa.png', sourceKind: 'clipboard' },
      }),
    ).resolves.toEqual(oversizeResult);
    expect(fixture.persist).not.toHaveBeenCalled();
    await expect(readdir(fixture.directories.attachments)).rejects.toThrow();
  });

  it('rejeita divergência entre Content-Type remoto e bytes detectados', async () => {
    const fixture = await createFixture();
    const service = new ImageImportService({
      repository: { insertAndSetCampaignCover: fixture.persist } as unknown as AttachmentRepository,
      processor: { process: fixture.process },
      downloader: remoteDownloader({ contentType: 'image/jpeg' }),
      directories: fixture.directories,
      selectImageFile: () => Promise.resolve(null),
    });
    await expect(
      service.importUrl({ ...identity(), url: 'https://images.example/capa.jpg' }),
    ).rejects.toMatchObject({ code: 'IMAGE_URL_CONTENT_MISMATCH' });
    expect(fixture.persist).not.toHaveBeenCalled();
  });

  it('devolve escolha de oversize remoto sem persistir URL ou arquivos', async () => {
    const fixture = await createFixture({ processingResult: oversizeResult });
    const service = new ImageImportService({
      repository: { insertAndSetCampaignCover: fixture.persist } as unknown as AttachmentRepository,
      processor: { process: fixture.process },
      downloader: remoteDownloader(),
      directories: fixture.directories,
      selectImageFile: () => Promise.resolve(null),
    });
    const result = await service.importUrl({
      ...identity(),
      url: 'https://images.example/mapa.png',
    });
    expect(result).toMatchObject(oversizeResult);
    if (result.status !== 'oversize_choice_required') {
      throw new Error('O teste esperava uma escolha oversize.');
    }
    expect(result.pendingImportId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(JSON.stringify(result)).not.toMatch(
      /https?:|sourceUrl|relativePath|thumbnailRelativePath/u,
    );
    expect(fixture.persist).not.toHaveBeenCalled();
    expect(await listFiles(fixture.directories.temporary)).toEqual([]);
    expect(await listFiles(fixture.directories.attachments)).toEqual([]);
    expect(await listFiles(fixture.directories.thumbnails)).toEqual([]);
  });

  it('remove arquivos publicados e staging quando a transação falha', async () => {
    const fixture = await createFixture({ persistenceError: new Error('rollback') });
    await expect(
      fixture.service.importBytes({
        ...identity(),
        oversizeMode: 'resize',
        bytes: new Uint8Array([1, 2, 3]),
        metadata: { originalFilename: 'mapa.png', sourceKind: 'drag_drop' },
      }),
    ).rejects.toThrow('rollback');
    expect(fixture.persist).toHaveBeenCalledOnce();
    expect(await listFiles(fixture.directories.attachments)).not.toContainEqual(
      expect.stringMatching(/\.webp$/u),
    );
    expect(await listFiles(fixture.directories.thumbnails)).not.toContainEqual(
      expect.stringMatching(/\.webp$/u),
    );
    expect(await listFiles(fixture.directories.temporary)).not.toContainEqual(
      expect.stringMatching(/\.webp$/u),
    );
  });
});

const processedResult = {
  status: 'processed' as const,
  detectedMimeType: 'image/png' as const,
  originalWidth: 640,
  originalHeight: 480,
  selectedOversizeMode: null,
  image: {
    bytes: new Uint8Array([1, 2]),
    mimeType: 'image/webp' as const,
    width: 640,
    height: 480,
  },
  thumbnail: {
    bytes: new Uint8Array([3, 4]),
    mimeType: 'image/webp' as const,
    width: 320,
    height: 240,
  },
};

const oversizeResult = {
  status: 'oversize_choice_required' as const,
  detectedMimeType: 'image/png' as const,
  originalWidth: 1600,
  originalHeight: 1200,
  maximumWidth: 1280 as const,
  maximumHeight: 1024 as const,
  allowedModes: ['resize', 'crop'] as const,
};

async function createFixture(
  options: {
    processingResult?: typeof processedResult | typeof oversizeResult;
    persistenceError?: Error;
  } = {},
) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'image-import-unit-'));
  roots.push(root);
  const directories = {
    attachments: path.join(root, 'attachments'),
    thumbnails: path.join(root, 'thumbnails'),
    temporary: path.join(root, 'tmp'),
  };
  const process = vi.fn().mockResolvedValue(options.processingResult ?? processedResult);
  const persist = vi.fn(() => {
    if (options.persistenceError !== undefined) throw options.persistenceError;
    throw new Error('O teste não esperava concluir a persistência.');
  });
  const ids = ['00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000012'];
  const service = new ImageImportService({
    repository: { insertAndSetCampaignCover: persist } as unknown as AttachmentRepository,
    processor: { process },
    directories,
    selectImageFile: () => Promise.resolve(null),
    createId: () => ids.shift() ?? '00000000-0000-4000-8000-000000000099',
    now: () => new Date('2026-10-27T12:00:00.000Z'),
  });
  return { service, process, persist, directories };
}

function identity() {
  return { campaignId: '00000000-0000-4000-8000-000000000001', revision: 1 };
}

async function listFiles(root: string): Promise<string[]> {
  try {
    return await readdir(root, { recursive: true });
  } catch {
    return [];
  }
}

function remoteDownloader(
  overrides: Partial<{
    contentType: 'image/png' | 'image/jpeg' | 'image/webp';
  }> = {},
): ImageDownloader {
  return {
    download: () =>
      Promise.resolve({
        bytes: new Uint8Array([1, 2, 3]),
        contentType: overrides.contentType ?? 'image/png',
        sourceUrl: 'https://images.example/capa.png',
        originalFilename: 'capa.png',
      }),
  };
}
