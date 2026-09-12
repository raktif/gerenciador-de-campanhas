import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createEventInputSchema } from '../../src/core/contracts/events';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import { CampaignRepository } from '../../src/db/repositories/campaign-repository';
import { EntityRepository } from '../../src/db/repositories/entity-repository';
import { EventRepository } from '../../src/db/repositories/event-repository';
import { SessionRepository } from '../../src/db/repositories/session-repository';
import { EventService } from '../../src/main/services/event-service';
import { TestLogger } from '../helpers/test-logger';

const campaignId = '00000000-0000-4000-8000-000000000001';
const sessionId = '70000000-0000-4000-8000-000000000001';
const entityTypeId = '10000000-0000-4000-8000-000000000001';
const entityA = '30000000-0000-4000-8000-000000000001';
const entityB = '30000000-0000-4000-8000-000000000002';
const timestamp = '2026-09-10T12:00:00.000Z';
const roots: string[] = [];
const contexts: DatabaseContext[] = [];

afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('EventRepository', () => {
  it('persiste eventos e v\u00ednculos, com lista determin\u00edstica e pagina\u00e7\u00e3o segura', async () => {
    const { context, service } = await setup();
    const first = service.create(
      createEventInputSchema.parse({
        campaignId,
        sessionId,
        title: 'Primeiro',
        eventOrder: 1,
        links: [{ entityId: entityA, role: 'participant', sortOrder: 2 }],
      }),
    );
    service.create(
      createEventInputSchema.parse({
        campaignId,
        sessionId,
        title: 'Segundo',
        eventOrder: 1,
        links: [{ entityId: entityB, role: 'target' }],
      }),
    );
    const page = service.list({
      campaignId,
      limit: 1,
      filters: { sessionId, archived: false },
      sort: 'eventOrder',
      order: 'asc',
    });
    expect(page).toMatchObject({ items: [{ id: first.event.id }], total: 2 });
    expect(page.nextCursor).not.toBeNull();
    const secondPage = service.list({
      campaignId,
      cursor: page.nextCursor ?? undefined,
      limit: 1,
      filters: { sessionId, archived: false },
      sort: 'eventOrder',
      order: 'asc',
    });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]?.id).not.toBe(first.event.id);
    expect(service.get({ campaignId, id: first.event.id }).links).toEqual([
      { eventId: first.event.id, entityId: entityA, role: 'participant', sortOrder: 2 },
    ]);
    context.close();
  });

  it('substitui v\u00ednculos e desfaz atualiza\u00e7\u00e3o inteira quando uma inser\u00e7\u00e3o falha', async () => {
    const { context, repository, service } = await setup();
    const created = service.create(
      createEventInputSchema.parse({
        campaignId,
        title: 'Emboscada',
        links: [{ entityId: entityA, role: 'participant' }],
      }),
    );
    expect(() =>
      repository.update(
        {
          campaignId,
          id: created.event.id,
          revision: 1,
          patch: { title: 'N\u00e3o deve persistir' },
          links: [
            { entityId: '30000000-0000-4000-8000-000000000099', role: 'target', sortOrder: 0 },
          ],
        },
        '2026-09-10T13:00:00.000Z',
      ),
    ).toThrow();
    expect(repository.findById(campaignId, created.event.id)).toMatchObject({
      event: { title: 'Emboscada', revision: 1 },
      links: [{ entityId: entityA, role: 'participant' }],
    });
    const updated = service.update({
      campaignId,
      id: created.event.id,
      revision: 1,
      links: [{ entityId: entityB, role: 'witness', sortOrder: 1 }],
    });
    expect(updated).toMatchObject({
      event: { revision: 2 },
      links: [{ entityId: entityB, role: 'witness', sortOrder: 1 }],
    });
    context.close();
  });
});

async function setup(): Promise<{
  context: DatabaseContext;
  repository: EventRepository;
  service: EventService;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rpg-events-test-'));
  roots.push(root);
  const directories = getDataDirectories(root);
  await ensureDataDirectories(directories);
  const context = await openApplicationDatabase(directories, new TestLogger());
  contexts.push(context);
  context.native
    .prepare(
      "INSERT INTO campaigns (id, name, status, created_at, updated_at, revision) VALUES (?, ?, 'active', ?, ?, 1)",
    )
    .run(campaignId, 'Eth\u00e9ria', timestamp, timestamp);
  context.native
    .prepare(
      "INSERT INTO entity_types (id, campaign_id, name, singular_name, slug, sort_order, is_system, is_archived, created_at, updated_at, revision) VALUES (?, ?, 'Entidades', 'Entidade', 'entidades', 0, 0, 0, ?, ?, 1)",
    )
    .run(entityTypeId, campaignId, timestamp, timestamp);
  const insertEntity = context.native.prepare(
    "INSERT INTO entities (id, campaign_id, entity_type_id, name, canon_state, knowledge_state, visibility, origin_kind, created_at, updated_at, revision) VALUES (?, ?, ?, ?, 'accepted', 'fact', 'gm', 'manual', ?, ?, 1)",
  );
  insertEntity.run(entityA, campaignId, entityTypeId, 'A', timestamp, timestamp);
  insertEntity.run(entityB, campaignId, entityTypeId, 'B', timestamp, timestamp);
  const sessions = new SessionRepository(context.orm);
  sessions.insert({
    id: sessionId,
    campaignId,
    sequenceNumber: 1,
    title: 'Sess\u00e3o',
    playedAt: null,
    status: 'planned',
    summaryMarkdown: null,
    gmNotesMarkdown: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 1,
  });
  const repository = new EventRepository(context.orm);
  return {
    context,
    repository,
    service: new EventService({
      repository,
      campaigns: new CampaignRepository(context.orm),
      sessions,
      entities: new EntityRepository(context.orm),
      createId: (() => {
        let sequence = 0;
        return () => `60000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
      })(),
      now: () => timestamp,
    }),
  };
}
