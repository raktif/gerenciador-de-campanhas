import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { campaignSchema, type Campaign } from '../../src/core/contracts/campaigns';
import { entityTypeSchema, type EntityType } from '../../src/core/contracts/entity-types';
import {
  fieldDefinitionPageRequestSchema,
  fieldDefinitionSchema,
  type FieldDefinition,
} from '../../src/core/contracts/field-definitions';
import { AppError } from '../../src/core/errors/app-error';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import { CampaignRepository } from '../../src/db/repositories/campaign-repository';
import { EntityTypeRepository } from '../../src/db/repositories/entity-type-repository';
import { FieldDefinitionRepository } from '../../src/db/repositories/field-definition-repository';
import { TestLogger } from '../helpers/test-logger';

const campaignId = '00000000-0000-4000-8000-000000000001';
const otherCampaignId = '00000000-0000-4000-8000-000000000002';
const entityTypeId = '10000000-0000-4000-8000-000000000001';
const otherEntityTypeId = '10000000-0000-4000-8000-000000000002';
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

describe('FieldDefinitionRepository', () => {
  it('mantém chave única por tipo, isolamento por campanha e JSON íntegro', async () => {
    const { context, fields } = await createRepositories();
    const name = createField('20000000-0000-4000-8000-000000000001', entityTypeId, 'nome', {
      defaultValue: { prefixo: 'Capitão' },
      options: ['A', 'B'],
      validation: { minLength: 2 },
    });
    const otherName = createField(
      '20000000-0000-4000-8000-000000000002',
      otherEntityTypeId,
      'nome',
    );

    fields.insert(name);
    fields.insert(otherName);
    expect(fields.findById(campaignId, entityTypeId, name.id)).toEqual(name);
    expect(fields.findById(otherCampaignId, entityTypeId, name.id)).toBeNull();
    expect(
      fields.list(fieldDefinitionPageRequestSchema.parse({ campaignId, entityTypeId })).items,
    ).toEqual([name]);
    expect(
      captureAppError(() =>
        fields.insert(createField('20000000-0000-4000-8000-000000000003', entityTypeId, 'nome')),
      ).code,
    ).toBe('FIELD_DEFINITION_KEY_CONFLICT');
    context.close();
  });

  it('pagina com cursor estável e separa campos arquivados', async () => {
    const { context, fields } = await createRepositories();
    fields.insert(
      createField('20000000-0000-4000-8000-000000000001', entityTypeId, 'nome', {
        sortOrder: 10,
      }),
    );
    fields.insert(
      createField('20000000-0000-4000-8000-000000000002', entityTypeId, 'alcunha', {
        sortOrder: 10,
      }),
    );
    fields.insert(
      createField('20000000-0000-4000-8000-000000000003', entityTypeId, 'objetivo', {
        sortOrder: 20,
      }),
    );
    fields.insert(
      createField('20000000-0000-4000-8000-000000000004', entityTypeId, 'segredo', {
        isArchived: true,
      }),
    );

    const request = fieldDefinitionPageRequestSchema.parse({ campaignId, entityTypeId, limit: 2 });
    const firstPage = fields.list(request);
    expect(firstPage.items.map(({ id }) => id)).toEqual([
      '20000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
    ]);
    expect(firstPage.total).toBe(3);
    expect(firstPage.nextCursor).not.toBeNull();
    expect(
      fields
        .list(
          fieldDefinitionPageRequestSchema.parse({
            campaignId,
            entityTypeId,
            limit: 2,
            cursor: firstPage.nextCursor ?? undefined,
          }),
        )
        .items.map(({ key }) => key),
    ).toEqual(['objetivo']);
    expect(
      fields
        .list(
          fieldDefinitionPageRequestSchema.parse({
            campaignId,
            entityTypeId,
            filters: { isArchived: true },
          }),
        )
        .items.map(({ key }) => key),
    ).toEqual(['segredo']);
    expect(
      captureAppError(() =>
        fields.list(
          fieldDefinitionPageRequestSchema.parse({
            campaignId,
            entityTypeId: otherEntityTypeId,
            cursor: firstPage.nextCursor ?? undefined,
          }),
        ),
      ).code,
    ).toBe('INVALID_CURSOR');
    context.close();
  });

  it('atualiza com revisão e impede atualização cruzada entre campanhas', async () => {
    const { context, fields } = await createRepositories();
    const name = createField('20000000-0000-4000-8000-000000000001', entityTypeId, 'nome');
    fields.insert(name);

    const updated = fields.update(
      {
        campaignId,
        entityTypeId,
        id: name.id,
        revision: 1,
        patch: { label: 'Nome completo', key: 'nome-completo' },
      },
      '2026-08-28T13:00:00.000Z',
    );
    expect(updated).toMatchObject({ label: 'Nome completo', key: 'nome-completo', revision: 2 });
    expect(
      captureAppError(() =>
        fields.update(
          {
            campaignId,
            entityTypeId,
            id: name.id,
            revision: 1,
            patch: { label: 'Sobrescrito' },
          },
          '2026-08-28T14:00:00.000Z',
        ),
      ).code,
    ).toBe('REVISION_CONFLICT');
    expect(
      captureAppError(() =>
        fields.update(
          {
            campaignId: otherCampaignId,
            entityTypeId,
            id: name.id,
            revision: 2,
            patch: { label: 'Vazamento' },
          },
          '2026-08-28T14:00:00.000Z',
        ),
      ).code,
    ).toBe('FIELD_DEFINITION_NOT_FOUND');
    context.close();
  });

  it('remove campos dependentes quando o tipo é removido', async () => {
    const { context, fields } = await createRepositories();
    const name = createField('20000000-0000-4000-8000-000000000001', entityTypeId, 'nome');
    fields.insert(name);

    context.native.prepare('DELETE FROM entity_types WHERE id = ?').run(entityTypeId);
    expect(fields.findById(campaignId, entityTypeId, name.id)).toBeNull();
    context.close();
  });

  it('lista apenas campos ativos ordenados por posição para checagem de obrigatoriedade', async () => {
    const { context, fields } = await createRepositories();
    fields.insert(
      createField('20000000-0000-4000-8000-000000000001', entityTypeId, 'objetivo', {
        sortOrder: 20,
        required: true,
      }),
    );
    fields.insert(
      createField('20000000-0000-4000-8000-000000000002', entityTypeId, 'nome', {
        sortOrder: 10,
      }),
    );
    fields.insert(
      createField('20000000-0000-4000-8000-000000000003', entityTypeId, 'segredo', {
        isArchived: true,
        required: true,
      }),
    );
    fields.insert(createField('20000000-0000-4000-8000-000000000004', otherEntityTypeId, 'nome'));

    expect(fields.listActive(campaignId, entityTypeId).map(({ key }) => key)).toEqual([
      'nome',
      'objetivo',
    ]);
    expect(fields.listActive(otherCampaignId, entityTypeId)).toEqual([]);
    context.close();
  });
});

async function createRepositories(): Promise<{
  context: DatabaseContext;
  fields: FieldDefinitionRepository;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rpg-field-definitions-test-'));
  temporaryRoots.push(root);
  const directories = getDataDirectories(root);
  await ensureDataDirectories(directories);
  const context = await openApplicationDatabase(directories, new TestLogger());
  databaseContexts.push(context);
  const campaigns = new CampaignRepository(context.orm);
  const entityTypes = new EntityTypeRepository(context.orm);
  campaigns.insert(createCampaign(campaignId, 'Ethéria'));
  campaigns.insert(createCampaign(otherCampaignId, 'Órbita'));
  entityTypes.insert(createEntityType(entityTypeId, campaignId, 'personagens'));
  entityTypes.insert(createEntityType(otherEntityTypeId, otherCampaignId, 'personagens'));
  return { context, fields: new FieldDefinitionRepository(context.orm) };
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

function createEntityType(id: string, targetCampaignId: string, slug: string): EntityType {
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
  });
}

function createField(
  id: string,
  targetEntityTypeId: string,
  key: string,
  overrides: Partial<FieldDefinition> = {},
): FieldDefinition {
  return fieldDefinitionSchema.parse({
    id,
    entityTypeId: targetEntityTypeId,
    key,
    label: key,
    description: null,
    dataType: 'short_text',
    semanticRole: null,
    required: false,
    searchable: false,
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
