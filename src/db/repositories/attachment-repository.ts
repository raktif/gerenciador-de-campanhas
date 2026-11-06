import type Database from 'better-sqlite3';
import { attachmentSchema, type Attachment } from '../../core/contracts/attachments';
import { campaignSchema, type Campaign } from '../../core/contracts/campaigns';
import type {
  CampaignCover,
  DeleteAttachmentInput,
  SetCampaignCoverInput,
} from '../../core/contracts/campaign-covers';
import type {
  EntityReferenceImage,
  SetEntityReferenceImageInput,
} from '../../core/contracts/entity-reference-images';
import { entitySchema, type Entity } from '../../core/contracts/entities';
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

export interface InsertEntityReferenceImageInput {
  campaignId: string;
  entityId: string;
  entityRevision: number;
  entityUpdatedAt: string;
  attachment: AttachmentPersistenceRecord;
}

export interface EntityReferenceImagePersistenceResult {
  entity: Entity;
  attachment: Attachment;
}

export interface UpdateAttachmentStatusInput {
  campaignId: string;
  id: string;
  revision: number;
  processingStatus: Attachment['processingStatus'];
  updatedAt: string;
}

export interface AttachmentDeletionCandidate {
  attachment: Attachment;
  relativePath: string;
  thumbnailRelativePath: string;
}

export interface AttachmentDeletionIdentity {
  attachmentId: string;
  campaignId: string;
  revision: number;
  relativePath: string;
  thumbnailRelativePath: string;
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

      insertAttachmentRecord(this.database, input.attachment);
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

  public insertAndSetEntityReferenceImage(
    input: InsertEntityReferenceImageInput,
  ): EntityReferenceImagePersistenceResult {
    if (input.attachment.campaignId !== input.campaignId) throw attachmentCampaignMismatch();
    return this.database.transaction(() => {
      const entity = this.requireEntityRevision(
        input.campaignId,
        input.entityId,
        input.entityRevision,
      );
      insertAttachmentRecord(this.database, input.attachment);
      this.updateEntityReferenceImage(
        entity.campaignId,
        entity.id,
        input.entityRevision,
        input.attachment.id,
        input.entityUpdatedAt,
      );
      const updated = this.readEntity(input.campaignId, input.entityId);
      const attachment = this.findById(input.campaignId, input.attachment.id);
      if (updated === null || attachment === null) {
        throw new AppError(
          'ATTACHMENT_PERSISTENCE_FAILED',
          'A imagem de referência não pôde ser confirmada.',
        );
      }
      return { entity: updated, attachment };
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

  public getCampaignCover(campaignId: string): CampaignCover {
    const campaign = this.readCampaign(campaignId);
    if (campaign === null) throw campaignNotFound(campaignId);
    if (campaign.coverAttachmentId === null) return { campaign, attachment: null };
    const attachment = this.findById(campaignId, campaign.coverAttachmentId);
    if (attachment === null) {
      throw new AppError(
        'CAMPAIGN_COVER_INVALID',
        'A capa da campanha referencia um anexo inválido.',
      );
    }
    return { campaign, attachment };
  }

  public setCampaignCover(input: SetCampaignCoverInput, updatedAt: string): CampaignCover {
    return this.database.transaction(() => {
      const campaign = this.requireCampaignRevision(input.campaignId, input.revision);
      const attachment = this.requireOwnedAttachment(input.campaignId, input.attachmentId);
      if (attachment.processingStatus !== 'ready') {
        throw new AppError(
          'ATTACHMENT_NOT_READY',
          'Somente um anexo pronto pode ser usado como capa.',
        );
      }
      if (campaign.coverAttachmentId === input.attachmentId) {
        throw new AppError(
          'ATTACHMENT_ALREADY_COVER',
          'O anexo informado já é a capa da campanha.',
        );
      }
      this.updateCampaignCover(input.campaignId, input.revision, input.attachmentId, updatedAt);
      return this.getCampaignCover(input.campaignId);
    })();
  }

  public removeCampaignCover(
    input: { campaignId: string; revision: number },
    updatedAt: string,
  ): CampaignCover {
    return this.database.transaction(() => {
      const campaign = this.requireCampaignRevision(input.campaignId, input.revision);
      if (campaign.coverAttachmentId === null) {
        throw new AppError('CAMPAIGN_COVER_NOT_SET', 'A campanha não possui capa para remover.');
      }
      this.updateCampaignCover(input.campaignId, input.revision, null, updatedAt);
      return this.getCampaignCover(input.campaignId);
    })();
  }

  public getEntityReferenceImage(campaignId: string, entityId: string): EntityReferenceImage {
    const entity = this.readEntity(campaignId, entityId);
    if (entity === null) throw entityNotFound(entityId);
    if (entity.referenceImageAttachmentId === null) return { entity, attachment: null };
    const attachment = this.findById(campaignId, entity.referenceImageAttachmentId);
    if (attachment === null) {
      throw new AppError(
        'ENTITY_REFERENCE_IMAGE_INVALID',
        'A entidade referencia uma imagem inválida.',
      );
    }
    return { entity, attachment };
  }

  public setEntityReferenceImage(
    input: SetEntityReferenceImageInput,
    updatedAt: string,
  ): EntityReferenceImage {
    return this.database.transaction(() => {
      const entity = this.requireEntityRevision(input.campaignId, input.entityId, input.revision);
      const attachment = this.requireOwnedAttachment(input.campaignId, input.attachmentId);
      if (attachment.processingStatus !== 'ready') {
        throw new AppError(
          'ATTACHMENT_NOT_READY',
          'Somente um anexo pronto pode ser usado como imagem de referência.',
        );
      }
      if (entity.referenceImageAttachmentId === input.attachmentId) {
        throw new AppError(
          'ATTACHMENT_ALREADY_ENTITY_REFERENCE',
          'O anexo informado já é a imagem de referência da entidade.',
        );
      }
      this.updateEntityReferenceImage(
        input.campaignId,
        input.entityId,
        input.revision,
        input.attachmentId,
        updatedAt,
      );
      return this.getEntityReferenceImage(input.campaignId, input.entityId);
    })();
  }

  public removeEntityReferenceImage(
    input: { campaignId: string; entityId: string; revision: number },
    updatedAt: string,
  ): EntityReferenceImage {
    return this.database.transaction(() => {
      const entity = this.requireEntityRevision(input.campaignId, input.entityId, input.revision);
      if (entity.referenceImageAttachmentId === null) {
        throw new AppError(
          'ENTITY_REFERENCE_IMAGE_NOT_SET',
          'A entidade não possui imagem de referência para remover.',
        );
      }
      this.updateEntityReferenceImage(
        input.campaignId,
        input.entityId,
        input.revision,
        null,
        updatedAt,
      );
      return this.getEntityReferenceImage(input.campaignId, input.entityId);
    })();
  }

  public prepareAttachmentDeletion(input: DeleteAttachmentInput): AttachmentDeletionCandidate {
    const campaign = this.readCampaign(input.campaignId);
    if (campaign === null) throw campaignNotFound(input.campaignId);
    const row = this.readPrivateAttachment(input.attachmentId);
    if (row === null) throw attachmentNotFound();
    if (row.campaign_id !== input.campaignId) throw attachmentCampaignMismatch();
    const attachment = attachmentSchema.parse(toAttachment(row));
    if (attachment.revision !== input.revision) {
      throw revisionConflict(input.revision, attachment.revision);
    }
    if (
      campaign.coverAttachmentId === input.attachmentId ||
      this.isEntityReference(input.attachmentId) ||
      this.isImageFieldValue(input.attachmentId)
    )
      throw attachmentInUse();
    return {
      attachment,
      relativePath: row.relative_path,
      thumbnailRelativePath: row.thumbnail_relative_path,
    };
  }

  public deleteUnusedAttachment(input: DeleteAttachmentInput): Attachment {
    return this.database.transaction(() => {
      const candidate = this.prepareAttachmentDeletion(input);
      const referenced = this.database
        .prepare(
          `SELECT 1 FROM campaigns WHERE cover_attachment_id = ?
           UNION ALL
           SELECT 1 FROM entities WHERE reference_image_attachment_id = ?
           UNION ALL
           SELECT 1 FROM image_field_values WHERE attachment_id = ?
           LIMIT 1`,
        )
        .get(input.attachmentId, input.attachmentId, input.attachmentId);
      if (referenced !== undefined) throw attachmentInUse();
      const deletion = this.database
        .prepare(
          `DELETE FROM attachments
           WHERE id = ? AND campaign_id = ? AND revision = ?
             AND NOT EXISTS (
               SELECT 1 FROM campaigns WHERE cover_attachment_id = attachments.id
             )
             AND NOT EXISTS (
               SELECT 1 FROM entities WHERE reference_image_attachment_id = attachments.id
             )
             AND NOT EXISTS (
               SELECT 1 FROM image_field_values WHERE attachment_id = attachments.id
             )`,
        )
        .run(input.attachmentId, input.campaignId, input.revision);
      if (deletion.changes !== 1) {
        const current = this.findById(input.campaignId, input.attachmentId);
        if (current === null) throw attachmentNotFound();
        throw revisionConflict(input.revision, current.revision);
      }
      return candidate.attachment;
    })();
  }

  public findAttachmentDeletionIdentity(attachmentId: string): AttachmentDeletionIdentity | null {
    const row = this.readPrivateAttachment(attachmentId);
    if (row === null) return null;
    return {
      attachmentId: row.id,
      campaignId: row.campaign_id,
      revision: row.revision,
      relativePath: row.relative_path,
      thumbnailRelativePath: row.thumbnail_relative_path,
    };
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

  private requireCampaignRevision(id: string, revision: number): Campaign {
    const campaign = this.readCampaign(id);
    if (campaign === null) throw campaignNotFound(id);
    if (campaign.revision !== revision) throw revisionConflict(revision, campaign.revision);
    return campaign;
  }

  private requireOwnedAttachment(campaignId: string, attachmentId: string): Attachment {
    const row = this.readPrivateAttachment(attachmentId);
    if (row === null) throw attachmentNotFound();
    if (row.campaign_id !== campaignId) throw attachmentCampaignMismatch();
    return attachmentSchema.parse(toAttachment(row));
  }

  private readEntity(campaignId: string, entityId: string): Entity | null {
    const row = this.database.prepare(entityPublicSelect).get(entityId, campaignId) as
      EntityRow | undefined;
    return row === undefined ? null : entitySchema.parse(toEntity(row));
  }

  private requireEntityRevision(campaignId: string, entityId: string, revision: number): Entity {
    const entity = this.readEntity(campaignId, entityId);
    if (entity === null) throw entityNotFound(entityId);
    if (entity.revision !== revision) throw revisionConflict(revision, entity.revision);
    return entity;
  }

  private isEntityReference(attachmentId: string): boolean {
    return (
      this.database
        .prepare('SELECT 1 FROM entities WHERE reference_image_attachment_id = ? LIMIT 1')
        .get(attachmentId) !== undefined
    );
  }

  private isImageFieldValue(attachmentId: string): boolean {
    return (
      this.database
        .prepare('SELECT 1 FROM image_field_values WHERE attachment_id = ? LIMIT 1')
        .get(attachmentId) !== undefined
    );
  }

  private readPrivateAttachment(id: string): PrivateAttachmentRow | null {
    const row = this.database.prepare(attachmentPrivateSelect).get(id) as
      PrivateAttachmentRow | undefined;
    return row ?? null;
  }

  private updateCampaignCover(
    campaignId: string,
    revision: number,
    attachmentId: string | null,
    updatedAt: string,
  ): void {
    const update = this.database
      .prepare(
        `UPDATE campaigns
         SET cover_attachment_id = ?, updated_at = ?, revision = revision + 1
         WHERE id = ? AND revision = ?`,
      )
      .run(attachmentId, updatedAt, campaignId, revision);
    if (update.changes !== 1) {
      const current = this.readCampaignRevision(campaignId);
      if (current === null) throw campaignNotFound(campaignId);
      throw revisionConflict(revision, current);
    }
  }

  private updateEntityReferenceImage(
    campaignId: string,
    entityId: string,
    revision: number,
    attachmentId: string | null,
    updatedAt: string,
  ): void {
    const update = this.database
      .prepare(
        `UPDATE entities
         SET reference_image_attachment_id = ?, updated_at = ?, revision = revision + 1
         WHERE id = ? AND campaign_id = ? AND revision = ?`,
      )
      .run(attachmentId, updatedAt, entityId, campaignId, revision);
    if (update.changes !== 1) {
      const current = this.readEntity(campaignId, entityId);
      if (current === null) throw entityNotFound(entityId);
      throw revisionConflict(revision, current.revision);
    }
  }
}

const attachmentPublicSelect = `
  SELECT id, campaign_id, original_filename, mime_type, file_size, checksum_sha256,
         visibility, width, height, source_kind, processed_mime_type, processing_status,
         created_at, updated_at, revision
  FROM attachments
  WHERE id = ? AND campaign_id = ?
`;

const attachmentPrivateSelect = `
  SELECT id, campaign_id, original_filename, mime_type, file_size, checksum_sha256,
         visibility, width, height, source_kind, processed_mime_type, processing_status,
         created_at, updated_at, revision, relative_path, thumbnail_relative_path
  FROM attachments
  WHERE id = ?
`;

const campaignPublicSelect = `
  SELECT id, name, system_name, concept, genre, tone, summary, cover_attachment_id,
         status, created_at, updated_at, archived_at, revision
  FROM campaigns
  WHERE id = ?
`;

const entityPublicSelect = `
  SELECT id, campaign_id, entity_type_id, reference_image_attachment_id, name, summary,
         canon_state, knowledge_state, visibility, origin_kind, source_id,
         created_at, updated_at, archived_at, revision
  FROM entities
  WHERE id = ? AND campaign_id = ?
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

interface PrivateAttachmentRow extends AttachmentRow {
  relative_path: string;
  thumbnail_relative_path: string;
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

interface EntityRow {
  id: string;
  campaign_id: string;
  entity_type_id: string;
  reference_image_attachment_id: string | null;
  name: string;
  summary: string | null;
  canon_state: Entity['canonState'];
  knowledge_state: Entity['knowledgeState'];
  visibility: Entity['visibility'];
  origin_kind: Entity['originKind'];
  source_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  revision: number;
}

export function insertAttachmentRecord(
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

function toEntity(row: EntityRow): Entity {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    entityTypeId: row.entity_type_id,
    referenceImageAttachmentId: row.reference_image_attachment_id,
    name: row.name,
    summary: row.summary,
    canonState: row.canon_state,
    knowledgeState: row.knowledge_state,
    visibility: row.visibility,
    originKind: row.origin_kind,
    sourceId: row.source_id,
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

function attachmentCampaignMismatch(): AppError {
  return new AppError('ATTACHMENT_CAMPAIGN_MISMATCH', 'O anexo não pertence à campanha informada.');
}

function attachmentInUse(): AppError {
  return new AppError(
    'ATTACHMENT_IN_USE',
    'O anexo não pode ser excluído enquanto estiver em uso.',
  );
}

function entityNotFound(id: string): AppError {
  return new AppError('ENTITY_NOT_FOUND', 'A entidade não foi encontrada.', { id });
}

function revisionConflict(expectedRevision: number, currentRevision: number): AppError {
  return new AppError('REVISION_CONFLICT', 'O registro foi alterado em outra operação.', {
    expectedRevision,
    currentRevision,
  });
}
