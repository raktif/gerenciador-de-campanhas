import { describe, expect, it } from 'vitest';
import {
  attachmentSchema,
  setCampaignCoverInputSchema,
} from '../../src/core/contracts/attachments';

const attachment = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  campaignId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  originalFilename: 'capa.png',
  mimeType: 'image/png',
  fileSize: 1024,
  checksumSha256: 'a'.repeat(64),
  visibility: 'gm',
  width: 1280,
  height: 720,
  sourceKind: 'file',
  processedMimeType: 'image/png',
  processingStatus: 'ready',
  createdAt: '2026-10-26T12:00:00.000Z',
  updatedAt: '2026-10-26T12:00:00.000Z',
  revision: 1,
} as const;

describe('Contratos de anexos de imagem', () => {
  it('aceita metadados públicos sem expor caminhos de armazenamento', () => {
    const parsed = attachmentSchema.parse(attachment);

    expect(parsed).toEqual(attachment);
    expect(parsed).not.toHaveProperty('relativePath');
    expect(parsed).not.toHaveProperty('thumbnailRelativePath');
    expect(parsed).not.toHaveProperty('storedFilename');
    expect(parsed).not.toHaveProperty('sourceUrl');
  });

  it('rejeita propriedades desconhecidas, formatos e limites inválidos', () => {
    expect(
      attachmentSchema.safeParse({ ...attachment, relativePath: 'privado/capa.png' }).success,
    ).toBe(false);
    expect(attachmentSchema.safeParse({ ...attachment, mimeType: 'image/svg+xml' }).success).toBe(
      false,
    );
    expect(
      attachmentSchema.safeParse({ ...attachment, fileSize: 10 * 1024 * 1024 + 1 }).success,
    ).toBe(false);
    expect(attachmentSchema.safeParse({ ...attachment, width: 1281 }).success).toBe(false);
    expect(attachmentSchema.safeParse({ ...attachment, revision: 0 }).success).toBe(false);
    expect(
      attachmentSchema.safeParse({ ...attachment, sourceUrl: 'https://example.invalid/capa.png' })
        .success,
    ).toBe(false);
  });

  it('exige campanha, anexo opcional e revisão positiva para associar uma capa', () => {
    const input = {
      campaignId: attachment.campaignId,
      attachmentId: attachment.id,
      revision: 2,
    };

    expect(setCampaignCoverInputSchema.parse(input)).toEqual(input);
    expect(setCampaignCoverInputSchema.parse({ ...input, attachmentId: null })).toEqual({
      ...input,
      attachmentId: null,
    });
    expect(setCampaignCoverInputSchema.safeParse({ ...input, revision: 0 }).success).toBe(false);
    expect(setCampaignCoverInputSchema.safeParse({ ...input, unexpected: true }).success).toBe(
      false,
    );
  });
});
