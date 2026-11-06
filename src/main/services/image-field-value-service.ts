import {
  getImageFieldValueInputSchema,
  imageFieldValueListSchema,
  imageFieldValueDisplaySchema,
  imageFieldValuePreviewSchema,
  listImageFieldValuesInputSchema,
  moveImageFieldValueInputSchema,
  removeImageFieldValueInputSchema,
  updateImageFieldValueInputSchema,
  type GetImageFieldValueInput,
  type ImageFieldValueDetails,
  type ImageFieldValuePreview,
  type ImageFieldValueDisplay,
  type ListImageFieldValuesInput,
  type MoveImageFieldValueInput,
  type RemoveImageFieldValueInput,
  type UpdateImageFieldValueInput,
} from '../../core/contracts/image-field-values';
import { AppError } from '../../core/errors/app-error';
import type { DataDirectories } from '../../core/storage/data-directories';
import type { AttachmentRepository } from '../../db/repositories/attachment-repository';
import type { ImageFieldValueRepository } from '../../db/repositories/image-field-value-repository';
import { readAttachmentDisplay, readAttachmentThumbnailPreview } from './attachment-preview';

type ImageFieldValuePersistence = Pick<
  ImageFieldValueRepository,
  'findById' | 'list' | 'update' | 'remove' | 'move'
>;
type AttachmentPreviewIdentity = Pick<AttachmentRepository, 'findAttachmentDeletionIdentity'>;

export class ImageFieldValueService {
  private readonly now: () => Date;

  public constructor(
    private readonly dependencies: {
      repository: ImageFieldValuePersistence;
      attachments: AttachmentPreviewIdentity;
      directories: Pick<DataDirectories, 'attachments' | 'thumbnails'>;
      now?: () => Date;
    },
  ) {
    this.now = dependencies.now ?? (() => new Date());
  }

  public list(input: ListImageFieldValuesInput): ImageFieldValueDetails[] {
    const parsed = listImageFieldValuesInputSchema.parse(input);
    return imageFieldValueListSchema.parse(this.dependencies.repository.list(parsed));
  }

  public async getPreview(input: GetImageFieldValueInput): Promise<ImageFieldValuePreview> {
    const parsed = getImageFieldValueInputSchema.parse(input);
    const details = this.dependencies.repository.findById(parsed.campaignId, parsed.id);
    if (details === null) throw imageFieldValueNotFound(parsed.id);
    const identity = this.dependencies.attachments.findAttachmentDeletionIdentity(
      details.attachment.id,
    );
    if (
      identity?.campaignId !== parsed.campaignId ||
      identity.attachmentId !== details.attachment.id
    ) {
      throw new AppError(
        'IMAGE_FIELD_PREVIEW_INVALID',
        'A miniatura da imagem personalizada é inválida.',
      );
    }
    return imageFieldValuePreviewSchema.parse(
      await readAttachmentThumbnailPreview(this.dependencies.directories.thumbnails, identity),
    );
  }

  public async getDisplay(input: GetImageFieldValueInput): Promise<ImageFieldValueDisplay> {
    const parsed = getImageFieldValueInputSchema.parse(input);
    const details = this.dependencies.repository.findById(parsed.campaignId, parsed.id);
    if (details === null) throw imageFieldValueNotFound(parsed.id);
    const identity = this.dependencies.attachments.findAttachmentDeletionIdentity(
      details.attachment.id,
    );
    if (
      identity?.campaignId !== parsed.campaignId ||
      identity.attachmentId !== details.attachment.id
    ) {
      throw new AppError(
        'IMAGE_FIELD_DISPLAY_INVALID',
        'A imagem ampliada personalizada é inválida.',
      );
    }
    return imageFieldValueDisplaySchema.parse(
      await readAttachmentDisplay(this.dependencies.directories.attachments, identity),
    );
  }

  public update(input: UpdateImageFieldValueInput): ImageFieldValueDetails {
    const parsed = updateImageFieldValueInputSchema.parse(input);
    return this.dependencies.repository.update(parsed, this.now().toISOString());
  }

  public remove(input: RemoveImageFieldValueInput): ImageFieldValueDetails {
    const parsed = removeImageFieldValueInputSchema.parse(input);
    return this.dependencies.repository.remove(parsed);
  }

  public move(input: MoveImageFieldValueInput): ImageFieldValueDetails[] {
    const parsed = moveImageFieldValueInputSchema.parse(input);
    return imageFieldValueListSchema.parse(
      this.dependencies.repository.move(parsed, this.now().toISOString()),
    );
  }
}

function imageFieldValueNotFound(id: string): AppError {
  return new AppError(
    'IMAGE_FIELD_VALUE_NOT_FOUND',
    'A imagem personalizada não foi encontrada nesta campanha.',
    { id },
  );
}
