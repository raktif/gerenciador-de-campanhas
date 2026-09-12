import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { campaignSchema, type Campaign } from '../../src/core/contracts/campaigns';
import {
  relationshipTypePageRequestSchema,
  type RelationshipType,
} from '../../src/core/contracts/relationship-types';
import { AppError } from '../../src/core/errors/app-error';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import { CampaignRepository } from '../../src/db/repositories/campaign-repository';
import { RelationshipTypeRepository } from '../../src/db/repositories/relationship-type-repository';
import { TestLogger } from '../helpers/test-logger';

const campaignId = '00000000-0000-4000-8000-000000000001';
const otherCampaignId = '00000000-0000-4000-8000-000000000002';
const timestamp = '2026-08-31T12:00:00.000Z';
const temporaryRoots: string[] = [];
const contexts: DatabaseContext[] = [];

afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('RelationshipTypeRepository', () => {
  it('persiste JSON, mantém slug único por campanha e isola consultas', async () => {
    const { campaigns, context, repository } = await createRepositories();
    campaigns.insert(createCampaign(campaignId, 'Ethéria'));
    campaigns.insert(createCampaign(otherCampaignId, 'Órbita'));
    const first = createType('20000000-0000-4000-8000-000000000001', campaignId, 'trabalha-em', {
      allowedSourceTypeIds: ['10000000-0000-4000-8000-000000000001'],
      allowedTargetTypeIds: ['10000000-0000-4000-8000-000000000002'],
    });
    repository.insert(first);
    repository.insert(
      createType('20000000-0000-4000-8000-000000000002', otherCampaignId, 'trabalha-em'),
    );

    expect(repository.findById(campaignId, first.id)).toEqual(first);
    expect(repository.findById(otherCampaignId, first.id)).toBeNull();
    expect(repository.list(relationshipTypePageRequestSchema.parse({ campaignId })).items).toEqual([
      first,
    ]);
    expect(
      capture(() =>
        repository.insert(
          createType('20000000-0000-4000-8000-000000000003', campaignId, 'trabalha-em'),
        ),
      ).code,
    ).toBe('RELATIONSHIP_TYPE_SLUG_CONFLICT');
    context.close();
  });

  it('pagina com cursor estável e separa arquivados', async () => {
    const { campaigns, context, repository } = await createRepositories();
    campaigns.insert(createCampaign(campaignId, 'Ethéria'));
    campaigns.insert(createCampaign(otherCampaignId, 'Órbita'));
    repository.insert(
      createType('20000000-0000-4000-8000-000000000001', campaignId, 'a', { sortOrder: 10 }),
    );
    repository.insert(
      createType('20000000-0000-4000-8000-000000000002', campaignId, 'b', { sortOrder: 10 }),
    );
    repository.insert(
      createType('20000000-0000-4000-8000-000000000003', campaignId, 'c', { sortOrder: 20 }),
    );
    repository.insert(
      createType('20000000-0000-4000-8000-000000000004', campaignId, 'd', { isArchived: true }),
    );

    const first = repository.list(
      relationshipTypePageRequestSchema.parse({ campaignId, limit: 2 }),
    );
    expect(first.items.map(({ slug }) => slug)).toEqual(['a', 'b']);
    expect(first.total).toBe(3);
    const second = repository.list(
      relationshipTypePageRequestSchema.parse({
        campaignId,
        limit: 2,
        cursor: first.nextCursor ?? undefined,
      }),
    );
    expect(second.items.map(({ slug }) => slug)).toEqual(['c']);
    expect(
      repository
        .list(
          relationshipTypePageRequestSchema.parse({ campaignId, filters: { isArchived: true } }),
        )
        .items.map(({ slug }) => slug),
    ).toEqual(['d']);
    expect(
      capture(() =>
        repository.list(
          relationshipTypePageRequestSchema.parse({
            campaignId: otherCampaignId,
            cursor: first.nextCursor ?? undefined,
          }),
        ),
      ).code,
    ).toBe('INVALID_CURSOR');
    context.close();
  });

  it('atualiza com revisão otimista e respeita cascata da campanha', async () => {
    const { campaigns, context, repository } = await createRepositories();
    campaigns.insert(createCampaign(campaignId, 'Ethéria'));
    const type = createType('20000000-0000-4000-8000-000000000001', campaignId, 'conhece');
    repository.insert(type);
    const updated = repository.update(
      { campaignId, id: type.id, revision: 1, patch: { name: 'É aliado de', slug: 'aliado-de' } },
      '2026-08-31T13:00:00.000Z',
    );
    expect(updated).toMatchObject({ name: 'É aliado de', slug: 'aliado-de', revision: 2 });
    expect(
      capture(() =>
        repository.update(
          { campaignId, id: type.id, revision: 1, patch: { name: 'Obsoleto' } },
          '2026-08-31T14:00:00.000Z',
        ),
      ).code,
    ).toBe('REVISION_CONFLICT');
    context.native.prepare('DELETE FROM campaigns WHERE id = ?').run(campaignId);
    expect(repository.findById(campaignId, type.id)).toBeNull();
    context.close();
  });
});

async function createRepositories(): Promise<{
  context: DatabaseContext;
  campaigns: CampaignRepository;
  repository: RelationshipTypeRepository;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rpg-relationship-types-test-'));
  temporaryRoots.push(root);
  const directories = getDataDirectories(root);
  await ensureDataDirectories(directories);
  const context = await openApplicationDatabase(directories, new TestLogger());
  contexts.push(context);
  return {
    context,
    campaigns: new CampaignRepository(context.orm),
    repository: new RelationshipTypeRepository(context.orm),
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
function createType(
  id: string,
  targetCampaignId: string,
  slug: string,
  overrides: Partial<RelationshipType> = {},
): RelationshipType {
  return {
    id,
    campaignId: targetCampaignId,
    packId: null,
    name: slug,
    slug,
    inverseName: null,
    description: null,
    semanticRole: null,
    isSymmetric: false,
    allowedSourceTypeIds: null,
    allowedTargetTypeIds: null,
    icon: null,
    color: null,
    sortOrder: 0,
    isArchived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 1,
    ...overrides,
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
