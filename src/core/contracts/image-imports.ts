import { z } from 'zod';
import { attachmentSchema } from './attachments';
import { campaignSchema } from './campaigns';
import {
  imageOversizeChoiceRequiredSchema,
  imageOversizeModes,
  maximumImageBytes,
} from './image-processing';
import type { Result } from './result';

const imageBytesSchema = z
  .custom<Uint8Array>((value) => value instanceof Uint8Array, 'Informe bytes binários válidos.')
  .refine((value) => value.byteLength > 0, 'A imagem não pode estar vazia.')
  .refine((value) => value.byteLength <= maximumImageBytes, 'A imagem não pode ultrapassar 10 MB.');

const importIdentitySchema = {
  campaignId: z.uuid(),
  revision: z.number().int().positive(),
  oversizeMode: z.enum(imageOversizeModes).optional(),
};

export const selectLocalImageInputSchema = z.object(importIdentitySchema).strict();
export type SelectLocalImageInput = z.infer<typeof selectLocalImageInputSchema>;

export const importImageBytesInputSchema = z
  .object({
    ...importIdentitySchema,
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
export type ImportImageBytesInput = z.infer<typeof importImageBytesInputSchema>;

export const importImageUrlInputSchema = z
  .object({
    ...importIdentitySchema,
    url: z
      .string()
      .min(1)
      .max(2048)
      .refine((value) => value === value.trim() && isStrictHttpUrl(value), {
        message: 'Informe uma URL HTTP ou HTTPS válida.',
      }),
  })
  .strict();
export type ImportImageUrlInput = z.infer<typeof importImageUrlInputSchema>;

export const imageImportCancelledSchema = z.object({ status: z.literal('cancelled') }).strict();

export const imageImportedSchema = z
  .object({
    status: z.literal('imported'),
    campaign: campaignSchema,
    attachment: attachmentSchema,
  })
  .strict();
export type ImageImported = z.infer<typeof imageImportedSchema>;

export const imageImportResultSchema = z.discriminatedUnion('status', [
  imageImportCancelledSchema,
  imageOversizeChoiceRequiredSchema,
  imageImportedSchema,
]);
export type ImageImportResult = z.infer<typeof imageImportResultSchema>;

export interface ImageImportGateway {
  selectLocal(input: SelectLocalImageInput): Promise<Result<ImageImportResult>>;
  importBytes(input: ImportImageBytesInput): Promise<Result<ImageImportResult>>;
  importUrl(input: ImportImageUrlInput): Promise<Result<ImageImportResult>>;
}

function isStrictHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.hostname !== '' &&
      url.username === '' &&
      url.password === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
}
