import { access, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Logger } from '../core/logging/logger';
import type { DataDirectories } from '../core/storage/data-directories';
import { createVerifiedBackup } from './backup';
import { matchesMigrationChecksum } from './migrations/checksum';
import {
  clearEntityJsonFieldValuesVersion,
  clearDerivedEntityFieldCopiesVersion,
  migrations,
  type MigrationDefinition,
} from './migrations/registry';
import {
  applyDerivedFieldCleanup,
  registerDerivedFieldCleanupFunctions,
  stageDerivedFieldCleanup,
} from './migrations/clear-derived-field-copies';
import * as schema from './schema';
import {
  legacyRichTextSemanticallyEqual,
  legacyStructuredJsonToRichText,
  structuredJsonToRichText,
} from '../core/domain/field-values';

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
    const performsCleanup = pendingMigrations.some(
      ({ version }) =>
        version === clearEntityJsonFieldValuesVersion ||
        version === clearDerivedEntityFieldCopiesVersion,
    );

    if (databaseAlreadyExisted && pendingMigrations.length > 0 && !performsCleanup) {
      const backup = await createVerifiedBackup(
        native,
        directories.automaticBackups,
        'pre-migration',
      );
      await logger.info('Backup pré-migração criado.', { backupPath: backup.path });
    }

    if (performsCleanup) {
      // The rollback journal is transient; do not retain pre-clear pages in a WAL.
      if (native.pragma('journal_mode = DELETE', { simple: true }) !== 'delete')
        throw new Error('Não foi possível iniciar a limpeza exclusiva dos campos JSON.');
      native.pragma('secure_delete = ON');
      native.function('is_json_container_text', { deterministic: true }, isJsonContainerText);
      registerDerivedFieldCleanupFunctions(native);
      applyMigrations(native, pendingMigrations, true);
      native.pragma('journal_mode = WAL');
    } else {
      if (pendingMigrations.some(({ version }) => version === 31 || version === 32)) {
        await prepareStructuredValueSnapshots(native, [
          directories.automaticBackups,
          directories.manualBackups,
        ]);
      }
      applyMigrations(native, pendingMigrations);
    }
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
  database.function(
    'structured_json_to_rich_text',
    { deterministic: true },
    (source: string | null) => {
      if (source === null) return '<p>null</p>';
      return structuredJsonToRichText(source);
    },
  );
  database.pragma('foreign_keys = ON');
  database.pragma('journal_mode = WAL');
  database.pragma('synchronous = NORMAL');
  database.pragma('busy_timeout = 5000');
}

interface StructuredValueSnapshot {
  field_value_id: string;
  field_definition_id: string;
  entity_id: string;
  source_json: string;
  legacy_rich_text: string;
  lossless_rich_text: string;
  created_at: string;
  updated_at: string;
  revision: number;
}

interface StructuredValueCandidate {
  snapshot: StructuredValueSnapshot;
  campaign_id: string;
  origin: string;
  migration_version: number;
}

async function prepareStructuredValueSnapshots(
  database: Database.Database,
  backupDirectories: readonly string[],
): Promise<void> {
  createStructuredValueSnapshotStaging(database);
  if (readSchemaVersion(database) < 30) return;
  const migration30 = database
    .prepare('SELECT applied_at FROM schema_migrations WHERE version = 30')
    .get() as { applied_at: string } | undefined;
  if (migration30 === undefined)
    throw new Error(
      'O histórico da migração v30 está incompleto; não é possível validar os snapshots.',
    );

  const currentValues = new Map(
    (
      database
        .prepare(
          `
          SELECT v.id AS field_value_id, v.field_definition_id, v.entity_id,
            e.campaign_id, v.value_text, v.created_at, v.updated_at, v.revision
          FROM field_values v
          JOIN field_definitions f ON f.id = v.field_definition_id
          JOIN entities e ON e.id = v.entity_id
          WHERE f.data_type = 'rich_text' AND v.value_text IS NOT NULL
        `,
        )
        .all() as {
        field_value_id: string;
        field_definition_id: string;
        entity_id: string;
        campaign_id: string;
        value_text: string;
        created_at: string;
        updated_at: string;
        revision: number;
      }[]
    ).map((row) => [row.field_value_id, row]),
  );
  const requiredSnapshotIds = database
    .prepare(
      `
      SELECT v.id
      FROM field_values v
      JOIN field_definitions f ON f.id = v.field_definition_id
      WHERE f.data_type = 'rich_text'
        AND f.created_at <= ?
        AND v.created_at <= ?
        AND v.value_text IS NOT NULL
    `,
    )
    .all(migration30.applied_at, migration30.applied_at) as { id: string }[];

  const backupPaths: string[] = [];
  const candidates = new Map<string, StructuredValueCandidate[]>();
  const priorRichText = new Map<string, { prior: string; lossless: string }>();
  const hasSnapshotTable = database
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
    .get('structured_value_migration_snapshots');
  if (hasSnapshotTable !== undefined) {
    const storedSnapshots = database
      .prepare(
        `
        SELECT snapshot.field_value_id, snapshot.field_definition_id, value.entity_id,
          entity.campaign_id, snapshot.source_json, snapshot.prior_rich_text,
          snapshot.lossless_rich_text,
          value.created_at, value.updated_at, value.revision
        FROM structured_value_migration_snapshots snapshot
        JOIN field_values value ON value.id = snapshot.field_value_id
        JOIN entities entity ON entity.id = value.entity_id
      `,
      )
      .all() as (Omit<
      StructuredValueSnapshot,
      'legacy_rich_text' | 'lossless_rich_text' | 'source_json'
    > & {
      campaign_id: string;
      source_json: string | null;
      prior_rich_text: string | null;
      lossless_rich_text: string;
    })[];
    for (const row of storedSnapshots) {
      const current = currentValues.get(row.field_value_id);
      if (
        current?.field_definition_id !== row.field_definition_id ||
        current.entity_id !== row.entity_id ||
        current.campaign_id !== row.campaign_id
      )
        continue;
      if (row.prior_rich_text !== null)
        priorRichText.set(row.field_value_id, {
          prior: row.prior_rich_text,
          lossless: row.lossless_rich_text,
        });
      if (row.source_json === null) continue;
      const snapshot: StructuredValueSnapshot = {
        ...row,
        source_json: row.source_json,
        legacy_rich_text: legacyStructuredJsonToRichText(row.source_json),
        lossless_rich_text: structuredJsonToRichText(row.source_json),
      };
      addCandidate(candidates, {
        snapshot,
        campaign_id: row.campaign_id,
        origin: 'snapshot-v31',
        migration_version: 31,
      });
    }
  }
  for (const directory of backupDirectories) {
    let names: string[];
    try {
      names = await readdir(directory);
    } catch {
      continue;
    }
    backupPaths.push(
      ...names.filter((name) => name.endsWith('.db')).map((name) => path.join(directory, name)),
    );
  }

  for (const backupPath of backupPaths) {
    let backup: Database.Database | undefined;
    try {
      backup = new Database(backupPath, { readonly: true, fileMustExist: true });
      if (!hasStructuredValues(backup)) continue;
      const versionRow = backup
        .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
        .get() as { version: number };
      const rows = backup
        .prepare(
          `
          SELECT v.id AS field_value_id, v.field_definition_id, v.entity_id,
            c.id AS campaign_id, v.value_json AS source_json,
            v.created_at, v.updated_at, v.revision
          FROM field_values v
          JOIN field_definitions f ON f.id = v.field_definition_id
          JOIN entities e ON e.id = v.entity_id
          JOIN campaigns c ON c.id = e.campaign_id
          WHERE f.data_type = 'structured' AND v.value_json IS NOT NULL
        `,
        )
        .all() as (Omit<StructuredValueSnapshot, 'legacy_rich_text' | 'lossless_rich_text'> & {
        campaign_id: string;
      })[];
      for (const row of rows) {
        const current = currentValues.get(row.field_value_id);
        if (
          current?.field_definition_id !== row.field_definition_id ||
          current.entity_id !== row.entity_id ||
          current.campaign_id !== row.campaign_id
        )
          continue;
        const snapshot: StructuredValueSnapshot = {
          ...row,
          legacy_rich_text: legacyStructuredJsonToRichText(row.source_json),
          lossless_rich_text: structuredJsonToRichText(row.source_json),
        };
        addCandidate(candidates, {
          snapshot,
          campaign_id: row.campaign_id,
          origin: backupPath,
          migration_version: versionRow.version,
        });
      }
    } catch (reason) {
      throw new Error(
        `Não foi possível verificar o backup Rich Text “${path.basename(backupPath)}”: ${String(reason)}`,
        { cause: reason },
      );
    } finally {
      backup?.close();
    }
  }
  const snapshots = new Map<string, StructuredValueSnapshot>();
  for (const { id } of requiredSnapshotIds) {
    const current = currentValues.get(id);
    const available = candidates.get(id) ?? [];
    if (current === undefined || available.length === 0)
      throw new Error(
        'Não há backup pré-v30 correspondente para validar conteúdo Rich Text sem risco.',
      );
    const prior = priorRichText.get(id);
    const isPostSnapshotEdit =
      prior !== undefined &&
      !legacyRichTextSemanticallyEqual(current.value_text, prior.prior) &&
      !legacyRichTextSemanticallyEqual(current.value_text, prior.lossless);
    if (isPostSnapshotEdit) continue;
    const baseline = prior?.prior ?? current.value_text;
    const matching = available.filter((candidate) =>
      legacyRichTextSemanticallyEqual(candidate.snapshot.legacy_rich_text, baseline),
    );
    if (matching.length === 0) {
      // An existing pre-v30 backup proves this content differs from its source: preserve the edit.
      continue;
    }
    if (!matching.some((candidate) => candidate.migration_version < 30))
      throw new Error(
        'Não há backup original pré-v30 independente para validar a origem do conteúdo Rich Text.',
      );
    const distinctSources = new Set(available.map((candidate) => candidate.snapshot.source_json));
    if (distinctSources.size !== 1)
      throw new Error('Há backups conflitantes para recuperar um valor Rich Text sem perda.');
    const [selected] = matching;
    const snapshot = selected?.snapshot;
    if (snapshot === undefined)
      throw new Error('Não há backup pré-v30 correspondente para validar conteúdo Rich Text.');
    snapshots.set(id, { ...snapshot, legacy_rich_text: current.value_text });
  }

  const insert = database.prepare(`
    INSERT OR REPLACE INTO temp.structured_value_snapshot_v31 (
      field_value_id, field_definition_id, entity_id, source_json, legacy_rich_text,
      lossless_rich_text, created_at, updated_at, revision
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = database.transaction((rows: StructuredValueSnapshot[]) => {
    for (const row of rows) {
      insert.run(
        row.field_value_id,
        row.field_definition_id,
        row.entity_id,
        row.source_json,
        row.legacy_rich_text,
        row.lossless_rich_text,
        row.created_at,
        row.updated_at,
        row.revision,
      );
    }
  });
  insertMany([...snapshots.values()]);
}

function addCandidate(
  candidates: Map<string, StructuredValueCandidate[]>,
  candidate: StructuredValueCandidate,
): void {
  const { field_value_id } = candidate.snapshot;
  candidates.set(field_value_id, [...(candidates.get(field_value_id) ?? []), candidate]);
}

function hasStructuredValues(database: Database.Database): boolean {
  const hasRegistry = database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get();
  if (!hasRegistry) return false;
  const version = database
    .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
    .get() as { version: number };
  if (version.version >= 30) return false;
  return Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'field_values'")
      .get(),
  );
}

function createStructuredValueSnapshotStaging(database: Database.Database): void {
  database.exec(`
    CREATE TEMP TABLE structured_value_snapshot_v31 (
      field_value_id TEXT PRIMARY KEY NOT NULL,
      field_definition_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      source_json TEXT NOT NULL,
      legacy_rich_text TEXT NOT NULL,
      lossless_rich_text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      revision INTEGER NOT NULL
    );
  `);
}

function isJsonContainerText(text: unknown): number {
  if (typeof text !== 'string' || !/^[\t\n\r ]*[[{]/u.test(text)) return 0;
  try {
    // The opening token is an object or array; validate the entire original text.
    JSON.parse(text);
    return 1;
  } catch {
    return 0;
  }
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
    if (!definition || !matchesMigrationChecksum(definition, migration.checksum)) {
      throw new Error(`Checksum de migração inválido para a versão ${String(migration.version)}.`);
    }
  }

  const appliedVersions = new Set(applied.map((migration) => migration.version));
  return migrations.filter((migration) => !appliedVersions.has(migration.version));
}

function applyMigrations(
  database: Database.Database,
  pendingMigrations: readonly MigrationDefinition[],
  clearsEntityJson = false,
): void {
  const insertMigration = database.prepare(`
    INSERT INTO schema_migrations (version, name, checksum, applied_at)
    VALUES (?, ?, ?, ?)
  `);

  const specialIndex = pendingMigrations.findIndex(
    (migration) => migration.requiresForeignKeysDisabled === true,
  );
  const runBatch = (batch: readonly MigrationDefinition[], checkForeignKeys: boolean): void => {
    if (batch.length === 0) return;
    const emptySnapshotStaging =
      clearsEntityJson && batch.some(({ version }) => version === 31 || version === 32);
    const transaction = database.transaction(() => {
      if (emptySnapshotStaging) createStructuredValueSnapshotStaging(database);
      const clearMigration = clearsEntityJson
        ? batch.find(({ version }) => version === clearEntityJsonFieldValuesVersion)
        : undefined;
      const clearsDerived = batch.some(
        ({ version }) => version === clearDerivedEntityFieldCopiesVersion,
      );
      let clearedFieldValues = false;
      for (const migration of batch) {
        if (
          clearMigration &&
          migration.version >= 30 &&
          migration.version <= clearMigration.version
        ) {
          // Run the checksummed cleanup before any pending v30–32 can copy the values.
          if (!clearedFieldValues) {
            if (clearsDerived) stageDerivedFieldCleanup(database, true);
            database.exec(clearMigration.sql);
            clearedFieldValues = true;
          }
          if (migration === clearMigration) {
            database.exec('DELETE FROM structured_value_migration_snapshots');
          }
        }
        if (clearsEntityJson && migration.requiresLegacyAlterTable)
          database.pragma('legacy_alter_table = ON');
        try {
          if (migration.version === clearDerivedEntityFieldCopiesVersion) {
            if (!clearedFieldValues) stageDerivedFieldCleanup(database, false);
            applyDerivedFieldCleanup(database, migration.sql);
          } else if (migration !== clearMigration) database.exec(migration.sql);
        } finally {
          if (clearsEntityJson && migration.requiresLegacyAlterTable)
            database.pragma('legacy_alter_table = OFF');
        }
        insertMigration.run(
          migration.version,
          migration.name,
          migration.checksum,
          new Date().toISOString(),
        );
      }
      if (emptySnapshotStaging) database.exec('DROP TABLE temp.structured_value_snapshot_v31');
      if (checkForeignKeys) {
        const violations = database.pragma('foreign_key_check') as unknown[];
        if (violations.length > 0)
          throw new Error('A migração deixou referências estrangeiras inconsistentes.');
      }
    });
    if (clearsEntityJson) transaction.immediate();
    else transaction();
  };
  if (clearsEntityJson) {
    // Keep the pre-v30 deletion, all pending SQL and its registry writes atomic.
    if (specialIndex !== -1) database.pragma('foreign_keys = OFF');
    try {
      runBatch(pendingMigrations, true);
    } finally {
      if (specialIndex !== -1) database.pragma('foreign_keys = ON');
    }
    return;
  }
  if (specialIndex === -1) {
    runBatch(pendingMigrations, false);
    return;
  }

  runBatch(pendingMigrations.slice(0, specialIndex), false);
  database.pragma('foreign_keys = OFF');
  const legacyAlterTable = pendingMigrations[specialIndex]?.requiresLegacyAlterTable === true;
  if (legacyAlterTable) database.pragma('legacy_alter_table = ON');
  try {
    runBatch(pendingMigrations.slice(specialIndex), true);
  } finally {
    if (legacyAlterTable) database.pragma('legacy_alter_table = OFF');
    database.pragma('foreign_keys = ON');
  }
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
