import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertionPageRequestSchema,
  assertionSchema,
  createAssertionInputSchema,
  type Assertion,
} from '../../src/core/contracts/assertions';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import { AssertionRepository } from '../../src/db/repositories/assertion-repository';
import { CampaignRepository } from '../../src/db/repositories/campaign-repository';
import { EntityRepository } from '../../src/db/repositories/entity-repository';
import { AssertionService } from '../../src/main/services/assertion-service';
import { TestLogger } from '../helpers/test-logger';

const campaignId = '00000000-0000-4000-8000-000000000001';
const otherCampaignId = '00000000-0000-4000-8000-000000000002';
const missingCampaignId = '00000000-0000-4000-8000-000000000099';
const entityTypeId = '10000000-0000-4000-8000-000000000001';
const otherEntityTypeId = '10000000-0000-4000-8000-000000000002';
const subjectEntityId = '30000000-0000-4000-8000-000000000001';
const objectEntityId = '30000000-0000-4000-8000-000000000002';
const thirdEntityId = '30000000-0000-4000-8000-000000000003';
const foreignEntityId = '30000000-0000-4000-8000-000000000004';
const timestamp = '2026-09-02T12:00:00.000Z';
const roots: string[] = [];
const contexts: DatabaseContext[] = [];

afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('AssertionRepository', () => {
  it('rejeita campanha inexistente no serviço sem persistir uma afirmação', async () => {
    const { context, repository } = await setup();
    const service = new AssertionService({
      repository,
      campaigns: new CampaignRepository(context.orm),
      entities: new EntityRepository(context.orm),
      createId: () => '50000000-0000-4000-8000-000000000099',
    });
    const input = createAssertionInputSchema.parse({
      campaignId: missingCampaignId,
      subjectEntityId,
      statement: 'Não deve persistir.',
    });
    expect(captureCode(() => service.create(input))).toBe('CAMPAIGN_NOT_FOUND');
    expect(context.native.prepare('SELECT COUNT(*) AS total FROM assertions').get()).toEqual({
      total: 0,
    });
    expect(
      captureCode(() =>
        service.list(assertionPageRequestSchema.parse({ campaignId: missingCampaignId })),
      ),
    ).toBe('CAMPAIGN_NOT_FOUND');
    context.close();
  });

  it('lista por qualquer entidade envolvida e aplica filtros narrativos sem misturar campanhas', async () => {
    const { context, repository } = await setup();
    repository.insert(
      createAssertion('50000000-0000-4000-8000-000000000001', {
        objectEntityId,
        predicate: 'conhece',
        statement: null,
      }),
    );
    repository.insert(
      createAssertion('50000000-0000-4000-8000-000000000002', {
        subjectEntityId: thirdEntityId,
        statement: 'A rede pode estar ativa.',
        canonState: 'accepted',
        knowledgeState: 'possibility',
        visibility: 'players',
        updatedAt: '2026-09-02T13:00:00.000Z',
      }),
    );
    repository.insert(
      createAssertion('50000000-0000-4000-8000-000000000003', {
        campaignId: otherCampaignId,
        subjectEntityId: foreignEntityId,
      }),
    );

    const byObject = repository.list(
      assertionPageRequestSchema.parse({
        campaignId,
        filters: { entityId: objectEntityId, archived: false },
      }),
    );
    expect(byObject.items.map((item) => item.id)).toEqual(['50000000-0000-4000-8000-000000000001']);
    const possibilities = repository.list(
      assertionPageRequestSchema.parse({
        campaignId,
        filters: {
          canonState: 'accepted',
          knowledgeState: 'possibility',
          visibility: 'players',
          originKind: 'manual',
          archived: false,
        },
      }),
    );
    expect(possibilities.items.map((item) => item.id)).toEqual([
      '50000000-0000-4000-8000-000000000002',
    ]);
    expect(possibilities.total).toBe(1);
    expect(repository.findById(otherCampaignId, '50000000-0000-4000-8000-000000000001')).toBeNull();
    context.close();
  });

  it('pagina deterministicamente e vincula o cursor a campanha, filtros, ordenação e sentido', async () => {
    const { context, repository } = await setup();
    for (let index = 1; index <= 3; index += 1)
      repository.insert(
        createAssertion(`50000000-0000-4000-8000-${String(index).padStart(12, '0')}`, {
          updatedAt: `2026-09-02T1${String(index)}:00:00.000Z`,
        }),
      );
    const first = repository.list(
      assertionPageRequestSchema.parse({ campaignId, limit: 2, order: 'asc' }),
    );
    expect(first.items.map((item) => item.updatedAt)).toEqual([
      '2026-09-02T11:00:00.000Z',
      '2026-09-02T12:00:00.000Z',
    ]);
    expect(first.nextCursor).not.toBeNull();
    const second = repository.list(
      assertionPageRequestSchema.parse({
        campaignId,
        cursor: first.nextCursor ?? undefined,
        limit: 2,
        order: 'asc',
      }),
    );
    expect(second.items.map((item) => item.updatedAt)).toEqual(['2026-09-02T13:00:00.000Z']);
    expect(() =>
      repository.list(
        assertionPageRequestSchema.parse({
          campaignId,
          cursor: first.nextCursor ?? undefined,
          limit: 2,
          order: 'desc',
        }),
      ),
    ).toThrow(expect.objectContaining({ code: 'INVALID_CURSOR' }));
    expect(() =>
      repository.list(
        assertionPageRequestSchema.parse({
          campaignId: otherCampaignId,
          cursor: first.nextCursor ?? undefined,
          limit: 2,
          order: 'asc',
        }),
      ),
    ).toThrow();
    context.close();
  });

  it('aplica revisão otimista e preserva o conteúdo ao arquivar e restaurar', async () => {
    const { context, repository } = await setup();
    repository.insert(createAssertion('50000000-0000-4000-8000-000000000001'));
    const updated = repository.update(
      {
        campaignId,
        id: '50000000-0000-4000-8000-000000000001',
        revision: 1,
        patch: { knowledgeState: 'rumor', value: ['relato', 2, true] },
      },
      '2026-09-02T13:00:00.000Z',
    );
    expect(updated).toMatchObject({
      knowledgeState: 'rumor',
      value: ['relato', 2, true],
      revision: 2,
    });
    expect(() =>
      repository.update(
        {
          campaignId,
          id: updated.id,
          revision: 1,
          patch: { visibility: 'public' },
        },
        '2026-09-02T14:00:00.000Z',
      ),
    ).toThrow(expect.objectContaining({ code: 'REVISION_CONFLICT' }));

    const service = new AssertionService({
      repository,
      campaigns: new CampaignRepository(context.orm),
      entities: new EntityRepository(context.orm),
      now: () => '2026-09-02T15:00:00.000Z',
    });
    const archived = service.archive({ campaignId, id: updated.id, revision: 2 });
    expect(archived).toMatchObject({
      archivedAt: '2026-09-02T15:00:00.000Z',
      statement: updated.statement,
      revision: 3,
    });
    expect(
      repository.list(
        assertionPageRequestSchema.parse({ campaignId, filters: { archived: false } }),
      ).items,
    ).toEqual([]);
    expect(
      repository.list(assertionPageRequestSchema.parse({ campaignId, filters: { archived: true } }))
        .items,
    ).toHaveLength(1);
    const restored = service.restore({ campaignId, id: updated.id, revision: 3 });
    expect(restored).toMatchObject({ archivedAt: null, statement: updated.statement, revision: 4 });
    context.close();
  });

  it('valida entidades e proveniência de sessão no serviço usando dados persistidos', async () => {
    const { context, repository } = await setup();
    const sessionId = '70000000-0000-4000-8000-000000000001';
    const sourceId = '60000000-0000-4000-8000-000000000001';
    context.native
      .prepare(
        "INSERT INTO sessions (id, campaign_id, sequence_number, title, status, created_at, updated_at, revision) VALUES (?, ?, 1, 'Sessão', 'planned', ?, ?, 1)",
      )
      .run(sessionId, otherCampaignId, timestamp, timestamp);
    context.native
      .prepare("INSERT INTO sources (id, kind, session_id, created_at) VALUES (?, 'session', ?, ?)")
      .run(sourceId, sessionId, timestamp);
    const service = new AssertionService({
      repository,
      campaigns: new CampaignRepository(context.orm),
      entities: new EntityRepository(context.orm),
    });
    const request = createAssertionInputSchema.parse({
      campaignId,
      subjectEntityId,
      statement: 'Registrado em sessão.',
      originKind: 'session',
      sourceId,
    });
    expect(captureCode(() => service.create(request))).toBe('ASSERTION_SOURCE_CAMPAIGN_MISMATCH');
    expect(
      captureCode(() =>
        service.create({
          ...request,
          originKind: 'manual',
          sourceId: null,
          subjectEntityId: foreignEntityId,
        }),
      ),
    ).toBe('ENTITY_NOT_FOUND');
    expect(repository.findById(otherCampaignId, '50000000-0000-4000-8000-000000000099')).toBeNull();
    context.close();
  });
});

async function setup(): Promise<{
  context: DatabaseContext;
  repository: AssertionRepository;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rpg-assertions-test-'));
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
    "INSERT INTO entity_types (id, campaign_id, name, singular_name, slug, sort_order, is_system, is_archived, created_at, updated_at, revision) VALUES (?, ?, 'Entidades', 'Entidade', 'entidades', 0, 0, 0, ?, ?, 1)",
  );
  insertType.run(entityTypeId, campaignId, timestamp, timestamp);
  insertType.run(otherEntityTypeId, otherCampaignId, timestamp, timestamp);
  const insertEntity = context.native.prepare(
    "INSERT INTO entities (id, campaign_id, entity_type_id, name, canon_state, knowledge_state, visibility, origin_kind, created_at, updated_at, revision) VALUES (?, ?, ?, ?, 'accepted', 'fact', 'gm', 'manual', ?, ?, 1)",
  );
  for (const id of [subjectEntityId, objectEntityId, thirdEntityId])
    insertEntity.run(id, campaignId, entityTypeId, id, timestamp, timestamp);
  insertEntity.run(
    foreignEntityId,
    otherCampaignId,
    otherEntityTypeId,
    foreignEntityId,
    timestamp,
    timestamp,
  );
  return { context, repository: new AssertionRepository(context.orm) };
}

function createAssertion(id: string, overrides: Partial<Assertion> = {}): Assertion {
  return assertionSchema.parse({
    id,
    campaignId,
    subjectEntityId,
    predicate: null,
    objectEntityId: null,
    statement: 'Os cabos vibram durante a madrugada.',
    value: null,
    canonState: 'accepted',
    knowledgeState: 'fact',
    visibility: 'gm',
    originKind: 'manual',
    sourceId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    revision: 1,
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
