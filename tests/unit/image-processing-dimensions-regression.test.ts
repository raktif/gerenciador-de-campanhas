import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharpState = vi.hoisted(() => ({
  metadata: ((): unknown => ({}))(),
  sharp: vi.fn(),
}));

vi.mock('sharp', () => ({ default: sharpState.sharp }));

import { AppError } from '../../src/core/errors/app-error';
import { ImageProcessingService } from '../../src/main/services/image-processing-service';

beforeEach(() => {
  sharpState.sharp.mockReset();
  sharpState.sharp.mockImplementation(() => ({
    metadata: () => Promise.resolve(sharpState.metadata),
  }));
});

describe('validação defensiva das dimensões decodificadas', () => {
  it.each([
    [
      'base fracionária',
      { format: 'png', width: 10.5, height: 20, autoOrient: { width: 10.5, height: 20 } },
    ],
    [
      'autoOrient negativa',
      { format: 'png', width: 10, height: 20, autoOrient: { width: -10, height: 20 } },
    ],
    ['autoOrient parcial', { format: 'png', width: 10, height: 20, autoOrient: { width: 10 } }],
  ])('rejeita dimensão %s antes de iniciar o processamento', async (_name, metadata) => {
    sharpState.metadata = metadata;
    const service = new ImageProcessingService();

    try {
      await service.process(validPngInput());
      throw new Error('O teste esperava rejeição das dimensões.');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ code: 'IMAGE_METADATA_INVALID' });
    }
    expect(sharpState.sharp).toHaveBeenCalledOnce();
  });
});

function validPngInput() {
  return {
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    metadata: { originalFilename: 'capa.png', sourceKind: 'file' as const },
  };
}
