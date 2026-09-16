import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  captureInboxItemInputSchema,
  inboxItemSchema,
  type InboxPageRequest,
} from '../../src/core/contracts/inbox';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import { CampaignRepository } from '../../src/db/repositories/campaign-repository';
import { EntityTypeRepository } from '../../src/db/repositories/entity-type-repository';
import { InboxRepository } from '../../src/db/repositories/inbox-repository';
import { SessionRepository } from '../../src/db/repositories/session-repository';
import { InboxService } from '../../src/main/services/inbox-service';
import { TestLogger } from '../helpers/test-logger';

const campaignId = '00000000-0000-4000-8000-000000000001';
const otherCampaignId = '00000000-0000-4000-8000-000000000002';
const sessionId = '70000000-0000-4000-8000-000000000001';
const foreignSessionId = '70000000-0000-4000-8000-000000000002';
const timestamp = '2026-09-14T12:00:00.000Z';
const roots: string[] = [];
const contexts: DatabaseContext[] = [];

afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('InboxRepository', () => {
  it('persiste uma captura nova, associa a sessão local e protege o isolamento no banco', async () => {
    const { context, repository, service } = await setup();
    const captured = service.capture(
      captureInboxItemInputSchema.parse({ campaignId, sessionId, rawText: '  O sino tocou.  ' }),
    );
    expect(captured).toMatchObject({
      campaignId,
      sessionId,
      rawText: '  O sino tocou.  ',
      status: 'new',
      originKind: 'session',
      revision: 1,
    });
    expect(
      context.native
        .prepare(
          'SELECT campaign_id, session_id, raw_text, status, origin_kind, revision FROM inbox_items WHERE id = ?',
        )
        .get(captured.id),
    ).toEqual({
      campaign_id: campaignId,
      session_id: sessionId,
      raw_text: '  O sino tocou.  ',
      status: 'new',
      origin_kind: 'session',
      revision: 1,
    });

    expect(() =>
      repository.insert(
        inboxItemSchema.parse({
          id: '80000000-0000-4000-8000-000000000099',
          campaignId,
          sessionId: foreignSessionId,
          rawText: 'Sessão de outra campanha.',
          status: 'new',
          originKind: 'session',
          capturedAt: timestamp,
          convertedObjectType: null,
          convertedObjectId: null,
          createdAt: timestamp,
          updatedAt: timestamp,
          revision: 1,
        }),
      ),
    ).toThrow(/INBOX_SESSION_CAMPAIGN_MISMATCH/);
    expect(context.native.prepare('SELECT COUNT(*) AS total FROM inbox_items').get()).toEqual({
      total: 1,
    });
    expect(context.native.pragma('foreign_key_check')).toEqual([]);
    context.close();
  });

  it('converte em entidade com fonte rastreável e faz rollback quando a entidade não pode ser inserida', async () => {
    const { context, repository, service } = await setup();
    const entityTypeId = '60000000-0000-4000-8000-000000000001';
    context.native
      .prepare(
        `INSERT INTO entity_types (id, campaign_id, name, singular_name, slug, sort_order, is_system, is_archived, created_at, updated_at, revision) VALUES (?, ?, 'Pessoa', 'Pessoa', 'pessoa', 0, 0, 0, ?, ?, 1)`,
      )
      .run(entityTypeId, campaignId, timestamp, timestamp);
    const captured = service.capture(
      captureInboxItemInputSchema.parse({ campaignId, rawText: 'A sentinela se chama Iara.' }),
    );
    const reviewing = service.beginReview({ campaignId, id: captured.id, revision: 1 });
    const converted = service.convertToEntity({
      campaignId,
      id: captured.id,
      revision: reviewing.revision,
      destination: {
        entityTypeId,
        name: 'Iara',
        summary: null,
        canonState: 'accepted',
        knowledgeState: 'fact',
        visibility: 'gm',
      },
    });
    expect(converted).toMatchObject({
      inboxItem: {
        status: 'converted',
        convertedObjectType: 'entity',
        convertedObjectId: converted.entity.id,
      },
      entity: { name: 'Iara', originKind: 'manual' },
    });
    expect(
      context.native
        .prepare('SELECT inbox_item_id, entity_id, source_id FROM inbox_entity_conversions')
        .get(),
    ).toEqual({
      inbox_item_id: captured.id,
      entity_id: converted.entity.id,
      source_id: converted.entity.sourceId,
    });
    expect(
      context.native
        .prepare('SELECT description, inbox_item_id FROM sources WHERE id = ?')
        .get(converted.entity.sourceId),
    ).toEqual({ description: 'A sentinela se chama Iara.', inbox_item_id: captured.id });
    const foreignEntityTypeId = '60000000-0000-4000-8000-000000000002';
    context.native
      .prepare(
        `INSERT INTO entity_types (id, campaign_id, name, singular_name, slug, sort_order, is_system, is_archived, created_at, updated_at, revision) VALUES (?, ?, 'Pessoa', 'Pessoa', 'pessoa', 0, 0, 0, ?, ?, 1)`,
      )
      .run(foreignEntityTypeId, otherCampaignId, timestamp, timestamp);
    const foreignEntitiesBefore = context.native
      .prepare('SELECT COUNT(*) AS total FROM entities WHERE campaign_id = ?')
      .get(otherCampaignId);
    expect(() =>
      context.native
        .prepare(
          `INSERT INTO entities (id, campaign_id, entity_type_id, name, summary, canon_state, knowledge_state, visibility, origin_kind, source_id, created_at, updated_at, revision)
           VALUES (?, ?, ?, 'InvasÃ£o', NULL, 'accepted', 'fact', 'gm', 'manual', ?, ?, ?, 1)`,
        )
        .run(
          '90000000-0000-4000-8000-000000000099',
          otherCampaignId,
          foreignEntityTypeId,
          converted.entity.sourceId,
          timestamp,
          timestamp,
        ),
    ).toThrow(/ENTITY_SOURCE_INVALID/);
    expect(
      context.native
        .prepare('SELECT COUNT(*) AS total FROM entities WHERE campaign_id = ?')
        .get(otherCampaignId),
    ).toEqual(foreignEntitiesBefore);
    expect(() =>
      service.convertToEntity({
        campaignId,
        id: captured.id,
        revision: reviewing.revision,
        destination: {
          entityTypeId,
          name: 'Outra',
          summary: null,
          canonState: 'accepted',
          knowledgeState: 'fact',
          visibility: 'gm',
        },
      }),
    ).toThrow();
    expect(context.native.prepare('SELECT COUNT(*) AS total FROM entities').get()).toEqual({
      total: 1,
    });
    const failed = createInboxItem(
      '80000000-0000-4000-8000-000000000099',
      campaignId,
      '2026-09-14T13:00:00.000Z',
    );
    repository.insert(failed);
    const failedReview = repository.updateStatus(
      { campaignId, id: failed.id, revision: 1 },
      'reviewing',
      timestamp,
    );
    const sourcesBefore = context.native.prepare('SELECT COUNT(*) AS total FROM sources').get();
    const conversionsBefore = context.native
      .prepare('SELECT COUNT(*) AS total FROM inbox_entity_conversions')
      .get();
    expect(() =>
      repository.convertToEntity(
        { campaignId, id: failed.id, revision: failedReview.revision },
        { ...converted.entity, sourceId: '90000000-0000-4000-8000-000000000098' },
        '90000000-0000-4000-8000-000000000098',
        timestamp,
      ),
    ).toThrow();
    expect(repository.findById(campaignId, failed.id)).toMatchObject({
      status: 'reviewing',
      revision: 2,
      convertedObjectType: null,
      convertedObjectId: null,
    });
    expect(context.native.prepare('SELECT COUNT(*) AS total FROM sources').get()).toEqual(
      sourcesBefore,
    );
    expect(
      context.native.prepare('SELECT COUNT(*) AS total FROM inbox_entity_conversions').get(),
    ).toEqual(conversionsBefore);
    context.close();
  });

  it('pagina em ordem determinística, isola campanhas, prende cursor e persiste transições revisadas', async () => {
    const { repository, service } = await setup();
    const first = createInboxItem(
      '80000000-0000-4000-8000-000000000010',
      campaignId,
      '2026-09-14T10:00:00.000Z',
    );
    const second = createInboxItem(
      '80000000-0000-4000-8000-000000000011',
      campaignId,
      '2026-09-14T11:00:00.000Z',
    );
    const third = createInboxItem(
      '80000000-0000-4000-8000-000000000012',
      campaignId,
      '2026-09-14T12:00:00.000Z',
    );
    const foreign = createInboxItem(
      '80000000-0000-4000-8000-000000000013',
      otherCampaignId,
      '2026-09-14T13:00:00.000Z',
    );
    [first, second, third, foreign].forEach((item) => repository.insert(item));
    const request: InboxPageRequest = {
      campaignId,
      limit: 2,
      filters: { statuses: ['new'] },
      sort: 'capturedAt' as const,
      order: 'desc' as const,
    };
    const page = repository.list(request);
    expect(page.items.map((item) => item.id)).toEqual([third.id, second.id]);
    expect(page.nextCursor).not.toBeNull();
    expect(
      repository
        .list({ ...request, cursor: page.nextCursor ?? undefined })
        .items.map((item) => item.id),
    ).toEqual([first.id]);
    expect(() =>
      repository.list({ ...request, filters: {}, cursor: page.nextCursor ?? undefined }),
    ).toThrow(/cursor de paginação/i);
    expect(() =>
      repository.list({
        ...request,
        campaignId: otherCampaignId,
        cursor: page.nextCursor ?? undefined,
      }),
    ).toThrow(/cursor de paginação/i);
    expect(repository.list({ ...request, campaignId: otherCampaignId }).items).toEqual([foreign]);

    const captured = service.capture(
      captureInboxItemInputSchema.parse({ campaignId, rawText: 'Ciclo' }),
    );
    const reviewing = service.beginReview({ campaignId, id: captured.id, revision: 1 });
    const dismissed = service.dismiss({ campaignId, id: captured.id, revision: 2 });
    const archived = service.archive({ campaignId, id: captured.id, revision: 3 });
    expect(service.restore({ campaignId, id: captured.id, revision: 4 })).toMatchObject({
      status: 'new',
      revision: 5,
    });
    expect(() =>
      service.archive({ campaignId, id: captured.id, revision: reviewing.revision }),
    ).toThrow(/alterada em outra operação/i);
    expect([reviewing.status, dismissed.status, archived.status]).toEqual([
      'reviewing',
      'dismissed',
      'archived',
    ]);
  });
});

function createInboxItem(id: string, owner: string, capturedAt: string) {
  return inboxItemSchema.parse({
    id,
    campaignId: owner,
    sessionId: null,
    rawText: id,
    status: 'new',
    originKind: 'manual',
    capturedAt,
    convertedObjectType: null,
    convertedObjectId: null,
    createdAt: capturedAt,
    updatedAt: capturedAt,
    revision: 1,
  });
}

async function setup(): Promise<{
  context: DatabaseContext;
  repository: InboxRepository;
  service: InboxService;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rpg-inbox-repository-test-'));
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
  const insertSession = context.native.prepare(
    `INSERT INTO sessions
      (id, campaign_id, sequence_number, title, created_at, updated_at)
     VALUES (?, ?, 1, ?, ?, ?)`,
  );
  insertSession.run(sessionId, campaignId, 'Sessão local', timestamp, timestamp);
  insertSession.run(foreignSessionId, otherCampaignId, 'Sessão externa', timestamp, timestamp);
  const repository = new InboxRepository(context.orm);
  return {
    context,
    repository,
    service: new InboxService({
      repository,
      campaigns: new CampaignRepository(context.orm),
      sessions: new SessionRepository(context.orm),
      entityTypes: new EntityTypeRepository(context.orm),
      createId: () => '80000000-0000-4000-8000-000000000001',
      now: () => timestamp,
    }),
  };
}
