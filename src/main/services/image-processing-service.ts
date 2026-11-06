import sharp, { type Metadata, type Sharp } from 'sharp';
import {
  imageOversizeChoiceRequiredSchema,
  imageProcessingCompletedSchema,
  imageProcessingInputSchema,
  maximumImageBytes,
  maximumImageHeight,
  maximumImagePixels,
  maximumImageWidth,
  maximumThumbnailHeight,
  maximumThumbnailWidth,
  type ImageProcessingInput,
  type ImageProcessingResult,
} from '../../core/contracts/image-processing';
import type { Attachment } from '../../core/contracts/attachments';
import { AppError } from '../../core/errors/app-error';

type SupportedMimeType = Attachment['mimeType'];

export class ImageProcessingService {
  public async process(input: ImageProcessingInput): Promise<ImageProcessingResult> {
    const parsed = parseInput(input);
    const source = Buffer.from(
      parsed.bytes.buffer,
      parsed.bytes.byteOffset,
      parsed.bytes.byteLength,
    );
    const detectedMimeType = detectMimeType(source);
    const metadata = await readMetadata(source);
    assertDecodedFormat(metadata, detectedMimeType);
    const dimensions = orientedDimensions(metadata);
    assertPixelLimit(dimensions.width, dimensions.height);
    assertSingleFrame(metadata);

    const oversize = dimensions.width > maximumImageWidth || dimensions.height > maximumImageHeight;
    if (oversize && parsed.oversizeMode === undefined) {
      return imageOversizeChoiceRequiredSchema.parse({
        status: 'oversize_choice_required',
        detectedMimeType,
        originalWidth: dimensions.width,
        originalHeight: dimensions.height,
        maximumWidth: maximumImageWidth,
        maximumHeight: maximumImageHeight,
        allowedModes: ['resize', 'crop'],
      });
    }

    let pipeline = createPipeline(source);
    if (oversize && parsed.oversizeMode === 'resize') {
      pipeline = pipeline.resize({
        width: maximumImageWidth,
        height: maximumImageHeight,
        fit: 'inside',
        withoutEnlargement: true,
      });
    } else if (oversize && parsed.oversizeMode === 'crop') {
      const crop = centeredCrop(dimensions.width, dimensions.height);
      pipeline = pipeline.extract(crop);
    }

    const processed = await encodeWebp(pipeline);
    const thumbnail = await encodeWebp(
      sharp(processed.bytes, { failOn: 'error', limitInputPixels: maximumImagePixels }).resize({
        width: maximumThumbnailWidth,
        height: maximumThumbnailHeight,
        fit: 'inside',
        withoutEnlargement: true,
      }),
    );

    return imageProcessingCompletedSchema.parse({
      status: 'processed',
      detectedMimeType,
      originalWidth: dimensions.width,
      originalHeight: dimensions.height,
      selectedOversizeMode: oversize ? (parsed.oversizeMode ?? null) : null,
      image: processed,
      thumbnail,
    });
  }
}

function parseInput(input: unknown): ImageProcessingInput {
  const candidateBytes =
    typeof input === 'object' && input !== null && 'bytes' in input ? input.bytes : undefined;
  if (candidateBytes instanceof Uint8Array && candidateBytes.byteLength > maximumImageBytes) {
    throw new AppError('IMAGE_PAYLOAD_TOO_LARGE', 'A imagem ultrapassa o limite de 10 MB.', {
      maximumBytes: maximumImageBytes,
      receivedBytes: candidateBytes.byteLength,
    });
  }
  const result = imageProcessingInputSchema.safeParse(input);
  if (result.success) return result.data;
  throw new AppError('IMAGE_METADATA_INVALID', 'Os metadados da imagem são inválidos.', {
    issues: result.error.issues.map(({ code, message, path }) => ({ code, message, path })),
  });
}

function detectMimeType(bytes: Uint8Array): SupportedMimeType {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  if (bytes.length >= 12 && readAscii(bytes, 0, 4) === 'RIFF' && readAscii(bytes, 8, 12) === 'WEBP')
    return 'image/webp';
  throw new AppError(
    'IMAGE_FORMAT_UNSUPPORTED',
    'A imagem precisa estar codificada como PNG, JPEG ou WebP.',
  );
}

async function readMetadata(bytes: Buffer): Promise<Metadata> {
  try {
    return await sharp(bytes, { failOn: 'error', limitInputPixels: false }).metadata();
  } catch {
    throw new AppError('IMAGE_DECODE_FAILED', 'O conteúdo da imagem não pôde ser decodificado.');
  }
}

function assertDecodedFormat(metadata: Metadata, detectedMimeType: SupportedMimeType): void {
  const expectedFormat =
    detectedMimeType === 'image/jpeg' ? 'jpeg' : detectedMimeType === 'image/png' ? 'png' : 'webp';
  if (metadata.format !== expectedFormat) {
    throw new AppError(
      'IMAGE_FORMAT_MISMATCH',
      'A assinatura e o conteúdo decodificado da imagem não correspondem.',
    );
  }
}

function orientedDimensions(metadata: Metadata): { width: number; height: number } {
  const width: unknown = metadata.width;
  const height: unknown = metadata.height;
  if (!isPositiveSafeInteger(width) || !isPositiveSafeInteger(height)) {
    throw new AppError('IMAGE_METADATA_INVALID', 'A imagem não possui dimensões válidas.');
  }
  const autoOrient: unknown = metadata.autoOrient;
  const orientedWidth = readUnknownProperty(autoOrient, 'width');
  const orientedHeight = readUnknownProperty(autoOrient, 'height');
  if (!isPositiveSafeInteger(orientedWidth) || !isPositiveSafeInteger(orientedHeight)) {
    throw new AppError(
      'IMAGE_METADATA_INVALID',
      'A imagem não possui dimensões orientadas válidas.',
    );
  }
  return { width: orientedWidth, height: orientedHeight };
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function readUnknownProperty(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function assertPixelLimit(width: number, height: number): void {
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > maximumImagePixels) {
    throw new AppError(
      'IMAGE_PIXEL_LIMIT_EXCEEDED',
      'A imagem possui pixels demais para processamento seguro.',
      {
        maximumPixels: maximumImagePixels,
        receivedPixels: pixels,
      },
    );
  }
}

function assertSingleFrame(metadata: Metadata): void {
  if ((metadata.pages ?? 1) > 1) {
    throw new AppError(
      'IMAGE_ANIMATION_UNSUPPORTED',
      'Imagens animadas não são aceitas neste campo.',
    );
  }
}

function createPipeline(bytes: Buffer): Sharp {
  return sharp(bytes, { failOn: 'error', limitInputPixels: maximumImagePixels }).autoOrient();
}

function centeredCrop(
  width: number,
  height: number,
): { left: number; top: number; width: number; height: number } {
  const cropWidth = Math.min(width, maximumImageWidth);
  const cropHeight = Math.min(height, maximumImageHeight);
  return {
    left: Math.floor((width - cropWidth) / 2),
    top: Math.floor((height - cropHeight) / 2),
    width: cropWidth,
    height: cropHeight,
  };
}

async function encodeWebp(pipeline: Sharp): Promise<{
  bytes: Uint8Array;
  mimeType: 'image/webp';
  width: number;
  height: number;
}> {
  try {
    const { data, info } = await pipeline
      .webp({ quality: 85, alphaQuality: 90, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    return {
      bytes: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      mimeType: 'image/webp',
      width: info.width,
      height: info.height,
    };
  } catch {
    throw new AppError('IMAGE_PROCESSING_FAILED', 'Não foi possível processar a imagem.');
  }
}

function readAscii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}
