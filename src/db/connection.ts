import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Logger } from '../core/logging/logger';
import type { DataDirectories } from '../core/storage/data-directories';
import { createVerifiedBackup } from './backup';
import { migrations, type MigrationDefinition } from './migrations/registry';
import * as schema from './schema';

export interface DatabaseContext {
  native: Database.Database;
  orm: BetterSQLite3Database<typeof schema>;
  databasePath: string;
  schemaVersion: number;
  sqliteVersion: string;
  fts5Available: true;
  close(): void;
}

interface AppliedMigration {
  version: number;
  checksum: string;
}

export async function openApplicationDatabase(
  directories: DataDirectories,
  logger: Logger,
): Promise<DatabaseContext> {
  await mkdir(directories.database, { recursive: true });
  const databasePath = path.join(directories.database, 'app.db');
  const databaseAlreadyExisted = await fileExists(databasePath);
  const native = new Database(databasePath);

  try {
    configureConnection(native);
    verifyIntegrity(native);
    ensureMigrationRegistry(native);
    const pendingMigrations = findPendingMigrations(native);

    if (databaseAlreadyExisted && pendingMigrations.length > 0) {
      const backup = await createVerifiedBackup(
        native,
        directories.automaticBackups,
        'pre-migration',
      );
      await logger.info('Backup pré-migração criado.', { backupPath: backup.path });
    }

    applyMigrations(native, pendingMigrations);
    const sqliteVersion = readSqliteVersion(native);
    verifyFts5(native);
    const schemaVersion = readSchemaVersion(native);
    const orm = drizzle(native, { schema });

    await logger.info('Banco de dados inicializado.', {
      databasePath,
      schemaVersion,
      sqliteVersion,
      migrationsApplied: pendingMigrations.length,
    });

    return {
      native,
      orm,
      databasePath,
      schemaVersion,
      sqliteVersion,
      fts5Available: true,
      close: () => native.close(),
    };
  } catch (error) {
    native.close();
    throw error;
  }
}

function configureConnection(database: Database.Database): void {
  database.pragma('foreign_keys = ON');
  database.pragma('journal_mode = WAL');
  database.pragma('synchronous = NORMAL');
  database.pragma('busy_timeout = 5000');
}

function verifyIntegrity(database: Database.Database): void {
  const result = database.pragma('quick_check', { simple: true });
  if (result !== 'ok') {
    throw new Error(`A verificação de integridade do SQLite falhou: ${String(result)}`);
  }
}

function ensureMigrationRegistry(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

function findPendingMigrations(database: Database.Database): MigrationDefinition[] {
  const applied = database
    .prepare('SELECT version, checksum FROM schema_migrations ORDER BY version')
    .all() as AppliedMigration[];

  for (const migration of applied) {
    const definition = migrations.find((candidate) => candidate.version === migration.version);
    if (definition?.checksum !== migration.checksum) {
      throw new Error(`Checksum de migração inválido para a versão ${String(migration.version)}.`);
    }
  }

  const appliedVersions = new Set(applied.map((migration) => migration.version));
  return migrations.filter((migration) => !appliedVersions.has(migration.version));
}

function applyMigrations(
  database: Database.Database,
  pendingMigrations: readonly MigrationDefinition[],
): void {
  const insertMigration = database.prepare(`
    INSERT INTO schema_migrations (version, name, checksum, applied_at)
    VALUES (?, ?, ?, ?)
  `);

  const migrate = database.transaction(() => {
    for (const migration of pendingMigrations) {
      database.exec(migration.sql);
      insertMigration.run(
        migration.version,
        migration.name,
        migration.checksum,
        new Date().toISOString(),
      );
    }
  });

  migrate();
}

function readSqliteVersion(database: Database.Database): string {
  const row = database.prepare('SELECT sqlite_version() AS version').get() as { version: string };
  return row.version;
}

function verifyFts5(database: Database.Database): void {
  database.prepare('SELECT count(*) AS total FROM app_search_fts').get();
}

function readSchemaVersion(database: Database.Database): number {
  const row = database
    .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
    .get() as {
    version: number;
  };
  return row.version;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
