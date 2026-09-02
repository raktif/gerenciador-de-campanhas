import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  relationshipPageRequestSchema,
  relationshipSchema,
  type Relationship,
} from '../../src/core/contracts/relationships';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import { RelationshipRepository } from '../../src/db/repositories/relationship-repository';
import { TestLogger } from '../helpers/test-logger';

const campaignId = '00000000-0000-4000-8000-000000000001';
const otherCampaignId = '00000000-0000-4000-8000-000000000002';
const typeId = '20000000-0000-4000-8000-000000000001';
const entityIds = [
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003',
] as const;
const timestamp = '2026-09-02T12:00:00.000Z';
const roots: string[] = [];
const contexts: DatabaseContext[] = [];

afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('RelationshipRepository', () => {
  it('consulta as duas direções e aplica filtros narrativos à vizinhança', async () => {
    const { context, repository } = await setup();
    repository.insert(
      createRelationship('40000000-0000-4000-8000-000000000001', entityIds[0], entityIds[1]),
    );
    repository.insert(
      createRelationship('40000000-0000-4000-8000-000000000002', entityIds[2], entityIds[0], {
        knowledgeState: 'rumor',
      }),
    );
    const all = repository.listActiveAdjacent({
      campaignId,
      entityIds: [entityIds[0]],
      relationshipTypeIds: [],
      canonStates: [],
      knowledgeStates: [],
      visibilities: [],
    });
    expect(all.map((item) => item.id)).toEqual([
      '40000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000002',
    ]);
    expect(
      repository.listActiveAdjacent({
        campaignId,
        entityIds: [entityIds[0]],
        relationshipTypeIds: [],
        canonStates: [],
        knowledgeStates: ['fact'],
        visibilities: [],
      }),
    ).toHaveLength(1);
    context.close();
  });

  it('filtra a lista e impede reutilização de cursor em outra campanha', async () => {
    const { context, repository } = await setup();
    repository.insert(
      createRelationship('40000000-0000-4000-8000-000000000001', entityIds[0], entityIds[1]),
    );
    repository.insert(
      createRelationship('40000000-0000-4000-8000-000000000002', entityIds[1], entityIds[2], {
        visibility: 'players',
        updatedAt: '2026-09-02T13:00:00.000Z',
      }),
    );
    const filtered = repository.list(
      relationshipPageRequestSchema.parse({
        campaignId,
        filters: { archived: false, visibility: 'players' },
      }),
    );
    expect(filtered.items.map((item) => item.id)).toEqual(['40000000-0000-4000-8000-000000000002']);
    const first = repository.list(relationshipPageRequestSchema.parse({ campaignId, limit: 1 }));
    expect(first.nextCursor).not.toBeNull();
    expect(() =>
      repository.list(
        relationshipPageRequestSchema.parse({
          campaignId: otherCampaignId,
          cursor: first.nextCursor ?? undefined,
        }),
      ),
    ).toThrow();
    context.close();
  });
});

async function setup(): Promise<{ context: DatabaseContext; repository: RelationshipRepository }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rpg-relationships-test-'));
  roots.push(root);
  const directories = getDataDirectories(root);
  await ensureDataDirectories(directories);
  const context = await openApplicationDatabase(directories, new TestLogger());
  contexts.push(context);
  for (const id of [campaignId, otherCampaignId])
    context.native
      .prepare(
        "INSERT INTO campaigns (id, name, status, created_at, updated_at, revision) VALUES (?, ?, 'active', ?, ?, 1)",
      )
      .run(id, id, timestamp, timestamp);
  context.native
    .prepare(
      "INSERT INTO entity_types (id, campaign_id, name, singular_name, slug, sort_order, is_system, is_archived, created_at, updated_at, revision) VALUES (?, ?, 'Entidades', 'Entidade', 'entidades', 0, 0, 0, ?, ?, 1)",
    )
    .run('10000000-0000-4000-8000-000000000001', campaignId, timestamp, timestamp);
  context.native
    .prepare(
      "INSERT INTO relationship_types (id, campaign_id, name, slug, is_symmetric, sort_order, is_archived, created_at, updated_at, revision) VALUES (?, ?, 'Conhece', 'conhece', 0, 0, 0, ?, ?, 1)",
    )
    .run(typeId, campaignId, timestamp, timestamp);
  const insertEntity = context.native.prepare(
    "INSERT INTO entities (id, campaign_id, entity_type_id, name, canon_state, knowledge_state, visibility, origin_kind, created_at, updated_at, revision) VALUES (?, ?, ?, ?, 'accepted', 'fact', 'gm', 'manual', ?, ?, 1)",
  );
  for (const id of entityIds)
    insertEntity.run(
      id,
      campaignId,
      '10000000-0000-4000-8000-000000000001',
      id,
      timestamp,
      timestamp,
    );
  return { context, repository: new RelationshipRepository(context.orm) };
}
function createRelationship(
  id: string,
  sourceEntityId: string,
  targetEntityId: string,
  overrides: Partial<Relationship> = {},
): Relationship {
  return relationshipSchema.parse({
    id,
    campaignId,
    relationshipTypeId: typeId,
    sourceEntityId,
    targetEntityId,
    description: null,
    strength: null,
    canonState: 'accepted',
    knowledgeState: 'fact',
    visibility: 'gm',
    originKind: 'manual',
    sourceId: null,
    validFromEventId: null,
    validToEventId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    revision: 1,
    ...overrides,
  });
}
