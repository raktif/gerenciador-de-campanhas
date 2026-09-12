import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  replaceSessionParticipantsInputSchema,
  sessionParticipantSchema,
  sessionSchema,
  type Session,
  type SessionParticipant,
} from '../../src/core/contracts/sessions';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import { EntityRepository } from '../../src/db/repositories/entity-repository';
import { CampaignRepository } from '../../src/db/repositories/campaign-repository';
import { SessionRepository } from '../../src/db/repositories/session-repository';
import { SessionParticipantService } from '../../src/main/services/session-participant-service';
import { TestLogger } from '../helpers/test-logger';

const campaignId = '00000000-0000-4000-8000-000000000001';
const otherCampaignId = '00000000-0000-4000-8000-000000000002';
const sessionId = '70000000-0000-4000-8000-000000000001';
const entityTypeId = '10000000-0000-4000-8000-000000000001';
const otherEntityTypeId = '10000000-0000-4000-8000-000000000002';
const entityA = '30000000-0000-4000-8000-000000000001';
const entityB = '30000000-0000-4000-8000-000000000002';
const archivedEntity = '30000000-0000-4000-8000-000000000003';
const foreignEntity = '30000000-0000-4000-8000-000000000004';
const timestamp = '2026-09-04T12:00:00.000Z';
const roots: string[] = [];
const contexts: DatabaseContext[] = [];

afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('SessionParticipantRepository', () => {
  it('substitui a lista integralmente, preserva presença/ordem e atualiza a revisão da sessão', async () => {
    const { context, repository, service } = await setup();
    repository.insert(createSession());
    const participants = service.replace(
      replaceSessionParticipantsInputSchema.parse({
        campaignId,
        sessionId,
        revision: 1,
        participants: [
          { entityId: entityB, role: 'ally', attended: false, sortOrder: 2 },
          { entityId: entityA, role: 'player_character', attended: true, sortOrder: 1 },
        ],
      }),
    );
    expect(participants).toEqual([
      createParticipant(entityA, { sortOrder: 1 }),
      createParticipant(entityB, { role: 'ally', attended: false, sortOrder: 2 }),
    ]);
    expect(repository.findById(campaignId, sessionId)?.revision).toBe(2);
    expect(
      context.native.prepare('SELECT updated_at FROM sessions WHERE id = ?').get(sessionId),
    ).toEqual({ updated_at: '2026-09-04T13:00:00.000Z' });
    context.close();
  });

  it('rejeita duplicata no contrato e entidades estrangeiras ou arquivadas sem alterar vínculos', async () => {
    const { context, repository, service } = await setup();
    repository.insert(createSession());
    service.replace(
      replaceSessionParticipantsInputSchema.parse({
        campaignId,
        sessionId,
        revision: 1,
        participants: [{ entityId: entityA, role: 'player_character' }],
      }),
    );
    expect(() =>
      replaceSessionParticipantsInputSchema.parse({
        campaignId,
        sessionId,
        revision: 2,
        participants: [
          { entityId: entityA, role: 'player_character' },
          { entityId: entityA, role: 'npc', sortOrder: 1 },
        ],
      }),
    ).toThrow();
    expect(
      captureCode(() =>
        service.replace(
          replaceSessionParticipantsInputSchema.parse({
            campaignId,
            sessionId,
            revision: 2,
            participants: [{ entityId: foreignEntity, role: 'npc' }],
          }),
        ),
      ),
    ).toBe('ENTITY_NOT_FOUND');
    expect(
      captureCode(() =>
        service.replace(
          replaceSessionParticipantsInputSchema.parse({
            campaignId,
            sessionId,
            revision: 2,
            participants: [{ entityId: archivedEntity, role: 'npc' }],
          }),
        ),
      ),
    ).toBe('INVALID_ENTITY_STATE');
    expect(repository.listParticipants(campaignId, sessionId)).toEqual([
      createParticipant(entityA),
    ]);
    expect(repository.findById(campaignId, sessionId)?.revision).toBe(2);
    context.close();
  });

  it('reverte sessão e lista quando uma inserção inválida falha dentro da transação', async () => {
    const { context, repository } = await setup();
    repository.insert(createSession());
    repository.replaceParticipants(
      {
        campaignId,
        sessionId,
        revision: 1,
        participants: [
          { entityId: entityA, role: 'player_character', attended: true, sortOrder: 0 },
        ],
      },
      '2026-09-04T13:00:00.000Z',
    );
    expect(() =>
      repository.replaceParticipants(
        {
          campaignId,
          sessionId,
          revision: 2,
          participants: [
            { entityId: entityB, role: 'ally', attended: true, sortOrder: 0 },
            {
              entityId: '30000000-0000-4000-8000-000000000099',
              role: 'npc',
              attended: true,
              sortOrder: 1,
            },
          ],
        },
        '2026-09-04T14:00:00.000Z',
      ),
    ).toThrow();
    expect(repository.listParticipants(campaignId, sessionId)).toEqual([
      createParticipant(entityA),
    ]);
    expect(repository.findById(campaignId, sessionId)).toMatchObject({ revision: 2 });
    context.close();
  });

  it('isola sessão e participantes por campanha e rejeita revisão obsoleta', async () => {
    const { context, repository, service } = await setup();
    repository.insert(createSession());
    expect(
      captureCode(() =>
        service.replace(
          replaceSessionParticipantsInputSchema.parse({
            campaignId: otherCampaignId,
            sessionId,
            revision: 1,
            participants: [{ entityId: foreignEntity, role: 'npc' }],
          }),
        ),
      ),
    ).toBe('SESSION_NOT_FOUND');
    service.replace(
      replaceSessionParticipantsInputSchema.parse({
        campaignId,
        sessionId,
        revision: 1,
        participants: [{ entityId: entityA, role: 'player_character' }],
      }),
    );
    expect(
      captureCode(() =>
        service.replace(
          replaceSessionParticipantsInputSchema.parse({
            campaignId,
            sessionId,
            revision: 1,
            participants: [{ entityId: entityB, role: 'ally' }],
          }),
        ),
      ),
    ).toBe('REVISION_CONFLICT');
    expect(repository.listParticipants(otherCampaignId, sessionId)).toEqual([]);
    context.close();
  });
});

async function setup(): Promise<{
  context: DatabaseContext;
  repository: SessionRepository;
  service: SessionParticipantService;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rpg-session-participants-test-'));
  roots.push(root);
  const directories = getDataDirectories(root);
  await ensureDataDirectories(directories);
  const context = await openApplicationDatabase(directories, new TestLogger());
  contexts.push(context);
  const insertCampaign = context.native.prepare(
    "INSERT INTO campaigns (id, name, status, created_at, updated_at, revision) VALUES (?, ?, 'active', ?, ?, 1)",
  );
  insertCampaign.run(campaignId, 'Ethéria', timestamp, timestamp);
  insertCampaign.run(otherCampaignId, 'Outra', timestamp, timestamp);
  const insertType = context.native.prepare(
    "INSERT INTO entity_types (id, campaign_id, name, singular_name, slug, sort_order, is_system, is_archived, created_at, updated_at, revision) VALUES (?, ?, 'Entidades', 'Entidade', ?, 0, 0, 0, ?, ?, 1)",
  );
  insertType.run(entityTypeId, campaignId, 'entidades', timestamp, timestamp);
  insertType.run(otherEntityTypeId, otherCampaignId, 'outras-entidades', timestamp, timestamp);
  const insertEntity = context.native.prepare(
    "INSERT INTO entities (id, campaign_id, entity_type_id, name, canon_state, knowledge_state, visibility, origin_kind, archived_at, created_at, updated_at, revision) VALUES (?, ?, ?, ?, 'accepted', 'fact', 'gm', 'manual', ?, ?, ?, 1)",
  );
  insertEntity.run(entityA, campaignId, entityTypeId, 'A', null, timestamp, timestamp);
  insertEntity.run(entityB, campaignId, entityTypeId, 'B', null, timestamp, timestamp);
  insertEntity.run(
    archivedEntity,
    campaignId,
    entityTypeId,
    'Arquivada',
    timestamp,
    timestamp,
    timestamp,
  );
  insertEntity.run(
    foreignEntity,
    otherCampaignId,
    otherEntityTypeId,
    'Estrangeira',
    null,
    timestamp,
    timestamp,
  );
  const repository = new SessionRepository(context.orm);
  return {
    context,
    repository,
    service: new SessionParticipantService({
      repository,
      campaigns: new CampaignRepository(context.orm),
      entities: new EntityRepository(context.orm),
      now: () => '2026-09-04T13:00:00.000Z',
    }),
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

function createParticipant(
  entityId: string,
  overrides: Partial<SessionParticipant> = {},
): SessionParticipant {
  return sessionParticipantSchema.parse({
    sessionId,
    entityId,
    role: 'player_character',
    attended: true,
    sortOrder: 0,
    ...overrides,
  });
}

function captureCode(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error) return String(error.code);
    throw error;
  }
  throw new Error('A operação deveria falhar.');
}
