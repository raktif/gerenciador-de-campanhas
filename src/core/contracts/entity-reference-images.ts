import { z } from 'zod';
import { attachmentPreviewSchema, attachmentSchema } from './attachments';
import { entitySchema } from './entities';
import {
  imageBytesSchema,
  imageImportCancelledSchema,
  imageImportOversizeChoiceRequiredSchema,
  isStrictHttpUrl,
} from './image-imports';
import { imageOversizeModes } from './image-processing';
import type { Result } from './result';

const entityReferenceIdentitySchema = {
  campaignId: z.uuid(),
  entityId: z.uuid(),
  revision: z.number().int().positive(),
  oversizeMode: z.enum(imageOversizeModes).optional(),
};

export const getEntityReferenceImageInputSchema = z
  .object({ campaignId: z.uuid(), entityId: z.uuid() })
  .strict();
export type GetEntityReferenceImageInput = z.infer<typeof getEntityReferenceImageInputSchema>;

export const setEntityReferenceImageInputSchema = z
  .object({
    campaignId: z.uuid(),
    entityId: z.uuid(),
    attachmentId: z.uuid(),
    revision: z.number().int().positive(),
  })
  .strict();
export type SetEntityReferenceImageInput = z.infer<typeof setEntityReferenceImageInputSchema>;

export const removeEntityReferenceImageInputSchema = z
  .object({
    campaignId: z.uuid(),
    entityId: z.uuid(),
    revision: z.number().int().positive(),
  })
  .strict();
export type RemoveEntityReferenceImageInput = z.infer<
  typeof removeEntityReferenceImageInputSchema
>;

export const selectLocalEntityReferenceImageInputSchema = z
  .object({ ...entityReferenceIdentitySchema, pendingImportId: z.uuid().optional() })
  .strict()
  .superRefine((input, context) => {
    if (input.pendingImportId !== undefined && input.oversizeMode === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['oversizeMode'],
        message: 'Escolha como ajustar a imagem pendente.',
      });
    }
  });
export type SelectLocalEntityReferenceImageInput = z.infer<
  typeof selectLocalEntityReferenceImageInputSchema
>;

export const importEntityReferenceImageBytesInputSchema = z
  .object({
    ...entityReferenceIdentitySchema,
    bytes: imageBytesSchema,
    metadata: z
      .object({
        originalFilename: z
          .string()
          .trim()
          .min(1)
          .max(255)
          .refine((value) => !/[\\/]/u.test(value), 'Informe somente o nome do arquivo.'),
        sourceKind: z.enum(['clipboard', 'drag_drop']),
        declaredMimeType: z.string().trim().min(1).max(127).optional(),
      })
      .strict(),
  })
  .strict();
export type ImportEntityReferenceImageBytesInput = z.infer<
  typeof importEntityReferenceImageBytesInputSchema
>;

export const importEntityReferenceImageUrlInputSchema = z
  .object({
    ...entityReferenceIdentitySchema,
    url: z
      .string()
      .min(1)
      .max(2048)
      .refine((value) => value === value.trim() && isStrictHttpUrl(value), {
        message: 'Informe uma URL HTTP ou HTTPS válida.',
      })
      .optional(),
    pendingImportId: z.uuid().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if ((input.url === undefined) === (input.pendingImportId === undefined)) {
      context.addIssue({
        code: 'custom',
        message: 'Informe uma URL ou uma importação pendente, exclusivamente.',
      });
    }
    if (input.pendingImportId !== undefined && input.oversizeMode === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['oversizeMode'],
        message: 'Escolha como ajustar a imagem pendente.',
      });
    }
  });
export type ImportEntityReferenceImageUrlInput = z.infer<
  typeof importEntityReferenceImageUrlInputSchema
>;

export const entityReferenceImageSchema = z
  .object({ entity: entitySchema, attachment: attachmentSchema.nullable() })
  .strict();
export type EntityReferenceImage = z.infer<typeof entityReferenceImageSchema>;

export const entityReferenceImageImportedSchema = z
  .object({
    status: z.literal('imported'),
    entity: entitySchema,
    attachment: attachmentSchema,
  })
  .strict();

export const entityReferenceImageImportResultSchema = z.discriminatedUnion('status', [
  imageImportCancelledSchema,
  imageImportOversizeChoiceRequiredSchema,
  entityReferenceImageImportedSchema,
]);
export type EntityReferenceImageImportResult = z.infer<
  typeof entityReferenceImageImportResultSchema
>;

export const entityReferenceImagePreviewSchema = attachmentPreviewSchema;
export type EntityReferenceImagePreview = z.infer<typeof entityReferenceImagePreviewSchema>;

export interface EntityReferenceImageGateway {
  selectEntityReferenceLocal(
    input: SelectLocalEntityReferenceImageInput,
  ): Promise<Result<EntityReferenceImageImportResult>>;
  importEntityReferenceBytes(
    input: ImportEntityReferenceImageBytesInput,
  ): Promise<Result<EntityReferenceImageImportResult>>;
  importEntityReferenceUrl(
    input: ImportEntityReferenceImageUrlInput,
  ): Promise<Result<EntityReferenceImageImportResult>>;
  getEntityReference(
    input: GetEntityReferenceImageInput,
  ): Promise<Result<EntityReferenceImage>>;
  getEntityReferencePreview(
    input: GetEntityReferenceImageInput,
  ): Promise<Result<EntityReferenceImagePreview>>;
  setEntityReference(
    input: SetEntityReferenceImageInput,
  ): Promise<Result<EntityReferenceImage>>;
  removeEntityReference(
    input: RemoveEntityReferenceImageInput,
  ): Promise<Result<EntityReferenceImage>>;
}
