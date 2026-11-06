import { randomUUID } from 'node:crypto';
import {
  campaignCoverPreviewSchema,
  deleteAttachmentInputSchema,
  deleteAttachmentResultSchema,
  getCampaignCoverInputSchema,
  removeCampaignCoverInputSchema,
  setCampaignCoverInputSchema,
  type CampaignCover,
  type CampaignCoverPreview,
  type DeleteAttachmentInput,
  type DeleteAttachmentResult,
  type GetCampaignCoverInput,
  type RemoveCampaignCoverInput,
  type SetCampaignCoverInput,
} from '../../core/contracts/campaign-covers';
import { AppError } from '../../core/errors/app-error';
import type { DataDirectories } from '../../core/storage/data-directories';
import type { AttachmentRepository } from '../../db/repositories/attachment-repository';
import { AttachmentDeletionJournal } from './attachment-deletion-journal';
import { readAttachmentThumbnailPreview } from './attachment-preview';

type CampaignCoverRepository = Pick<
  AttachmentRepository,
  | 'getCampaignCover'
  | 'setCampaignCover'
  | 'removeCampaignCover'
  | 'prepareAttachmentDeletion'
  | 'deleteUnusedAttachment'
  | 'findAttachmentDeletionIdentity'
>;

export interface CampaignCoverServiceDependencies {
  repository: CampaignCoverRepository;
  directories: Pick<DataDirectories, 'attachments' | 'thumbnails' | 'temporary'>;
  now?: () => Date;
  createId?: () => string;
}

export class CampaignCoverService {
  private readonly now: () => Date;
  private readonly createId: () => string;

  public constructor(private readonly dependencies: CampaignCoverServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.createId = dependencies.createId ?? randomUUID;
  }

  public get(input: GetCampaignCoverInput): CampaignCover {
    const parsed = getCampaignCoverInputSchema.parse(input);
    return this.dependencies.repository.getCampaignCover(parsed.campaignId);
  }

  public async getPreview(input: GetCampaignCoverInput): Promise<CampaignCoverPreview> {
    const parsed = getCampaignCoverInputSchema.parse(input);
    const cover = this.dependencies.repository.getCampaignCover(parsed.campaignId);
    if (cover.attachment === null) return null;
    const identity = this.dependencies.repository.findAttachmentDeletionIdentity(
      cover.attachment.id,
    );
    if (
      identity?.campaignId !== parsed.campaignId ||
      identity.attachmentId !== cover.attachment.id
    ) {
      throw new AppError('CAMPAIGN_COVER_INVALID', 'A capa da campanha é inválida.');
    }
    return campaignCoverPreviewSchema.parse(
      await readAttachmentThumbnailPreview(this.dependencies.directories.thumbnails, identity),
    );
  }

  public set(input: SetCampaignCoverInput): CampaignCover {
    const parsed = setCampaignCoverInputSchema.parse(input);
    return this.dependencies.repository.setCampaignCover(parsed, this.now().toISOString());
  }

  public remove(input: RemoveCampaignCoverInput): CampaignCover {
    const parsed = removeCampaignCoverInputSchema.parse(input);
    return this.dependencies.repository.removeCampaignCover(parsed, this.now().toISOString());
  }

  public async deleteAttachment(input: DeleteAttachmentInput): Promise<DeleteAttachmentResult> {
    const parsed = deleteAttachmentInputSchema.parse(input);
    const candidate = this.dependencies.repository.prepareAttachmentDeletion(parsed);
    const journal = await AttachmentDeletionJournal.create(this.dependencies.directories, {
      campaignId: parsed.campaignId,
      attachmentId: parsed.attachmentId,
      attachmentRevision: parsed.revision,
      relativePath: candidate.relativePath,
      thumbnailRelativePath: candidate.thumbnailRelativePath,
      operationId: this.createId(),
      createdAt: this.now().toISOString(),
    });
    let databaseDeleted = false;

    try {
      await journal.moveImage();
      await journal.moveThumbnail();
      this.dependencies.repository.deleteUnusedAttachment(parsed);
      databaseDeleted = true;
      await journal.markDatabaseDeleted();
      await journal.purge();
      return deleteAttachmentResultSchema.parse({
        campaignId: parsed.campaignId,
        attachmentId: candidate.attachment.id,
      });
    } catch (error) {
      if (!databaseDeleted) {
        const restoration = await journal.restore();
        if (!restoration) {
          throw new AppError(
            'ATTACHMENT_DELETE_COMPENSATION_FAILED',
            'A exclusão falhou e os arquivos não puderam ser restaurados com segurança.',
          );
        }
        await journal.purge();
      }
      throw error;
    }
  }
}
