import { describe, expect, it } from 'vitest';
import {
  getEntityReferenceImageInputSchema,
  importEntityReferenceImageBytesInputSchema,
  removeEntityReferenceImageInputSchema,
} from '../../src/core/contracts/entity-reference-images';

describe('contratos da imagem de referência', () => {
  it('rejeita propriedades desconhecidas e identidades inválidas', () => {
    expect(() =>
      getEntityReferenceImageInputSchema.parse({
        campaignId: campaignId,
        entityId,
        path: 'C:\\privado\\imagem.webp',
      }),
    ).toThrow();
    expect(() =>
      removeEntityReferenceImageInputSchema.parse({
        campaignId,
        entityId: otherEntityId,
        revision: 0,
      }),
    ).toThrow();
  });

  it('aceita somente bytes e metadados públicos estritos', () => {
    const valid = {
      campaignId,
      entityId,
      revision: 2,
      bytes: new Uint8Array([1, 2, 3]),
      metadata: { originalFilename: 'retrato.png', sourceKind: 'clipboard' as const },
    };
    expect(importEntityReferenceImageBytesInputSchema.parse(valid)).toEqual(valid);
    expect(() =>
      importEntityReferenceImageBytesInputSchema.parse({
        ...valid,
        metadata: { ...valid.metadata, originalFilename: '../retrato.png' },
      }),
    ).toThrow();
  });
});

const campaignId = '00000000-0000-4000-8000-000000000001';
const entityId = '20000000-0000-4000-8000-000000000001';
const otherEntityId = '20000000-0000-4000-8000-000000000002';
