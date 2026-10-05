import { describe, expect, it } from 'vitest';
import type { CampaignManagerGateway } from '../../src/core/contracts/gateway';
import {
  sessionChannels,
  sessionIntentionChannels,
  sessionParticipantChannels,
} from '../../src/core/contracts/ipc-channels';
import {
  createSessionInputSchema,
  createSessionIntentionInputSchema,
  listSessionParticipantsInputSchema,
  replaceSessionParticipantsInputSchema,
  sessionParticipantsSchema,
  type SessionGateway,
  type SessionIntentionsGateway,
  type SessionParticipantsGateway,
} from '../../src/core/contracts/sessions';

const campaignId = '00000000-0000-4000-8000-000000000001';
const sessionId = '70000000-0000-4000-8000-000000000001';
const intentionId = '80000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';

describe('contratos IPC de sessões', () => {
  it('nomeia explicitamente cada operação permitida', () => {
    expect(sessionChannels).toEqual({
      create: 'sessions:create',
      get: 'sessions:get',
      list: 'sessions:list',
      update: 'sessions:update',
    });
    expect(sessionParticipantChannels).toEqual({
      list: 'session-participants:list',
      replace: 'session-participants:replace',
    });
    expect(sessionIntentionChannels).toEqual({
      create: 'session-intentions:create',
      get: 'session-intentions:get',
      list: 'session-intentions:list',
      update: 'session-intentions:update',
    });
  });

  it('mantém as entradas e saídas de sessão estritas nos limites do gateway', () => {
    expect(
      createSessionInputSchema.parse({ campaignId, sequenceNumber: 1, title: '  Sessão um  ' }),
    ).toMatchObject({ title: 'Sessão um', playedAt: null });
    expect(() =>
      createSessionInputSchema.parse({
        campaignId,
        sequenceNumber: 1,
        title: 'Sessão',
        unexpected: true,
      }),
    ).toThrow();
    expect(listSessionParticipantsInputSchema.parse({ campaignId, sessionId })).toEqual({
      campaignId,
      sessionId,
    });
    expect(() =>
      listSessionParticipantsInputSchema.parse({ campaignId, sessionId, unexpected: true }),
    ).toThrow();
    expect(() =>
      replaceSessionParticipantsInputSchema.parse({
        campaignId,
        sessionId,
        revision: 1,
        participants: [
          { entityId, role: 'npc' },
          { entityId, role: 'observer' },
        ],
      }),
    ).toThrow();
    expect(() =>
      replaceSessionParticipantsInputSchema.parse({
        campaignId,
        sessionId,
        revision: 1,
        participants: [{ entityId, role: 'npc', sortOrder: 0 }],
      }),
    ).toThrow();
    expect(
      createSessionIntentionInputSchema.parse({
        campaignId,
        sessionId,
        text: '  Encontrar a chave. ',
      }),
    ).toMatchObject({ entityId: null, text: 'Encontrar a chave.' });
    expect(() =>
      sessionParticipantsSchema.parse([
        {
          sessionId,
          entityId,
          role: 'npc',
          attended: true,
          sortOrder: 0,
          unexpected: true,
        },
      ]),
    ).toThrow();
    expect(() =>
      sessionParticipantsSchema.parse([
        { sessionId, entityId, role: 'npc', attended: true, sortOrder: 0 },
        { sessionId, entityId, role: 'observer', attended: false, sortOrder: 1 },
      ]),
    ).toThrow();
  });

  it('declara as três superfícies públicas com somente as operações previstas', () => {
    const gateways = createTypedGateways();
    expect(Object.keys(gateways.sessions).sort()).toEqual(['create', 'get', 'list', 'update']);
    expect(Object.keys(gateways.sessionParticipants).sort()).toEqual(['list', 'replace']);
    expect(Object.keys(gateways.sessionIntentions).sort()).toEqual([
      'create',
      'get',
      'list',
      'update',
    ]);
  });
});

function createTypedGateways(): Required<
  Pick<CampaignManagerGateway, 'sessions' | 'sessionParticipants' | 'sessionIntentions'>
> {
  const sessions: SessionGateway = {
    create: () => Promise.resolve({ ok: true, data: session(), requestId: 'test-request' }),
    get: () => Promise.resolve({ ok: true, data: session(), requestId: 'test-request' }),
    list: () =>
      Promise.resolve({
        ok: true,
        data: { items: [], nextCursor: null, total: 0 },
        requestId: 'test-request',
      }),
    update: () => Promise.resolve({ ok: true, data: session(), requestId: 'test-request' }),
  };
  const sessionParticipants: SessionParticipantsGateway = {
    list: () => Promise.resolve({ ok: true, data: [], requestId: 'test-request' }),
    replace: () => Promise.resolve({ ok: true, data: [], requestId: 'test-request' }),
  };
  const sessionIntentions: SessionIntentionsGateway = {
    create: () => Promise.resolve({ ok: true, data: intention(), requestId: 'test-request' }),
    get: () => Promise.resolve({ ok: true, data: intention(), requestId: 'test-request' }),
    list: () =>
      Promise.resolve({
        ok: true,
        data: { items: [], nextCursor: null, total: 0 },
        requestId: 'test-request',
      }),
    update: () => Promise.resolve({ ok: true, data: intention(), requestId: 'test-request' }),
  };
  return { sessions, sessionParticipants, sessionIntentions };
}

function session() {
  return {
    id: sessionId,
    campaignId,
    sequenceNumber: 1,
    title: 'Sessão',
    playedAt: null,
    status: 'planned' as const,
    summaryMarkdown: null,
    gmNotesMarkdown: null,
    createdAt: '2026-09-04T12:00:00.000Z',
    updatedAt: '2026-09-04T12:00:00.000Z',
    revision: 1,
  };
}

function intention() {
  return {
    id: intentionId,
    sessionId,
    entityId: null,
    text: 'Encontrar a chave.',
    status: 'open' as const,
    createdAt: '2026-09-04T12:00:00.000Z',
    updatedAt: '2026-09-04T12:00:00.000Z',
    revision: 1,
  };
}
