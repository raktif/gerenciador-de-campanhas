import { z } from 'zod';
import {
  attachmentSchema,
  setCampaignCoverInputSchema,
  type SetCampaignCoverInput,
} from './attachments';
import { campaignSchema } from './campaigns';
import type { Result } from './result';

export const getCampaignCoverInputSchema = z.object({ campaignId: z.uuid() }).strict();
export type GetCampaignCoverInput = z.infer<typeof getCampaignCoverInputSchema>;

export { setCampaignCoverInputSchema, type SetCampaignCoverInput };

export const removeCampaignCoverInputSchema = z
  .object({
    campaignId: z.uuid(),
    revision: z.number().int().positive(),
  })
  .strict();
export type RemoveCampaignCoverInput = z.infer<typeof removeCampaignCoverInputSchema>;

export const deleteAttachmentInputSchema = z
  .object({
    campaignId: z.uuid(),
    attachmentId: z.uuid(),
    revision: z.number().int().positive(),
  })
  .strict();
export type DeleteAttachmentInput = z.infer<typeof deleteAttachmentInputSchema>;

export const campaignCoverSchema = z
  .object({
    campaign: campaignSchema,
    attachment: attachmentSchema.nullable(),
  })
  .strict();
export type CampaignCover = z.infer<typeof campaignCoverSchema>;

export const maximumCampaignCoverPreviewBytes = 2 * 1024 * 1024;

export const campaignCoverPreviewSchema = z
  .object({
    attachmentId: z.uuid(),
    mimeType: z.literal('image/webp'),
    bytes: z.custom<Uint8Array>(
      (value) =>
        value instanceof Uint8Array &&
        value.byteLength > 0 &&
        value.byteLength <= maximumCampaignCoverPreviewBytes &&
        hasWebpMagic(value),
      'A miniatura pública deve ser um WebP válido de até 2 MB.',
    ),
  })
  .strict()
  .nullable();
export type CampaignCoverPreview = z.infer<typeof campaignCoverPreviewSchema>;

export const deleteAttachmentResultSchema = z
  .object({
    campaignId: z.uuid(),
    attachmentId: z.uuid(),
  })
  .strict();
export type DeleteAttachmentResult = z.infer<typeof deleteAttachmentResultSchema>;

export interface CampaignCoverGateway {
  getCover(input: GetCampaignCoverInput): Promise<Result<CampaignCover>>;
  getCoverPreview(input: GetCampaignCoverInput): Promise<Result<CampaignCoverPreview>>;
  setCover(input: SetCampaignCoverInput): Promise<Result<CampaignCover>>;
  removeCover(input: RemoveCampaignCoverInput): Promise<Result<CampaignCover>>;
  deleteAttachment(input: DeleteAttachmentInput): Promise<Result<DeleteAttachmentResult>>;
}

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
