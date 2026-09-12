import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Event } from '../../src/core/contracts/events';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import { EventRepository } from '../../src/db/repositories/event-repository';
import { SessionRepository } from '../../src/db/repositories/session-repository';
import { TimelineRepository } from '../../src/db/repositories/timeline-repository';
import { TestLogger } from '../helpers/test-logger';

const campaignId = '00000000-0000-4000-8000-000000000001';
const sessionOneId = '70000000-0000-4000-8000-000000000001';
const sessionTwoId = '70000000-0000-4000-8000-000000000002';
const entityTypeId = '10000000-0000-4000-8000-000000000001';
const entityA = '30000000-0000-4000-8000-000000000001';
const entityB = '30000000-0000-4000-8000-000000000002';
const eventA = '60000000-0000-4000-8000-000000000001';
const eventB = '60000000-0000-4000-8000-000000000002';
const standaloneEvent = '60000000-0000-4000-8000-000000000003';
const archivedEvent = '60000000-0000-4000-8000-000000000004';
const timestamp = '2026-09-11T12:00:00.000Z';
const roots: string[] = [];
const contexts: DatabaseContext[] = [];

afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('TimelineRepository', () => {
  it('ordena sess\u00f5es antes de eventos sem sess\u00e3o, com cursor est\u00e1vel e arquivados opt-in', async () => {
    const { context, repository } = await setup();
    const firstPage = repository.listCampaign({
      campaignId,
      limit: 2,
      filters: { archived: false },
    });
    expect(firstPage.items.map((item) => item.event.id)).toEqual([eventA, eventB]);
    expect(firstPage.items.map((item) => item.sessionSequenceNumber)).toEqual([1, 2]);
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPage = repository.listCampaign({
      campaignId,
      cursor: firstPage.nextCursor ?? undefined,
      limit: 2,
      filters: { archived: false },
    });
    expect(secondPage).toMatchObject({
      items: [{ event: { id: standaloneEvent }, sessionSequenceNumber: null }],
      nextCursor: null,
      total: 3,
    });
    expect(
      repository
        .listCampaign({ campaignId, limit: 10, filters: { archived: true } })
        .items.map((item) => item.event.id),
    ).toEqual([archivedEvent]);
    context.close();
  });

  it('restringe a cronologia da entidade aos eventos vinculados e preserva pap\u00e9is e ordem', async () => {
    const { context, repository } = await setup();
    const result = repository.listEntity({
      campaignId,
      entityId: entityA,
      limit: 10,
      filters: { archived: false },
    });
    expect(result.items.map((item) => item.event.id)).toEqual([eventA, eventB]);
    expect(result.items[1]?.links).toEqual([
      { eventId: eventB, entityId: entityB, role: 'location', sortOrder: 0 },
      { eventId: eventB, entityId: entityA, role: 'witness', sortOrder: 1 },
    ]);
    context.close();
  });
});

async function setup(): Promise<{ context: DatabaseContext; repository: TimelineRepository }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rpg-timeline-test-'));
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
  sessions.insert(session(sessionOneId, 1));
  sessions.insert(session(sessionTwoId, 2));
  const events = new EventRepository(context.orm);
  events.insert(event(eventA, sessionOneId, 2, '2026-09-11T13:00:00.000Z'), [
    { entityId: entityA, role: 'participant', sortOrder: 0 },
  ]);
  events.insert(event(eventB, sessionTwoId, 0, '2026-09-11T12:00:00.000Z'), [
    { entityId: entityB, role: 'location', sortOrder: 0 },
    { entityId: entityA, role: 'witness', sortOrder: 1 },
  ]);
  events.insert(event(standaloneEvent, null, 99, '2026-09-11T11:00:00.000Z'), [
    { entityId: entityB, role: 'related', sortOrder: 0 },
  ]);
  events.insert(event(archivedEvent, null, 0, '2026-09-11T14:00:00.000Z', timestamp), [
    { entityId: entityA, role: 'victim', sortOrder: 0 },
  ]);
  return { context, repository: new TimelineRepository(context.orm) };
}

function session(id: string, sequenceNumber: number) {
  return {
    id,
    campaignId,
    sequenceNumber,
    title: `Sess\u00e3o ${String(sequenceNumber)}`,
    playedAt: null,
    status: 'planned' as const,
    summaryMarkdown: null,
    gmNotesMarkdown: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 1,
  };
}

function event(
  id: string,
  sessionId: string | null,
  eventOrder: number,
  createdAt: string,
  archivedAt: string | null = null,
): Event {
  return {
    id,
    campaignId,
    sessionId,
    title: id,
    descriptionMarkdown: null,
    eventOrder,
    occurredAtLabel: 'Texto livre sem valor de ordena\u00e7\u00e3o',
    canonState: 'accepted',
    knowledgeState: 'fact',
    visibility: 'gm',
    originKind: 'manual',
    sourceId: null,
    createdAt,
    updatedAt: createdAt,
    archivedAt,
    revision: 1,
  };
}
