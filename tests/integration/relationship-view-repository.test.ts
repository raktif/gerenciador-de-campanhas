import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import type { RelationshipView } from '../../src/core/contracts/relationship-views';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import { RelationshipViewRepository } from '../../src/db/repositories/relationship-view-repository';
import { TestLogger } from '../helpers/test-logger';

const roots: string[] = [];
const contexts: DatabaseContext[] = [];

afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('RelationshipViewRepository', () => {
  it('cria a view padrão idempotente e aplica CAS agregado em todas as mutações', async () => {
    const fixture = await createFixture();
    const first = fixture.repository.insertDefault(view(fixture.first.campaignId));
    const duplicate = fixture.repository.insertDefault({
      ...view(fixture.first.campaignId),
      id: randomUUID(),
    });
    expect(duplicate.view.id).toBe(first.view.id);

    const positioned = fixture.repository.saveNodePosition(
      {
        campaignId: fixture.first.campaignId,
        relationshipViewId: first.view.id,
        revision: 1,
        position: {
          entityId: fixture.first.entityId,
          x: 100,
          y: 200,
          width: 180,
          height: 64,
          pinned: true,
        },
      },
      later(1),
    );
    expect(positioned).toMatchObject({
      view: { revision: 2 },
      nodes: [{ entityId: fixture.first.entityId, pinned: true }],
    });
    expect(() =>
      fixture.repository.saveViewport(
        {
          campaignId: fixture.first.campaignId,
          relationshipViewId: first.view.id,
          revision: 1,
          viewport: { x: 10, y: 20, zoom: 2 },
        },
        later(2),
      ),
    ).toThrow(/alterado/u);

    const laidOut = fixture.repository.applyAutoLayout(
      {
        campaignId: fixture.first.campaignId,
        relationshipViewId: first.view.id,
        revision: 2,
        positions: [
          {
            entityId: fixture.first.entityId,
            x: 0,
            y: 0,
            width: 180,
            height: 64,
            pinned: false,
          },
          {
            entityId: fixture.first.secondEntityId,
            x: 240,
            y: 0,
            width: 180,
            height: 64,
            pinned: false,
          },
        ],
        viewport: { x: 5, y: 6, zoom: 1.25 },
      },
      later(3),
    );
    expect(laidOut.view).toMatchObject({ revision: 3, viewport: { x: 5, y: 6, zoom: 1.25 } });
    expect(laidOut.nodes).toHaveLength(2);

    const reset = fixture.repository.resetLayout(
      {
        campaignId: fixture.first.campaignId,
        relationshipViewId: first.view.id,
        revision: 3,
      },
      later(4),
    );
    expect(reset).toMatchObject({
      view: { revision: 4, viewport: { x: 0, y: 0, zoom: 1 } },
      nodes: [],
    });
  });

  it('faz rollback da revisão e do lote quando qualquer entidade cruza campanhas', async () => {
    const fixture = await createFixture();
    const state = fixture.repository.insertDefault(view(fixture.first.campaignId));

    expect(() =>
      fixture.repository.applyAutoLayout(
        {
          campaignId: fixture.first.campaignId,
          relationshipViewId: state.view.id,
          revision: 1,
          positions: [
            {
              entityId: fixture.first.entityId,
              x: 0,
              y: 0,
              width: 180,
              height: 64,
              pinned: false,
            },
            {
              entityId: fixture.second.entityId,
              x: 240,
              y: 0,
              width: 180,
              height: 64,
              pinned: false,
            },
          ],
          viewport: { x: 99, y: 88, zoom: 1.5 },
        },
        later(1),
      ),
    ).toThrow(/node must belong to the campaign/u);

    expect(fixture.repository.findById(fixture.first.campaignId, state.view.id)).toMatchObject({
      view: { revision: 1, viewport: { x: 0, y: 0, zoom: 1 } },
      nodes: [],
    });
    expect(fixture.repository.findById(fixture.second.campaignId, state.view.id)).toBeNull();
  });
});

async function createFixture() {
  const root = await mkdtemp(`${os.tmpdir()}\\relationship-view-repository-`);
  roots.push(root);
  const directories = getDataDirectories(root);
  await ensureDataDirectories(directories);
  const context = await openApplicationDatabase(directories, new TestLogger());
  contexts.push(context);
  const first = seedCampaign(context, 'Primeira');
  const second = seedCampaign(context, 'Segunda');
  return { context, first, second, repository: new RelationshipViewRepository(context.native) };
}

function seedCampaign(context: DatabaseContext, name: string) {
  const campaignId = randomUUID();
  const entityTypeId = randomUUID();
  const entityId = randomUUID();
  const secondEntityId = randomUUID();
  const now = later(0);
  context.native
    .prepare('INSERT INTO campaigns (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(campaignId, name, now, now);
  context.native
    .prepare(
      `INSERT INTO entity_types (
        id, campaign_id, name, singular_name, slug, created_at, updated_at
      ) VALUES (?, ?, 'Pessoas', 'Pessoa', ?, ?, ?)`,
    )
    .run(entityTypeId, campaignId, `pessoas-${campaignId.slice(0, 8)}`, now, now);
  const insert = context.native.prepare(
    `INSERT INTO entities (
      id, campaign_id, entity_type_id, name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  insert.run(entityId, campaignId, entityTypeId, `${name} A`, now, now);
  insert.run(secondEntityId, campaignId, entityTypeId, `${name} B`, now, now);
  return { campaignId, entityTypeId, entityId, secondEntityId };
}

function view(campaignId: string): RelationshipView {
  return {
    id: randomUUID(),
    campaignId,
    name: 'Mapa principal',
    viewType: 'campaign',
    sourceEntityId: null,
    isDefault: true,
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: later(0),
    updatedAt: later(0),
    revision: 1,
  };
}

function later(minutes: number): string {
  return new Date(Date.UTC(2026, 10, 11, 12, minutes)).toISOString();
}
