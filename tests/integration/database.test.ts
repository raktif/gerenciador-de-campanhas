import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import { openApplicationDatabase } from '../../src/db/connection';
import { migrations } from '../../src/db/migrations/registry';
import { PhaseZeroRepository } from '../../src/db/repositories/phase-zero-repository';
import { TestLogger } from '../helpers/test-logger';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((temporaryRoot) => rm(temporaryRoot, { recursive: true, force: true })),
  );
});

describe('SQLite embutido', () => {
  it('aplica migração, PRAGMAs e disponibiliza FTS5', async () => {
    const root = await createTemporaryRoot();
    const directories = getDataDirectories(root);
    await ensureDataDirectories(directories);
    const context = await openApplicationDatabase(directories, new TestLogger());

    expect(context.schemaVersion).toBe(8);
    expect(context.sqliteVersion).toMatch(/^3\./);
    expect(context.fts5Available).toBe(true);
    expect(context.native.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(context.native.pragma('journal_mode', { simple: true })).toBe('wal');

    context.native
      .prepare(
        'INSERT INTO app_search_fts (object_type, object_id, title, body, tags) VALUES (?, ?, ?, ?, ?)',
      )
      .run('test', '1', 'Kabotya', 'Vila mineradora', 'local');
    const result = context.native
      .prepare("SELECT title FROM app_search_fts WHERE app_search_fts MATCH 'mineradora'")
      .get() as { title: string };
    expect(result.title).toBe('Kabotya');
    context.close();
  });

  it('persiste o mesmo valor depois de fechar e reabrir', async () => {
    const root = await createTemporaryRoot();
    const directories = getDataDirectories(root);
    await ensureDataDirectories(directories);
    const firstContext = await openApplicationDatabase(directories, new TestLogger());
    const expected = { value: 'persistente', savedAt: new Date().toISOString() };
    new PhaseZeroRepository(firstContext.orm).write(expected);
    firstContext.close();

    const secondContext = await openApplicationDatabase(directories, new TestLogger());
    expect(new PhaseZeroRepository(secondContext.orm).read()).toEqual(expected);
    secondContext.close();
  });

  it('migra com segurança um banco legado da versão 6 e preserva dados da Fase 1', async () => {
    const root = await createTemporaryRoot();
    const directories = getDataDirectories(root);
    await ensureDataDirectories(directories);
    const databasePath = path.join(directories.database, 'app.db');
    const legacyDatabase = new Database(databasePath);
    legacyDatabase.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);
    const insertMigration = legacyDatabase.prepare(
      'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
    );
    for (const migration of migrations.filter(({ version }) => version <= 6)) {
      legacyDatabase.exec(migration.sql);
      insertMigration.run(migration.version, migration.name, migration.checksum, timestamp());
    }
    const campaignId = randomUUID();
    legacyDatabase
      .prepare('INSERT INTO campaigns (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(campaignId, 'Campanha preservada', timestamp(), timestamp());
    legacyDatabase.close();

    const context = await openApplicationDatabase(directories, new TestLogger());
    expect(context.schemaVersion).toBe(8);
    expect(
      context.native.prepare('SELECT name FROM campaigns WHERE id = ?').get(campaignId),
    ).toEqual({ name: 'Campanha preservada' });
    expect(
      context.native
        .prepare(
          "SELECT count(*) AS total FROM sqlite_master WHERE type = 'table' AND name IN ('tags', 'entity_tags')",
        )
        .get(),
    ).toEqual({ total: 0 });
    context.close();
  });

  it('cria e persiste uma campanha somente com os campos obrigatórios', async () => {
    const root = await createTemporaryRoot();
    const directories = getDataDirectories(root);
    await ensureDataDirectories(directories);
    const firstContext = await openApplicationDatabase(directories, new TestLogger());
    const id = randomUUID();
    const timestamp = new Date().toISOString();

    firstContext.native
      .prepare(
        `INSERT INTO campaigns (id, name, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(id, 'Ethéria', timestamp, timestamp);
    firstContext.close();

    const secondContext = await openApplicationDatabase(directories, new TestLogger());
    const campaign = secondContext.native
      .prepare(
        `SELECT id, name, system_name, concept, genre, tone, summary, image_path,
                status, created_at, updated_at, archived_at, revision
         FROM campaigns WHERE id = ?`,
      )
      .get(id);

    expect(campaign).toEqual({
      id,
      name: 'Ethéria',
      system_name: null,
      concept: null,
      genre: null,
      tone: null,
      summary: null,
      image_path: null,
      status: 'active',
      created_at: timestamp,
      updated_at: timestamp,
      archived_at: null,
      revision: 1,
    });
    secondContext.close();
  });

  it('rejeita identificador, nome, status e revisão inválidos de campanha', async () => {
    const root = await createTemporaryRoot();
    const directories = getDataDirectories(root);
    await ensureDataDirectories(directories);
    const context = await openApplicationDatabase(directories, new TestLogger());
    const insert = context.native.prepare(
      `INSERT INTO campaigns (id, name, status, created_at, updated_at, revision)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const timestamp = new Date().toISOString();

    expect(() => insert.run('nao-e-uuid', 'Válida', 'active', timestamp, timestamp, 1)).toThrow();
    expect(() => insert.run(randomUUID(), '   ', 'active', timestamp, timestamp, 1)).toThrow();
    expect(() => insert.run(randomUUID(), 'Válida', 'paused', timestamp, timestamp, 1)).toThrow();
    expect(() => insert.run(randomUUID(), 'Válida', 'active', timestamp, timestamp, 0)).toThrow();
    expect(context.native.prepare('SELECT count(*) AS total FROM campaigns').get()).toEqual({
      total: 0,
    });
    context.close();
  });

  it('cria e verifica backup antes de migrar um banco existente', async () => {
    const root = await createTemporaryRoot();
    const directories = getDataDirectories(root);
    await ensureDataDirectories(directories);
    const databasePath = path.join(directories.database, 'app.db');
    const legacyDatabase = new Database(databasePath);
    legacyDatabase.exec('CREATE TABLE legacy_data (id INTEGER PRIMARY KEY, value TEXT);');
    legacyDatabase.prepare('INSERT INTO legacy_data (value) VALUES (?)').run('preservado');
    legacyDatabase.close();

    const context = await openApplicationDatabase(directories, new TestLogger());
    context.close();
    const backupFiles = (await readdir(directories.automaticBackups)).filter((name) =>
      name.endsWith('.db'),
    );

    expect(backupFiles).toHaveLength(1);
    const backupFile = backupFiles[0];
    if (backupFile === undefined) throw new Error('Backup pré-migração não foi criado.');
    const backupDatabase = new Database(path.join(directories.automaticBackups, backupFile), {
      readonly: true,
    });
    expect(backupDatabase.prepare('SELECT value FROM legacy_data').get()).toEqual({
      value: 'preservado',
    });
    backupDatabase.close();
  });
});

async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rpg-campaign-manager-test-'));
  temporaryRoots.push(root);
  return root;
}

function timestamp(): string {
  return new Date().toISOString();
}
