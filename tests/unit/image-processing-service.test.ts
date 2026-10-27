import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  maximumImageBytes,
  maximumImageHeight,
  maximumImagePixels,
  maximumImageWidth,
} from '../../src/core/contracts/image-processing';
import { AppError } from '../../src/core/errors/app-error';
import { ImageProcessingService } from '../../src/main/services/image-processing-service';

const service = new ImageProcessingService();

describe('ImageProcessingService', () => {
  it.each([
    ['png', 'image/png'],
    ['jpeg', 'image/jpeg'],
    ['webp', 'image/webp'],
  ] as const)('aceita %s pela assinatura e decodificação reais', async (format, mimeType) => {
    const bytes = await createImage(64, 32, format);

    const result = await service.process(validInput(bytes));

    expect(result).toMatchObject({
      status: 'processed',
      detectedMimeType: mimeType,
      originalWidth: 64,
      originalHeight: 32,
      selectedOversizeMode: null,
      image: { mimeType: 'image/webp', width: 64, height: 32 },
      thumbnail: { mimeType: 'image/webp', width: 64, height: 32 },
    });
  });

  it('confia no conteúdo, não na extensão nem no MIME declarado', async () => {
    const bytes = await createImage(80, 40, 'png');

    const result = await service.process({
      bytes,
      metadata: {
        originalFilename: 'imagem.svg',
        sourceKind: 'file',
        declaredMimeType: 'image/svg+xml',
      },
    });

    expect(result).toMatchObject({ status: 'processed', detectedMimeType: 'image/png' });
  });

  it('rejeita payload acima de 10 MB antes da decodificação', async () => {
    const input = validInput(new Uint8Array(maximumImageBytes + 1));

    await expectAppError(service.process(input), 'IMAGE_PAYLOAD_TOO_LARGE');
  });

  it('rejeita metadados da origem inválidos', async () => {
    const bytes = await createImage(32, 32, 'png');

    await expectAppError(
      service.process({
        bytes,
        metadata: { originalFilename: '   ', sourceKind: 'file' },
      }),
      'IMAGE_METADATA_INVALID',
    );
    await expectAppError(
      service.process({
        bytes,
        metadata: { originalFilename: 'capa.png', sourceKind: 'ftp' as 'file' },
      }),
      'IMAGE_METADATA_INVALID',
    );
  });

  it('rejeita assinatura não suportada e imagem truncada', async () => {
    await expectAppError(
      service.process(validInput(Buffer.from('<svg></svg>'))),
      'IMAGE_FORMAT_UNSUPPORTED',
    );
    await expectAppError(
      service.process(validInput(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))),
      'IMAGE_DECODE_FAILED',
    );
  });

  it('rejeita dimensões acima do limite defensivo de pixels antes de decodificar os pixels', async () => {
    const bytes = await pngHeaderWithDimensions(
      10_000,
      Math.floor(maximumImagePixels / 10_000) + 1,
    );

    await expectAppError(service.process(validInput(bytes)), 'IMAGE_PIXEL_LIMIT_EXCEEDED');
  });

  it('exige escolha explícita antes de processar imagem acima de 1280×1024', async () => {
    const bytes = await createImage(2000, 1200, 'png');

    const result = await service.process(validInput(bytes));

    expect(result).toEqual({
      status: 'oversize_choice_required',
      detectedMimeType: 'image/png',
      originalWidth: 2000,
      originalHeight: 1200,
      maximumWidth: maximumImageWidth,
      maximumHeight: maximumImageHeight,
      allowedModes: ['resize', 'crop'],
    });
  });

  it('redimensiona dentro dos máximos sem corte e preserva a proporção', async () => {
    const bytes = await createImage(2000, 1200, 'jpeg');

    const result = await service.process({ ...validInput(bytes), oversizeMode: 'resize' });

    expect(result).toMatchObject({
      status: 'processed',
      selectedOversizeMode: 'resize',
      image: { width: 1280, height: 768 },
      thumbnail: { width: 480, height: 288 },
    });
  });

  it('recorta centralmente somente o excedente e nunca amplia', async () => {
    const regular = await service.process({
      ...validInput(await createImage(2000, 1200, 'png')),
      oversizeMode: 'crop',
    });
    const panoramic = await service.process({
      ...validInput(await createImage(2000, 500, 'png')),
      oversizeMode: 'crop',
    });

    expect(regular).toMatchObject({
      status: 'processed',
      selectedOversizeMode: 'crop',
      image: { width: 1280, height: 1024 },
      thumbnail: { width: 400, height: 320 },
    });
    expect(panoramic).toMatchObject({
      status: 'processed',
      image: { width: 1280, height: 500 },
      thumbnail: { width: 480, height: 188 },
    });
  });

  it('não amplia imagem nem miniatura menores que seus limites', async () => {
    const result = await service.process(validInput(await createImage(320, 200, 'webp')));

    expect(result).toMatchObject({
      status: 'processed',
      image: { width: 320, height: 200 },
      thumbnail: { width: 320, height: 200 },
    });
  });

  it('remove metadados ao normalizar principal e miniatura para WebP', async () => {
    const bytes = await sharp({
      create: { width: 120, height: 80, channels: 3, background: '#804020' },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    const result = await service.process(validInput(bytes));
    if (result.status !== 'processed') throw new Error('Resultado processado esperado.');
    const mainMetadata = await sharp(result.image.bytes).metadata();
    const thumbnailMetadata = await sharp(result.thumbnail.bytes).metadata();

    expect(result).toMatchObject({ originalWidth: 80, originalHeight: 120 });
    expect(mainMetadata).toMatchObject({ format: 'webp', width: 80, height: 120 });
    expect(mainMetadata.exif).toBeUndefined();
    expect(mainMetadata.icc).toBeUndefined();
    expect(mainMetadata.xmp).toBeUndefined();
    expect(thumbnailMetadata.exif).toBeUndefined();
    expect(thumbnailMetadata.icc).toBeUndefined();
    expect(thumbnailMetadata.xmp).toBeUndefined();
  });
});

function validInput(bytes: Uint8Array) {
  return {
    bytes,
    metadata: { originalFilename: 'capa.bin', sourceKind: 'file' as const },
  };
}

async function createImage(
  width: number,
  height: number,
  format: 'png' | 'jpeg' | 'webp',
): Promise<Buffer> {
  const image = sharp({
    create: { width, height, channels: 4, background: { r: 40, g: 90, b: 140, alpha: 0.8 } },
  });
  if (format === 'jpeg') return image.jpeg().toBuffer();
  if (format === 'webp') return image.webp().toBuffer();
  return image.png().toBuffer();
}

async function pngHeaderWithDimensions(width: number, height: number): Promise<Buffer> {
  const bytes = Buffer.from(await createImage(1, 1, 'png'));
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes.writeUInt32BE(crc32(bytes.subarray(12, 29)), 29);
  return bytes;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function expectAppError(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code });
    return;
  }
  throw new Error(`A operação deveria falhar com ${code}.`);
}
