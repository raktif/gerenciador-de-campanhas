import { describe, expect, it } from 'vitest';
import type { Campaign } from '../../src/core/contracts/campaigns';
import type { Entity } from '../../src/core/contracts/entities';
import {
  replaceSessionParticipantsInputSchema,
  sessionParticipantSchema,
  sessionSchema,
  type Session,
  type SessionParticipant,
} from '../../src/core/contracts/sessions';
import { AppError } from '../../src/core/errors/app-error';
import type { SessionParticipantsReplace } from '../../src/db/repositories/session-repository';
import {
  SessionParticipantService,
  type SessionParticipantRepositoryPort,
} from '../../src/main/services/session-participant-service';

const campaignId = '00000000-0000-4000-8000-000000000001';
const otherCampaignId = '00000000-0000-4000-8000-000000000002';
const missingCampaignId = '00000000-0000-4000-8000-000000000099';
const sessionId = '70000000-0000-4000-8000-000000000001';
const entityA = '30000000-0000-4000-8000-000000000001';
const entityB = '30000000-0000-4000-8000-000000000002';
const foreignEntity = '30000000-0000-4000-8000-000000000003';
const archivedEntity = '30000000-0000-4000-8000-000000000004';
const timestamp = '2026-09-04T12:00:00.000Z';

describe('SessionParticipantService', () => {
  it('substitui integralmente participantes e incrementa a revisão da sessão', () => {
    const repository = new MemoryRepository([createSession()], [createParticipant(entityA)]);
    const service = createService(repository);
    const participants = service.replace(
      replaceSessionParticipantsInputSchema.parse({
        campaignId,
        sessionId,
        revision: 1,
        participants: [
          { entityId: entityB, role: 'ally', attended: false, sortOrder: 2 },
          { entityId: entityA, role: 'player_character', sortOrder: 1 },
        ],
      }),
    );
    expect(participants.map((participant) => participant.entityId)).toEqual([entityA, entityB]);
    expect(participants[1]).toMatchObject({ attended: false, role: 'ally' });
    expect(repository.findById(campaignId, sessionId)?.revision).toBe(2);
  });

  it('rejeita sessão estrangeira, revisão obsoleta e entidades inválidas sem substituir a lista', () => {
    const repository = new MemoryRepository([createSession()], [createParticipant(entityA)]);
    const service = createService(repository);
    const replace = (entityId: string, revision = 1) =>
      service.replace(
        replaceSessionParticipantsInputSchema.parse({
          campaignId,
          sessionId,
          revision,
          participants: [{ entityId, role: 'npc' }],
        }),
      );
    expect(capture(() => replace(foreignEntity)).code).toBe('ENTITY_NOT_FOUND');
    expect(capture(() => replace(archivedEntity)).code).toBe('INVALID_ENTITY_STATE');
    expect(capture(() => replace(entityB, 99)).code).toBe('REVISION_CONFLICT');
    expect(capture(() => service.list(otherCampaignId, sessionId)).code).toBe('SESSION_NOT_FOUND');
    expect(capture(() => service.list(missingCampaignId, sessionId)).code).toBe(
      'CAMPAIGN_NOT_FOUND',
    );
    expect(repository.listParticipants(campaignId, sessionId)).toEqual([
      createParticipant(entityA),
    ]);
  });
});

class MemoryRepository implements SessionParticipantRepositoryPort {
  private sessions: Session[];
  private participants: SessionParticipant[];

  public constructor(sessions: Session[], participants: SessionParticipant[]) {
    this.sessions = sessions;
    this.participants = participants;
  }

  public findById(campaign: string, id: string): Session | null {
    return (
      this.sessions.find((session) => session.campaignId === campaign && session.id === id) ?? null
    );
  }

  public listParticipants(campaign: string, id: string): SessionParticipant[] {
    if (this.findById(campaign, id) === null) return [];
    return this.participants
      .filter((participant) => participant.sessionId === id)
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder || left.entityId.localeCompare(right.entityId),
      );
  }

  public replaceParticipants(
    input: SessionParticipantsReplace,
    updatedAt: string,
  ): SessionParticipant[] {
    void updatedAt;
    const session = this.findById(input.campaignId, input.sessionId);
    if (session === null) throw new Error('Sessão ausente.');
    if (session.revision !== input.revision) throw new Error('Conflito não interceptado.');
    this.sessions = this.sessions.map((item) =>
      item.id === session.id ? { ...item, revision: item.revision + 1 } : item,
    );
    this.participants = input.participants.map((participant) =>
      sessionParticipantSchema.parse({ sessionId: input.sessionId, ...participant }),
    );
    return this.listParticipants(input.campaignId, input.sessionId);
  }
}

function createService(repository: SessionParticipantRepositoryPort): SessionParticipantService {
  const campaigns = new Map<string, Campaign>([
    [campaignId, createCampaign(campaignId)],
    [otherCampaignId, createCampaign(otherCampaignId)],
  ]);
  const entities = new Map<string, Entity>([
    [entityA, createEntity(entityA, campaignId)],
    [entityB, createEntity(entityB, campaignId)],
    [foreignEntity, createEntity(foreignEntity, otherCampaignId)],
    [archivedEntity, createEntity(archivedEntity, campaignId, timestamp)],
  ]);
  return new SessionParticipantService({
    repository,
    campaigns: { findById: (id) => campaigns.get(id) ?? null },
    entities: {
      findById: (campaign, id) => {
        const entity = entities.get(id);
        return entity?.campaignId === campaign ? entity : null;
      },
    },
    now: () => timestamp,
  });
}

function createCampaign(id: string): Campaign {
  return {
    id,
    name: id,
    systemName: null,
    concept: null,
    genre: null,
    tone: null,
    summary: null,
    imagePath: null,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    revision: 1,
  };
}

function createSession(): Session {
  return sessionSchema.parse({
    id: sessionId,
    campaignId,
    sequenceNumber: 1,
    title: 'Sessão',
    playedAt: null,
    status: 'planned',
    summaryMarkdown: null,
    gmNotesMarkdown: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 1,
  });
}

function createParticipant(entityId: string): SessionParticipant {
  return sessionParticipantSchema.parse({
    sessionId,
    entityId,
    role: 'player_character',
    attended: true,
    sortOrder: 0,
  });
}

function createEntity(id: string, owner: string, archivedAt: string | null = null): Entity {
  return {
    id,
    campaignId: owner,
    entityTypeId: '10000000-0000-4000-8000-000000000001',
    name: id,
    summary: null,
    canonState: 'accepted',
    knowledgeState: 'fact',
    visibility: 'gm',
    originKind: 'manual',
    sourceId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt,
    revision: 1,
  };
}

function capture(operation: () => unknown): AppError {
  try {
    operation();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('A operação deveria falhar.');
}
