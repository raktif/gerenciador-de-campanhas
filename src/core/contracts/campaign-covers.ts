import { z } from 'zod';
import {
  attachmentPreviewSchema,
  attachmentSchema,
  maximumAttachmentPreviewBytes,
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

export const maximumCampaignCoverPreviewBytes = maximumAttachmentPreviewBytes;
export const campaignCoverPreviewSchema = attachmentPreviewSchema;
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
