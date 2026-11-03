import {
  entityReferenceImagePreviewSchema,
  getEntityReferenceImageInputSchema,
  removeEntityReferenceImageInputSchema,
  setEntityReferenceImageInputSchema,
  type EntityReferenceImage,
  type EntityReferenceImagePreview,
  type GetEntityReferenceImageInput,
  type RemoveEntityReferenceImageInput,
  type SetEntityReferenceImageInput,
} from '../../core/contracts/entity-reference-images';
import { AppError } from '../../core/errors/app-error';
import type { DataDirectories } from '../../core/storage/data-directories';
import type { AttachmentRepository } from '../../db/repositories/attachment-repository';
import { readAttachmentThumbnailPreview } from './attachment-preview';

type EntityReferenceImageRepository = Pick<
  AttachmentRepository,
  | 'getEntityReferenceImage'
  | 'setEntityReferenceImage'
  | 'removeEntityReferenceImage'
  | 'findAttachmentDeletionIdentity'
>;

export class EntityReferenceImageService {
  private readonly now: () => Date;

  public constructor(
    private readonly dependencies: {
      repository: EntityReferenceImageRepository;
      directories: Pick<DataDirectories, 'thumbnails'>;
      now?: () => Date;
    },
  ) {
    this.now = dependencies.now ?? (() => new Date());
  }

  public get(input: GetEntityReferenceImageInput): EntityReferenceImage {
    const parsed = getEntityReferenceImageInputSchema.parse(input);
    return this.dependencies.repository.getEntityReferenceImage(parsed.campaignId, parsed.entityId);
  }

  public async getPreview(
    input: GetEntityReferenceImageInput,
  ): Promise<EntityReferenceImagePreview> {
    const parsed = getEntityReferenceImageInputSchema.parse(input);
    const reference = this.dependencies.repository.getEntityReferenceImage(
      parsed.campaignId,
      parsed.entityId,
    );
    if (reference.attachment === null) return null;
    const identity = this.dependencies.repository.findAttachmentDeletionIdentity(
      reference.attachment.id,
    );
    if (
      identity?.campaignId !== parsed.campaignId ||
      identity.attachmentId !== reference.attachment.id
    ) {
      throw new AppError(
        'ENTITY_REFERENCE_IMAGE_INVALID',
        'A imagem de referência da entidade é inválida.',
      );
    }
    return entityReferenceImagePreviewSchema.parse(
      await readAttachmentThumbnailPreview(this.dependencies.directories.thumbnails, identity),
    );
  }

  public set(input: SetEntityReferenceImageInput): EntityReferenceImage {
    const parsed = setEntityReferenceImageInputSchema.parse(input);
    return this.dependencies.repository.setEntityReferenceImage(
      parsed,
      this.now().toISOString(),
    );
  }

  public remove(input: RemoveEntityReferenceImageInput): EntityReferenceImage {
    const parsed = removeEntityReferenceImageInputSchema.parse(input);
    return this.dependencies.repository.removeEntityReferenceImage(
      parsed,
      this.now().toISOString(),
    );
  }
}
