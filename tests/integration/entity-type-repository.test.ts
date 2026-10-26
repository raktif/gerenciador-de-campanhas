import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { campaignSchema, type Campaign } from '../../src/core/contracts/campaigns';
import {
  entityTypePageRequestSchema,
  entityTypeSchema,
  type EntityType,
} from '../../src/core/contracts/entity-types';
import { AppError } from '../../src/core/errors/app-error';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import { CampaignRepository } from '../../src/db/repositories/campaign-repository';
import { EntityTypeRepository } from '../../src/db/repositories/entity-type-repository';
import { TestLogger } from '../helpers/test-logger';

const campaignId = '00000000-0000-4000-8000-000000000001';
const otherCampaignId = '00000000-0000-4000-8000-000000000002';
const timestamp = '2026-08-28T12:00:00.000Z';
const temporaryRoots: string[] = [];
const databaseContexts: DatabaseContext[] = [];

afterEach(async () => {
  for (const context of databaseContexts.splice(0)) {
    if (context.native.open) context.close();
  }
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((temporaryRoot) => rm(temporaryRoot, { recursive: true, force: true })),
  );
});

describe('EntityTypeRepository', () => {
  it('mantém slug único e consultas isoladas por campanha', async () => {
    const { campaigns, context, entityTypes } = await createRepositories();
    campaigns.insert(createCampaign(campaignId, 'Ethéria'));
    campaigns.insert(createCampaign(otherCampaignId, 'Órbita'));
    const characters = createEntityType(
      '10000000-0000-4000-8000-000000000001',
      campaignId,
      'personagens',
    );
    const otherCharacters = createEntityType(
      '10000000-0000-4000-8000-000000000002',
      otherCampaignId,
      'personagens',
    );

    entityTypes.insert(characters);
    entityTypes.insert(otherCharacters);
    expect(entityTypes.findById(campaignId, characters.id)).toEqual(characters);
    expect(entityTypes.findById(otherCampaignId, characters.id)).toBeNull();
    expect(entityTypes.list(entityTypePageRequestSchema.parse({ campaignId })).items).toEqual([
      characters,
    ]);

    const conflict = captureAppError(() =>
      entityTypes.insert(
        createEntityType('10000000-0000-4000-8000-000000000003', campaignId, 'personagens'),
      ),
    );
    expect(conflict.code).toBe('ENTITY_TYPE_SLUG_CONFLICT');
    context.close();
  });

  it('pagina com cursor estável e separa tipos arquivados', async () => {
    const { campaigns, context, entityTypes } = await createRepositories();
    campaigns.insert(createCampaign(campaignId, 'Ethéria'));
    campaigns.insert(createCampaign(otherCampaignId, 'Órbita'));
    entityTypes.insert(
      createEntityType('10000000-0000-4000-8000-000000000001', campaignId, 'personagens', {
        sortOrder: 10,
      }),
    );
    entityTypes.insert(
      createEntityType('10000000-0000-4000-8000-000000000002', campaignId, 'locais', {
        sortOrder: 10,
      }),
    );
    entityTypes.insert(
      createEntityType('10000000-0000-4000-8000-000000000003', campaignId, 'faccoes', {
        sortOrder: 20,
      }),
    );
    entityTypes.insert(
      createEntityType('10000000-0000-4000-8000-000000000004', campaignId, 'segredos', {
        isArchived: true,
      }),
    );

    const request = entityTypePageRequestSchema.parse({ campaignId, limit: 2 });
    const firstPage = entityTypes.list(request);
    expect(firstPage.items.map(({ id }) => id)).toEqual([
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
    ]);
    expect(firstPage.total).toBe(3);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = entityTypes.list(
      entityTypePageRequestSchema.parse({
        campaignId,
        limit: 2,
        cursor: firstPage.nextCursor ?? undefined,
      }),
    );
    expect(secondPage.items.map(({ slug }) => slug)).toEqual(['faccoes']);
    expect(
      entityTypes
        .list(entityTypePageRequestSchema.parse({ campaignId, filters: { isArchived: true } }))
        .items.map(({ slug }) => slug),
    ).toEqual(['segredos']);

    expect(
      captureAppError(() =>
        entityTypes.list(
          entityTypePageRequestSchema.parse({
            campaignId: otherCampaignId,
            cursor: firstPage.nextCursor ?? undefined,
          }),
        ),
      ).code,
    ).toBe('INVALID_CURSOR');
    context.close();
  });

  it('atualiza com revisão e impede atualização cruzada entre campanhas', async () => {
    const { campaigns, context, entityTypes } = await createRepositories();
    campaigns.insert(createCampaign(campaignId, 'Ethéria'));
    campaigns.insert(createCampaign(otherCampaignId, 'Órbita'));
    const characters = createEntityType(
      '10000000-0000-4000-8000-000000000001',
      campaignId,
      'personagens',
    );
    entityTypes.insert(characters);

    const updated = entityTypes.update(
      {
        campaignId,
        id: characters.id,
        revision: 1,
        patch: { name: 'Protagonistas', slug: 'protagonistas' },
      },
      '2026-08-28T13:00:00.000Z',
    );
    expect(updated).toMatchObject({
      name: 'Protagonistas',
      slug: 'protagonistas',
      revision: 2,
    });
    expect(
      captureAppError(() =>
        entityTypes.update(
          { campaignId, id: characters.id, revision: 1, patch: { name: 'Sobrescrito' } },
          '2026-08-28T14:00:00.000Z',
        ),
      ).code,
    ).toBe('REVISION_CONFLICT');
    expect(
      captureAppError(() =>
        entityTypes.update(
          {
            campaignId: otherCampaignId,
            id: characters.id,
            revision: 2,
            patch: { name: 'Vazamento' },
          },
          '2026-08-28T14:00:00.000Z',
        ),
      ).code,
    ).toBe('ENTITY_TYPE_NOT_FOUND');
    context.close();
  });

  it('remove tipos dependentes quando a campanha é removida', async () => {
    const { campaigns, context, entityTypes } = await createRepositories();
    campaigns.insert(createCampaign(campaignId, 'Ethéria'));
    const characters = createEntityType(
      '10000000-0000-4000-8000-000000000001',
      campaignId,
      'personagens',
    );
    entityTypes.insert(characters);

    context.native.prepare('DELETE FROM campaigns WHERE id = ?').run(campaignId);
    expect(entityTypes.findById(campaignId, characters.id)).toBeNull();
    context.close();
  });
  it('anexa, move e restaura atomicamente sem atravessar campanhas', async () => {
    const { campaigns, context, entityTypes } = await createRepositories();
    campaigns.insert(createCampaign(campaignId, 'Etheria'));
    campaigns.insert(createCampaign(otherCampaignId, 'Orbita'));
    const first = entityTypes.insertAtEnd(
      createEntityType('10000000-0000-4000-8000-000000000011', campaignId, 'primeiro', {
        sortOrder: 99,
      }),
    );
    const second = entityTypes.insertAtEnd(
      createEntityType('10000000-0000-4000-8000-000000000012', campaignId, 'segundo'),
    );
    const archived = entityTypes.insert(
      createEntityType('10000000-0000-4000-8000-000000000013', campaignId, 'arquivado', {
        isArchived: true,
      }),
    );
    const external = entityTypes.insertAtEnd(
      createEntityType('10000000-0000-4000-8000-000000000014', otherCampaignId, 'externo'),
    );

    expect([first.sortOrder, second.sortOrder, external.sortOrder]).toEqual([0, 1, 0]);
    context.native.exec(`CREATE TRIGGER reject_entity_type_move BEFORE UPDATE OF sort_order
      ON entity_types WHEN OLD.id = '${first.id}' BEGIN SELECT RAISE(IGNORE); END`);
    expect(
      captureAppError(() =>
        entityTypes.move(
          {
            campaignId,
            sourceId: second.id,
            sourceRevision: second.revision,
            targetId: first.id,
            targetRevision: first.revision,
            placement: 'before',
          },
          '2026-08-28T12:30:00.000Z',
        ),
      ).code,
    ).toBe('REVISION_CONFLICT');
    expect(entityTypes.findById(campaignId, second.id)?.sortOrder).toBe(1);
    expect(entityTypes.findById(campaignId, first.id)?.sortOrder).toBe(0);
    context.native.exec('DROP TRIGGER reject_entity_type_move');
    const moved = entityTypes.move(
      {
        campaignId,
        sourceId: second.id,
        sourceRevision: second.revision,
        targetId: first.id,
        targetRevision: first.revision,
        placement: 'before',
      },
      '2026-08-28T13:00:00.000Z',
    );
    expect(moved.map(({ slug, sortOrder }) => [slug, sortOrder])).toEqual([
      ['segundo', 0],
      ['primeiro', 1],
    ]);
    expect(entityTypes.findById(otherCampaignId, external.id)).toEqual(external);

    expect(
      captureAppError(() =>
        entityTypes.move(
          {
            campaignId,
            sourceId: second.id,
            sourceRevision: second.revision,
            targetId: first.id,
            targetRevision: first.revision,
            placement: 'after',
          },
          '2026-08-28T14:00:00.000Z',
        ),
      ).code,
    ).toBe('REVISION_CONFLICT');
    expect(
      entityTypes
        .list(entityTypePageRequestSchema.parse({ campaignId }))
        .items.map(({ slug }) => slug),
    ).toEqual(['segundo', 'primeiro']);

    context.native.exec(`CREATE TRIGGER reject_entity_type_restore BEFORE UPDATE OF is_archived
      ON entity_types WHEN OLD.id = '${archived.id}' BEGIN SELECT RAISE(IGNORE); END`);
    expect(
      captureAppError(() =>
        entityTypes.restoreAtEnd(
          { campaignId, id: archived.id, revision: archived.revision },
          '2026-08-28T14:30:00.000Z',
        ),
      ).code,
    ).toBe('REVISION_CONFLICT');
    expect(entityTypes.findById(campaignId, archived.id)).toMatchObject({
      isArchived: true,
      revision: 1,
    });
    context.native.exec('DROP TRIGGER reject_entity_type_restore');
    const restored = entityTypes.restoreAtEnd(
      { campaignId, id: archived.id, revision: archived.revision },
      '2026-08-28T15:00:00.000Z',
    );
    expect(restored).toMatchObject({ isArchived: false, sortOrder: 2, revision: 2 });
    context.close();
  });
});

async function createRepositories(): Promise<{
  context: DatabaseContext;
  campaigns: CampaignRepository;
  entityTypes: EntityTypeRepository;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rpg-entity-types-test-'));
  temporaryRoots.push(root);
  const directories = getDataDirectories(root);
  await ensureDataDirectories(directories);
  const context = await openApplicationDatabase(directories, new TestLogger());
  databaseContexts.push(context);
  return {
    context,
    campaigns: new CampaignRepository(context.orm),
    entityTypes: new EntityTypeRepository(context.orm),
  };
}

function createCampaign(id: string, name: string): Campaign {
  return campaignSchema.parse({
    id,
    name,
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
  });
}

function createEntityType(
  id: string,
  targetCampaignId: string,
  slug: string,
  overrides: Partial<EntityType> = {},
): EntityType {
  return entityTypeSchema.parse({
    id,
    campaignId: targetCampaignId,
    packId: null,
    name: slug,
    singularName: slug,
    slug,
    description: null,
    icon: null,
    color: null,
    sortOrder: 0,
    isSystem: false,
    isArchived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 1,
    ...overrides,
  });
}

function captureAppError(operation: () => unknown): AppError {
  try {
    operation();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('A operação deveria ter lançado AppError.');
}
