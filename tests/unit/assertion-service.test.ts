import { describe, expect, it } from 'vitest';
import {
  assertionPageRequestSchema,
  assertionSchema,
  createAssertionInputSchema,
  type Assertion,
  type AssertionPageRequest,
  type AssertionPageResult,
} from '../../src/core/contracts/assertions';
import type { Entity } from '../../src/core/contracts/entities';
import type { Campaign } from '../../src/core/contracts/campaigns';
import { AppError } from '../../src/core/errors/app-error';
import type {
  AssertionRepositoryUpdate,
  AssertionSourceContext,
} from '../../src/db/repositories/assertion-repository';
import {
  AssertionService,
  type AssertionRepositoryPort,
} from '../../src/main/services/assertion-service';

const campaignId = '00000000-0000-4000-8000-000000000001';
const otherCampaignId = '00000000-0000-4000-8000-000000000002';
const missingCampaignId = '00000000-0000-4000-8000-000000000099';
const subjectEntityId = '30000000-0000-4000-8000-000000000001';
const objectEntityId = '30000000-0000-4000-8000-000000000002';
const foreignEntityId = '30000000-0000-4000-8000-000000000003';
const sourceId = '60000000-0000-4000-8000-000000000001';
const timestamp = '2026-09-02T12:00:00.000Z';

describe('AssertionService', () => {
  it('rejeita campanha inexistente ao criar ou listar sem persistir dados', () => {
    const repository = new MemoryRepository();
    const service = createService(repository);
    const input = createAssertionInputSchema.parse({
      campaignId: missingCampaignId,
      subjectEntityId,
      statement: 'Não deve persistir.',
    });
    expect(capture(() => service.create(input)).code).toBe('CAMPAIGN_NOT_FOUND');
    expect(repository.count()).toBe(0);
    expect(
      capture(() =>
        service.list(assertionPageRequestSchema.parse({ campaignId: missingCampaignId })),
      ).code,
    ).toBe('CAMPAIGN_NOT_FOUND');
  });

  it('cria possibilidade aceita sem promovê-la a fato', () => {
    const repository = new MemoryRepository();
    const service = createService(repository);
    const assertion = service.create(
      createAssertionInputSchema.parse({
        campaignId,
        subjectEntityId,
        statement: 'Os cabos podem pertencer à Rede Bélica.',
        knowledgeState: 'possibility',
      }),
    );
    expect(assertion).toMatchObject({
      campaignId,
      subjectEntityId,
      canonState: 'accepted',
      knowledgeState: 'possibility',
      visibility: 'gm',
      originKind: 'manual',
      sourceId: null,
      archivedAt: null,
      revision: 1,
    });
  });

  it('impede entidades ausentes, arquivadas ou pertencentes a outra campanha', () => {
    const service = createService(new MemoryRepository());
    const input = (object: string | null) =>
      createAssertionInputSchema.parse({
        campaignId,
        subjectEntityId,
        predicate: 'conhece',
        objectEntityId: object,
        statement: object === null ? 'Uma declaração.' : null,
      });
    expect(capture(() => service.create(input(foreignEntityId))).code).toBe('ENTITY_NOT_FOUND');
    expect(capture(() => service.create(input('30000000-0000-4000-8000-000000000004'))).code).toBe(
      'INVALID_ENTITY_STATE',
    );
  });

  it('valida novamente a declaração completa ao atualizar', () => {
    const repository = new MemoryRepository([createAssertion()]);
    const service = createService(repository);
    expect(
      capture(() =>
        service.update({
          campaignId,
          id: createAssertion().id,
          revision: 1,
          patch: { statement: null },
        }),
      ).code,
    ).toBe('INVALID_ASSERTION_CONTENT');
    const updated = service.update({
      campaignId,
      id: createAssertion().id,
      revision: 1,
      patch: { knowledgeState: 'rumor', visibility: 'players' },
    });
    expect(updated).toMatchObject({ knowledgeState: 'rumor', visibility: 'players', revision: 2 });
  });

  it('exige fonte coerente e impede fonte de sessão de outra campanha', () => {
    const missingSource = createAssertionInputSchema.parse({
      campaignId,
      subjectEntityId,
      statement: 'Registrado durante a sessão.',
      originKind: 'session',
    });
    expect(capture(() => createService(new MemoryRepository()).create(missingSource)).code).toBe(
      'ASSERTION_SOURCE_REQUIRED',
    );

    const repository = new MemoryRepository();
    repository.sources.set(sourceId, { kind: 'session', sessionCampaignId: otherCampaignId });
    const withSource = { ...missingSource, sourceId };
    expect(capture(() => createService(repository).create(withSource)).code).toBe(
      'ASSERTION_SOURCE_CAMPAIGN_MISMATCH',
    );
    repository.sources.set(sourceId, { kind: 'manual', sessionCampaignId: null });
    expect(capture(() => createService(repository).create(withSource)).code).toBe(
      'ASSERTION_SOURCE_KIND_MISMATCH',
    );
    repository.sources.set(sourceId, { kind: 'session', sessionCampaignId: campaignId });
    expect(createService(repository).create(withSource).sourceId).toBe(sourceId);
  });

  it('valida filtro de entidade, revisão e ciclo de arquivamento', () => {
    const repository = new MemoryRepository([createAssertion()]);
    const service = createService(repository);
    expect(
      capture(() =>
        service.list(
          assertionPageRequestSchema.parse({
            campaignId,
            filters: { entityId: foreignEntityId, archived: false },
          }),
        ),
      ).code,
    ).toBe('ENTITY_NOT_FOUND');
    expect(
      capture(() =>
        service.update({
          campaignId,
          id: createAssertion().id,
          revision: 99,
          patch: { visibility: 'public' },
        }),
      ).code,
    ).toBe('REVISION_CONFLICT');
    const archived = service.archive({ campaignId, id: createAssertion().id, revision: 1 });
    expect(archived.archivedAt).toBe(timestamp);
    expect(capture(() => service.archive({ campaignId, id: archived.id, revision: 2 })).code).toBe(
      'INVALID_ASSERTION_STATE',
    );
    const restored = service.restore({ campaignId, id: archived.id, revision: 2 });
    expect(restored).toMatchObject({ archivedAt: null, revision: 3 });
  });
});

class MemoryRepository implements AssertionRepositoryPort {
  public readonly sources = new Map<string, AssertionSourceContext>();
  private records: Assertion[];

  public constructor(records: Assertion[] = []) {
    this.records = records;
  }

  public count(): number {
    return this.records.length;
  }

  public insert(assertion: Assertion): Assertion {
    this.records.push(assertion);
    return assertion;
  }

  public findById(campaign: string, id: string): Assertion | null {
    return this.records.find((item) => item.campaignId === campaign && item.id === id) ?? null;
  }

  public findSourceContext(id: string): AssertionSourceContext | null {
    return this.sources.get(id) ?? null;
  }

  public list(request: AssertionPageRequest): AssertionPageResult {
    const items = this.records.filter((item) => item.campaignId === request.campaignId);
    return { items, nextCursor: null, total: items.length };
  }

  public update(input: AssertionRepositoryUpdate, updatedAt: string): Assertion {
    const current = this.findById(input.campaignId, input.id);
    if (current === null) throw new Error('Registro ausente.');
    if (current.revision !== input.revision) throw new Error('Conflito não interceptado.');
    const updated = assertionSchema.parse({
      ...current,
      ...input.patch,
      updatedAt,
      revision: current.revision + 1,
    });
    this.records = this.records.map((item) => (item.id === updated.id ? updated : item));
    return updated;
  }
}

function createService(repository: AssertionRepositoryPort): AssertionService {
  const campaigns = new Map<string, Campaign>([
    [campaignId, createCampaign(campaignId)],
    [otherCampaignId, createCampaign(otherCampaignId)],
  ]);
  const entities = new Map<string, Entity>([
    [subjectEntityId, createEntity(subjectEntityId, campaignId)],
    [objectEntityId, createEntity(objectEntityId, campaignId)],
    [foreignEntityId, createEntity(foreignEntityId, otherCampaignId)],
    [
      '30000000-0000-4000-8000-000000000004',
      createEntity('30000000-0000-4000-8000-000000000004', campaignId, timestamp),
    ],
  ]);
  let sequence = 0;
  return new AssertionService({
    repository,
    campaigns: { findById: (id) => campaigns.get(id) ?? null },
    entities: {
      findById: (campaign, id) => {
        const entity = entities.get(id);
        return entity?.campaignId === campaign ? entity : null;
      },
    },
    createId: () => `50000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
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

function createEntity(
  id: string,
  ownerCampaignId: string,
  archivedAt: string | null = null,
): Entity {
  return {
    id,
    campaignId: ownerCampaignId,
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

function createAssertion(overrides: Partial<Assertion> = {}): Assertion {
  return assertionSchema.parse({
    id: '50000000-0000-4000-8000-000000000001',
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

function capture(operation: () => unknown): AppError {
  try {
    operation();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('A operação deveria falhar.');
}
