import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import { latestMigrationVersion, migrations } from '../../src/db/migrations/registry';
import { DemandRepository } from '../../src/db/repositories/demand-repository';
import { CampaignSignalRepository } from '../../src/db/repositories/campaign-signal-repository';
import type { DemandContent, DemandDetails } from '../../src/core/contracts/demands';
import { EventRepository } from '../../src/db/repositories/event-repository';
import { EventService } from '../../src/main/services/event-service';
import { CampaignRepository } from '../../src/db/repositories/campaign-repository';
import { EntityRepository } from '../../src/db/repositories/entity-repository';
import { SessionRepository } from '../../src/db/repositories/session-repository';
import { TestLogger } from '../helpers/test-logger';

const now = '2026-11-17T15:00:00.000Z';
const roots: string[] = [];
const contexts: DatabaseContext[] = [];
afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function setup(needText = 'Investigar os cabos') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'demand-test-'));
  roots.push(root);
  const dirs = getDataDirectories(root);
  await ensureDataDirectories(dirs);
  const context = await openApplicationDatabase(dirs, new TestLogger());
  contexts.push(context);
  const db = context.native;
  const campaignId = randomUUID(),
    type = randomUUID(),
    entity = randomUUID(),
    other = randomUUID(),
    field = randomUUID(),
    value = randomUUID();
  db.prepare('INSERT INTO campaigns(id,name,created_at,updated_at) VALUES(?,?,?,?)').run(
    campaignId,
    'Teste',
    now,
    now,
  );
  db.prepare(
    "INSERT INTO entity_types(id,campaign_id,name,singular_name,slug,created_at,updated_at) VALUES(?,?,'NPCs','NPC','npc',?,?)",
  ).run(type, campaignId, now, now);
  for (const [id, name] of [
    [entity, 'Gorel'],
    [other, 'Skel'],
  ])
    db.prepare(
      'INSERT INTO entities(id,campaign_id,entity_type_id,name,created_at,updated_at) VALUES(?,?,?,?,?,?)',
    ).run(id, campaignId, type, name, now, now);
  db.prepare(
    "INSERT INTO field_definitions(id,entity_type_id,key,label,data_type,semantic_role,created_at,updated_at) VALUES(?,?,'need','Necessidade','long_text','need',?,?)",
  ).run(field, type, now, now);
  db.prepare(
    'INSERT INTO field_values(id,entity_id,field_definition_id,value_text,created_at,updated_at) VALUES(?,?,?,?,?,?)',
  ).run(value, entity, field, needText, now, now);
  const signals = new CampaignSignalRepository(db);
  const firstSignal = signals.recalculate(campaignId, now).items[0];
  if (!firstSignal) throw new Error('Sinal ausente');
  const signal = firstSignal.signal;
  const repo = new DemandRepository(db, () => now);
  const content: DemandContent = {
    title: 'Investigar cabos',
    need: needText,
    summary: 'Revisado',
    obstacle: '',
    risks: '',
    urgency: 'low',
    requesterEntityId: entity,
    links: [{ targetType: 'entity', targetId: other, role: 'affected' }],
  };
  const input = { campaignId, signalId: signal.id, signalRevision: signal.revision, content };
  const accept = () => repo.accept(input);
  const transition = (
    d: DemandDetails,
    action: 'archive' | 'restore' | 'resolve' | 'fail' | 'ignore' | 'reopen' | 'activate',
    confirmed?: boolean,
  ) =>
    repo.transition({
      campaignId,
      id: d.demand.id,
      revision: d.demand.revision,
      action,
      confirmed,
    });
  return {
    root,
    dirs,
    context,
    db,
    campaignId,
    type,
    entity,
    other,
    field,
    value,
    signals,
    signal,
    repo,
    content,
    input,
    accept,
    transition,
  };
}

describe('3B.3 Demandas — SQLite real', () => {
  it('contenção retorna erro explícito sem gravações; retry de conversão/resolução é durável após reinício', async () => {
    const s = await setup();
    const other = new Database(s.db.name);
    s.db.pragma('busy_timeout=5');
    try {
      other.exec('BEGIN IMMEDIATE');
      expect(s.accept).toThrow('banco está ocupado');
      expect(s.db.prepare('SELECT count(*) AS n FROM demands').get()).toEqual({ n: 0 });
      other.exec('ROLLBACK');
    } finally {
      other.close();
    }
    const accepted = s.accept();
    const resolved = s.transition(accepted, 'resolve', true);
    s.context.close();
    const context = await openApplicationDatabase(s.dirs, new TestLogger());
    contexts.push(context);
    const repository = new DemandRepository(context.native, () => now);
    expect(repository.accept(s.input)).toEqual(resolved);
    expect(
      repository.transition({
        campaignId: s.campaignId,
        id: accepted.demand.id,
        revision: accepted.demand.revision,
        action: 'resolve',
        confirmed: true,
      }),
    ).toEqual(resolved);
    expect(context.native.prepare('SELECT count(*) AS n FROM demands').get()).toEqual({ n: 1 });
    expect(context.native.prepare('SELECT count(*) AS n FROM events').get()).toEqual({ n: 1 });
  });
  it('isola referências reais entre duas campanhas no mesmo banco, inclusive fontes geradas', async () => {
    const s = await setup();
    const d = s.accept();
    const campaign = randomUUID(),
      type = randomUUID(),
      entity = randomUUID(),
      session = randomUUID(),
      clock = randomUUID();
    s.db
      .prepare('INSERT INTO campaigns(id,name,created_at,updated_at) VALUES(?,?,?,?)')
      .run(campaign, 'B', now, now);
    s.db
      .prepare(
        "INSERT INTO entity_types(id,campaign_id,name,singular_name,slug,created_at,updated_at) VALUES(?,?,'B','B','b',?,?)",
      )
      .run(type, campaign, now, now);
    s.db
      .prepare(
        "INSERT INTO entities(id,campaign_id,entity_type_id,name,created_at,updated_at) VALUES(?,?,?,'Privado B',?,?)",
      )
      .run(entity, campaign, type, now, now);
    s.db
      .prepare(
        "INSERT INTO sessions(id,campaign_id,sequence_number,title,created_at,updated_at) VALUES(?,?,1,'Sessão B',?,?)",
      )
      .run(session, campaign, now, now);
    s.db
      .prepare(
        "INSERT INTO clocks(id,campaign_id,name,consequence,segments_total,segments_filled,clock_type,status,entity_id,created_at,updated_at) VALUES(?,?,'Relógio B','Potencial',4,0,'threat','active',?,?,?)",
      )
      .run(clock, campaign, entity, now, now);
    expect(() => s.repo.get(campaign, d.demand.id)).toThrow('nesta campanha');
    for (const [table, column, target] of [
      ['demand_entity_links', 'entity_id', entity],
      ['demand_clock_links', 'clock_id', clock],
      ['demand_session_links', 'session_id', session],
    ] as const) {
      expect(() =>
        s.db
          .prepare(
            `INSERT INTO ${table}(demand_id,${column}${table === 'demand_entity_links' ? ',role' : ''}) VALUES(?,?${table === 'demand_entity_links' ? ",'related'" : ''})`,
          )
          .run(d.demand.id, target),
      ).toThrow('DEMAND_LINK_INVALID');
    }
    expect(() =>
      s.db
        .prepare("UPDATE entities SET source_id=?,origin_kind='generator' WHERE id=?")
        .run(d.demand.sourceId, entity),
    ).toThrow('DEMAND_SOURCE_INVALID');
    expect(() =>
      s.db.prepare('UPDATE entities SET campaign_id=? WHERE id=?').run(campaign, s.other),
    ).toThrow('DEMAND_LINK_INVALID');
    expect(s.repo.get(s.campaignId, d.demand.id)).toEqual(d);
  });
  it('preserva literalmente Unicode, NUL e espaços na necessidade e no snapshot, sem perder a referência', async () => {
    const s = await setup();
    const need = '\0 Cabos 🧭 e segredos  ';
    s.db.prepare('UPDATE field_values SET value_text=? WHERE id=?').run(need, s.value);
    const recalc = s.signals.recalculate(s.campaignId, '2026-11-18T15:00:00.000Z').items[0];
    if (!recalc) throw new Error('Sinal ausente');
    const accepted = s.repo.accept({
      ...s.input,
      signalRevision: recalc.signal.revision,
      content: { ...s.content, need },
    });
    expect(accepted.demand.need).toBe(need);
    expect(JSON.parse(accepted.demand.sourceSnapshot)).toMatchObject({ need });
    expect(() =>
      s.db.prepare('UPDATE field_values SET value_text=? WHERE id=?').run('Cabos', s.value),
    ).toThrow('DEMAND_NEED_LOCKED');
  });
  it('pagina Demandas sem perdas e mantém uma identidade por campo Need distinto', async () => {
    const s = await setup();
    s.accept();
    for (let i = 0; i < 4; i += 1) {
      const field = randomUUID();
      s.db
        .prepare(
          "INSERT INTO field_definitions(id,entity_type_id,key,label,data_type,semantic_role,created_at,updated_at) VALUES(?,?,?,?,'long_text','need',?,?)",
        )
        .run(field, s.type, `need-${String(i)}`, `Need ${String(i)}`, now, now);
      s.db
        .prepare(
          'INSERT INTO field_values(id,entity_id,field_definition_id,value_text,created_at,updated_at) VALUES(?,?,?,?,?,?)',
        )
        .run(randomUUID(), s.entity, field, `Necessidade ${String(i)}`, now, now);
    }
    const signals = s.signals
      .recalculate(s.campaignId, now)
      .items.filter((entry) => entry.signal.status === 'new');
    expect(signals).toHaveLength(4);
    for (const entry of signals) {
      const suggestion = s.repo.suggestion(s.campaignId, entry.signal.id);
      s.repo.accept({
        campaignId: s.campaignId,
        signalId: entry.signal.id,
        signalRevision: entry.signal.revision,
        content: { ...s.content, need: suggestion.need },
      });
    }
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const result = s.repo.list({
        campaignId: s.campaignId,
        limit: 2,
        ...(cursor ? { cursor } : {}),
      });
      expect(result.total).toBe(5);
      ids.push(...result.items.map((d) => d.id));
      cursor = result.nextCursor;
    } while (cursor);
    expect(new Set(ids).size).toBe(5);
    expect(ids).toHaveLength(5);
  });
  it('aceita somente necessidade atual; conversão idempotente preserva fonte e não promove cânone', async () => {
    const s = await setup();
    expect(s.repo.suggestion(s.campaignId, s.signal.id)).toMatchObject({
      need: s.content.need,
      rationale:
        'Necessidade explícita: o campo “Necessidade” está preenchido. Nenhuma urgência, risco ou obstáculo foi inferido.',
    });
    const first = s.accept();
    expect(first.demand).toMatchObject({
      status: 'available',
      canonState: 'draft',
      knowledgeState: 'possibility',
      originKind: 'generator',
    });
    expect(first.links).toHaveLength(2);
    expect(s.accept()).toEqual(first);
    expect(s.signals.findById(s.campaignId, s.signal.id)?.status).toBe('converted');
    expect(() => s.repo.accept({ ...s.input, content: { ...s.content, title: 'Outra' } })).toThrow(
      'outro conteúdo',
    );
    s.signals.recalculate(s.campaignId, '2026-11-18T15:00:00.000Z');
    expect(s.repo.get(s.campaignId, first.demand.id)).toEqual(first);
    expect(JSON.parse(first.demand.sourceSnapshot)).toMatchObject({
      need: 'Investigar os cabos',
      signal: { rule_version: 'explicit-need-v1' },
    });
  });

  it('reverte juntos a limpeza do campo e das cópias se a v34 falhar', async () => {
    const original = '{"necessidade":"Investigar"}';
    const s = await setup(original);
    const accepted = s.accept();
    const demandSql = 'SELECT * FROM demands WHERE id=?';
    const demandId = accepted.demand.id;
    const before = s.db.prepare(demandSql).get(demandId);
    s.db.exec(`DELETE FROM schema_migrations WHERE version IN (33,34);
        CREATE TRIGGER reject_v34 BEFORE INSERT ON schema_migrations WHEN NEW.version=34
        BEGIN SELECT RAISE(ABORT, 'falha controlada v34'); END;`);
    s.context.close();
    await expect(openApplicationDatabase(s.dirs, new TestLogger())).rejects.toThrow(
      'falha controlada v34',
    );
    const failed = new Database(path.join(s.dirs.database, 'app.db'), { readonly: true });
    try {
      expect(failed.prepare(demandSql).get(demandId)).toEqual(before);
      expect(failed.prepare('SELECT value_text FROM field_values WHERE id=?').get(s.value)).toEqual(
        { value_text: original },
      );
      expect(
        failed.prepare('SELECT summary FROM campaign_signals WHERE id=?').get(s.signal.id),
      ).toEqual({ summary: original });
      expect(failed.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()).toEqual(
        { version: 36 },
      );
    } finally {
      failed.close();
    }
    expect(
      (await readdir(s.dirs.automaticBackups)).filter((name) => name.endsWith('.db')),
    ).toHaveLength(1);
  });
  it('bloqueia stale/adiado, fonte alterada e revisão obsoleta sem criar dados parciais', async () => {
    const s = await setup();
    s.db.prepare("UPDATE campaign_signals SET status='stale' WHERE id=?").run(s.signal.id);
    expect(s.accept).toThrow('Revise');
    s.db
      .prepare(
        "UPDATE campaign_signals SET status='snoozed',dismissed_until='2026-11-20T15:00:00.000Z' WHERE id=?",
      )
      .run(s.signal.id);
    expect(s.accept).toThrow('Revise');
    s.db
      .prepare("UPDATE campaign_signals SET status='new',dismissed_until=NULL WHERE id=?")
      .run(s.signal.id);
    s.db.prepare("UPDATE field_values SET value_text='Outra necessidade' WHERE id=?").run(s.value);
    expect(s.accept).toThrow('mudou');
    s.signals.recalculate(s.campaignId, '2026-11-18T15:00:00.000Z');
    expect(s.accept).toThrow('alterado');
    expect(s.db.prepare('SELECT count(*) AS n FROM demands').get()).toEqual({ n: 0 });
  });
  it('congela Need e definição compartilhada, sem congelar irmã ou atributos alheios', async () => {
    const s = await setup();
    let d = s.accept();
    const attempts = [
      ["UPDATE field_values SET value_text='outro' WHERE id=?", s.value],
      ['DELETE FROM field_values WHERE id=?', s.value],
      ["UPDATE field_definitions SET semantic_role='goal' WHERE id=?", s.field],
      ['UPDATE field_definitions SET is_archived=1 WHERE id=?', s.field],
      ['UPDATE entity_types SET is_archived=1 WHERE id=?', s.type],
    ] as const;
    for (const [sql, id] of attempts)
      expect(() => s.db.prepare(sql).run(id)).toThrow('DEMAND_NEED_LOCKED');
    expect(() =>
      s.repo.assertEntityMutation({ campaignId: s.campaignId, id: s.entity, fieldValues: [] }),
    ).toThrow('Campo usado');
    s.db
      .prepare(
        "INSERT INTO field_values(id,entity_id,field_definition_id,value_text,created_at,updated_at) VALUES(?,?,?,'Outra necessidade',?,?)",
      )
      .run(randomUUID(), s.other, s.field, now, now);
    s.db.prepare("UPDATE entities SET summary='Editável' WHERE id=?").run(s.entity);
    s.db.prepare("UPDATE field_values SET value_text='Editável' WHERE entity_id=?").run(s.other);
    expect(() =>
      s.db.prepare('UPDATE entities SET archived_at=? WHERE id=?').run(now, s.entity),
    ).toThrow('DEMAND_PENDING_ENTITY');
    d = s.transition(d, 'archive');
    s.db.prepare('UPDATE entities SET archived_at=? WHERE id=?').run(now, s.entity);
    expect(() => s.transition(d, 'restore')).toThrow('Restaure primeiro');
    for (const [sql, id] of attempts) expect(() => s.db.prepare(sql).run(id)).toThrow();
    expect(() => s.db.prepare('DELETE FROM entities WHERE id=?').run(s.entity)).toThrow();
    expect(() => s.db.prepare('DELETE FROM demands WHERE id=?').run(d.demand.id)).toThrow(
      'DEMAND_IMMUTABLE',
    );
  });
  it('resolução exige confirmação, cria um Evento e todas entidades relacionadas atomicamente', async () => {
    const s = await setup();
    const d = s.accept();
    expect(() => s.transition(d, 'resolve')).toThrow('Confirme');
    expect(s.db.prepare('SELECT count(*) AS n FROM events').get()).toEqual({ n: 0 });
    const resolved = s.transition(d, 'resolve', true);
    const retried = s.transition(d, 'resolve', true);
    expect(retried).toEqual(resolved);
    const eventId = resolved.demand.generatedEventId;
    if (!eventId) throw new Error('Evento ausente');
    expect(
      s.db
        .prepare('SELECT canon_state,knowledge_state,description_markdown FROM events WHERE id=?')
        .get(eventId),
    ).toEqual({
      canon_state: 'draft',
      knowledge_state: 'possibility',
      description_markdown: 'Investigar os cabos\n\nRevisado',
    });
    expect(
      s.db
        .prepare('SELECT count(*) AS n FROM event_entity_links WHERE event_id=? AND role=?')
        .get(eventId, 'related'),
    ).toEqual({ n: 2 });
    expect(() => s.db.prepare("UPDATE events SET title='Outro' WHERE id=?").run(eventId)).toThrow(
      'DEMAND_EVENT_IMMUTABLE',
    );
    expect(() =>
      s.db.prepare('DELETE FROM event_entity_links WHERE event_id=?').run(eventId),
    ).toThrow('DEMAND_EVENT_IMMUTABLE');
    const service = new EventService({
      repository: new EventRepository(s.context.orm),
      campaigns: new CampaignRepository(s.context.orm),
      entities: new EntityRepository(s.context.orm),
      sessions: new SessionRepository(s.context.orm),
    });
    expect(service.get({ campaignId: s.campaignId, id: eventId }).demandGenerated).toBe(true);
    expect(() =>
      service.update({
        campaignId: s.campaignId,
        id: eventId,
        revision: 1,
        patch: { title: 'Não' },
      }),
    ).toThrow('Somente');
    const promoted = service.update({
      campaignId: s.campaignId,
      id: eventId,
      revision: 1,
      patch: { canonState: 'accepted', knowledgeState: 'fact' },
    });
    expect(promoted.event.canonState).toBe('accepted');
    expect(
      service.archive({ campaignId: s.campaignId, id: eventId, revision: promoted.event.revision })
        .event.archivedAt,
    ).not.toBeNull();
  });
  it('falha na criação do Evento reverte resolução, vínculos e revisão', async () => {
    const s = await setup();
    const d = s.accept();
    s.db.exec(
      "CREATE TRIGGER test_fail_event BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT,'test_event_failure'); END;",
    );
    expect(() => s.transition(d, 'resolve', true)).toThrow('test_event_failure');
    expect(s.repo.get(s.campaignId, d.demand.id)).toEqual(d);
    expect(s.db.prepare('SELECT count(*) AS n FROM events').get()).toEqual({ n: 0 });
  });
  it('subdemanda preserva linhagem, arquiva pai e só permite resolução manual após filhas encerradas', async () => {
    const s = await setup();
    const parent = s.accept();
    const request = {
      campaignId: s.campaignId,
      id: parent.demand.id,
      revision: parent.demand.revision,
      confirmed: true as const,
      idempotencyKey: randomUUID(),
      content: { ...s.content, title: 'Nova necessidade', need: 'Proteger os trabalhadores' },
    };
    let child = s.repo.transform(request);
    expect(s.repo.transform(request)).toEqual(child);
    expect(child.demand).toMatchObject({
      parentId: parent.demand.id,
      acceptedSignalId: null,
      lineageSignalId: s.signal.id,
      status: 'available',
    });
    expect(s.repo.get(s.campaignId, parent.demand.id).demand.status).toBe('archived');
    let restored = s.transition(s.repo.get(s.campaignId, parent.demand.id), 'restore');
    expect(() => s.transition(restored, 'resolve', true)).toThrow('Encerre');
    child = s.transition(child, 'archive');
    expect(s.repo.get(s.campaignId, parent.demand.id).canResolve).toBe(false);
    child = s.transition(child, 'restore');
    child = s.transition(child, 'ignore');
    s.transition(child, 'archive');
    restored = s.repo.get(s.campaignId, parent.demand.id);
    expect(restored.canResolve).toBe(true);
    expect(s.transition(restored, 'resolve', true).demand.status).toBe('resolved');
    expect(s.db.prepare('SELECT count(*) AS n FROM campaign_signals').get()).toEqual({ n: 1 });
  });
  it('campanha, revisão, paginação e alvos cruzados são protegidos', async () => {
    const a = await setup(),
      b = await setup();
    const d = a.accept();
    expect(() => a.repo.get(b.campaignId, d.demand.id)).toThrow('Campanha');
    expect(() =>
      a.repo.update({ campaignId: a.campaignId, id: d.demand.id, revision: 9, content: a.content }),
    ).toThrow('alterada');
    expect(() =>
      a.repo.update({
        campaignId: a.campaignId,
        id: d.demand.id,
        revision: 1,
        content: {
          ...a.content,
          links: [{ targetType: 'entity', targetId: b.entity, role: 'related' }],
        },
      }),
    ).toThrow('campanha');
    expect(a.repo.get(a.campaignId, d.demand.id)).toEqual(d);
    const all = a.repo.targets({ campaignId: a.campaignId, targetType: 'entity', limit: 1 });
    expect(all.nextCursor).not.toBeNull();
    const cursor = all.nextCursor;
    if (!cursor) throw new Error('Cursor ausente');
    expect(() =>
      a.repo.targets({ campaignId: a.campaignId, targetType: 'session', limit: 1, cursor }),
    ).toThrow('Paginação');
    a.db.prepare("UPDATE campaigns SET status='archived' WHERE id=?").run(a.campaignId);
    expect(() => a.transition(d, 'archive')).toThrow('ativas');
    expect(a.repo.get(a.campaignId, d.demand.id)).toEqual(d);
  });
  it('REPLACE e bypass não apagam fonte, demanda, definição ou Evento congelado', async () => {
    const s = await setup();
    const d = s.accept();
    s.db.pragma('recursive_triggers=0');
    for (const table of [
      'demands',
      'field_definitions',
      'entities',
      'entity_types',
      'field_values',
    ]) {
      const id = {
        demands: d.demand.id,
        field_definitions: s.field,
        entities: s.entity,
        entity_types: s.type,
        field_values: s.value,
      }[table];
      if (!id) throw new Error('Alvo ausente');
      expect(
        () =>
          s.db.prepare(`INSERT OR REPLACE INTO ${table} SELECT * FROM ${table} WHERE id=?`).run(id),
        table,
      ).toThrow();
    }
    const resolved = s.transition(d, 'resolve', true);
    expect(() =>
      s.db
        .prepare('INSERT OR REPLACE INTO events SELECT * FROM events WHERE id=?')
        .run(resolved.demand.generatedEventId),
    ).toThrow();
  });
  it('upgrade v28 preserva checksums e dados sem backup no lote da v33; banco vazio chega à versão atual', async () => {
    const s = await setup();
    expect(s.db.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({
      version: latestMigrationVersion,
    });
    const root = await mkdtemp(path.join(os.tmpdir(), 'demand-upgrade-'));
    roots.push(root);
    const dirs = getDataDirectories(root);
    await ensureDataDirectories(dirs);
    const legacy = new Database(path.join(dirs.database, 'app.db'));
    legacy.exec(
      'CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL,checksum TEXT NOT NULL,applied_at TEXT NOT NULL)',
    );
    for (const migration of migrations.filter((m) => m.version <= 28)) {
      legacy.pragma('foreign_keys=OFF');
      if (migration.requiresLegacyAlterTable) legacy.pragma('legacy_alter_table=ON');
      legacy.exec(migration.sql);
      legacy
        .prepare('INSERT INTO schema_migrations VALUES(?,?,?,?)')
        .run(migration.version, migration.name, migration.checksum, now);
      legacy.pragma('legacy_alter_table=OFF');
    }
    legacy
      .prepare('INSERT INTO campaigns(id,name,created_at,updated_at) VALUES(?,?,?,?)')
      .run(randomUUID(), 'Preservada', now, now);
    const before = legacy.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
    legacy.close();
    const upgraded = await openApplicationDatabase(dirs, new TestLogger());
    contexts.push(upgraded);
    expect(
      upgraded.native
        .prepare('SELECT * FROM schema_migrations WHERE version<=28 ORDER BY version')
        .all(),
    ).toEqual(before);
    expect(
      upgraded.native.prepare("SELECT name FROM campaigns WHERE name='Preservada'").get(),
    ).toEqual({ name: 'Preservada' });
    expect(upgraded.native.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(upgraded.native.pragma('foreign_key_check')).toEqual([]);
    expect(
      (await readdir(dirs.automaticBackups)).filter((name) => name.endsWith('.db')),
    ).toHaveLength(1);
  });

  it.each([32, 33])(
    'v%i: limpa cópias com proveniência exata sem alterar identidade ou histórico',
    async (version) => {
      const original = '{"necessidade":"Investigar"}';
      const notice = 'Conteúdo removido pela limpeza de campos.';
      const s = await setup(original);
      const accepted = s.accept();
      const demandId = accepted.demand.id;
      const signalId = s.signal.id;
      const queryDemand = 'SELECT * FROM demands WHERE id=?';
      const queryLinks =
        'SELECT * FROM demand_entity_links WHERE demand_id=? ORDER BY entity_id, role';
      const querySignal = 'SELECT * FROM campaign_signals WHERE id=?';
      const queryEvidence = 'SELECT * FROM signal_evidence WHERE signal_id=? ORDER BY id';
      const before = s.db.prepare(queryDemand).get(demandId) as {
        source_snapshot: string;
        need: string;
      };
      const links = s.db.prepare(queryLinks).all(demandId);
      const unrelatedId = randomUUID();
      s.db
        .prepare(
          `INSERT INTO campaign_signals
      SELECT ?,campaign_id,signal_type,title,summary,priority,status,generated_at,last_detected_at,
      dismissed_until,rule_version,generator_kind,created_at,updated_at,revision
      FROM campaign_signals WHERE id=?`,
        )
        .run(unrelatedId, signalId);
      const originalSignal = s.db.prepare(querySignal).get(signalId) as { summary: string };
      const evidence = s.db.prepare(queryEvidence).all(signalId) as { description: string }[];
      expect(evidence).toHaveLength(1);
      s.db
        .prepare(
          'INSERT INTO field_values(id,entity_id,field_definition_id,value_text,created_at,updated_at) VALUES(?,?,?,?,?,?)',
        )
        .run(randomUUID(), s.other, s.field, original, now, now);
      const standalone = s.signals
        .recalculate(s.campaignId, now)
        .items.find(
          ({ signal }) =>
            signal.id !== signalId && signal.id !== unrelatedId && signal.summary === original,
        )?.signal;
      if (!standalone) throw new Error('Sinal avulso ausente.');
      if (version === 33) {
        const cleanup = migrations.find((m) => m.version === 33);
        if (!cleanup) throw new Error('Migração v33 ausente.');
        s.db.function('is_json_container_text', (value) => Number(value === original));
        s.db.exec(cleanup.sql);
      } else {
        s.db.prepare('DELETE FROM schema_migrations WHERE version=33').run();
      }
      s.db.prepare('DELETE FROM schema_migrations WHERE version=34').run();
      s.context.close();
      const upgraded = await openApplicationDatabase(s.dirs, new TestLogger());
      contexts.push(upgraded);
      expect(
        upgraded.native.prepare('SELECT value_text FROM field_values WHERE id=?').get(s.value),
      ).toEqual({ value_text: '' });
      const after = upgraded.native.prepare(queryDemand).get(demandId) as typeof before;
      const snapshot = JSON.parse(after.source_snapshot) as {
        need: string;
        acceptedPayload: string;
        signal: { id: string; rule_version: string; summary: string };
        evidence: { description: string }[];
      };
      expect(after).toEqual({ ...before, need: notice, source_snapshot: after.source_snapshot });
      expect(snapshot).toMatchObject({
        need: notice,
        signal: { id: signalId, rule_version: 'explicit-need-v1', summary: notice },
        evidence: [{ description: notice }],
      });
      expect(JSON.parse(snapshot.acceptedPayload)).toEqual({ ...s.content, need: notice });
      expect(Object.values(after)).not.toContain(original);
      expect(after.source_snapshot).not.toContain('necessidade');
      expect(upgraded.native.prepare(queryLinks).all(demandId)).toEqual(links);
      expect(upgraded.native.prepare(querySignal).get(signalId)).toEqual({
        ...originalSignal,
        summary: notice,
      });
      expect(upgraded.native.prepare(queryEvidence).all(signalId)).toEqual(
        evidence.map((entry) => ({ ...entry, description: notice })),
      );
      expect(upgraded.native.prepare(querySignal).get(unrelatedId)).toMatchObject({
        summary: original,
      });
      expect(upgraded.native.prepare(querySignal).get(standalone.id)).toMatchObject({
        summary: version === 32 ? notice : original,
      });
      expect(
        upgraded.native
          .prepare('SELECT count(*) AS total FROM structured_value_migration_snapshots')
          .get(),
      ).toEqual({ total: 0 });
      expect(() =>
        upgraded.native
          .prepare('UPDATE field_values SET value_text=? WHERE id=?')
          .run('Outro valor', s.value),
      ).toThrow('DEMAND_NEED_LOCKED');
      expect(upgraded.native.pragma('foreign_key_check')).toEqual([]);
      expect(
        (await readdir(s.dirs.automaticBackups)).filter((name) => name.endsWith('.db')),
      ).toHaveLength(1);
    },
  );
});
