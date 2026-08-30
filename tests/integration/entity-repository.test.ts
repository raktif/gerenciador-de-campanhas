import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { campaignSchema } from '../../src/core/contracts/campaigns';
import { entityTypeSchema } from '../../src/core/contracts/entity-types';
import { fieldDefinitionSchema } from '../../src/core/contracts/field-definitions';
import {
  entityPageRequestSchema,
  entitySchema,
  type Entity,
} from '../../src/core/contracts/entities';
import { AppError } from '../../src/core/errors/app-error';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import { CampaignRepository } from '../../src/db/repositories/campaign-repository';
import { EntityRepository } from '../../src/db/repositories/entity-repository';
import { EntityTypeRepository } from '../../src/db/repositories/entity-type-repository';
import { FieldDefinitionRepository } from '../../src/db/repositories/field-definition-repository';
import { TestLogger } from '../helpers/test-logger';

const campaignId = '00000000-0000-4000-8000-000000000001';
const otherCampaignId = '00000000-0000-4000-8000-000000000002';
const entityTypeId = '10000000-0000-4000-8000-000000000001';
const fieldId = '20000000-0000-4000-8000-000000000001';
const timestamp = '2026-08-28T12:00:00.000Z';
const roots: string[] = [];
const contexts: DatabaseContext[] = [];
afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('EntityRepository', () => {
  it('persiste valores tipados, isola campanha e atualiza o conjunto atomicamente', async () => {
    const { context, entities } = await setup();
    const aris = createEntity('30000000-0000-4000-8000-000000000001', 'Aris');
    const created = entities.insert(aris, [
      {
        id: '40000000-0000-4000-8000-000000000001',
        fieldDefinitionId: fieldId,
        valueText: 'Capitã',
        valueNumber: null,
        valueBoolean: null,
        valueDate: null,
        valueJson: null,
      },
    ]);
    expect(created.fieldValues[0]).toMatchObject({ value: 'Capitã', revision: 1 });
    expect(entities.getDetails(otherCampaignId, aris.id)).toBeNull();
    const updated = entities.update(
      { campaignId, id: aris.id, revision: 1, patch: { summary: 'Líder' } },
      '2026-08-28T13:00:00.000Z',
      [
        {
          id: '40000000-0000-4000-8000-000000000099',
          fieldDefinitionId: fieldId,
          valueText: 'Comandante',
          valueNumber: null,
          valueBoolean: null,
          valueDate: null,
          valueJson: null,
        },
      ],
    );
    expect(updated.entity).toMatchObject({ summary: 'Líder', revision: 2 });
    expect(updated.fieldValues[0]).toMatchObject({ value: 'Comandante', revision: 2 });
    expect(
      capture(() =>
        entities.update(
          { campaignId, id: aris.id, revision: 1, patch: { name: 'Conflito' } },
          timestamp,
        ),
      ).code,
    ).toBe('REVISION_CONFLICT');
    context.close();
  });

  it('pagina de modo estável e separa arquivadas e tipos', async () => {
    const { context, entities } = await setup();
    entities.insert(createEntity('30000000-0000-4000-8000-000000000001', 'Aris'), []);
    entities.insert(createEntity('30000000-0000-4000-8000-000000000002', 'Borin'), []);
    entities.insert(createEntity('30000000-0000-4000-8000-000000000003', 'Cira'), []);
    entities.insert(
      createEntity('30000000-0000-4000-8000-000000000004', 'Dara', { archivedAt: timestamp }),
      [],
    );
    const first = entities.list(entityPageRequestSchema.parse({ campaignId, limit: 2 }));
    expect(first.items.map(({ name }) => name)).toEqual(['Aris', 'Borin']);
    expect(first.total).toBe(3);
    const second = entities.list(
      entityPageRequestSchema.parse({
        campaignId,
        limit: 2,
        cursor: first.nextCursor ?? undefined,
      }),
    );
    expect(second.items.map(({ name }) => name)).toEqual(['Cira']);
    expect(
      entities
        .list(entityPageRequestSchema.parse({ campaignId, filters: { archived: true } }))
        .items.map(({ name }) => name),
    ).toEqual(['Dara']);
    context.close();
  });

  it('remove entidade e valores quando a campanha é removida', async () => {
    const { context, entities } = await setup();
    const aris = createEntity('30000000-0000-4000-8000-000000000001', 'Aris');
    entities.insert(aris, [
      {
        id: '40000000-0000-4000-8000-000000000001',
        fieldDefinitionId: fieldId,
        valueText: 'Capitã',
        valueNumber: null,
        valueBoolean: null,
        valueDate: null,
        valueJson: null,
      },
    ]);
    context.native.prepare('DELETE FROM campaigns WHERE id = ?').run(campaignId);
    expect(entities.findById(campaignId, aris.id)).toBeNull();
    expect(
      context.native.prepare('SELECT COUNT(*) AS total FROM field_values').get(),
    ).toMatchObject({ total: 0 });
    context.close();
  });
});

async function setup(): Promise<{ context: DatabaseContext; entities: EntityRepository }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rpg-entities-test-'));
  roots.push(root);
  const dirs = getDataDirectories(root);
  await ensureDataDirectories(dirs);
  const context = await openApplicationDatabase(dirs, new TestLogger());
  contexts.push(context);
  const campaigns = new CampaignRepository(context.orm);
  const types = new EntityTypeRepository(context.orm);
  const fields = new FieldDefinitionRepository(context.orm);
  campaigns.insert(
    campaignSchema.parse({
      id: campaignId,
      name: 'Ethéria',
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
    }),
  );
  types.insert(
    entityTypeSchema.parse({
      id: entityTypeId,
      campaignId,
      packId: null,
      name: 'Personagens',
      singularName: 'Personagem',
      slug: 'personagens',
      description: null,
      icon: null,
      color: null,
      sortOrder: 0,
      isSystem: false,
      isArchived: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 1,
    }),
  );
  fields.insert(
    fieldDefinitionSchema.parse({
      id: fieldId,
      entityTypeId,
      key: 'titulo',
      label: 'Título',
      description: null,
      dataType: 'short_text',
      semanticRole: null,
      required: false,
      searchable: true,
      secretByDefault: false,
      defaultValue: null,
      options: null,
      validation: null,
      referenceRelationshipTypeId: null,
      referenceDirection: null,
      allowedTargetTypeIds: null,
      onDeleteBehavior: null,
      sortOrder: 0,
      isArchived: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 1,
    }),
  );
  return { context, entities: new EntityRepository(context.orm) };
}
function createEntity(id: string, name: string, overrides: Partial<Entity> = {}): Entity {
  return entitySchema.parse({
    id,
    campaignId,
    entityTypeId,
    name,
    summary: null,
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
  throw new Error('Era esperado AppError.');
}
