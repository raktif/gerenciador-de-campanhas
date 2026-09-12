import { describe, expect, it } from 'vitest';
import {
  createSessionInputSchema,
  replaceSessionParticipantsInputSchema,
  sessionParticipantSchema,
  sessionPageRequestSchema,
  sessionSchema,
  updateSessionInputSchema,
} from '../../src/core/contracts/sessions';

const campaignId = '00000000-0000-4000-8000-000000000001';
const sessionId = '70000000-0000-4000-8000-000000000001';
const timestamp = '2026-09-04T12:00:00.000Z';

describe('contratos de sessões', () => {
  it('normaliza título e aplica valores seguros de planejamento e paginação', () => {
    expect(
      createSessionInputSchema.parse({ campaignId, sequenceNumber: 1, title: '  Sessão um  ' }),
    ).toEqual({
      campaignId,
      sequenceNumber: 1,
      title: 'Sessão um',
      playedAt: null,
      summaryMarkdown: null,
      gmNotesMarkdown: null,
    });
    expect(sessionPageRequestSchema.parse({ campaignId })).toEqual({
      campaignId,
      limit: 50,
      filters: {},
      sort: 'sequenceNumber',
      order: 'desc',
    });
  });

  it('rejeita sequência inválida, dados extras, datas fora de UTC e patch vazio', () => {
    const base = { campaignId, sequenceNumber: 1, title: 'Sessão' };
    expect(() => createSessionInputSchema.parse({ ...base, sequenceNumber: 0 })).toThrow();
    expect(() => createSessionInputSchema.parse({ ...base, title: 'x'.repeat(201) })).toThrow();
    expect(() => createSessionInputSchema.parse({ ...base, unexpected: true })).toThrow();
    expect(() => createSessionInputSchema.parse({ ...base, playedAt: '2026-09-04' })).toThrow();
    expect(() =>
      updateSessionInputSchema.parse({ campaignId, id: sessionId, revision: 1, patch: {} }),
    ).toThrow();
  });

  it('valida a forma persistida, alterações e filtros de estado', () => {
    expect(
      sessionSchema.parse({
        id: sessionId,
        campaignId,
        sequenceNumber: 1,
        title: 'Sessão um',
        playedAt: timestamp,
        status: 'in_progress',
        summaryMarkdown: '# Resumo',
        gmNotesMarkdown: 'Preparar cena.',
        createdAt: timestamp,
        updatedAt: timestamp,
        revision: 1,
      }),
    ).toMatchObject({ status: 'in_progress', playedAt: timestamp });
    expect(
      updateSessionInputSchema.parse({
        campaignId,
        id: sessionId,
        revision: 1,
        patch: { status: 'completed', summaryMarkdown: null },
      }),
    ).toMatchObject({ patch: { status: 'completed', summaryMarkdown: null } });
    expect(
      sessionPageRequestSchema.parse({
        campaignId,
        filters: { status: 'completed' },
        sort: 'playedAt',
        order: 'asc',
      }),
    ).toMatchObject({ filters: { status: 'completed' }, sort: 'playedAt', order: 'asc' });
  });

  it('valida papéis, presença, ordem e entidades participantes não repetidas', () => {
    const entityId = '30000000-0000-4000-8000-000000000001';
    expect(
      replaceSessionParticipantsInputSchema.parse({
        campaignId,
        sessionId,
        revision: 1,
        participants: [{ entityId, role: 'player_character' }],
      }),
    ).toMatchObject({
      participants: [{ entityId, role: 'player_character', attended: true, sortOrder: 0 }],
    });
    expect(() =>
      replaceSessionParticipantsInputSchema.parse({
        campaignId,
        sessionId,
        revision: 1,
        participants: [
          { entityId, role: 'npc' },
          { entityId, role: 'observer', attended: false, sortOrder: 1 },
        ],
      }),
    ).toThrow();
    expect(() =>
      sessionParticipantSchema.parse({
        sessionId,
        entityId,
        role: 'hero',
        attended: true,
        sortOrder: -1,
      }),
    ).toThrow();
  });
});
