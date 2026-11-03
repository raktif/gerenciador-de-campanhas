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
import {
  entityReferenceImageImportResultSchema,
  importEntityReferenceImageBytesInputSchema,
  importEntityReferenceImageUrlInputSchema,
  selectLocalEntityReferenceImageInputSchema,
  type EntityReferenceImageImportResult,
  type ImportEntityReferenceImageBytesInput,
  type ImportEntityReferenceImageUrlInput,
  type SelectLocalEntityReferenceImageInput,
} from '../../core/contracts/entity-reference-images';
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
  private readonly pendingLocalImports = new Map<string, PendingLocalImport>();
  private readonly pendingUrlImports = new Map<string, PendingUrlImport>();
  private readonly pendingEntityLocalImports = new Map<string, PendingEntityLocalImport>();
  private readonly pendingEntityUrlImports = new Map<string, PendingEntityUrlImport>();

  public constructor(private readonly dependencies: ImageImportServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.createId = dependencies.createId ?? randomUUID;
  }

  public async selectLocal(input: SelectLocalImageInput): Promise<ImageImportResult> {
    const parsed = selectLocalImageInputSchema.parse(input);
    this.prunePendingLocalImports();
    if (parsed.pendingImportId !== undefined) {
      const pending = this.pendingLocalImports.get(parsed.pendingImportId);
      this.pendingLocalImports.delete(parsed.pendingImportId);
      if (pending?.campaignId !== parsed.campaignId || pending.revision !== parsed.revision) {
        throw new AppError(
          'IMAGE_PENDING_IMPORT_INVALID',
          'A imagem pendente expirou ou é inválida.',
        );
      }
      return this.processAndPersist({
        campaignId: pending.campaignId,
        revision: pending.revision,
        ...(parsed.oversizeMode === undefined ? {} : { oversizeMode: parsed.oversizeMode }),
        bytes: pending.bytes,
        originalFilename: pending.originalFilename,
        sourceKind: 'file',
      });
    }
    const selectedPath = await this.dependencies.selectImageFile();
    if (selectedPath === null) return { status: 'cancelled' };
    const bytes = await readBoundedSelectedFile(selectedPath);
    const result = await this.processAndPersist({
      campaignId: parsed.campaignId,
      revision: parsed.revision,
      ...(parsed.oversizeMode === undefined ? {} : { oversizeMode: parsed.oversizeMode }),
      bytes,
      originalFilename: path.basename(selectedPath),
      sourceKind: 'file',
    });
    if (result.status !== 'oversize_choice_required') return result;
    const pendingImportId = this.createId();
    this.pendingLocalImports.set(pendingImportId, {
      campaignId: parsed.campaignId,
      revision: parsed.revision,
      bytes,
      originalFilename: path.basename(selectedPath),
      expiresAt: this.now().getTime() + pendingLocalImportLifetimeMilliseconds,
    });
    return imageImportResultSchema.parse({ ...result, pendingImportId });
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
    this.prunePendingUrlImports();
    if (parsed.pendingImportId !== undefined) {
      const pending = this.pendingUrlImports.get(parsed.pendingImportId);
      this.pendingUrlImports.delete(parsed.pendingImportId);
      if (
        pending?.campaignId !== parsed.campaignId ||
        pending.revision !== parsed.revision ||
        parsed.oversizeMode === undefined
      ) {
        throw new AppError(
          'IMAGE_PENDING_IMPORT_INVALID',
          'A imagem pendente expirou ou é inválida.',
        );
      }
      return this.processAndPersist({
        campaignId: pending.campaignId,
        revision: pending.revision,
        oversizeMode: parsed.oversizeMode,
        bytes: pending.bytes,
        originalFilename: pending.originalFilename,
        sourceKind: 'url',
        sourceUrl: pending.sourceUrl,
        declaredMimeType: pending.contentType,
        expectedMimeType: pending.contentType,
      });
    }
    if (this.dependencies.downloader === undefined || parsed.url === undefined) {
      throw new AppError(
        'IMAGE_URL_IMPORT_UNAVAILABLE',
        'A importação remota não está disponível.',
      );
    }
    const downloaded = await this.dependencies.downloader.download(parsed.url);
    const result = await this.processAndPersist({
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
    if (result.status !== 'oversize_choice_required') return result;
    const pendingImportId = this.createId();
    this.pendingUrlImports.set(pendingImportId, {
      campaignId: parsed.campaignId,
      revision: parsed.revision,
      requestedUrl: parsed.url,
      bytes: downloaded.bytes,
      originalFilename: downloaded.originalFilename,
      sourceUrl: downloaded.sourceUrl,
      contentType: downloaded.contentType,
      expiresAt: this.now().getTime() + pendingImportLifetimeMilliseconds,
    });
    return imageImportResultSchema.parse({ ...result, pendingImportId });
  }

  public async selectEntityReferenceLocal(
    input: SelectLocalEntityReferenceImageInput,
  ): Promise<EntityReferenceImageImportResult> {
    const parsed = selectLocalEntityReferenceImageInputSchema.parse(input);
    this.prunePendingEntityLocalImports();
    if (parsed.pendingImportId !== undefined) {
      const pending = this.pendingEntityLocalImports.get(parsed.pendingImportId);
      this.pendingEntityLocalImports.delete(parsed.pendingImportId);
      if (
        pending?.campaignId !== parsed.campaignId ||
        pending.entityId !== parsed.entityId ||
        pending.revision !== parsed.revision
      ) {
        throw new AppError(
          'IMAGE_PENDING_IMPORT_INVALID',
          'A imagem pendente expirou ou é inválida.',
        );
      }
      return this.processAndPersist({
        campaignId: pending.campaignId,
        entityId: pending.entityId,
        revision: pending.revision,
        ...(parsed.oversizeMode === undefined ? {} : { oversizeMode: parsed.oversizeMode }),
        bytes: pending.bytes,
        originalFilename: pending.originalFilename,
        sourceKind: 'file',
      });
    }
    const selectedPath = await this.dependencies.selectImageFile();
    if (selectedPath === null) return { status: 'cancelled' };
    const bytes = await readBoundedSelectedFile(selectedPath);
    const result = await this.processAndPersist({
      campaignId: parsed.campaignId,
      entityId: parsed.entityId,
      revision: parsed.revision,
      ...(parsed.oversizeMode === undefined ? {} : { oversizeMode: parsed.oversizeMode }),
      bytes,
      originalFilename: path.basename(selectedPath),
      sourceKind: 'file',
    });
    if (result.status !== 'oversize_choice_required') return result;
    const pendingImportId = this.createId();
    this.pendingEntityLocalImports.set(pendingImportId, {
      campaignId: parsed.campaignId,
      entityId: parsed.entityId,
      revision: parsed.revision,
      bytes,
      originalFilename: path.basename(selectedPath),
      expiresAt: this.now().getTime() + pendingImportLifetimeMilliseconds,
    });
    return entityReferenceImageImportResultSchema.parse({ ...result, pendingImportId });
  }

  public async importEntityReferenceBytes(
    input: ImportEntityReferenceImageBytesInput,
  ): Promise<EntityReferenceImageImportResult> {
    const parsed = importEntityReferenceImageBytesInputSchema.parse(input);
    return this.processAndPersist({
      campaignId: parsed.campaignId,
      entityId: parsed.entityId,
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

  public async importEntityReferenceUrl(
    input: ImportEntityReferenceImageUrlInput,
  ): Promise<EntityReferenceImageImportResult> {
    const parsed = importEntityReferenceImageUrlInputSchema.parse(input);
    this.prunePendingEntityUrlImports();
    if (parsed.pendingImportId !== undefined) {
      const pending = this.pendingEntityUrlImports.get(parsed.pendingImportId);
      this.pendingEntityUrlImports.delete(parsed.pendingImportId);
      if (
        pending?.campaignId !== parsed.campaignId ||
        pending.entityId !== parsed.entityId ||
        pending.revision !== parsed.revision ||
        parsed.oversizeMode === undefined
      ) {
        throw new AppError(
          'IMAGE_PENDING_IMPORT_INVALID',
          'A imagem pendente expirou ou é inválida.',
        );
      }
      return this.processAndPersist({
        campaignId: pending.campaignId,
        entityId: pending.entityId,
        revision: pending.revision,
        oversizeMode: parsed.oversizeMode,
        bytes: pending.bytes,
        originalFilename: pending.originalFilename,
        sourceKind: 'url',
        sourceUrl: pending.sourceUrl,
        declaredMimeType: pending.contentType,
        expectedMimeType: pending.contentType,
      });
    }
    if (this.dependencies.downloader === undefined || parsed.url === undefined) {
      throw new AppError(
        'IMAGE_URL_IMPORT_UNAVAILABLE',
        'A importação remota não está disponível.',
      );
    }
    const downloaded = await this.dependencies.downloader.download(parsed.url);
    const result = await this.processAndPersist({
      campaignId: parsed.campaignId,
      entityId: parsed.entityId,
      revision: parsed.revision,
      ...(parsed.oversizeMode === undefined ? {} : { oversizeMode: parsed.oversizeMode }),
      bytes: downloaded.bytes,
      originalFilename: downloaded.originalFilename,
      sourceKind: 'url',
      sourceUrl: downloaded.sourceUrl,
      declaredMimeType: downloaded.contentType,
      expectedMimeType: downloaded.contentType,
    });
    if (result.status !== 'oversize_choice_required') return result;
    const pendingImportId = this.createId();
    this.pendingEntityUrlImports.set(pendingImportId, {
      campaignId: parsed.campaignId,
      entityId: parsed.entityId,
      revision: parsed.revision,
      requestedUrl: parsed.url,
      bytes: downloaded.bytes,
      originalFilename: downloaded.originalFilename,
      sourceUrl: downloaded.sourceUrl,
      contentType: downloaded.contentType,
      expiresAt: this.now().getTime() + pendingImportLifetimeMilliseconds,
    });
    return entityReferenceImageImportResultSchema.parse({ ...result, pendingImportId });
  }

  private processAndPersist(input: InternalCoverImportInput): Promise<ImageImportResult>;
  private processAndPersist(
    input: InternalEntityImportInput,
  ): Promise<EntityReferenceImageImportResult>;
  private async processAndPersist(
    input: InternalImportInput,
  ): Promise<ImageImportResult | EntityReferenceImageImportResult> {
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
      const result =
        input.entityId === undefined
          ? this.dependencies.repository.insertAndSetCampaignCover({
              campaignId: input.campaignId,
              campaignRevision: input.revision,
              campaignUpdatedAt: timestamp,
              attachment,
            })
          : this.dependencies.repository.insertAndSetEntityReferenceImage({
              campaignId: input.campaignId,
              entityId: input.entityId,
              entityRevision: input.revision,
              entityUpdatedAt: timestamp,
              attachment,
            });
      metadataCommitted = true;
      return input.entityId === undefined
        ? imageImportResultSchema.parse({ status: 'imported', ...result })
        : entityReferenceImageImportResultSchema.parse({ status: 'imported', ...result });
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

  private prunePendingLocalImports(): void {
    const now = this.now().getTime();
    for (const [id, pending] of this.pendingLocalImports) {
      if (pending.expiresAt <= now) this.pendingLocalImports.delete(id);
    }
  }

  private prunePendingUrlImports(): void {
    const now = this.now().getTime();
    for (const [id, pending] of this.pendingUrlImports) {
      if (pending.expiresAt <= now) this.pendingUrlImports.delete(id);
    }
  }

  private prunePendingEntityLocalImports(): void {
    const now = this.now().getTime();
    for (const [id, pending] of this.pendingEntityLocalImports) {
      if (pending.expiresAt <= now) this.pendingEntityLocalImports.delete(id);
    }
  }

  private prunePendingEntityUrlImports(): void {
    const now = this.now().getTime();
    for (const [id, pending] of this.pendingEntityUrlImports) {
      if (pending.expiresAt <= now) this.pendingEntityUrlImports.delete(id);
    }
  }
}

interface InternalImportInputBase {
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

interface InternalCoverImportInput extends InternalImportInputBase {
  entityId?: never;
}

interface InternalEntityImportInput extends InternalImportInputBase {
  entityId: string;
}

type InternalImportInput = InternalCoverImportInput | InternalEntityImportInput;

interface PendingLocalImport {
  campaignId: string;
  revision: number;
  bytes: Uint8Array;
  originalFilename: string;
  expiresAt: number;
}

interface PendingUrlImport {
  campaignId: string;
  revision: number;
  requestedUrl: string;
  bytes: Uint8Array;
  originalFilename: string;
  sourceUrl: string;
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
  expiresAt: number;
}

interface PendingEntityLocalImport extends PendingLocalImport {
  entityId: string;
}

interface PendingEntityUrlImport extends PendingUrlImport {
  entityId: string;
}

const pendingImportLifetimeMilliseconds = 5 * 60 * 1000;
const pendingLocalImportLifetimeMilliseconds = pendingImportLifetimeMilliseconds;

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
