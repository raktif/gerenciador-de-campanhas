import type Database from 'better-sqlite3';
import { attachmentSchema, type Attachment } from '../../core/contracts/attachments';
import {
  imageFieldValueDetailsSchema,
  imageFieldValueSchema,
  type ImageFieldValue,
  type ImageFieldValueDetails,
  type ListImageFieldValuesInput,
  type MoveImageFieldValueInput,
  type RemoveImageFieldValueInput,
  type UpdateImageFieldValueInput,
} from '../../core/contracts/image-field-values';
import { AppError } from '../../core/errors/app-error';
import { moveRelative } from '../../core/ordering/move-relative';
import { insertAttachmentRecord, type AttachmentPersistenceRecord } from './attachment-repository';

export interface InsertImageFieldValueWithAttachmentInput {
  campaignId: string;
  entityId: string;
  fieldDefinitionId: string;
  valueId: string;
  caption: string | null;
  altText: string;
  timestamp: string;
  attachment: AttachmentPersistenceRecord;
}

export class ImageFieldValueRepository {
  public constructor(private readonly database: Database.Database) {}

  public insertWithAttachment(
    input: InsertImageFieldValueWithAttachmentInput,
  ): ImageFieldValueDetails {
    return this.database.transaction(() => {
      this.requireTarget(input.campaignId, input.entityId, input.fieldDefinitionId);
      if (
        input.attachment.campaignId !== input.campaignId ||
        input.attachment.processingStatus !== 'ready'
      ) {
        throw new AppError(
          'IMAGE_FIELD_ATTACHMENT_INVALID',
          'A imagem deve estar pronta e pertencer à campanha informada.',
        );
      }
      const last = this.database
        .prepare(
          `SELECT sort_order
           FROM image_field_values
           WHERE entity_id = ? AND field_definition_id = ?
           ORDER BY sort_order DESC, id DESC
           LIMIT 1`,
        )
        .get(input.entityId, input.fieldDefinitionId) as { sort_order: number } | undefined;
      insertAttachmentRecord(this.database, input.attachment);
      this.database
        .prepare(
          `INSERT INTO image_field_values (
            id, entity_id, field_definition_id, attachment_id, caption, alt_text,
            sort_order, created_at, updated_at, revision
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        )
        .run(
          input.valueId,
          input.entityId,
          input.fieldDefinitionId,
          input.attachment.id,
          input.caption,
          input.altText,
          (last?.sort_order ?? -1) + 1,
          input.timestamp,
          input.timestamp,
        );
      const created = this.findById(input.campaignId, input.valueId);
      if (created === null) {
        throw new AppError(
          'IMAGE_FIELD_PERSISTENCE_FAILED',
          'A imagem personalizada não pôde ser confirmada.',
        );
      }
      return created;
    })();
  }

  public findById(campaignId: string, id: string): ImageFieldValueDetails | null {
    const row = this.database.prepare(detailsSelectById).get(id, campaignId) as
      ImageFieldValueRow | undefined;
    return row === undefined ? null : toDetails(row);
  }

  public list(input: ListImageFieldValuesInput): ImageFieldValueDetails[] {
    this.requireTarget(input.campaignId, input.entityId, input.fieldDefinitionId, false);
    return (
      this.database
        .prepare(
          `${detailsSelectBase}
           WHERE i.entity_id = ? AND i.field_definition_id = ? AND e.campaign_id = ?
           ORDER BY i.sort_order, i.id`,
        )
        .all(input.entityId, input.fieldDefinitionId, input.campaignId) as ImageFieldValueRow[]
    ).map(toDetails);
  }

  public update(input: UpdateImageFieldValueInput, updatedAt: string): ImageFieldValueDetails {
    const current = this.requireValue(input.campaignId, input.id);
    const update = this.database
      .prepare(
        `UPDATE image_field_values
         SET caption = ?,
             alt_text = ?,
             updated_at = ?,
             revision = revision + 1
         WHERE id = ? AND revision = ?
           AND EXISTS (
             SELECT 1 FROM entities
             WHERE entities.id = image_field_values.entity_id
               AND entities.campaign_id = ?
           )`,
      )
      .run(
        input.patch.caption === undefined ? current.value.caption : input.patch.caption,
        input.patch.altText === undefined ? current.value.altText : input.patch.altText,
        updatedAt,
        input.id,
        input.revision,
        input.campaignId,
      );
    if (update.changes !== 1)
      throw this.revisionOrNotFound(input.campaignId, input.id, input.revision);
    return this.requireValue(input.campaignId, input.id);
  }

  public remove(input: RemoveImageFieldValueInput): ImageFieldValueDetails {
    const current = this.requireValue(input.campaignId, input.id);
    const removal = this.database
      .prepare(
        `DELETE FROM image_field_values
         WHERE id = ? AND revision = ?
           AND EXISTS (
             SELECT 1 FROM entities
             WHERE entities.id = image_field_values.entity_id
               AND entities.campaign_id = ?
           )`,
      )
      .run(input.id, input.revision, input.campaignId);
    if (removal.changes !== 1)
      throw this.revisionOrNotFound(input.campaignId, input.id, input.revision);
    return current;
  }

  public move(input: MoveImageFieldValueInput, updatedAt: string): ImageFieldValueDetails[] {
    return this.database.transaction(() => {
      const current = this.list(input);
      const source = current.find(({ value }) => value.id === input.sourceId);
      const target = current.find(({ value }) => value.id === input.targetId);
      if (source === undefined) throw imageFieldValueNotFound(input.sourceId);
      if (target === undefined) throw imageFieldValueNotFound(input.targetId);
      if (source.value.revision !== input.sourceRevision)
        throw revisionConflict(source.value, input.sourceRevision);
      if (target.value.revision !== input.targetRevision)
        throw revisionConflict(target.value, input.targetRevision);

      const ordered = moveRelative(
        current.map(({ value }) => value),
        input,
      );
      ordered.forEach((value, sortOrder) => {
        if (value.sortOrder === sortOrder) return;
        const result = this.database
          .prepare(
            `UPDATE image_field_values
             SET sort_order = ?, updated_at = ?, revision = revision + 1
             WHERE id = ? AND entity_id = ? AND field_definition_id = ? AND revision = ?`,
          )
          .run(
            sortOrder,
            updatedAt,
            value.id,
            input.entityId,
            input.fieldDefinitionId,
            value.revision,
          );
        if (result.changes !== 1) throw revisionConflict(value, value.revision);
      });
      return this.list(input);
    })();
  }

  private requireTarget(
    campaignId: string,
    entityId: string,
    fieldDefinitionId: string,
    requireActive = true,
  ): void {
    const row = this.database
      .prepare(
        `SELECT 1
         FROM entities e
         JOIN field_definitions f
           ON f.id = ? AND f.entity_type_id = e.entity_type_id AND f.data_type = 'image'
         WHERE e.id = ? AND e.campaign_id = ?
           AND (? = 0 OR f.is_archived = 0)
         LIMIT 1`,
      )
      .get(fieldDefinitionId, entityId, campaignId, requireActive ? 1 : 0);
    if (row === undefined) {
      throw new AppError(
        'IMAGE_FIELD_TARGET_NOT_FOUND',
        'A entidade ou o campo de imagem não está disponível nesta campanha.',
      );
    }
  }

  private requireValue(campaignId: string, id: string): ImageFieldValueDetails {
    const value = this.findById(campaignId, id);
    if (value === null) throw imageFieldValueNotFound(id);
    return value;
  }

  private revisionOrNotFound(campaignId: string, id: string, expected: number): AppError {
    const current = this.findById(campaignId, id);
    return current === null
      ? imageFieldValueNotFound(id)
      : revisionConflict(current.value, expected);
  }
}

const detailsSelectBase = `
  SELECT
    i.id AS value_id, i.entity_id, i.field_definition_id, i.attachment_id,
    i.caption, i.alt_text, i.sort_order, i.created_at AS value_created_at,
    i.updated_at AS value_updated_at, i.revision AS value_revision,
    a.campaign_id AS attachment_campaign_id, a.original_filename, a.mime_type,
    a.file_size, a.checksum_sha256, a.visibility, a.width, a.height, a.source_kind,
    a.processed_mime_type, a.processing_status, a.created_at AS attachment_created_at,
    a.updated_at AS attachment_updated_at, a.revision AS attachment_revision
  FROM image_field_values i
  JOIN entities e ON e.id = i.entity_id
  JOIN attachments a ON a.id = i.attachment_id
`;
const detailsSelectById = `${detailsSelectBase} WHERE i.id = ? AND e.campaign_id = ?`;

interface ImageFieldValueRow {
  value_id: string;
  entity_id: string;
  field_definition_id: string;
  attachment_id: string;
  caption: string | null;
  alt_text: string | null;
  sort_order: number;
  value_created_at: string;
  value_updated_at: string;
  value_revision: number;
  attachment_campaign_id: string;
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
  attachment_created_at: string;
  attachment_updated_at: string;
  attachment_revision: number;
}

function toDetails(row: ImageFieldValueRow): ImageFieldValueDetails {
  return imageFieldValueDetailsSchema.parse({
    value: imageFieldValueSchema.parse({
      id: row.value_id,
      entityId: row.entity_id,
      fieldDefinitionId: row.field_definition_id,
      attachmentId: row.attachment_id,
      caption: row.caption,
      altText: row.alt_text,
      sortOrder: row.sort_order,
      createdAt: row.value_created_at,
      updatedAt: row.value_updated_at,
      revision: row.value_revision,
    }),
    attachment: attachmentSchema.parse({
      id: row.attachment_id,
      campaignId: row.attachment_campaign_id,
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
      createdAt: row.attachment_created_at,
      updatedAt: row.attachment_updated_at,
      revision: row.attachment_revision,
    }),
  });
}

function imageFieldValueNotFound(id: string): AppError {
  return new AppError(
    'IMAGE_FIELD_VALUE_NOT_FOUND',
    'A imagem personalizada não foi encontrada nesta campanha.',
    { id },
  );
}

function revisionConflict(current: ImageFieldValue, expectedRevision: number): AppError {
  return new AppError('REVISION_CONFLICT', 'A imagem foi alterada em outra operação.', {
    expectedRevision,
    currentRevision: current.revision,
    current,
  });
}
