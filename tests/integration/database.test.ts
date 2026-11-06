import { randomUUID } from 'node:crypto';
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
import { migrations } from '../../src/db/migrations/registry';
import { PhaseZeroRepository } from '../../src/db/repositories/phase-zero-repository';
import { TestLogger } from '../helpers/test-logger';

const temporaryRoots: string[] = [];
const contexts: DatabaseContext[] = [];
const latestSchemaVersion = migrations.at(-1)?.version;

if (latestSchemaVersion === undefined) throw new Error('Registro de migrações vazio.');

afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((temporaryRoot) =>
        rm(temporaryRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
      ),
  );
});

describe('SQLite embutido', () => {
  it('aplica migração, PRAGMAs e disponibiliza FTS5', async () => {
    const root = await createTemporaryRoot();
    const directories = getDataDirectories(root);
    await ensureDataDirectories(directories);
    const context = await openTestDatabase(directories);

    expect(context.schemaVersion).toBe(latestSchemaVersion);
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
    const firstContext = await openTestDatabase(directories);
    const expected = { value: 'persistente', savedAt: new Date().toISOString() };
    new PhaseZeroRepository(firstContext.orm).write(expected);
    firstContext.close();

    const secondContext = await openTestDatabase(directories);
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

    const context = await openTestDatabase(directories);
    expect(context.schemaVersion).toBe(latestSchemaVersion);
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

  it('aceita o checksum histórico da versão 9 e aplica as migrações posteriores', async () => {
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
    const historicalVersionNineChecksum =
      '98b4b72f7029aaaba84433f0fe5cb2bdbadd00004098df35e5f5a8e7ed121f53';

    for (const migration of migrations.filter(({ version }) => version <= 9)) {
      legacyDatabase.exec(migration.sql);
      insertMigration.run(
        migration.version,
        migration.name,
        migration.version === 9 ? historicalVersionNineChecksum : migration.checksum,
        timestamp(),
      );
    }
    legacyDatabase.close();

    const context = await openTestDatabase(directories);
    expect(context.schemaVersion).toBe(latestSchemaVersion);
    expect(
      context.native.prepare('SELECT checksum FROM schema_migrations WHERE version = 9').get(),
    ).toEqual({ checksum: historicalVersionNineChecksum });
    expect(
      context.native
        .prepare(
          'SELECT version, checksum FROM schema_migrations WHERE version >= 10 ORDER BY version',
        )
        .all(),
    ).toEqual(
      migrations
        .filter(({ version }) => version >= 10)
        .map(({ version, checksum }) => ({ version, checksum })),
    );
    context.close();
    expect(
      (await readdir(directories.automaticBackups)).filter((name) => name.endsWith('.db')),
    ).toHaveLength(1);
  });

  it('adiciona ajuda contextual a um banco na versão 15 preservando campos existentes', async () => {
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
    for (const migration of migrations.filter(({ version }) => version <= 15)) {
      legacyDatabase.exec(migration.sql);
      insertMigration.run(migration.version, migration.name, migration.checksum, timestamp());
    }
    const campaignId = randomUUID();
    const entityTypeId = randomUUID();
    const fieldId = randomUUID();
    const now = timestamp();
    legacyDatabase
      .prepare('INSERT INTO campaigns (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(campaignId, 'Campanha preservada', now, now);
    legacyDatabase
      .prepare(
        `INSERT INTO entity_types (
          id, campaign_id, name, singular_name, slug, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(entityTypeId, campaignId, 'Personagens', 'Personagem', 'personagens', now, now);
    legacyDatabase
      .prepare(
        `INSERT INTO field_definitions (
          id, entity_type_id, key, label, data_type, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(fieldId, entityTypeId, 'personagem-nome', 'Nome', 'short_text', now, now);
    legacyDatabase.close();

    const context = await openTestDatabase(directories);
    expect(context.schemaVersion).toBe(latestSchemaVersion);
    expect(
      context.native
        .prepare(
          `SELECT label, help_text, example_text, help_article_id
           FROM field_definitions WHERE id = ?`,
        )
        .get(fieldId),
    ).toEqual({
      label: 'Nome',
      help_text: null,
      example_text: null,
      help_article_id: null,
    });
    context.close();
  });

  it('adiciona anexos de capa a um banco na versão 16 sem expor ou perder a referência legada', async () => {
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
    for (const migration of migrations.filter(({ version }) => version <= 16)) {
      legacyDatabase.exec(migration.sql);
      insertMigration.run(migration.version, migration.name, migration.checksum, timestamp());
    }
    const campaignId = randomUUID();
    const now = timestamp();
    legacyDatabase
      .prepare(
        `INSERT INTO campaigns (id, name, image_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(campaignId, 'Campanha preservada', 'C:\\legado\\capa.png', now, now);
    legacyDatabase.close();

    const context = await openTestDatabase(directories);
    expect(context.schemaVersion).toBe(latestSchemaVersion);
    expect(
      context.native
        .prepare('SELECT image_path, cover_attachment_id FROM campaigns WHERE id = ?')
        .get(campaignId),
    ).toEqual({ image_path: 'C:\\legado\\capa.png', cover_attachment_id: null });
    expect(
      context.native
        .prepare(
          "SELECT count(*) AS total FROM sqlite_master WHERE type = 'table' AND name = 'attachments'",
        )
        .get(),
    ).toEqual({ total: 1 });
    context.close();
  });

  it('migra v17 para v18 preservando entidades e substituindo guards de anexos', async () => {
    const root = await createTemporaryRoot();
    const directories = getDataDirectories(root);
    await ensureDataDirectories(directories);
    const databasePath = path.join(directories.database, 'app.db');
    const legacy = new Database(databasePath);
    legacy.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);
    const recordMigration = legacy.prepare(
      'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
    );
    for (const migration of migrations.filter(({ version }) => version <= 17)) {
      legacy.exec(migration.sql);
      recordMigration.run(migration.version, migration.name, migration.checksum, timestamp());
    }
    const now = timestamp();
    const firstCampaign = randomUUID();
    const secondCampaign = randomUUID();
    const firstType = randomUUID();
    const secondType = randomUUID();
    const firstEntity = randomUUID();
    const secondEntity = randomUUID();
    const coverAttachment = randomUUID();
    for (const [campaignId, name] of [
      [firstCampaign, 'Primeira'],
      [secondCampaign, 'Segunda'],
    ]) {
      legacy
        .prepare('INSERT INTO campaigns (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run(campaignId, name, now, now);
    }
    for (const [typeId, campaignId, slug] of [
      [firstType, firstCampaign, 'pessoas-primeira'],
      [secondType, secondCampaign, 'pessoas-segunda'],
    ]) {
      legacy
        .prepare(
          `INSERT INTO entity_types
           (id, campaign_id, name, singular_name, slug, created_at, updated_at)
           VALUES (?, ?, 'Pessoas', 'Pessoa', ?, ?, ?)`,
        )
        .run(typeId, campaignId, slug, now, now);
    }
    for (const [entityId, campaignId, typeId, name] of [
      [firstEntity, firstCampaign, firstType, 'Gorel'],
      [secondEntity, secondCampaign, secondType, 'Skel'],
    ]) {
      legacy
        .prepare(
          `INSERT INTO entities
           (id, campaign_id, entity_type_id, name, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(entityId, campaignId, typeId, name, now, now);
    }
    insertMigrationAttachment(legacy, coverAttachment, firstCampaign, 'ready', now);
    legacy
      .prepare('UPDATE campaigns SET cover_attachment_id = ? WHERE id = ?')
      .run(coverAttachment, firstCampaign);
    legacy.close();

    const context = await openTestDatabase(directories);
    expect(context.schemaVersion).toBe(18);
    expect(
      context.native
        .prepare('SELECT name, reference_image_attachment_id FROM entities WHERE id = ?')
        .get(firstEntity),
    ).toEqual({ name: 'Gorel', reference_image_attachment_id: null });
    expect(
      context.native
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'trigger' AND name IN (
             'attachments_ready_cover_guard', 'attachments_ready_reference_guard'
           ) ORDER BY name`,
        )
        .all(),
    ).toEqual([{ name: 'attachments_ready_reference_guard' }]);

    expect(() =>
      context.native
        .prepare("UPDATE attachments SET processing_status = 'failed' WHERE id = ?")
        .run(coverAttachment),
    ).toThrow(/referenced attachment must remain ready/u);

    const foreignReady = randomUUID();
    insertMigrationAttachment(context.native, foreignReady, firstCampaign, 'ready', now);
    expect(() =>
      context.native
        .prepare('UPDATE entities SET reference_image_attachment_id = ? WHERE id = ?')
        .run(foreignReady, secondEntity),
    ).toThrow(/must be ready and belong to the campaign/u);

    const failedAttachment = randomUUID();
    insertMigrationAttachment(context.native, failedAttachment, firstCampaign, 'failed', now);
    expect(() =>
      context.native
        .prepare('UPDATE entities SET reference_image_attachment_id = ? WHERE id = ?')
        .run(failedAttachment, firstEntity),
    ).toThrow(/must be ready and belong to the campaign/u);

    const referenceAttachment = randomUUID();
    insertMigrationAttachment(context.native, referenceAttachment, firstCampaign, 'ready', now);
    context.native
      .prepare('UPDATE entities SET reference_image_attachment_id = ? WHERE id = ?')
      .run(referenceAttachment, firstEntity);
    expect(() =>
      context.native
        .prepare("UPDATE attachments SET processing_status = 'failed' WHERE id = ?")
        .run(referenceAttachment),
    ).toThrow(/referenced attachment must remain ready/u);
    context.close();
  });

  it('continua rejeitando um checksum desconhecido de migração aplicada', async () => {
    const root = await createTemporaryRoot();
    const directories = getDataDirectories(root);
    await ensureDataDirectories(directories);
    const context = await openTestDatabase(directories);
    context.close();

    const native = new Database(path.join(directories.database, 'app.db'));
    native
      .prepare('UPDATE schema_migrations SET checksum = ? WHERE version = 9')
      .run('0'.repeat(64));
    native.close();

    await expect(openApplicationDatabase(directories, new TestLogger())).rejects.toThrow(
      'Checksum de migração inválido para a versão 9.',
    );
  });

  it('cria e persiste uma campanha somente com os campos obrigatórios', async () => {
    const root = await createTemporaryRoot();
    const directories = getDataDirectories(root);
    await ensureDataDirectories(directories);
    const firstContext = await openTestDatabase(directories);
    const id = randomUUID();
    const timestamp = new Date().toISOString();

    firstContext.native
      .prepare(
        `INSERT INTO campaigns (id, name, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(id, 'Ethéria', timestamp, timestamp);
    firstContext.close();

    const secondContext = await openTestDatabase(directories);
    const campaign = secondContext.native
      .prepare(
        `SELECT id, name, system_name, concept, genre, tone, summary, image_path,
                cover_attachment_id,
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
      cover_attachment_id: null,
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
    const context = await openTestDatabase(directories);
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

    const context = await openTestDatabase(directories);
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

async function openTestDatabase(directories: DataDirectories): Promise<DatabaseContext> {
  const context = await openApplicationDatabase(directories, new TestLogger());
  contexts.push(context);
  return context;
}

function timestamp(): string {
  return new Date().toISOString();
}

function insertMigrationAttachment(
  database: Database.Database,
  id: string,
  campaignId: string,
  processingStatus: 'ready' | 'failed',
  now: string,
): void {
  database
    .prepare(
      `INSERT INTO attachments (
        id, campaign_id, original_filename, stored_filename, relative_path, mime_type,
        file_size, checksum_sha256, visibility, width, height, thumbnail_relative_path,
        source_kind, source_url, processed_mime_type, processing_status,
        created_at, updated_at, revision
      ) VALUES (?, ?, 'imagem.png', ?, ?, 'image/png', 128, ?, 'gm', 320, 240, ?,
                'file', NULL, 'image/webp', ?, ?, ?, 1)`,
    )
    .run(
      id,
      campaignId,
      `${id}.webp`,
      `${campaignId}/${id}.webp`,
      'a'.repeat(64),
      `${campaignId}/${id}-thumb.webp`,
      processingStatus,
      now,
      now,
    );
}
