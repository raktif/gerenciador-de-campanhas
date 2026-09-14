import { describe, expect, it } from 'vitest';
import { captureInboxItemInputSchema, inboxItemSchema } from '../../src/core/contracts/inbox';

const campaignId = '00000000-0000-4000-8000-000000000001';
const sessionId = '70000000-0000-4000-8000-000000000001';
const inboxItemId = '80000000-0000-4000-8000-000000000001';
const timestamp = '2026-09-14T12:00:00.000Z';

describe('contratos de captura rápida', () => {
  it('aceita somente o texto obrigatório e uma sessão opcional, preservando o texto original', () => {
    expect(captureInboxItemInputSchema.parse({ campaignId, rawText: '  A ponte caiu.  ' })).toEqual(
      {
        campaignId,
        sessionId: null,
        rawText: '  A ponte caiu.  ',
      },
    );
    expect(
      captureInboxItemInputSchema.parse({ campaignId, sessionId, rawText: 'Registrar o nome.' }),
    ).toMatchObject({ campaignId, sessionId, rawText: 'Registrar o nome.' });
  });

  it('rejeita texto vazio, IDs inválidos e propriedades fora do contrato', () => {
    expect(() => captureInboxItemInputSchema.parse({ campaignId, rawText: '   ' })).toThrow();
    expect(() =>
      captureInboxItemInputSchema.parse({ campaignId, rawText: 'x'.repeat(10001) }),
    ).toThrow();
    expect(() =>
      captureInboxItemInputSchema.parse({ campaignId, sessionId: 'sessão', rawText: 'X' }),
    ).toThrow();
    expect(() =>
      captureInboxItemInputSchema.parse({ campaignId, rawText: 'X', status: 'reviewing' }),
    ).toThrow();
  });

  it('valida a forma persistida e impede destino de conversão fora de seu estado', () => {
    expect(
      inboxItemSchema.parse({
        id: inboxItemId,
        campaignId,
        sessionId,
        rawText: 'Anotação durante a sessão.',
        status: 'new',
        originKind: 'session',
        capturedAt: timestamp,
        convertedObjectType: null,
        convertedObjectId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        revision: 1,
      }),
    ).toMatchObject({ status: 'new', revision: 1 });
    expect(() =>
      inboxItemSchema.parse({
        id: inboxItemId,
        campaignId,
        sessionId: null,
        rawText: 'Conversão inválida.',
        status: 'new',
        originKind: 'manual',
        capturedAt: timestamp,
        convertedObjectType: 'entity',
        convertedObjectId: '90000000-0000-4000-8000-000000000001',
        createdAt: timestamp,
        updatedAt: timestamp,
        revision: 1,
      }),
    ).toThrow();
  });
});
