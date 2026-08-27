import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import { openApplicationDatabase } from '../../src/db/connection';
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

    expect(context.schemaVersion).toBe(1);
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
