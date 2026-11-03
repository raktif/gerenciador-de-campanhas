import { open } from 'node:fs/promises';
import path from 'node:path';
import {
  attachmentPreviewSchema,
  maximumAttachmentPreviewBytes,
  type AttachmentPreview,
} from '../../core/contracts/attachments';
import { AppError } from '../../core/errors/app-error';

export async function readAttachmentThumbnailPreview(
  thumbnailsRoot: string,
  identity: {
    attachmentId: string;
    thumbnailRelativePath: string;
  },
): Promise<AttachmentPreview> {
  const previewPath = resolvePrivateAssetPath(thumbnailsRoot, identity.thumbnailRelativePath);
  const handle = await open(previewPath, 'r');
  let bytes: Buffer;
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size <= 0 || stats.size > maximumAttachmentPreviewBytes) {
      throw new AppError(
        'ATTACHMENT_PREVIEW_INVALID',
        'A miniatura é inválida ou ultrapassa 2 MB.',
      );
    }
    bytes = Buffer.alloc(stats.size);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const chunk = await handle.read(bytes, offset, bytes.byteLength - offset, offset);
      if (chunk.bytesRead === 0) break;
      offset += chunk.bytesRead;
    }
    const trailing = await handle.read(Buffer.alloc(1), 0, 1, offset);
    if (offset !== bytes.byteLength || trailing.bytesRead !== 0) {
      throw new AppError(
        'ATTACHMENT_PREVIEW_INVALID',
        'A miniatura mudou durante a leitura segura.',
      );
    }
  } finally {
    await handle.close();
  }
  return attachmentPreviewSchema.parse({
    attachmentId: identity.attachmentId,
    mimeType: 'image/webp',
    bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
  });
}

function resolvePrivateAssetPath(root: string, relativePath: string): string {
  const normalizedRoot = path.resolve(root);
  const resolved = path.resolve(normalizedRoot, ...relativePath.split('/'));
  if (!resolved.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new AppError('ATTACHMENT_PATH_INVALID', 'O caminho interno do anexo é inválido.');
  }
  return resolved;
}
