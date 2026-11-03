import { z } from 'zod';
import { visibilityStates } from './narrative';

export const attachmentMimeTypes = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const attachmentSourceKinds = ['file', 'url', 'clipboard', 'drag_drop'] as const;
export const attachmentProcessingStatuses = ['pending', 'ready', 'failed'] as const;
export const attachmentRevisionSchema = z.number().int().positive();
export const maximumAttachmentPreviewBytes = 2 * 1024 * 1024;

export const attachmentSchema = z
  .object({
    id: z.uuid(),
    campaignId: z.uuid(),
    originalFilename: z.string().trim().min(1).max(255),
    mimeType: z.enum(attachmentMimeTypes),
    fileSize: z
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
    visibility: z.enum(visibilityStates),
    width: z.number().int().positive().max(1280),
    height: z.number().int().positive().max(1024),
    sourceKind: z.enum(attachmentSourceKinds),
    processedMimeType: z.enum(attachmentMimeTypes),
    processingStatus: z.enum(attachmentProcessingStatuses),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    revision: attachmentRevisionSchema,
  })
  .strict();
export type Attachment = z.infer<typeof attachmentSchema>;

export const attachmentPreviewSchema = z
  .object({
    attachmentId: z.uuid(),
    mimeType: z.literal('image/webp'),
    bytes: z.custom<Uint8Array>(
      (value) =>
        value instanceof Uint8Array &&
        value.byteLength > 0 &&
        value.byteLength <= maximumAttachmentPreviewBytes &&
        hasWebpMagic(value),
      'A miniatura pública deve ser um WebP válido de até 2 MB.',
    ),
  })
  .strict()
  .nullable();
export type AttachmentPreview = z.infer<typeof attachmentPreviewSchema>;

export const setCampaignCoverInputSchema = z
  .object({
    campaignId: z.uuid(),
    attachmentId: z.uuid(),
    revision: z.number().int().positive(),
  })
  .strict();
export type SetCampaignCoverInput = z.infer<typeof setCampaignCoverInputSchema>;

function hasWebpMagic(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}
