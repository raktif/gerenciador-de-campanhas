import { z } from 'zod';
import { relativePlacements } from '../ordering/move-relative';
import { attachmentDisplaySchema, attachmentPreviewSchema, attachmentSchema } from './attachments';
import {
  imageBytesSchema,
  imageImportCancelledSchema,
  imageImportOversizeChoiceRequiredSchema,
  isStrictHttpUrl,
} from './image-imports';
import { imageOversizeModes } from './image-processing';
import type { Result } from './result';

const optionalImageTextSchema = z.string().trim().min(1).max(1000).nullable();
const requiredAltTextSchema = z.string().trim().min(1).max(1000);

export const imageFieldValueSchema = z
  .object({
    id: z.uuid(),
    entityId: z.uuid(),
    fieldDefinitionId: z.uuid(),
    attachmentId: z.uuid(),
    caption: optionalImageTextSchema,
    altText: requiredAltTextSchema,
    sortOrder: z.number().int().nonnegative(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    revision: z.number().int().positive(),
  })
  .strict();
export type ImageFieldValue = z.infer<typeof imageFieldValueSchema>;

export const imageFieldValueDetailsSchema = z
  .object({ value: imageFieldValueSchema, attachment: attachmentSchema })
  .strict();
export type ImageFieldValueDetails = z.infer<typeof imageFieldValueDetailsSchema>;

const imageFieldIdentitySchema = {
  campaignId: z.uuid(),
  entityId: z.uuid(),
  fieldDefinitionId: z.uuid(),
  caption: optionalImageTextSchema.default(null),
  altText: requiredAltTextSchema,
  oversizeMode: z.enum(imageOversizeModes).optional(),
};

export const selectLocalImageFieldValueInputSchema = z
  .object({ ...imageFieldIdentitySchema, pendingImportId: z.uuid().optional() })
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
export type SelectLocalImageFieldValueInput = z.infer<typeof selectLocalImageFieldValueInputSchema>;

export const importImageFieldValueBytesInputSchema = z
  .object({
    ...imageFieldIdentitySchema,
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
export type ImportImageFieldValueBytesInput = z.infer<typeof importImageFieldValueBytesInputSchema>;

export const importImageFieldValueUrlInputSchema = z
  .object({
    ...imageFieldIdentitySchema,
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
export type ImportImageFieldValueUrlInput = z.infer<typeof importImageFieldValueUrlInputSchema>;

export const imageFieldValueImportedSchema = z
  .object({
    status: z.literal('imported'),
    value: imageFieldValueSchema,
    attachment: attachmentSchema,
  })
  .strict();
export const imageFieldValueImportResultSchema = z.discriminatedUnion('status', [
  imageImportCancelledSchema,
  imageImportOversizeChoiceRequiredSchema,
  imageFieldValueImportedSchema,
]);
export type ImageFieldValueImportResult = z.infer<typeof imageFieldValueImportResultSchema>;

export const listImageFieldValuesInputSchema = z
  .object({
    campaignId: z.uuid(),
    entityId: z.uuid(),
    fieldDefinitionId: z.uuid(),
  })
  .strict();
export type ListImageFieldValuesInput = z.infer<typeof listImageFieldValuesInputSchema>;
export const imageFieldValueListSchema = z.array(imageFieldValueDetailsSchema);

export const getImageFieldValueInputSchema = z
  .object({ campaignId: z.uuid(), id: z.uuid() })
  .strict();
export type GetImageFieldValueInput = z.infer<typeof getImageFieldValueInputSchema>;

export const imageFieldValueMetadataPatchSchema = z
  .object({
    caption: optionalImageTextSchema.optional(),
    altText: requiredAltTextSchema.optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'Informe ao menos uma alteração.');
export const updateImageFieldValueInputSchema = z
  .object({
    campaignId: z.uuid(),
    id: z.uuid(),
    revision: z.number().int().positive(),
    patch: imageFieldValueMetadataPatchSchema,
  })
  .strict();
export type UpdateImageFieldValueInput = z.infer<typeof updateImageFieldValueInputSchema>;

export const removeImageFieldValueInputSchema = z
  .object({ campaignId: z.uuid(), id: z.uuid(), revision: z.number().int().positive() })
  .strict();
export type RemoveImageFieldValueInput = z.infer<typeof removeImageFieldValueInputSchema>;

export const moveImageFieldValueInputSchema = z
  .object({
    campaignId: z.uuid(),
    entityId: z.uuid(),
    fieldDefinitionId: z.uuid(),
    sourceId: z.uuid(),
    sourceRevision: z.number().int().positive(),
    targetId: z.uuid(),
    targetRevision: z.number().int().positive(),
    placement: z.enum(relativePlacements),
  })
  .strict()
  .refine((input) => input.sourceId !== input.targetId, {
    path: ['targetId'],
    message: 'A origem e o destino devem ser diferentes.',
  });
export type MoveImageFieldValueInput = z.infer<typeof moveImageFieldValueInputSchema>;

export const imageFieldValuePreviewSchema = attachmentPreviewSchema;
export type ImageFieldValuePreview = z.infer<typeof imageFieldValuePreviewSchema>;
export const imageFieldValueDisplaySchema = attachmentDisplaySchema;
export type ImageFieldValueDisplay = z.infer<typeof imageFieldValueDisplaySchema>;

export interface ImageFieldValueGateway {
  selectLocal(input: SelectLocalImageFieldValueInput): Promise<Result<ImageFieldValueImportResult>>;
  importBytes(input: ImportImageFieldValueBytesInput): Promise<Result<ImageFieldValueImportResult>>;
  importUrl(input: ImportImageFieldValueUrlInput): Promise<Result<ImageFieldValueImportResult>>;
  list(input: ListImageFieldValuesInput): Promise<Result<ImageFieldValueDetails[]>>;
  getPreview(input: GetImageFieldValueInput): Promise<Result<ImageFieldValuePreview>>;
  getDisplay(input: GetImageFieldValueInput): Promise<Result<ImageFieldValueDisplay>>;
  update(input: UpdateImageFieldValueInput): Promise<Result<ImageFieldValueDetails>>;
  remove(input: RemoveImageFieldValueInput): Promise<Result<ImageFieldValueDetails>>;
  move(input: MoveImageFieldValueInput): Promise<Result<ImageFieldValueDetails[]>>;
}
