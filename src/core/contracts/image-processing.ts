import { z } from 'zod';
import { attachmentMimeTypes } from './attachments';

export const maximumImageBytes = 10 * 1024 * 1024;
export const maximumImageWidth = 1280;
export const maximumImageHeight = 1024;
export const maximumImagePixels = 40_000_000;
export const maximumThumbnailWidth = 480;
export const maximumThumbnailHeight = 320;

export const imageOversizeModes = ['resize', 'crop'] as const;
export const localImageSourceKinds = ['file', 'clipboard', 'drag_drop', 'url'] as const;

const uint8ArraySchema = z.custom<Uint8Array>(
  (value) => value instanceof Uint8Array,
  'Informe bytes binários válidos.',
);

const imageBytesSchema = uint8ArraySchema
  .refine((value) => value.byteLength > 0, 'A imagem não pode estar vazia.')
  .refine((value) => value.byteLength <= maximumImageBytes, 'A imagem não pode ultrapassar 10 MB.');

export const localImageSourceMetadataSchema = z
  .object({
    originalFilename: z.string().trim().min(1).max(255),
    sourceKind: z.enum(localImageSourceKinds),
    declaredMimeType: z.string().trim().min(1).max(127).optional(),
  })
  .strict();
export type LocalImageSourceMetadata = z.infer<typeof localImageSourceMetadataSchema>;

export const imageProcessingInputSchema = z
  .object({
    bytes: imageBytesSchema,
    metadata: localImageSourceMetadataSchema,
    oversizeMode: z.enum(imageOversizeModes).optional(),
  })
  .strict();
export type ImageProcessingInput = z.infer<typeof imageProcessingInputSchema>;

const processedImageAssetSchema = z
  .object({
    bytes: uint8ArraySchema.refine((value) => value.byteLength > 0),
    mimeType: z.literal('image/webp'),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();
export type ProcessedImageAsset = z.infer<typeof processedImageAssetSchema>;

export const imageProcessingCompletedSchema = z
  .object({
    status: z.literal('processed'),
    detectedMimeType: z.enum(attachmentMimeTypes),
    originalWidth: z.number().int().positive(),
    originalHeight: z.number().int().positive(),
    selectedOversizeMode: z.enum(imageOversizeModes).nullable(),
    image: processedImageAssetSchema.extend({
      width: z.number().int().positive().max(maximumImageWidth),
      height: z.number().int().positive().max(maximumImageHeight),
    }),
    thumbnail: processedImageAssetSchema.extend({
      width: z.number().int().positive().max(maximumThumbnailWidth),
      height: z.number().int().positive().max(maximumThumbnailHeight),
    }),
  })
  .strict();
export type ImageProcessingCompleted = z.infer<typeof imageProcessingCompletedSchema>;

export const imageOversizeChoiceRequiredSchema = z
  .object({
    status: z.literal('oversize_choice_required'),
    detectedMimeType: z.enum(attachmentMimeTypes),
    originalWidth: z.number().int().positive(),
    originalHeight: z.number().int().positive(),
    maximumWidth: z.literal(maximumImageWidth),
    maximumHeight: z.literal(maximumImageHeight),
    allowedModes: z.tuple([z.literal('resize'), z.literal('crop')]),
  })
  .strict();
export type ImageOversizeChoiceRequired = z.infer<typeof imageOversizeChoiceRequiredSchema>;

export const imageProcessingResultSchema = z.discriminatedUnion('status', [
  imageProcessingCompletedSchema,
  imageOversizeChoiceRequiredSchema,
]);
export type ImageProcessingResult = z.infer<typeof imageProcessingResultSchema>;
