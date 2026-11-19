import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import { latestMigrationVersion, migrations } from '../../src/db/migrations/registry';
import { CampaignRepository } from '../../src/db/repositories/campaign-repository';
import { StoryThreadRepository } from '../../src/db/repositories/story-thread-repository';
import { StoryThreadService } from '../../src/main/services/story-thread-service';
import type { StoryThreadPageResult } from '../../src/core/contracts/story-threads';
import { TestLogger } from '../helpers/test-logger';

const now = '2026-11-16T14:00:00.000Z';
const roots: string[] = [];
const contexts: DatabaseContext[] = [];

afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('persistência SQLite de Fios Abertos', () => {
  it('vincula os seis alvos permitidos com campanha validada e não confunde sessão concluída com arquivada', async () => {
    const { context, ids, service } = await setup();
    const details = service.create({
      campaignId: ids.campaign,
      title: 'O minerador desaparecido',
      description: 'Ainda pode retornar.',
      threadType: 'mystery',
      originKind: 'session',
      sessionId: ids.session,
      originReason: 'A ausência foi notada na mesa.',
      links: [
        { targetType: 'entity', targetId: ids.entity },
        { targetType: 'relationship', targetId: ids.relationship },
        { targetType: 'assertion', targetId: ids.assertion },
        { targetType: 'note', targetId: ids.note },
        { targetType: 'event', targetId: ids.event },
        { targetType: 'session', targetId: ids.session },
      ],
    });
    expect(details.thread).toMatchObject({
      title: 'O minerador desaparecido',
      status: 'open',
      originKind: 'session',
      originSessionId: ids.session,
      originSessionTitle: 'Sessão encerrada',
      originReason: 'A ausência foi notada na mesa.',
      revision: 1,
    });
    expect(details.links).toHaveLength(6);
    expect(details.links.map((link) => link.targetType)).toEqual([
      'assertion',
      'entity',
      'event',
      'note',
      'relationship',
      'session',
    ]);
    expect(details.transitions).toMatchObject([
      {
        fromStatus: null,
        toStatus: 'open',
        reason: 'A ausência foi notada na mesa.',
        sessionId: ids.session,
        sessionTitle: 'Sessão encerrada',
      },
    ]);
    for (const [table, targetId] of [
      ['entities', ids.entity],
      ['relationships', ids.relationship],
      ['assertions', ids.assertion],
      ['notes', ids.note],
      ['events', ids.event],
      ['sessions', ids.session],
    ] as const) {
      expect(() =>
        context.native.prepare(`DELETE FROM ${table} WHERE id = ?`).run(targetId),
      ).toThrow();
    }
    expect(() =>
      context.native
        .prepare(
          'INSERT OR REPLACE INTO notes (id, campaign_id, title, body_markdown, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(ids.note, ids.campaign, 'Substituição', 'Conteúdo', now, now),
    ).toThrow();
    expect(() =>
      context.native
        .prepare(
          `INSERT INTO story_thread_links (
            id, campaign_id, thread_id, target_type, target_id, entity_id, sort_order, created_at
          ) VALUES (?, ?, ?, 'entity', ?, ?, 0, ?)`,
        )
        .run(
          randomUUID(),
          ids.campaign,
          details.thread.id,
          ids.foreignEntity,
          ids.foreignEntity,
          now,
        ),
    ).toThrow(/story_thread_link_target_campaign_mismatch/);
    for (const targetType of [
      'entity',
      'relationship',
      'assertion',
      'note',
      'event',
      'session',
    ] as const) {
      expect(
        service.listTargets({ campaignId: ids.campaign, targetType }).items.length,
      ).toBeGreaterThan(0);
    }
    const firstTargetPage = service.listTargets({
      campaignId: ids.campaign,
      targetType: 'entity',
      limit: 1,
    });
    expect(firstTargetPage.nextCursor).not.toBeNull();
    expect(
      service.listTargets({
        campaignId: ids.campaign,
        targetType: 'entity',
        limit: 1,
        cursor: firstTargetPage.nextCursor ?? undefined,
      }).items,
    ).toHaveLength(1);
    expect(() =>
      service.listTargets({
        campaignId: ids.otherCampaign,
        targetType: 'entity',
        limit: 1,
        cursor: firstTargetPage.nextCursor ?? undefined,
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_CURSOR' }));

    expect(() =>
      service.create({
        campaignId: ids.campaign,
        title: 'Referência alheia',
        threadType: 'custom',
        links: [{ targetType: 'entity', targetId: ids.foreignEntity }],
      }),
    ).toThrow(expect.objectContaining({ code: 'THREAD_TARGET_NOT_FOUND' }));
    expect(() =>
      service.create({
        campaignId: ids.campaign,
        title: 'Sessão alheia',
        threadType: 'custom',
        originKind: 'session',
        sessionId: ids.foreignSession,
      }),
    ).toThrow(expect.objectContaining({ code: 'SESSION_NOT_FOUND' }));
    expect(context.native.pragma('foreign_keys', { simple: true })).toBe(1);
    context.close();
  });

  it('preserva vínculo histórico com alvo arquivado, mas recusa novo vínculo; exclusão direta é restrita', async () => {
    const { context, ids, service } = await setup();
    const thread = service.create({
      campaignId: ids.campaign,
      title: 'Fio antigo',
      threadType: 'clue',
      links: [{ targetType: 'entity', targetId: ids.entity }],
    });
    context.native
      .prepare('UPDATE entities SET archived_at = ?, revision = revision + 1 WHERE id = ?')
      .run(now, ids.entity);
    const newThread = service.create({
      campaignId: ids.campaign,
      title: 'Novo fio sem vínculo',
      threadType: 'custom',
    });
    expect(() =>
      context.native
        .prepare(
          `INSERT INTO story_thread_links (
            id, campaign_id, thread_id, target_type, target_id, entity_id, sort_order, created_at
          ) VALUES (?, ?, ?, 'entity', ?, ?, 0, ?)`,
        )
        .run(randomUUID(), ids.campaign, newThread.thread.id, ids.entity, ids.entity, now),
    ).toThrow(/story_thread_link_archived_target/);
    const relationshipThread = service.create({
      campaignId: ids.campaign,
      title: 'Fio com vínculo ativo',
      threadType: 'custom',
      links: [{ targetType: 'relationship', targetId: ids.relationship }],
    });
    expect(() =>
      context.native
        .prepare(
          `UPDATE story_thread_links SET target_type = 'entity', target_id = ?,
            relationship_id = NULL, entity_id = ? WHERE thread_id = ?`,
        )
        .run(ids.entity, ids.entity, relationshipThread.thread.id),
    ).toThrow(/story_thread_link_archived_target/);
    const edited = service.update({
      campaignId: ids.campaign,
      id: thread.thread.id,
      revision: 1,
      patch: { title: 'Fio preservado' },
    });
    expect(edited.thread.title).toBe('Fio preservado');
    expect(edited.links).toMatchObject([{ targetId: ids.entity, archived: true }]);
    const replaceSame = service.update({
      campaignId: ids.campaign,
      id: thread.thread.id,
      revision: 2,
      links: [{ targetType: 'entity', targetId: ids.entity }],
    });
    expect(replaceSame.links).toMatchObject([{ targetId: ids.entity, archived: true }]);
    context.native.exec(`
      CREATE TRIGGER test_fail_thread_link_insert
      BEFORE INSERT ON story_thread_links
      WHEN NEW.target_type = 'event'
      BEGIN SELECT RAISE(ABORT, 'injected_link_failure'); END;
    `);
    expect(() =>
      service.update({
        campaignId: ids.campaign,
        id: thread.thread.id,
        revision: 3,
        links: [
          { targetType: 'entity', targetId: ids.entity },
          { targetType: 'event', targetId: ids.event },
        ],
      }),
    ).toThrow();
    expect(service.get({ campaignId: ids.campaign, id: thread.thread.id })).toMatchObject({
      thread: { revision: 3, title: 'Fio preservado' },
      links: [{ targetId: ids.entity }],
    });
    expect(() =>
      service.create({
        campaignId: ids.campaign,
        title: 'Novo vínculo proibido',
        threadType: 'custom',
        links: [{ targetType: 'entity', targetId: ids.entity }],
      }),
    ).toThrow(expect.objectContaining({ code: 'THREAD_TARGET_ARCHIVED' }));
    expect(() =>
      context.native.prepare('DELETE FROM entities WHERE id = ?').run(ids.entity),
    ).toThrow();
    expect(
      context.native
        .prepare('SELECT count(*) AS total FROM story_thread_links WHERE thread_id = ?')
        .get(thread.thread.id),
    ).toEqual({ total: 1 });
    context.close();
  });

  it('lista todos os fios em páginas sucessivas e vincula o cursor à campanha', async () => {
    const { context, ids, service } = await setup();
    const created = ['Página um', 'Página dois', 'Página três'].map((title) =>
      service.create({ campaignId: ids.campaign, title, threadType: 'custom' }),
    );
    service.create({
      campaignId: ids.otherCampaign,
      title: 'Não deve vazar',
      threadType: 'custom',
    });

    const pages: StoryThreadPageResult[] = [];
    let cursor: string | undefined;
    do {
      const page = service.list({
        campaignId: ids.campaign,
        limit: 1,
        ...(cursor === undefined ? {} : { cursor }),
      });
      pages.push(page);
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);

    expect(pages).toHaveLength(3);
    expect(pages.map((page) => page.total)).toEqual([3, 3, 3]);
    expect(new Set(pages.flatMap((page) => page.items.map((item) => item.title)))).toEqual(
      new Set(['Página um', 'Página dois', 'Página três']),
    );
    expect(
      pages.flatMap((page) => page.items).some((item) => item.title === 'Não deve vazar'),
    ).toBe(false);
    expect(() =>
      service.list({
        campaignId: ids.otherCampaign,
        limit: 1,
        cursor: pages[0]?.nextCursor ?? undefined,
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_CURSOR' }));
    expect(created).toHaveLength(3);
    context.close();
  });

  it('mostra relações sem descrição por tipo e entidades de origem/destino, sem UUID', async () => {
    const { context, ids, service } = await setup();
    const secondTarget = randomUUID();
    const relationshipTypeId = context.native
      .prepare('SELECT id FROM relationship_types WHERE campaign_id = ?')
      .get(ids.campaign) as { id: string };
    const entityTypeId = context.native
      .prepare('SELECT id FROM entity_types WHERE campaign_id = ?')
      .get(ids.campaign) as { id: string };
    context.native
      .prepare(
        `INSERT INTO entities (id, campaign_id, entity_type_id, name, created_at, updated_at)
         VALUES (?, ?, ?, 'Vigia', ?, ?)`,
      )
      .run(secondTarget, ids.campaign, entityTypeId.id, now, now);
    const secondRelationshipId = randomUUID();
    context.native
      .prepare(
        `INSERT INTO relationships (id, campaign_id, relationship_type_id, source_entity_id,
         target_entity_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        secondRelationshipId,
        ids.campaign,
        relationshipTypeId.id,
        secondTarget,
        ids.entity,
        now,
        now,
      );
    const thread = service.create({
      campaignId: ids.campaign,
      title: 'Relações legíveis',
      threadType: 'relationship',
      links: [
        { targetType: 'relationship', targetId: ids.relationship },
        { targetType: 'relationship', targetId: secondRelationshipId },
      ],
    });

    expect(thread.links.map((link) => link.label).sort()).toEqual(
      ['Minerador — Conhece — Testemunha', 'Vigia — Conhece — Minerador'].sort(),
    );
    expect(thread.links.map((link) => link.label)).not.toContain(ids.relationship);
    context.close();
  });

  it('registra transições explícitas, retorno ao estado arquivado, reabertura e revisão otimista', async () => {
    const { context, ids, service } = await setup();
    const created = service.create({
      campaignId: ids.campaign,
      title: 'Promessa',
      threadType: 'promise',
    });
    const active = service.setStatus({
      campaignId: ids.campaign,
      id: created.thread.id,
      revision: 1,
      status: 'active',
      reason: 'Foi retomada na mesa.',
      sessionId: ids.session,
    });
    const dormant = service.setStatus({
      campaignId: ids.campaign,
      id: active.thread.id,
      revision: 2,
      status: 'dormant',
      reason: 'A promessa aguarda.',
    });
    const resolved = service.resolve({
      campaignId: ids.campaign,
      id: dormant.thread.id,
      revision: 3,
      reason: 'Cumprida explicitamente.',
    });
    const archived = service.archive({
      campaignId: ids.campaign,
      id: resolved.thread.id,
      revision: 4,
      reason: 'Ocultar da lista de trabalho.',
    });
    expect(archived.thread).toMatchObject({
      status: 'archived',
      statusBeforeArchive: 'resolved',
      revision: 5,
    });
    const restored = service.restore({
      campaignId: ids.campaign,
      id: archived.thread.id,
      revision: 5,
    });
    expect(restored.thread).toMatchObject({ status: 'resolved', statusBeforeArchive: null });
    const reopened = service.reopen({
      campaignId: ids.campaign,
      id: restored.thread.id,
      revision: 6,
      reason: 'O mestre decidiu retomar.',
      sessionId: ids.session,
    });
    expect(reopened.thread).toMatchObject({ status: 'open', revision: 7 });
    expect(reopened.transitions.map((item) => [item.fromStatus, item.toStatus])).toEqual([
      [null, 'open'],
      ['open', 'active'],
      ['active', 'dormant'],
      ['dormant', 'resolved'],
      ['resolved', 'archived'],
      ['archived', 'resolved'],
      ['resolved', 'open'],
    ]);
    expect(reopened.transitions[1]).toMatchObject({
      reason: 'Foi retomada na mesa.',
      sessionId: ids.session,
      sessionTitle: 'Sessão encerrada',
    });
    expect(() =>
      context.native
        .prepare('UPDATE story_thread_transitions SET reason = ? WHERE thread_id = ?')
        .run('Alteração indevida', reopened.thread.id),
    ).toThrow(/story_thread_transition_immutable/);
    expect(() =>
      context.native
        .prepare('DELETE FROM story_thread_transitions WHERE thread_id = ?')
        .run(reopened.thread.id),
    ).toThrow(/story_thread_transition_immutable/);
    expect(() =>
      service.abandon({ campaignId: ids.campaign, id: reopened.thread.id, revision: 1 }),
    ).toThrow(expect.objectContaining({ code: 'REVISION_CONFLICT' }));
    expect(() =>
      service.reopen({ campaignId: ids.campaign, id: reopened.thread.id, revision: 7 }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_THREAD_STATE' }));
    expect(() =>
      service.archive({
        campaignId: ids.campaign,
        id: reopened.thread.id,
        revision: 7,
        sessionId: ids.foreignSession,
      }),
    ).toThrow(expect.objectContaining({ code: 'SESSION_NOT_FOUND' }));
    const abandoned = service.create({
      campaignId: ids.campaign,
      title: 'Meta deixada para trás',
      threadType: 'unfinished_goal',
    });
    const abandonment = service.abandon({
      campaignId: ids.campaign,
      id: abandoned.thread.id,
      revision: 1,
      reason: 'Decisão explícita.',
    });
    expect(abandonment.thread.status).toBe('abandoned');
    const reopenedAbandoned = service.reopen({
      campaignId: ids.campaign,
      id: abandoned.thread.id,
      revision: 2,
    });
    expect(reopenedAbandoned.thread.status).toBe('open');
    context.close();
  });

  it('reverte status e revisão quando o registro da proveniência falha', async () => {
    const { context, ids, service } = await setup();
    const thread = service.create({
      campaignId: ids.campaign,
      title: 'Atomicidade',
      threadType: 'custom',
    });
    context.native.exec(`
      CREATE TRIGGER test_fail_thread_transition
      BEFORE INSERT ON story_thread_transitions
      WHEN NEW.to_status = 'abandoned'
      BEGIN SELECT RAISE(ABORT, 'injected_transition_failure'); END;
    `);
    expect(() =>
      service.abandon({ campaignId: ids.campaign, id: thread.thread.id, revision: 1 }),
    ).toThrow();
    expect(service.get({ campaignId: ids.campaign, id: thread.thread.id }).thread).toMatchObject({
      status: 'open',
      revision: 1,
    });
    context.close();
  });

  it('protege campanha não ativa no serviço e novamente dentro da transação do repositório', async () => {
    const { context, ids, service, repository } = await setup();
    const thread = service.create({
      campaignId: ids.campaign,
      title: 'Isolamento',
      threadType: 'custom',
    });
    context.native
      .prepare("UPDATE campaigns SET status = 'archived' WHERE id = ?")
      .run(ids.campaign);
    expect(() =>
      service.update({
        campaignId: ids.campaign,
        id: thread.thread.id,
        revision: 1,
        patch: { title: 'Bloqueada' },
      }),
    ).toThrow(expect.objectContaining({ code: 'CAMPAIGN_NOT_ACTIVE' }));
    expect(() =>
      repository.update(
        {
          campaignId: ids.campaign,
          id: thread.thread.id,
          revision: 1,
          patch: { title: 'Bloqueio transacional' },
        },
        now,
      ),
    ).toThrow(expect.objectContaining({ code: 'CAMPAIGN_NOT_ACTIVE' }));
    expect(
      context.native
        .prepare('SELECT title, revision FROM story_threads WHERE id = ?')
        .get(thread.thread.id),
    ).toEqual({ title: 'Isolamento', revision: 1 });
    context.close();
  });

  it('migra banco preexistente v23 com backup validado e preserva campanha; banco vazio chega à v26', async () => {
    const root = await makeRoot();
    const directories = getDataDirectories(root);
    await ensureDataDirectories(directories);
    const file = path.join(directories.database, 'app.db');
    const legacy = new Database(file);
    legacy.pragma('foreign_keys = ON');
    legacy.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);
    for (const migration of migrations.filter((item) => item.version <= 23)) {
      if (migration.requiresForeignKeysDisabled) {
        legacy.pragma('foreign_keys = OFF');
        if (migration.requiresLegacyAlterTable) legacy.pragma('legacy_alter_table = ON');
      }
      legacy.transaction(() => {
        legacy.exec(migration.sql);
        legacy
          .prepare(
            'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
          )
          .run(migration.version, migration.name, migration.checksum, now);
      })();
      if (migration.requiresForeignKeysDisabled) {
        if (migration.requiresLegacyAlterTable) legacy.pragma('legacy_alter_table = OFF');
        legacy.pragma('foreign_keys = ON');
      }
    }
    const campaignId = randomUUID();
    legacy
      .prepare('INSERT INTO campaigns (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(campaignId, 'Campanha existente', now, now);
    legacy.close();

    const migrated = await openApplicationDatabase(directories, new TestLogger());
    contexts.push(migrated);
    expect(migrated.schemaVersion).toBe(latestMigrationVersion);
    expect(
      migrated.native.prepare('SELECT name FROM campaigns WHERE id = ?').get(campaignId),
    ).toEqual({
      name: 'Campanha existente',
    });
    expect(migrated.native.pragma('foreign_key_check')).toEqual([]);
    const backupNames = await readdir(directories.automaticBackups);
    expect(backupNames.some((name) => name.endsWith('.db'))).toBe(true);
    migrated.close();
    contexts.pop();

    const emptyRoot = await makeRoot();
    const emptyDirectories = getDataDirectories(emptyRoot);
    await ensureDataDirectories(emptyDirectories);
    const empty = await openApplicationDatabase(emptyDirectories, new TestLogger());
    contexts.push(empty);
    expect(empty.schemaVersion).toBe(latestMigrationVersion);
    expect(empty.native.prepare('SELECT count(*) AS total FROM story_threads').get()).toEqual({
      total: 0,
    });
    expect(empty.native.prepare('SELECT count(*) AS total FROM clocks').get()).toEqual({
      total: 0,
    });
    expect(empty.native.pragma('foreign_key_check')).toEqual([]);
  });
});

async function setup(): Promise<{
  context: DatabaseContext;
  ids: Record<
    | 'campaign'
    | 'otherCampaign'
    | 'entity'
    | 'foreignEntity'
    | 'relationship'
    | 'assertion'
    | 'note'
    | 'event'
    | 'session'
    | 'foreignSession',
    string
  >;
  service: StoryThreadService;
  repository: StoryThreadRepository;
}> {
  const root = await makeRoot();
  const directories = getDataDirectories(root);
  await ensureDataDirectories(directories);
  const context = await openApplicationDatabase(directories, new TestLogger());
  contexts.push(context);
  const ids = {
    campaign: randomUUID(),
    otherCampaign: randomUUID(),
    entity: randomUUID(),
    foreignEntity: randomUUID(),
    relationship: randomUUID(),
    assertion: randomUUID(),
    note: randomUUID(),
    event: randomUUID(),
    session: randomUUID(),
    foreignSession: randomUUID(),
  };
  const entityType = randomUUID();
  const foreignTypeId = randomUUID();
  const relationshipType = randomUUID();
  const insertCampaign = context.native.prepare(
    'INSERT INTO campaigns (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
  );
  insertCampaign.run(ids.campaign, 'Campanha de teste', now, now);
  insertCampaign.run(ids.otherCampaign, 'Outra campanha', now, now);
  context.native
    .prepare(
      `INSERT INTO entity_types (id, campaign_id, name, singular_name, slug, created_at, updated_at)
       VALUES (?, ?, 'Personagens', 'Personagem', 'personagens', ?, ?)`,
    )
    .run(entityType, ids.campaign, now, now);
  context.native
    .prepare(
      `INSERT INTO entity_types (id, campaign_id, name, singular_name, slug, created_at, updated_at)
       VALUES (?, ?, 'Personagens', 'Personagem', 'personagens', ?, ?)`,
    )
    .run(foreignTypeId, ids.otherCampaign, now, now);
  const insertEntity = context.native.prepare(
    `INSERT INTO entities (id, campaign_id, entity_type_id, name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  insertEntity.run(ids.entity, ids.campaign, entityType, 'Minerador', now, now);
  insertEntity.run(ids.foreignEntity, ids.otherCampaign, foreignTypeId, 'Alheio', now, now);
  context.native
    .prepare(
      `INSERT INTO relationship_types (id, campaign_id, name, slug, created_at, updated_at)
       VALUES (?, ?, 'Conhece', 'conhece', ?, ?)`,
    )
    .run(relationshipType, ids.campaign, now, now);
  const otherEntity = randomUUID();
  insertEntity.run(otherEntity, ids.campaign, entityType, 'Testemunha', now, now);
  context.native
    .prepare(
      `INSERT INTO relationships (id, campaign_id, relationship_type_id, source_entity_id,
       target_entity_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(ids.relationship, ids.campaign, relationshipType, ids.entity, otherEntity, now, now);
  context.native
    .prepare(
      `INSERT INTO assertions (id, campaign_id, subject_entity_id, statement, created_at, updated_at)
       VALUES (?, ?, ?, 'Conhecia o minerador', ?, ?)`,
    )
    .run(ids.assertion, ids.campaign, ids.entity, now, now);
  context.native
    .prepare(
      `INSERT INTO notes (id, campaign_id, title, body_markdown, created_at, updated_at)
       VALUES (?, ?, 'Diário', 'Anotação', ?, ?)`,
    )
    .run(ids.note, ids.campaign, now, now);
  context.native
    .prepare(
      `INSERT INTO sessions (id, campaign_id, sequence_number, title, status, created_at, updated_at)
       VALUES (?, ?, 1, 'Sessão encerrada', 'completed', ?, ?)`,
    )
    .run(ids.session, ids.campaign, now, now);
  context.native
    .prepare(
      `INSERT INTO sessions (id, campaign_id, sequence_number, title, created_at, updated_at)
       VALUES (?, ?, 1, 'Sessão estrangeira', ?, ?)`,
    )
    .run(ids.foreignSession, ids.otherCampaign, now, now);
  context.native
    .prepare(
      `INSERT INTO events (id, campaign_id, session_id, title, created_at, updated_at)
       VALUES (?, ?, ?, 'Desaparecimento', ?, ?)`,
    )
    .run(ids.event, ids.campaign, ids.session, now, now);
  const repository = new StoryThreadRepository(context.native);
  const service = new StoryThreadService({
    repository,
    campaigns: new CampaignRepository(context.orm),
    createId: randomUUID,
    now: () => now,
  });
  return { context, ids, service, repository };
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'story-threads-test-'));
  roots.push(root);
  return root;
}
