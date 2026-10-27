import type Database from 'better-sqlite3';
import { attachmentSchema, type Attachment } from '../../core/contracts/attachments';
import { campaignSchema, type Campaign } from '../../core/contracts/campaigns';
import { AppError } from '../../core/errors/app-error';

export interface AttachmentPersistenceRecord extends Attachment {
  storedFilename: string;
  relativePath: string;
  thumbnailRelativePath: string;
  sourceUrl: string | null;
}

export interface InsertCampaignCoverInput {
  campaignId: string;
  campaignRevision: number;
  campaignUpdatedAt: string;
  attachment: AttachmentPersistenceRecord;
}

export interface CampaignCoverPersistenceResult {
  campaign: Campaign;
  attachment: Attachment;
}

export interface UpdateAttachmentStatusInput {
  campaignId: string;
  id: string;
  revision: number;
  processingStatus: Attachment['processingStatus'];
  updatedAt: string;
}

export class AttachmentRepository {
  public constructor(private readonly database: Database.Database) {}

  public findById(campaignId: string, id: string): Attachment | null {
    const row = this.database.prepare(attachmentPublicSelect).get(id, campaignId);
    return row === undefined ? null : attachmentSchema.parse(toAttachment(row as AttachmentRow));
  }

  public insertAndSetCampaignCover(
    input: InsertCampaignCoverInput,
  ): CampaignCoverPersistenceResult {
    if (input.attachment.campaignId !== input.campaignId) {
      throw new AppError(
        'ATTACHMENT_CAMPAIGN_MISMATCH',
        'O anexo não pertence à campanha informada.',
      );
    }

    return this.database.transaction(() => {
      const current = this.readCampaignRevision(input.campaignId);
      if (current === null) throw campaignNotFound(input.campaignId);
      if (current !== input.campaignRevision)
        throw revisionConflict(input.campaignRevision, current);

      insertAttachment(this.database, input.attachment);
      const update = this.database
        .prepare(
          `UPDATE campaigns
           SET cover_attachment_id = ?, updated_at = ?, revision = revision + 1
           WHERE id = ? AND revision = ?`,
        )
        .run(
          input.attachment.id,
          input.campaignUpdatedAt,
          input.campaignId,
          input.campaignRevision,
        );
      if (update.changes !== 1) {
        const revision = this.readCampaignRevision(input.campaignId);
        if (revision === null) throw campaignNotFound(input.campaignId);
        throw revisionConflict(input.campaignRevision, revision);
      }

      const campaign = this.readCampaign(input.campaignId);
      const attachment = this.findById(input.campaignId, input.attachment.id);
      if (campaign === null || attachment === null)
        throw new AppError('ATTACHMENT_PERSISTENCE_FAILED', 'A capa não pôde ser confirmada.');
      return { campaign, attachment };
    })();
  }

  public updateProcessingStatus(input: UpdateAttachmentStatusInput): Attachment {
    const update = this.database
      .prepare(
        `UPDATE attachments
         SET processing_status = ?, updated_at = ?, revision = revision + 1
         WHERE id = ? AND campaign_id = ? AND revision = ?`,
      )
      .run(input.processingStatus, input.updatedAt, input.id, input.campaignId, input.revision);
    if (update.changes !== 1) {
      const current = this.findById(input.campaignId, input.id);
      if (current === null) throw attachmentNotFound();
      throw revisionConflict(input.revision, current.revision);
    }
    const updated = this.findById(input.campaignId, input.id);
    if (updated === null) throw attachmentNotFound();
    return updated;
  }

  private readCampaignRevision(id: string): number | null {
    const row = this.database.prepare('SELECT revision FROM campaigns WHERE id = ?').get(id) as
      { revision: number } | undefined;
    return row?.revision ?? null;
  }

  private readCampaign(id: string): Campaign | null {
    const row = this.database.prepare(campaignPublicSelect).get(id) as CampaignRow | undefined;
    return row === undefined ? null : campaignSchema.parse(toCampaign(row));
  }
}

const attachmentPublicSelect = `
  SELECT id, campaign_id, original_filename, mime_type, file_size, checksum_sha256,
         visibility, width, height, source_kind, processed_mime_type, processing_status,
         created_at, updated_at, revision
  FROM attachments
  WHERE id = ? AND campaign_id = ?
`;

const campaignPublicSelect = `
  SELECT id, name, system_name, concept, genre, tone, summary, cover_attachment_id,
         status, created_at, updated_at, archived_at, revision
  FROM campaigns
  WHERE id = ?
`;

interface AttachmentRow {
  id: string;
  campaign_id: string;
  original_filename: string;
  mime_type: Attachment['mimeType'];
  file_size: number;
  checksum_sha256: string;
  visibility: Attachment['visibility'];
  width: number;
  height: number;
  source_kind: Attachment['sourceKind'];
  processed_mime_type: Attachment['processedMimeType'];
  processing_status: Attachment['processingStatus'];
  created_at: string;
  updated_at: string;
  revision: number;
}

interface CampaignRow {
  id: string;
  name: string;
  system_name: string | null;
  concept: string | null;
  genre: string | null;
  tone: string | null;
  summary: string | null;
  cover_attachment_id: string | null;
  status: Campaign['status'];
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  revision: number;
}

function insertAttachment(
  database: Database.Database,
  attachment: AttachmentPersistenceRecord,
): void {
  database
    .prepare(
      `INSERT INTO attachments (
        id, campaign_id, original_filename, stored_filename, relative_path, mime_type,
        file_size, checksum_sha256, visibility, width, height, thumbnail_relative_path,
        source_kind, source_url, processed_mime_type, processing_status, created_at,
        updated_at, revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      attachment.id,
      attachment.campaignId,
      attachment.originalFilename,
      attachment.storedFilename,
      attachment.relativePath,
      attachment.mimeType,
      attachment.fileSize,
      attachment.checksumSha256,
      attachment.visibility,
      attachment.width,
      attachment.height,
      attachment.thumbnailRelativePath,
      attachment.sourceKind,
      attachment.sourceUrl,
      attachment.processedMimeType,
      attachment.processingStatus,
      attachment.createdAt,
      attachment.updatedAt,
      attachment.revision,
    );
}

function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    checksumSha256: row.checksum_sha256,
    visibility: row.visibility,
    width: row.width,
    height: row.height,
    sourceKind: row.source_kind,
    processedMimeType: row.processed_mime_type,
    processingStatus: row.processing_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
  };
}

function toCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    name: row.name,
    systemName: row.system_name,
    concept: row.concept,
    genre: row.genre,
    tone: row.tone,
    summary: row.summary,
    coverAttachmentId: row.cover_attachment_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    revision: row.revision,
  };
}

function campaignNotFound(id: string): AppError {
  return new AppError('CAMPAIGN_NOT_FOUND', 'A campanha não foi encontrada.', { id });
}

function attachmentNotFound(): AppError {
  return new AppError('ATTACHMENT_NOT_FOUND', 'O anexo não foi encontrado nesta campanha.');
}

function revisionConflict(expectedRevision: number, currentRevision: number): AppError {
  return new AppError('REVISION_CONFLICT', 'O registro foi alterado em outra operação.', {
    expectedRevision,
    currentRevision,
  });
}
