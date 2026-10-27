import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  imageImportResultSchema,
  importImageBytesInputSchema,
  importImageUrlInputSchema,
  selectLocalImageInputSchema,
  type ImageImportResult,
  type ImportImageBytesInput,
  type ImportImageUrlInput,
  type SelectLocalImageInput,
} from '../../core/contracts/image-imports';
import { maximumImageBytes } from '../../core/contracts/image-processing';
import { AppError } from '../../core/errors/app-error';
import type { DataDirectories } from '../../core/storage/data-directories';
import type {
  AttachmentPersistenceRecord,
  AttachmentRepository,
} from '../../db/repositories/attachment-repository';
import type { ImageProcessingService } from './image-processing-service';
import type { ImageDownloader } from './secure-image-download-service';

export type SelectImageFile = () => Promise<string | null>;

export interface ImageImportServiceDependencies {
  repository: AttachmentRepository;
  processor: ImageProcessingService;
  directories: Pick<DataDirectories, 'attachments' | 'thumbnails' | 'temporary'>;
  selectImageFile: SelectImageFile;
  downloader?: ImageDownloader;
  now?: () => Date;
  createId?: () => string;
}

export class ImageImportService {
  private readonly now: () => Date;
  private readonly createId: () => string;

  public constructor(private readonly dependencies: ImageImportServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.createId = dependencies.createId ?? randomUUID;
  }

  public async selectLocal(input: SelectLocalImageInput): Promise<ImageImportResult> {
    const parsed = selectLocalImageInputSchema.parse(input);
    const selectedPath = await this.dependencies.selectImageFile();
    if (selectedPath === null) return { status: 'cancelled' };
    const bytes = await readBoundedSelectedFile(selectedPath);
    return this.processAndPersist({
      campaignId: parsed.campaignId,
      revision: parsed.revision,
      ...(parsed.oversizeMode === undefined ? {} : { oversizeMode: parsed.oversizeMode }),
      bytes,
      originalFilename: path.basename(selectedPath),
      sourceKind: 'file',
    });
  }

  public async importBytes(input: ImportImageBytesInput): Promise<ImageImportResult> {
    const parsed = importImageBytesInputSchema.parse(input);
    return this.processAndPersist({
      campaignId: parsed.campaignId,
      revision: parsed.revision,
      ...(parsed.oversizeMode === undefined ? {} : { oversizeMode: parsed.oversizeMode }),
      bytes: parsed.bytes,
      originalFilename: parsed.metadata.originalFilename,
      sourceKind: parsed.metadata.sourceKind,
      ...(parsed.metadata.declaredMimeType === undefined
        ? {}
        : { declaredMimeType: parsed.metadata.declaredMimeType }),
    });
  }

  public async importUrl(input: ImportImageUrlInput): Promise<ImageImportResult> {
    const parsed = importImageUrlInputSchema.parse(input);
    if (this.dependencies.downloader === undefined) {
      throw new AppError(
        'IMAGE_URL_IMPORT_UNAVAILABLE',
        'A importação remota não está disponível.',
      );
    }
    const downloaded = await this.dependencies.downloader.download(parsed.url);
    return this.processAndPersist({
      campaignId: parsed.campaignId,
      revision: parsed.revision,
      ...(parsed.oversizeMode === undefined ? {} : { oversizeMode: parsed.oversizeMode }),
      bytes: downloaded.bytes,
      originalFilename: downloaded.originalFilename,
      sourceKind: 'url',
      sourceUrl: downloaded.sourceUrl,
      declaredMimeType: downloaded.contentType,
      expectedMimeType: downloaded.contentType,
    });
  }

  private async processAndPersist(input: InternalImportInput): Promise<ImageImportResult> {
    const processed = await this.dependencies.processor.process({
      bytes: input.bytes,
      metadata: {
        originalFilename: input.originalFilename,
        sourceKind: input.sourceKind,
        ...(input.declaredMimeType === undefined
          ? {}
          : { declaredMimeType: input.declaredMimeType }),
      },
      ...(input.oversizeMode === undefined ? {} : { oversizeMode: input.oversizeMode }),
    });
    if (
      input.expectedMimeType !== undefined &&
      processed.detectedMimeType !== input.expectedMimeType
    ) {
      throw new AppError(
        'IMAGE_URL_CONTENT_MISMATCH',
        'O tipo declarado pela origem não corresponde ao conteúdo da imagem.',
      );
    }
    if (processed.status === 'oversize_choice_required') {
      return imageImportResultSchema.parse(processed);
    }

    const attachmentId = this.createId();
    const operationId = this.createId();
    const storedFilename = `${attachmentId}.webp`;
    const thumbnailFilename = `${attachmentId}-thumb.webp`;
    const relativePath = `${input.campaignId}/${storedFilename}`;
    const thumbnailRelativePath = `${input.campaignId}/${thumbnailFilename}`;
    const stagingDirectory = path.join(
      this.dependencies.directories.temporary,
      'image-imports',
      operationId,
    );
    const stagedImage = path.join(stagingDirectory, storedFilename);
    const stagedThumbnail = path.join(stagingDirectory, thumbnailFilename);
    const finalImageDirectory = path.join(
      this.dependencies.directories.attachments,
      input.campaignId,
    );
    const finalThumbnailDirectory = path.join(
      this.dependencies.directories.thumbnails,
      input.campaignId,
    );
    const finalImage = path.join(finalImageDirectory, storedFilename);
    const finalThumbnail = path.join(finalThumbnailDirectory, thumbnailFilename);
    let imageMoved = false;
    let thumbnailMoved = false;
    let metadataCommitted = false;

    try {
      await mkdir(stagingDirectory, { recursive: true });
      await Promise.all([
        writeFile(stagedImage, processed.image.bytes, { flag: 'wx' }),
        writeFile(stagedThumbnail, processed.thumbnail.bytes, { flag: 'wx' }),
      ]);
      await Promise.all([
        mkdir(finalImageDirectory, { recursive: true }),
        mkdir(finalThumbnailDirectory, { recursive: true }),
      ]);
      await rename(stagedImage, finalImage);
      imageMoved = true;
      await rename(stagedThumbnail, finalThumbnail);
      thumbnailMoved = true;

      const timestamp = this.now().toISOString();
      const attachment: AttachmentPersistenceRecord = {
        id: attachmentId,
        campaignId: input.campaignId,
        originalFilename: input.originalFilename,
        storedFilename,
        relativePath,
        thumbnailRelativePath,
        mimeType: processed.detectedMimeType,
        fileSize: input.bytes.byteLength,
        checksumSha256: createHash('sha256').update(input.bytes).digest('hex'),
        visibility: 'gm',
        width: processed.image.width,
        height: processed.image.height,
        sourceKind: input.sourceKind,
        sourceUrl: input.sourceUrl ?? null,
        processedMimeType: 'image/webp',
        processingStatus: 'ready',
        createdAt: timestamp,
        updatedAt: timestamp,
        revision: 1,
      };
      const result = this.dependencies.repository.insertAndSetCampaignCover({
        campaignId: input.campaignId,
        campaignRevision: input.revision,
        campaignUpdatedAt: timestamp,
        attachment,
      });
      metadataCommitted = true;
      return imageImportResultSchema.parse({ status: 'imported', ...result });
    } catch (error) {
      if (!metadataCommitted) {
        await Promise.allSettled([
          ...(imageMoved ? [rm(finalImage, { force: true })] : []),
          ...(thumbnailMoved ? [rm(finalThumbnail, { force: true })] : []),
        ]);
      }
      throw error;
    } finally {
      await rm(stagingDirectory, { recursive: true, force: true });
    }
  }
}

interface InternalImportInput {
  campaignId: string;
  revision: number;
  oversizeMode?: 'resize' | 'crop';
  bytes: Uint8Array;
  originalFilename: string;
  sourceKind: 'file' | 'clipboard' | 'drag_drop' | 'url';
  sourceUrl?: string;
  declaredMimeType?: string;
  expectedMimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
}

async function readBoundedSelectedFile(selectedPath: string): Promise<Uint8Array> {
  const handle = await open(selectedPath, 'r');
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) {
      throw new AppError('IMAGE_FILE_INVALID', 'O item selecionado não é um arquivo regular.');
    }
    if (stats.size <= 0) throw new AppError('IMAGE_FILE_EMPTY', 'A imagem está vazia.');
    if (stats.size > maximumImageBytes) throw payloadTooLarge(stats.size);
    const bytes = await handle.readFile();
    if (bytes.byteLength > maximumImageBytes) throw payloadTooLarge(bytes.byteLength);
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  } finally {
    await handle.close();
  }
}

function payloadTooLarge(receivedBytes: number): AppError {
  return new AppError('IMAGE_PAYLOAD_TOO_LARGE', 'A imagem ultrapassa o limite de 10 MB.', {
    maximumBytes: maximumImageBytes,
    receivedBytes,
  });
}
