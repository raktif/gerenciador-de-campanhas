import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import {
  legacyStructuredJsonToRichText,
  structuredJsonToRichText,
} from '../../src/core/domain/field-values';
import { openApplicationDatabase } from '../../src/db/connection';
import { migrations } from '../../src/db/migrations/registry';
import { TestLogger } from '../helpers/test-logger';

const roots: string[] = [];
const handles: { close(): void }[] = [];
const before30 = '2026-01-01T00:00:00.000Z';
const at30 = '2026-02-01T00:00:00.000Z';
const after30 = '2026-03-01T00:00:00.000Z';
const source = '{"n":9007199254740993,"quoted":"a\\r\\n\\"b\\"","dupe":1,"dupe":2}';

function id(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

afterEach(async () => {
  handles
    .splice(0)
    .reverse()
    .forEach((handle) => handle.close());
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rpg-json-clear-'));
  roots.push(root);
  const directories = getDataDirectories(root);
  await ensureDataDirectories(directories);
  const dbPath = path.join(directories.database, 'app.db');
  const db = new Database(dbPath);
  handles.push({
    close: () => {
      if (db.open) db.close();
    },
  });
  db.exec(`CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL
  )`);
  applyFixtureMigrations(db, 1, 29);
  db.prepare('INSERT INTO campaigns(id,name,created_at,updated_at) VALUES(?,?,?,?)').run(
    id(1),
    'Campanha',
    before30,
    before30,
  );
  db.prepare(
    `INSERT INTO entity_types(id,campaign_id,name,singular_name,slug,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?)`,
  ).run(id(2), id(1), 'Registros', 'Registro', 'registros', before30, before30);
  db.prepare(
    `INSERT INTO entities(id,campaign_id,entity_type_id,name,created_at,updated_at)
    VALUES(?,?,?,?,?,?)`,
  ).run(id(3), id(1), id(2), 'Registro', before30, before30);
  const field = db.prepare(`INSERT INTO field_definitions
    (id,entity_type_id,key,label,data_type,default_value_json,options_json,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?)`);
  const value = db.prepare(`INSERT INTO field_values
    (id,entity_id,field_definition_id,value_text,value_number,value_boolean,value_date,value_json,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`);
  field.run(
    id(10),
    id(2),
    'estruturado',
    'Estruturado',
    'structured',
    '{"config":1}',
    null,
    before30,
    before30,
  );
  value.run(id(20), id(3), id(10), null, null, null, null, source, before30, before30);
  field.run(
    id(11),
    id(2),
    'multi',
    'Múltipla',
    'multi_select',
    null,
    '["Norte, Sul","Leste"]',
    before30,
    before30,
  );
  value.run(id(21), id(3), id(11), null, null, null, null, '["Norte, Sul"]', before30, before30);
  field.run(id(12), id(2), 'progresso', 'Progresso', 'progress', null, null, before30, before30);
  value.run(
    id(22),
    id(3),
    id(12),
    null,
    null,
    null,
    null,
    '{"current":2,"final":4}',
    before30,
    before30,
  );
  field.run(
    id(13),
    id(2),
    'simples',
    'Única',
    'single_select',
    null,
    '["Norte"]',
    before30,
    before30,
  );
  value.run(id(23), id(3), id(13), 'Norte', null, null, null, null, before30, before30);
  field.run(
    id(14),
    id(2),
    'numero',
    'Progresso legado',
    'progress',
    null,
    null,
    before30,
    before30,
  );
  value.run(id(24), id(3), id(14), null, -2.5, null, null, null, before30, before30);
  field.run(id(15), id(2), 'data', 'Data', 'date', null, null, before30, before30);
  value.run(id(25), id(3), id(15), null, null, null, '2026-01-01', null, before30, before30);
  field.run(id(16), id(2), 'booleano', 'Booleano', 'boolean', null, null, before30, before30);
  value.run(id(26), id(3), id(16), null, null, 0, null, null, before30, before30);
  field.run(
    id(17),
    id(2),
    'json-null',
    'JSON nulo',
    'multi_select',
    null,
    null,
    before30,
    before30,
  );
  value.run(id(27), id(3), id(17), null, null, null, null, 'null', before30, before30);
  field.run(id(18), id(2), 'texto', 'Texto', 'short_text', null, null, before30, before30);
  value.run(
    id(28),
    id(3),
    id(18),
    '{"texto":"literal"}',
    null,
    null,
    null,
    null,
    before30,
    before30,
  );
  for (const [n, text] of [
    [40, ' \t[\n1,{"n":9007199254740993},true]\r\n'],
    [41, 'Texto com {"a":1} no meio'],
    [42, '[1,]'],
    [43, '"texto"'],
    [44, 'null'],
    [45, '17'],
    [46, 'true'],
    [47, '{"a":1} sobra'],
    [48, 'Texto comum'],
  ] as const) {
    field.run(
      id(n + 100),
      id(2),
      `texto-${String(n)}`,
      'Texto',
      'short_text',
      null,
      null,
      before30,
      before30,
    );
    value.run(id(n), id(3), id(n + 100), text, null, null, null, null, before30, before30);
  }
  for (const [n, json] of [
    [50, '17'],
    [51, '"texto"'],
    [52, 'true'],
  ] as const) {
    field.run(
      id(n + 100),
      id(2),
      `json-${String(n)}`,
      'JSON',
      'multi_select',
      null,
      null,
      before30,
      before30,
    );
    value.run(id(n), id(3), id(n + 100), null, null, null, null, json, before30, before30);
  }
  return { db, dbPath, directories };
}

function applyFixtureMigrations(db: Database.Database, first: number, last: number): void {
  db.function('structured_json_to_rich_text', legacyStructuredJsonToRichText);
  db.pragma('foreign_keys = OFF');
  const insert = db.prepare('INSERT INTO schema_migrations VALUES(?,?,?,?)');
  for (const migration of migrations.filter(({ version }) => version >= first && version <= last)) {
    if (migration.requiresLegacyAlterTable) db.pragma('legacy_alter_table = ON');
    db.exec(migration.sql);
    if (migration.requiresLegacyAlterTable) db.pragma('legacy_alter_table = OFF');
    insert.run(migration.version, migration.name, migration.checksum, at30);
  }
  db.pragma('foreign_keys = ON');
}

function registry(db: Database.Database, through: number) {
  return db
    .prepare('SELECT * FROM schema_migrations WHERE version <= ? ORDER BY version')
    .all(through);
}

function scalars(db: Database.Database) {
  return db
    .prepare(
      `SELECT id, value_text, value_number, value_boolean, value_date, created_at, updated_at, revision
    FROM field_values WHERE id BETWEEN ? AND ? OR id BETWEEN ? AND ? ORDER BY id`,
    )
    .all(id(23), id(26), id(41), id(48));
}

describe('limpeza v33 dos valores JSON dos campos de Entidades', () => {
  it.each([29, 30])(
    'atualiza v%i sem backup e sem manter valores JSON ou Structured',
    async (version) => {
      const { db, directories } = await fixture();
      if (version === 30) applyFixtureMigrations(db, 30, 30);
      const previous = registry(db, version);
      const preserved = scalars(db);
      db.close();
      const context = await openApplicationDatabase(directories, new TestLogger());
      handles.push(context);
      expect(context.schemaVersion).toBe(34);
      expect(registry(context.native, version)).toEqual(previous);
      expect(context.native.prepare('SELECT id FROM field_values ORDER BY id').all()).toEqual(
        [23, 24, 25, 26, 41, 42, 43, 44, 45, 46, 47, 48].map((n) => ({ id: id(n) })),
      );
      expect(scalars(context.native)).toEqual(preserved);
      expect(
        context.native
          .prepare('SELECT data_type,default_value_json FROM field_definitions WHERE id=?')
          .get(id(10)),
      ).toEqual({ data_type: 'rich_text', default_value_json: '{"config":1}' });
      expect(
        context.native.prepare('SELECT options_json FROM field_definitions WHERE id=?').get(id(11)),
      ).toEqual({ options_json: '["Norte, Sul","Leste"]' });
      expect(context.native.prepare('SELECT name FROM entities WHERE id=?').get(id(3))).toEqual({
        name: 'Registro',
      });
      expect(
        context.native.prepare('SELECT * FROM structured_value_migration_snapshots').all(),
      ).toEqual([]);
      expect(
        context.native
          .prepare(
            "SELECT name FROM sqlite_temp_schema WHERE name IN ('entity_json_field_value_removals', 'structured_value_snapshot_v31')",
          )
          .all(),
      ).toEqual([]);
      expect(context.native.pragma('foreign_key_check')).toEqual([]);
      expect(await readdir(directories.automaticBackups)).toEqual([]);
      expect(await readdir(directories.manualBackups)).toEqual([]);
    },
  );

  it.each([31, 32])(
    'v%i: ignora conflitos externos e apaga inclusive Rich Text autoral e snapshots sem source_json',
    async (version) => {
      const { db, dbPath, directories } = await fixture();
      const backups = [
        path.join(directories.automaticBackups, 'a.db'),
        path.join(directories.manualBackups, 'b.db'),
      ];
      db.close();
      for (const [index, backup] of backups.entries()) {
        await copyFile(dbPath, backup);
        const copy = new Database(backup);
        copy
          .prepare('UPDATE field_values SET value_json=? WHERE id=?')
          .run(
            index === 0 ? '123' : source.replace('9007199254740993', '9007199254740992'),
            id(20),
          );
        copy.close();
      }
      const digest = async (file: string) =>
        createHash('sha256')
          .update(await readFile(file))
          .digest('hex');
      const hashes = await Promise.all(backups.map(digest));
      const active = new Database(dbPath);
      handles.push({
        close: () => {
          if (active.open) active.close();
        },
      });
      applyFixtureMigrations(active, 30, 30);
      active.exec(`CREATE TEMP TABLE structured_value_snapshot_v31 (
      field_value_id TEXT, field_definition_id TEXT, entity_id TEXT, source_json TEXT,
      legacy_rich_text TEXT, lossless_rich_text TEXT, created_at TEXT, updated_at TEXT, revision INTEGER
    )`);
      const legacy = legacyStructuredJsonToRichText(source);
      const lossless = structuredJsonToRichText(source);
      active
        .prepare('INSERT INTO temp.structured_value_snapshot_v31 VALUES(?,?,?,?,?,?,?,?,?)')
        .run(id(20), id(10), id(3), source, legacy, lossless, before30, before30, 1);
      applyFixtureMigrations(active, 31, version);
      active
        .prepare('UPDATE field_values SET value_text=?, updated_at=? WHERE id=?')
        .run(legacy.replaceAll('&quot;', '"').replaceAll('\r\n', '\n'), after30, id(20));
      const field = active.prepare(`INSERT INTO field_definitions
      (id,entity_type_id,key,label,data_type,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`);
      const value = active.prepare(`INSERT INTO field_values
      (id,entity_id,field_definition_id,value_text,created_at,updated_at) VALUES(?,?,?,?,?,?)`);
      const snapshot = active.prepare(
        'INSERT INTO structured_value_migration_snapshots VALUES(?,?,?,?,?,?,?)',
      );
      field.run(id(19), id(2), 'editado', 'Editado', 'rich_text', before30, before30);
      value.run(id(29), id(3), id(19), '<p>Texto editado</p>', before30, after30);
      snapshot.run(id(29), id(19), source, legacy, lossless, 1, at30);
      snapshot.run(id(90), id(19), source, legacy, lossless, 0, at30);
      field.run(id(30), id(2), 'novo', 'Novo', 'rich_text', after30, after30);
      value.run(id(31), id(3), id(30), '<p>Texto inteiramente autoral</p>', after30, after30);
      snapshot.run(id(31), id(30), null, legacy, legacy, 0, after30);
      snapshot.run(id(91), id(19), null, legacy, legacy, 0, at30);
      const previous = registry(active, version);
      const definitions = active.prepare('SELECT * FROM field_definitions ORDER BY id').all();
      const preserved = scalars(active);
      active.close();

      const context = await openApplicationDatabase(directories, new TestLogger());
      handles.push(context);
      expect(context.schemaVersion).toBe(34);
      expect(registry(context.native, version)).toEqual(previous);
      expect(context.native.prepare('SELECT id FROM field_values ORDER BY id').all()).toEqual(
        [23, 24, 25, 26, 41, 42, 43, 44, 45, 46, 47, 48].map((n) => ({ id: id(n) })),
      );
      expect(scalars(context.native)).toEqual(preserved);
      expect(context.native.prepare('SELECT * FROM field_definitions ORDER BY id').all()).toEqual(
        definitions,
      );
      expect(
        context.native
          .prepare('SELECT field_value_id,source_json FROM structured_value_migration_snapshots')
          .all(),
      ).toEqual([]);
      expect(await Promise.all(backups.map(digest))).toEqual(hashes);
      expect(await readdir(directories.automaticBackups)).toEqual(['a.db']);
      expect(await readdir(directories.manualBackups)).toEqual(['b.db']);
    },
  );

  it('apaga Rich Text sem proveniência e não repete a limpeza em reaberturas', async () => {
    const { db, directories } = await fixture();
    applyFixtureMigrations(db, 30, 30);
    db.prepare('UPDATE field_values SET updated_at=?,revision=2 WHERE id=?').run(after30, id(20));
    db.prepare("UPDATE field_definitions SET data_type='rich_text',updated_at=? WHERE id=?").run(
      after30,
      id(18),
    );
    db.close();
    const context = await openApplicationDatabase(directories, new TestLogger());
    handles.push(context);
    expect(context.schemaVersion).toBe(34);
    expect(
      context.native.prepare('SELECT id FROM field_values WHERE id IN (?,?)').all(id(20), id(28)),
    ).toEqual([]);
    const newText = '<p>Escrito após a limpeza</p>';
    context.native
      .prepare(
        `INSERT INTO field_values
      (id,entity_id,field_definition_id,value_text,created_at,updated_at) VALUES(?,?,?,?,?,?)`,
      )
      .run(id(20), id(3), id(10), newText, after30, after30);
    context.close();
    handles.pop();
    const reopened = await openApplicationDatabase(directories, new TestLogger());
    handles.push(reopened);
    expect(
      reopened.native.prepare('SELECT value_text FROM field_values WHERE id=?').get(id(20)),
    ).toEqual({ value_text: newText });
    expect(await readdir(directories.automaticBackups)).toEqual([]);
  });

  it('reverte a limpeza e todo o lote se o registro da v33 falhar', async () => {
    const { db, dbPath, directories } = await fixture();
    const previous = registry(db, 29);
    const values = db.prepare('SELECT * FROM field_values ORDER BY id').all();
    db.exec(`CREATE TRIGGER reject_clear BEFORE INSERT ON schema_migrations
      WHEN NEW.version=33 BEGIN SELECT RAISE(ABORT, 'falha controlada'); END;`);
    db.close();
    await expect(openApplicationDatabase(directories, new TestLogger())).rejects.toThrow(
      'falha controlada',
    );
    const failed = new Database(dbPath, { readonly: true });
    try {
      expect(registry(failed, 33)).toEqual(previous);
      expect(failed.prepare('SELECT * FROM field_values ORDER BY id').all()).toEqual(values);
      expect(
        failed.prepare('SELECT data_type FROM field_definitions WHERE id=?').get(id(10)),
      ).toEqual({ data_type: 'structured' });
      expect(
        failed
          .prepare(
            "SELECT name FROM sqlite_master WHERE name='structured_value_migration_snapshots'",
          )
          .get(),
      ).toBeUndefined();
    } finally {
      failed.close();
    }
    expect(await readdir(directories.automaticBackups)).toEqual([]);
  });

  it('reverte também a exclusão de snapshots se a v33 falhar em uma base v32', async () => {
    const { db, dbPath, directories } = await fixture();
    applyFixtureMigrations(db, 30, 30);
    db.exec(`CREATE TEMP TABLE structured_value_snapshot_v31 (
      field_value_id TEXT, field_definition_id TEXT, entity_id TEXT, source_json TEXT,
      legacy_rich_text TEXT, lossless_rich_text TEXT, created_at TEXT, updated_at TEXT, revision INTEGER
    )`);
    applyFixtureMigrations(db, 31, 32);
    const values = db.prepare('SELECT * FROM field_values ORDER BY id').all();
    const snapshots = db.prepare('SELECT * FROM structured_value_migration_snapshots').all();
    expect(snapshots).toHaveLength(1);
    db.exec(`CREATE TRIGGER reject_clear BEFORE INSERT ON schema_migrations
      WHEN NEW.version=33 BEGIN SELECT RAISE(ABORT, 'falha controlada'); END;`);
    db.close();
    await expect(openApplicationDatabase(directories, new TestLogger())).rejects.toThrow(
      'falha controlada',
    );
    const failed = new Database(dbPath, { readonly: true });
    try {
      expect(failed.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()).toEqual(
        { version: 32 },
      );
      expect(failed.prepare('SELECT * FROM field_values ORDER BY id').all()).toEqual(values);
      expect(failed.prepare('SELECT * FROM structured_value_migration_snapshots').all()).toEqual(
        snapshots,
      );
    } finally {
      failed.close();
    }
    expect(await readdir(directories.automaticBackups)).toEqual([]);
  });
});
