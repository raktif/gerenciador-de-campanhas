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
import { EntityRepository } from '../../src/db/repositories/entity-repository';
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
  it('converte em afirmação com fonte rastreável, rollback real e isolamento de campanha', async () => {
    const { context, repository, service } = await setup();
    const entityTypeId = '60000000-0000-4000-8000-000000000020';
    const subjectId = '30000000-0000-4000-8000-000000000020';
    const foreignTypeId = '60000000-0000-4000-8000-000000000021';
    const foreignSubjectId = '30000000-0000-4000-8000-000000000021';
    context.native
      .prepare(
        `INSERT INTO entity_types (id, campaign_id, name, singular_name, slug, sort_order, is_system, is_archived, created_at, updated_at, revision) VALUES (?, ?, 'Pessoa', 'Pessoa', 'pessoa-assertion', 0, 0, 0, ?, ?, 1)`,
      )
      .run(entityTypeId, campaignId, timestamp, timestamp);
    context.native
      .prepare(
        `INSERT INTO entities (id, campaign_id, entity_type_id, name, canon_state, knowledge_state, visibility, origin_kind, created_at, updated_at, revision) VALUES (?, ?, ?, 'Iara', 'accepted', 'fact', 'gm', 'manual', ?, ?, 1)`,
      )
      .run(subjectId, campaignId, entityTypeId, timestamp, timestamp);
    context.native
      .prepare(
        `INSERT INTO entity_types (id, campaign_id, name, singular_name, slug, sort_order, is_system, is_archived, created_at, updated_at, revision) VALUES (?, ?, 'Pessoa', 'Pessoa', 'pessoa-assertion-externa', 0, 0, 0, ?, ?, 1)`,
      )
      .run(foreignTypeId, otherCampaignId, timestamp, timestamp);
    context.native
      .prepare(
        `INSERT INTO entities (id, campaign_id, entity_type_id, name, canon_state, knowledge_state, visibility, origin_kind, created_at, updated_at, revision) VALUES (?, ?, ?, 'Externa', 'accepted', 'fact', 'gm', 'manual', ?, ?, 1)`,
      )
      .run(foreignSubjectId, otherCampaignId, foreignTypeId, timestamp, timestamp);

    const captured = service.capture(
      captureInboxItemInputSchema.parse({ campaignId, rawText: 'Iara viu o sino tocar.' }),
    );
    const reviewing = service.beginReview({
      campaignId,
      id: captured.id,
      revision: captured.revision,
    });
    const converted = service.convertToAssertion({
      campaignId,
      id: captured.id,
      revision: reviewing.revision,
      destination: {
        subjectEntityId: subjectId,
        objectEntityId: null,
        predicate: null,
        statement: 'Iara viu o sino tocar.',
        value: null,
        canonState: 'accepted',
        knowledgeState: 'fact',
        visibility: 'gm',
      },
    });
    expect(converted.inboxItem).toMatchObject({
      status: 'converted',
      convertedObjectType: 'assertion',
      convertedObjectId: converted.assertion.id,
    });
    expect(
      context.native
        .prepare('SELECT inbox_item_id, assertion_id, source_id FROM inbox_assertion_conversions')
        .get(),
    ).toEqual({
      inbox_item_id: captured.id,
      assertion_id: converted.assertion.id,
      source_id: converted.assertion.sourceId,
    });
    expect(
      context.native
        .prepare('SELECT description, inbox_item_id FROM sources WHERE id = ?')
        .get(converted.assertion.sourceId),
    ).toEqual({ description: captured.rawText, inbox_item_id: captured.id });

    const assertionSourceId = converted.assertion.sourceId;
    if (assertionSourceId === null) throw new Error('A fonte Inbox deveria existir.');
    const foreignInbox = createInboxItem(
      '80000000-0000-4000-8000-000000000121',
      otherCampaignId,
      '2026-09-14T13:00:00.000Z',
    );
    repository.insert(foreignInbox);
    const foreignSourceId = '90000000-0000-4000-8000-000000000121';
    context.native
      .prepare(
        `INSERT INTO sources (id, kind, session_id, inbox_item_id, description, created_at)
         VALUES (?, 'manual', NULL, ?, 'Fonte externa', ?)`,
      )
      .run(foreignSourceId, foreignInbox.id, timestamp);
    const assertionId = converted.assertion.id;
    const updates = [
      ['UPDATE assertions SET source_id = NULL WHERE id = ?', []],
      ["UPDATE assertions SET source_id = '90000000-0000-4000-8000-000000000199' WHERE id = ?", []],
      ['UPDATE assertions SET source_id = ? WHERE id = ?', [foreignSourceId]],
      ["UPDATE assertions SET origin_kind = 'session' WHERE id = ?", []],
    ] as const;
    for (const [statement, parameters] of updates) {
      expect(() => context.native.prepare(statement).run(...parameters, assertionId)).toThrow(
        /ASSERTION_SOURCE_INVALID/,
      );
      expect(
        context.native
          .prepare('SELECT source_id, origin_kind FROM assertions WHERE id = ?')
          .get(assertionId),
      ).toEqual({ source_id: assertionSourceId, origin_kind: 'manual' });
    }

    const failed = createInboxItem(
      '80000000-0000-4000-8000-000000000120',
      campaignId,
      '2026-09-14T13:00:00.000Z',
    );
    repository.insert(failed);
    const failedReview = repository.updateStatus(
      { campaignId, id: failed.id, revision: 1 },
      'reviewing',
      timestamp,
    );
    const countsBefore = context.native
      .prepare(
        'SELECT (SELECT COUNT(*) FROM sources) AS sources, (SELECT COUNT(*) FROM assertions) AS assertions, (SELECT COUNT(*) FROM inbox_assertion_conversions) AS conversions',
      )
      .get();
    expect(() =>
      repository.convertToAssertion(
        { campaignId, id: failed.id, revision: failedReview.revision },
        { ...converted.assertion, sourceId: '90000000-0000-4000-8000-000000000120' },
        '90000000-0000-4000-8000-000000000120',
        timestamp,
      ),
    ).toThrow();
    expect(repository.findById(campaignId, failed.id)).toMatchObject({
      status: 'reviewing',
      revision: failedReview.revision,
      convertedObjectId: null,
    });
    expect(
      context.native
        .prepare(
          'SELECT (SELECT COUNT(*) FROM sources) AS sources, (SELECT COUNT(*) FROM assertions) AS assertions, (SELECT COUNT(*) FROM inbox_assertion_conversions) AS conversions',
        )
        .get(),
    ).toEqual(countsBefore);

    expect(() =>
      service.convertToAssertion({
        campaignId,
        id: failed.id,
        revision: failedReview.revision,
        destination: {
          subjectEntityId: foreignSubjectId,
          objectEntityId: null,
          predicate: null,
          statement: 'Tentativa externa.',
          value: null,
          canonState: 'accepted',
          knowledgeState: 'fact',
          visibility: 'gm',
        },
      }),
    ).toThrow(/entidade da afirmação não foi encontrada/i);
    context.close();
  });

  it('converte nota e evento com pontes, vínculos e guards de proveniência', async () => {
    const { context, repository } = await setup();
    const typeId = '60000000-0000-4000-8000-000000000130';
    const entityId = '30000000-0000-4000-8000-000000000130';
    context.native
      .prepare(
        `INSERT INTO entity_types (id,campaign_id,name,singular_name,slug,sort_order,is_system,is_archived,created_at,updated_at,revision) VALUES (?,?,'Pessoa','Pessoa','pessoa-d2',0,0,0,?,?,1)`,
      )
      .run(typeId, campaignId, timestamp, timestamp);
    context.native
      .prepare(
        `INSERT INTO entities (id,campaign_id,entity_type_id,name,canon_state,knowledge_state,visibility,origin_kind,created_at,updated_at,revision) VALUES (?, ?, ?, 'Iara','accepted','fact','gm','manual',?,?,1)`,
      )
      .run(entityId, campaignId, typeId, timestamp, timestamp);
    const noteItem = createInboxItem('80000000-0000-4000-8000-000000000130', campaignId, timestamp);
    repository.insert(noteItem);
    const noteReview = repository.updateStatus(
      { campaignId, id: noteItem.id, revision: 1 },
      'reviewing',
      timestamp,
    );
    const note = {
      id: '91000000-0000-4000-8000-000000000130',
      campaignId,
      title: 'Nota',
      bodyMarkdown: 'Corpo',
      noteType: 'clue',
      canonState: 'accepted',
      knowledgeState: 'fact',
      visibility: 'gm',
      originKind: 'manual',
      sourceId: '92000000-0000-4000-8000-000000000130',
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      revision: 1,
    } as const;
    const noteResult = repository.convertToNote(
      { campaignId, id: noteItem.id, revision: noteReview.revision },
      note,
      [{ entityId, role: 'related' }],
      note.sourceId,
      timestamp,
    );
    expect(noteResult).toMatchObject({
      inboxItem: { status: 'converted', convertedObjectType: 'note' },
      note: { links: [{ entityId, role: 'related' }] },
    });
    expect(
      context.native
        .prepare('SELECT inbox_item_id, note_id, source_id FROM inbox_note_conversions')
        .get(),
    ).toEqual({ inbox_item_id: noteItem.id, note_id: note.id, source_id: note.sourceId });
    const eventItem = createInboxItem(
      '80000000-0000-4000-8000-000000000131',
      campaignId,
      timestamp,
    );
    repository.insert(eventItem);
    const eventReview = repository.updateStatus(
      { campaignId, id: eventItem.id, revision: 1 },
      'reviewing',
      timestamp,
    );
    const event = {
      id: '91000000-0000-4000-8000-000000000131',
      campaignId,
      sessionId,
      title: 'Evento',
      descriptionMarkdown: 'Descrição',
      eventOrder: 2,
      occurredAtLabel: 'Noite',
      canonState: 'accepted',
      knowledgeState: 'fact',
      visibility: 'gm',
      originKind: 'manual',
      sourceId: '92000000-0000-4000-8000-000000000131',
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      revision: 1,
    } as const;
    const eventResult = repository.convertToEvent(
      { campaignId, id: eventItem.id, revision: eventReview.revision },
      event,
      [{ entityId, role: 'witness', sortOrder: 1 }],
      event.sourceId,
      timestamp,
    );
    expect(eventResult).toMatchObject({
      inboxItem: { status: 'converted', convertedObjectType: 'event' },
      event: { links: [{ entityId, role: 'witness', sortOrder: 1 }] },
    });
    expect(
      context.native
        .prepare('SELECT inbox_item_id, event_id, source_id FROM inbox_event_conversions')
        .get(),
    ).toEqual({ inbox_item_id: eventItem.id, event_id: event.id, source_id: event.sourceId });
    const foreignInbox = createInboxItem(
      '80000000-0000-4000-8000-000000000132',
      otherCampaignId,
      timestamp,
    );
    repository.insert(foreignInbox);
    const foreignSourceId = '92000000-0000-4000-8000-000000000132';
    context.native
      .prepare(
        `INSERT INTO sources (id,kind,inbox_item_id,description,created_at) VALUES (?,'manual',?,'Externa',?)`,
      )
      .run(foreignSourceId, foreignInbox.id, timestamp);
    for (const [table, id, sourceId, code] of [
      ['notes', note.id, note.sourceId, 'NOTE_SOURCE_INVALID'],
      ['events', event.id, event.sourceId, 'EVENT_SOURCE_INVALID'],
    ] as const) {
      expect(() =>
        context.native
          .prepare(`UPDATE ${table} SET source_id = ? WHERE id = ?`)
          .run(foreignSourceId, id),
      ).toThrow(code);
      expect(
        context.native.prepare(`SELECT source_id, origin_kind FROM ${table} WHERE id = ?`).get(id),
      ).toEqual({ source_id: sourceId, origin_kind: 'manual' });
    }
    const failedNote = createInboxItem(
      '80000000-0000-4000-8000-000000000133',
      campaignId,
      timestamp,
    );
    repository.insert(failedNote);
    const failedNoteReview = repository.updateStatus(
      { campaignId, id: failedNote.id, revision: 1 },
      'reviewing',
      timestamp,
    );
    const noteCounts = context.native
      .prepare(
        `SELECT (SELECT COUNT(*) FROM sources) AS sources,(SELECT COUNT(*) FROM notes) AS destinations`,
      )
      .get();
    expect(() =>
      repository.convertToNote(
        { campaignId, id: failedNote.id, revision: failedNoteReview.revision },
        { ...note, sourceId: '92000000-0000-4000-8000-000000000133' },
        [],
        '92000000-0000-4000-8000-000000000133',
        timestamp,
      ),
    ).toThrow();
    expect(repository.findById(campaignId, failedNote.id)).toMatchObject({
      status: 'reviewing',
      convertedObjectId: null,
    });
    expect(
      context.native
        .prepare(
          `SELECT (SELECT COUNT(*) FROM sources) AS sources,(SELECT COUNT(*) FROM notes) AS destinations`,
        )
        .get(),
    ).toEqual(noteCounts);
    const failedEvent = createInboxItem(
      '80000000-0000-4000-8000-000000000134',
      campaignId,
      timestamp,
    );
    repository.insert(failedEvent);
    const failedEventReview = repository.updateStatus(
      { campaignId, id: failedEvent.id, revision: 1 },
      'reviewing',
      timestamp,
    );
    const eventCounts = context.native
      .prepare(
        `SELECT (SELECT COUNT(*) FROM sources) AS sources,(SELECT COUNT(*) FROM events) AS destinations`,
      )
      .get();
    expect(() =>
      repository.convertToEvent(
        { campaignId, id: failedEvent.id, revision: failedEventReview.revision },
        { ...event, sourceId: '92000000-0000-4000-8000-000000000134' },
        [],
        '92000000-0000-4000-8000-000000000134',
        timestamp,
      ),
    ).toThrow();
    expect(repository.findById(campaignId, failedEvent.id)).toMatchObject({
      status: 'reviewing',
      convertedObjectId: null,
    });
    expect(
      context.native
        .prepare(
          `SELECT (SELECT COUNT(*) FROM sources) AS sources,(SELECT COUNT(*) FROM events) AS destinations`,
        )
        .get(),
    ).toEqual(eventCounts);
    for (const [table, id, sourceId, code] of [
      ['notes', note.id, note.sourceId, 'NOTE_SOURCE_INVALID'],
      ['events', event.id, event.sourceId, 'EVENT_SOURCE_INVALID'],
    ] as const)
      for (const query of [
        `UPDATE ${table} SET source_id = NULL WHERE id = ?`,
        `UPDATE ${table} SET source_id = '92000000-0000-4000-8000-000000000199' WHERE id = ?`,
        `UPDATE ${table} SET origin_kind = 'session' WHERE id = ?`,
      ]) {
        expect(() => context.native.prepare(query).run(id)).toThrow(code);
        expect(
          context.native
            .prepare(`SELECT source_id, origin_kind FROM ${table} WHERE id = ?`)
            .get(id),
        ).toEqual({ source_id: sourceId, origin_kind: 'manual' });
      }
    context.close();
  });

  it('converte relacionamento e preserva fonte, ponteiros e endpoint criado', async () => {
    const { context, repository } = await setup();
    const entityTypeId = '60000000-0000-4000-8000-000000000010';
    const relationshipTypeId = '50000000-0000-4000-8000-000000000010';
    const existingId = '30000000-0000-4000-8000-000000000010';
    context.native
      .prepare(
        `INSERT INTO entity_types (id, campaign_id, name, singular_name, slug, sort_order, is_system, is_archived, created_at, updated_at, revision) VALUES (?, ?, 'Pessoa', 'Pessoa', 'pessoa-rel', 0, 0, 0, ?, ?, 1)`,
      )
      .run(entityTypeId, campaignId, timestamp, timestamp);
    context.native
      .prepare(
        `INSERT INTO relationship_types (id, campaign_id, name, slug, is_symmetric, is_archived, sort_order, created_at, updated_at, revision) VALUES (?, ?, 'Conhece', 'conhece', 0, 0, 0, ?, ?, 1)`,
      )
      .run(relationshipTypeId, campaignId, timestamp, timestamp);
    context.native
      .prepare(
        `INSERT INTO entities (id, campaign_id, entity_type_id, name, canon_state, knowledge_state, visibility, origin_kind, created_at, updated_at, revision) VALUES (?, ?, ?, 'Mara', 'accepted', 'fact', 'gm', 'manual', ?, ?, 1)`,
      )
      .run(existingId, campaignId, entityTypeId, timestamp, timestamp);
    const item = createInboxItem('80000000-0000-4000-8000-000000000080', campaignId, timestamp);
    repository.insert(item);
    const reviewing = repository.updateStatus(
      { campaignId, id: item.id, revision: 1 },
      'reviewing',
      timestamp,
    );
    const sourceId = '90000000-0000-4000-8000-000000000080';
    const created = {
      id: '30000000-0000-4000-8000-000000000080',
      campaignId,
      entityTypeId,
      referenceImageAttachmentId: null,
      name: 'Iara',
      summary: null,
      canonState: 'accepted' as const,
      knowledgeState: 'fact' as const,
      visibility: 'gm' as const,
      originKind: 'manual' as const,
      sourceId,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      revision: 1,
    };
    const relationship = {
      id: '40000000-0000-4000-8000-000000000080',
      campaignId,
      relationshipTypeId,
      sourceEntityId: existingId,
      targetEntityId: created.id,
      description: null,
      strength: null,
      canonState: 'accepted' as const,
      knowledgeState: 'fact' as const,
      visibility: 'gm' as const,
      originKind: 'manual' as const,
      sourceId,
      validFromEventId: null,
      validToEventId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      revision: 1,
    };
    const result = repository.convertToRelationship(
      { campaignId, id: item.id, revision: reviewing.revision },
      relationship,
      [created],
      sourceId,
      timestamp,
    );
    expect(result).toMatchObject({
      inboxItem: {
        status: 'converted',
        convertedObjectType: 'relationship',
        convertedObjectId: relationship.id,
      },
      relationship: { id: relationship.id },
      createdEntities: [{ id: created.id }],
    });
    expect(
      context.native
        .prepare(
          'SELECT inbox_item_id, relationship_id, source_id FROM inbox_relationship_conversions',
        )
        .get(),
    ).toEqual({ inbox_item_id: item.id, relationship_id: relationship.id, source_id: sourceId });
    expect(
      context.native.prepare('SELECT inbox_item_id FROM sources WHERE id = ?').get(sourceId),
    ).toEqual({ inbox_item_id: item.id });
    const failed = createInboxItem(
      '80000000-0000-4000-8000-000000000081',
      campaignId,
      '2026-09-14T13:00:00.000Z',
    );
    repository.insert(failed);
    const failedReview = repository.updateStatus(
      { campaignId, id: failed.id, revision: 1 },
      'reviewing',
      timestamp,
    );
    const countsBefore = context.native
      .prepare(
        'SELECT (SELECT COUNT(*) FROM sources) AS sources, (SELECT COUNT(*) FROM entities) AS entities, (SELECT COUNT(*) FROM relationships) AS relationships, (SELECT COUNT(*) FROM inbox_relationship_conversions) AS conversions',
      )
      .get();
    expect(() =>
      repository.convertToRelationship(
        { campaignId, id: failed.id, revision: failedReview.revision },
        { ...relationship, sourceId: '90000000-0000-4000-8000-000000000081' },
        [
          {
            ...created,
            id: '30000000-0000-4000-8000-000000000081',
            sourceId: '90000000-0000-4000-8000-000000000081',
          },
        ],
        '90000000-0000-4000-8000-000000000081',
        timestamp,
      ),
    ).toThrow();
    expect(repository.findById(campaignId, failed.id)).toMatchObject({
      status: 'reviewing',
      revision: 2,
      convertedObjectId: null,
    });
    expect(
      context.native
        .prepare(
          'SELECT (SELECT COUNT(*) FROM sources) AS sources, (SELECT COUNT(*) FROM entities) AS entities, (SELECT COUNT(*) FROM relationships) AS relationships, (SELECT COUNT(*) FROM inbox_relationship_conversions) AS conversions',
        )
        .get(),
    ).toEqual(countsBefore);

    const foreignEntityTypeId = '60000000-0000-4000-8000-000000000011';
    const foreignRelationshipTypeId = '50000000-0000-4000-8000-000000000011';
    const foreignEntityId = '30000000-0000-4000-8000-000000000011';
    context.native
      .prepare(
        `INSERT INTO entity_types (id, campaign_id, name, singular_name, slug, sort_order, is_system, is_archived, created_at, updated_at, revision) VALUES (?, ?, 'Pessoa', 'Pessoa', 'pessoa-fora', 0, 0, 0, ?, ?, 1)`,
      )
      .run(foreignEntityTypeId, otherCampaignId, timestamp, timestamp);
    context.native
      .prepare(
        `INSERT INTO relationship_types (id, campaign_id, name, slug, is_symmetric, is_archived, sort_order, created_at, updated_at, revision) VALUES (?, ?, 'Conhece', 'conhece-fora', 0, 0, 0, ?, ?, 1)`,
      )
      .run(foreignRelationshipTypeId, otherCampaignId, timestamp, timestamp);
    context.native
      .prepare(
        `INSERT INTO entities (id, campaign_id, entity_type_id, name, canon_state, knowledge_state, visibility, origin_kind, created_at, updated_at, revision) VALUES (?, ?, ?, 'Outra', 'accepted', 'fact', 'gm', 'manual', ?, ?, 1)`,
      )
      .run(foreignEntityId, otherCampaignId, foreignEntityTypeId, timestamp, timestamp);
    expect(() =>
      context.native
        .prepare(
          `INSERT INTO relationships (id, campaign_id, relationship_type_id, source_entity_id, target_entity_id, canon_state, knowledge_state, visibility, origin_kind, source_id, created_at, updated_at, revision) VALUES (?, ?, ?, ?, ?, 'accepted', 'fact', 'gm', 'manual', ?, ?, ?, 1)`,
        )
        .run(
          '40000000-0000-4000-8000-000000000011',
          otherCampaignId,
          foreignRelationshipTypeId,
          foreignEntityId,
          foreignEntityId,
          sourceId,
          timestamp,
          timestamp,
        ),
    ).toThrow(/RELATIONSHIP_SOURCE_INVALID/);
    expect(() =>
      context.native
        .prepare(
          `INSERT INTO relationships (id, campaign_id, relationship_type_id, source_entity_id, target_entity_id, canon_state, knowledge_state, visibility, origin_kind, created_at, updated_at, revision) VALUES (?, ?, ?, ?, ?, 'accepted', 'fact', 'gm', 'manual', ?, ?, 1)`,
        )
        .run(
          '40000000-0000-4000-8000-000000000012',
          campaignId,
          relationshipTypeId,
          existingId,
          foreignEntityId,
          timestamp,
          timestamp,
        ),
    ).toThrow(/RELATIONSHIP_CAMPAIGN_INVALID/);
    const foreignInbox = createInboxItem(
      '80000000-0000-4000-8000-000000000082',
      otherCampaignId,
      timestamp,
    );
    repository.insert(foreignInbox);
    const foreignSourceId = '90000000-0000-4000-8000-000000000082';
    context.native
      .prepare(
        `INSERT INTO sources (id, kind, session_id, inbox_item_id, description, created_at) VALUES (?, 'manual', NULL, ?, 'Fonte de outra campanha', ?)`,
      )
      .run(foreignSourceId, foreignInbox.id, timestamp);
    expect(() =>
      context.native
        .prepare('UPDATE relationships SET source_id = ? WHERE id = ?')
        .run(foreignSourceId, relationship.id),
    ).toThrow(/RELATIONSHIP_SOURCE_INVALID/);
    expect(
      context.native
        .prepare('SELECT source_id FROM relationships WHERE id = ?')
        .get(relationship.id),
    ).toEqual({ source_id: sourceId });
    for (const update of [
      "UPDATE relationships SET source_id = '90000000-0000-4000-8000-000000000099' WHERE id = ?",
      'UPDATE relationships SET source_id = NULL WHERE id = ?',
      "UPDATE relationships SET origin_kind = 'session' WHERE id = ?",
    ]) {
      expect(() => context.native.prepare(update).run(relationship.id)).toThrow(
        /RELATIONSHIP_SOURCE_INVALID/,
      );
      expect(
        context.native
          .prepare('SELECT source_id, origin_kind FROM relationships WHERE id = ?')
          .get(relationship.id),
      ).toEqual({ source_id: sourceId, origin_kind: 'manual' });
    }
    context.close();
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
      entities: new EntityRepository(context.orm),
      createId: () => '80000000-0000-4000-8000-000000000001',
      now: () => timestamp,
    }),
  };
}
