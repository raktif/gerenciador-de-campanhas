import { describe, expect, it, vi } from 'vitest';
import type { ImageFieldValueDetails } from '../../src/core/contracts/image-field-values';
import { ImageFieldValueService } from '../../src/main/services/image-field-value-service';

const campaignId = '00000000-0000-4000-8000-000000000001';
const entityId = '10000000-0000-4000-8000-000000000001';
const fieldDefinitionId = '20000000-0000-4000-8000-000000000001';
const valueId = '30000000-0000-4000-8000-000000000001';

describe('ImageFieldValueService', () => {
  it('valida a entrada e encaminha metadados com revisao otimista', () => {
    const details = createDetails();
    const update = vi.fn(() => ({
      ...details,
      value: { ...details.value, caption: null, revision: 2 },
    }));
    const service = createService({ update });

    expect(
      service.update({ campaignId, id: valueId, revision: 1, patch: { caption: null } }),
    ).toMatchObject({ value: { caption: null, revision: 2 } });
    expect(update).toHaveBeenCalledWith(
      { campaignId, id: valueId, revision: 1, patch: { caption: null } },
      '2026-11-04T10:00:00.000Z',
    );
    expect(() =>
      service.update({
        campaignId,
        id: valueId,
        revision: 1,
        patch: { caption: 'Retrato', path: 'C:\\privado.png' } as never,
      }),
    ).toThrow();
  });

  it('lista, remove e reordena somente por contratos estritos', () => {
    const details = createDetails();
    const list = vi.fn(() => [details]);
    const remove = vi.fn(() => details);
    const move = vi.fn(() => [details]);
    const service = createService({ list, remove, move });

    expect(service.list({ campaignId, entityId, fieldDefinitionId })).toEqual([details]);
    expect(service.remove({ campaignId, id: valueId, revision: 1 })).toEqual(details);
    expect(
      service.move({
        campaignId,
        entityId,
        fieldDefinitionId,
        sourceId: valueId,
        sourceRevision: 1,
        targetId: '30000000-0000-4000-8000-000000000002',
        targetRevision: 1,
        placement: 'after',
      }),
    ).toEqual([details]);
    expect(list).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(move).toHaveBeenCalledOnce();
  });
});

function createService(overrides: Record<string, unknown>) {
  const details = createDetails();
  return new ImageFieldValueService({
    repository: {
      findById: () => details,
      list: () => [details],
      update: () => details,
      remove: () => details,
      move: () => [details],
      ...overrides,
    },
    attachments: { findAttachmentDeletionIdentity: () => null },
    directories: { attachments: 'unused', thumbnails: 'unused' },
    now: () => new Date('2026-11-04T10:00:00.000Z'),
  });
}

function createDetails(): ImageFieldValueDetails {
  return {
    value: {
      id: valueId,
      entityId,
      fieldDefinitionId,
      attachmentId: '40000000-0000-4000-8000-000000000001',
      caption: 'Retrato',
      altText: 'Uma pessoa',
      sortOrder: 0,
      createdAt: '2026-11-04T10:00:00.000Z',
      updatedAt: '2026-11-04T10:00:00.000Z',
      revision: 1,
    },
    attachment: {
      id: '40000000-0000-4000-8000-000000000001',
      campaignId,
      originalFilename: 'retrato.png',
      mimeType: 'image/png',
      fileSize: 128,
      checksumSha256: 'a'.repeat(64),
      visibility: 'gm',
      width: 320,
      height: 240,
      sourceKind: 'clipboard',
      processedMimeType: 'image/webp',
      processingStatus: 'ready',
      createdAt: '2026-11-04T10:00:00.000Z',
      updatedAt: '2026-11-04T10:00:00.000Z',
      revision: 1,
    },
  };
}
