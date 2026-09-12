import { describe, expect, it } from 'vitest';
import {
  createSessionIntentionInputSchema,
  sessionIntentionPageRequestSchema,
  sessionIntentionSchema,
  updateSessionIntentionInputSchema,
} from '../../src/core/contracts/sessions';

const campaignId = '00000000-0000-4000-8000-000000000001';
const sessionId = '70000000-0000-4000-8000-000000000001';
const intentionId = '80000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';
const timestamp = '2026-09-04T12:00:00.000Z';

describe('contratos de intenções de sessão', () => {
  it('normaliza texto e aplica padrão seguro para entidade opcional e paginação', () => {
    expect(
      createSessionIntentionInputSchema.parse({
        campaignId,
        sessionId,
        text: '  Encontrar o farol.  ',
      }),
    ).toEqual({ campaignId, sessionId, entityId: null, text: 'Encontrar o farol.' });
    expect(sessionIntentionPageRequestSchema.parse({ campaignId, sessionId })).toEqual({
      campaignId,
      sessionId,
      limit: 50,
      filters: {},
      sort: 'createdAt',
      order: 'asc',
    });
  });

  it('rejeita limites, campos desconhecidos, patches vazios e estados inválidos', () => {
    const base = { campaignId, sessionId, text: 'Objetivo' };
    expect(() => createSessionIntentionInputSchema.parse({ ...base, text: ' \n\t ' })).toThrow();
    expect(() =>
      createSessionIntentionInputSchema.parse({ ...base, text: 'x'.repeat(10001) }),
    ).toThrow();
    expect(() => createSessionIntentionInputSchema.parse({ ...base, extra: true })).toThrow();
    expect(() =>
      updateSessionIntentionInputSchema.parse({
        campaignId,
        sessionId,
        id: intentionId,
        revision: 1,
        patch: {},
      }),
    ).toThrow();
    expect(() =>
      updateSessionIntentionInputSchema.parse({
        campaignId,
        sessionId,
        id: intentionId,
        revision: 1,
        patch: { status: 'paused' },
      }),
    ).toThrow();
  });

  it('valida forma persistida, filtros e alterações de estado', () => {
    expect(
      sessionIntentionSchema.parse({
        id: intentionId,
        sessionId,
        entityId,
        text: 'Encontrar o farol.',
        status: 'transformed',
        createdAt: timestamp,
        updatedAt: timestamp,
        revision: 2,
      }),
    ).toMatchObject({ status: 'transformed', entityId });
    expect(
      sessionIntentionPageRequestSchema.parse({
        campaignId,
        sessionId,
        filters: { status: 'open', entityId },
        sort: 'updatedAt',
        order: 'desc',
      }),
    ).toMatchObject({ filters: { status: 'open', entityId }, sort: 'updatedAt' });
  });
});
