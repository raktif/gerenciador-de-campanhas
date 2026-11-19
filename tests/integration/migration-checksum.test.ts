import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ensureDataDirectories,
  getDataDirectories,
  type DataDirectories,
} from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import {
  migrations,
  latestMigrationVersion,
  type MigrationDefinition,
} from '../../src/db/migrations/registry';
import { TestLogger } from '../helpers/test-logger';

const roots: string[] = [];
const contexts: DatabaseContext[] = [];
const timestamp = '2026-11-16T12:00:00.000Z';
const campaignId = '00000000-0000-4000-8000-000000000001';

afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 3 })),
  );
});

describe('compatibilidade de checksums no bootstrap SQLite', () => {
  it.each(['LF', 'CRLF'] as const)(
    'abre fixture schema21 %s, preserva registros/dados e não cria backup no lote da v33',
    async (ending) => {
      const directories = await createDirectories();
      const native = new Database(path.join(directories.database, 'app.db'));
      let applied: unknown[];
      try {
        native.exec(`
          CREATE TABLE schema_migrations (
            version INTEGER PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            checksum TEXT NOT NULL,
            applied_at TEXT NOT NULL
          );
        `);
        const insert = native.prepare('INSERT INTO schema_migrations VALUES (?, ?, ?, ?)');
        for (const migration of migrations.filter(({ version }) => version <= 21)) {
          const lf = migration.sql.replace(/\r\n/g, '\n');
          const sql = ending === 'LF' ? lf : lf.replace(/\n/g, '\r\n');
          native.exec(sql);
          insert.run(
            migration.version,
            migration.name,
            migration.crlfChecksum === undefined ? migration.checksum : hash(sql),
            timestamp,
          );
        }
        insertCampaign(native);
        applied = readRegistry(native);
      } finally {
        native.close();
      }

      const context = await openTestDatabase(directories);
      expect(context.schemaVersion).toBe(latestMigrationVersion);
      expect(readRegistry(context.native, 21)).toEqual(applied);
      expectCampaign(context.native);
      expect(context.native.pragma('quick_check', { simple: true })).toBe('ok');
      expect(context.native.pragma('foreign_key_check')).toEqual([]);
      expect(
        context.native
          .prepare(
            'SELECT version, checksum FROM schema_migrations WHERE version > 21 ORDER BY version',
          )
          .all(),
      ).toEqual(
        migrations
          .filter(({ version }) => version > 21)
          .map(({ version, checksum }) => ({
            version,
            checksum,
          })),
      );
      context.close();

      const backups = (await readdir(directories.automaticBackups)).filter((file) =>
        file.endsWith('.db'),
      );
      expect(backups).toHaveLength(1);
      const reopened = await openTestDatabase(directories);
      expect(readRegistry(reopened.native, 21)).toEqual(applied);
      expectCampaign(reopened.native);
      expect(
        (await readdir(directories.automaticBackups)).filter((file) => file.endsWith('.db')),
      ).toEqual(backups);
    },
  );

  it('mantém o backup verificado de upgrades que não incluem a limpeza v33', async () => {
    const directories = await createDirectories();
    const before = await openTestDatabase(directories);
    insertCampaign(before.native);
    const applied = readRegistry(before.native);
    before.close();

    // Simulate a future migration while exercising the same production runner.
    const testRegistry = migrations as MigrationDefinition[];
    const sql = 'CREATE TABLE future_migration_fixture (id INTEGER PRIMARY KEY);';
    const version = latestMigrationVersion + 1;
    testRegistry.push({ version, name: 'future-migration-fixture', sql, checksum: hash(sql) });
    try {
      const after = await openTestDatabase(directories);
      expect(after.schemaVersion).toBe(version);
      expect(readRegistry(after.native, latestMigrationVersion)).toEqual(applied);
      const backups = (await readdir(directories.automaticBackups)).filter((file) =>
        file.endsWith('.db'),
      );
      expect(backups).toHaveLength(1);
      const [backupName] = backups;
      if (backupName === undefined) throw new Error('Backup pré-migração ausente.');
      const backup = new Database(path.join(directories.automaticBackups, backupName), {
        readonly: true,
      });
      try {
        expect(readRegistry(backup)).toEqual(applied);
        expectCampaign(backup);
        expect(backup.pragma('quick_check', { simple: true })).toBe('ok');
      } finally {
        backup.close();
      }
    } finally {
      testRegistry.pop();
    }
  });

  it('registra checksums canônicos em banco novo e reabre sem alterar o registro', async () => {
    const directories = await createDirectories();
    const first = await openTestDatabase(directories);
    const applied = readRegistry(first.native);
    expect(
      first.native
        .prepare('SELECT version, checksum FROM schema_migrations ORDER BY version')
        .all(),
    ).toEqual(migrations.map(({ version, checksum }) => ({ version, checksum })));
    insertCampaign(first.native);
    first.close();
    const reopened = await openTestDatabase(directories);
    expect(readRegistry(reopened.native)).toEqual(applied);
    expectCampaign(reopened.native);
    expect(await readdir(directories.automaticBackups)).toEqual([]);
  });

  it('aceita registros CRLF em todas as versões dinâmicas, inclusive v22/v23, sem regravá-los', async () => {
    const directories = await createDirectories();
    const first = await openTestDatabase(directories);
    const update = first.native.prepare(
      'UPDATE schema_migrations SET checksum = ? WHERE version = ?',
    );
    for (const migration of migrations) {
      if (migration.crlfChecksum !== undefined) {
        update.run(migration.crlfChecksum, migration.version);
      }
    }
    const applied = readRegistry(first.native);
    first.close();
    const reopened = await openTestDatabase(directories);
    expect(readRegistry(reopened.native)).toEqual(applied);
    expect(await readdir(directories.automaticBackups)).toEqual([]);
  });

  it.each([
    { version: 2, kind: 'unknown' },
    { version: 2, kind: 'changed-sql' },
    { version: 2, kind: 'mixed-endings' },
    { version: 9, kind: 'unknown' },
    { version: 9, kind: 'current-crlf' },
    { version: 22, kind: 'changed-sql' },
    { version: latestMigrationVersion + 1, kind: 'unknown-version' },
  ])('rejeita $kind em v$version sem sobrescrever registro/dados', async ({ version, kind }) => {
    const directories = await createDirectories();
    const first = await openTestDatabase(directories);
    insertCampaign(first.native);
    const migration = migrations.find((candidate) => candidate.version === version);
    const lf = migration?.sql.replace(/\r\n/g, '\n') ?? '';
    const checksum =
      kind === 'changed-sql'
        ? hash(`${lf}\nSELECT 1;`)
        : kind === 'mixed-endings'
          ? hash(lf.replace('\n', '\r\n'))
          : kind === 'current-crlf'
            ? hash(lf.replace(/\n/g, '\r\n'))
            : '0'.repeat(64);
    if (kind === 'unknown-version') {
      first.native
        .prepare('INSERT INTO schema_migrations VALUES (?, ?, ?, ?)')
        .run(version, 'unknown', checksum, timestamp);
    } else {
      expect(checksum).not.toBe(migration?.checksum);
      first.native
        .prepare('UPDATE schema_migrations SET checksum = ? WHERE version = ?')
        .run(checksum, version);
    }
    const applied = readRegistry(first.native);
    first.close();
    await expect(openApplicationDatabase(directories, new TestLogger())).rejects.toThrow(
      `Checksum de migração inválido para a versão ${String(version)}.`,
    );
    const unchanged = new Database(path.join(directories.database, 'app.db'), { readonly: true });
    try {
      expect(readRegistry(unchanged)).toEqual(applied);
      expectCampaign(unchanged);
      expect(unchanged.pragma('quick_check', { simple: true })).toBe('ok');
    } finally {
      unchanged.close();
    }
    expect(await readdir(directories.automaticBackups)).toEqual([]);
  });
});

async function createDirectories(): Promise<DataDirectories> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rpg-migration-checksum-'));
  roots.push(root);
  const directories = getDataDirectories(root);
  await ensureDataDirectories(directories);
  return directories;
}

async function openTestDatabase(directories: DataDirectories): Promise<DatabaseContext> {
  const context = await openApplicationDatabase(directories, new TestLogger());
  contexts.push(context);
  return context;
}

function readRegistry(
  database: Database.Database,
  through = latestMigrationVersion + 1,
): unknown[] {
  return database
    .prepare('SELECT * FROM schema_migrations WHERE version <= ? ORDER BY version')
    .all(through);
}

function insertCampaign(database: Database.Database): void {
  database
    .prepare('INSERT INTO campaigns (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(campaignId, 'Campanha preservada', timestamp, timestamp);
}

function expectCampaign(database: Database.Database): void {
  expect(database.prepare('SELECT id, name, created_at, updated_at FROM campaigns').all()).toEqual([
    {
      id: campaignId,
      name: 'Campanha preservada',
      created_at: timestamp,
      updated_at: timestamp,
    },
  ]);
}

function hash(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}
