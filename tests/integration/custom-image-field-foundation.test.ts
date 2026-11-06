import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
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
import { AttachmentRepository } from '../../src/db/repositories/attachment-repository';
import { TestLogger } from '../helpers/test-logger';

const temporaryRoots: string[] = [];
const contexts: DatabaseContext[] = [];

afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('fundação dos campos personalizados de imagem', () => {
  it('migra a versão 18 preservando definições e valores existentes', async () => {
    const root = await createTemporaryRoot();
    const directories = getDataDirectories(root);
    await ensureDataDirectories(directories);
    const databasePath = path.join(directories.database, 'app.db');
    const legacy = new Database(databasePath);
    legacy.pragma('foreign_keys = ON');
    applyThroughVersion(legacy, 18);

    const ids = seedCampaignStructure(legacy, 'Legado');
    const fieldId = randomUUID();
    const valueId = randomUUID();
    const now = timestamp();
    legacy
      .prepare(
        `INSERT INTO field_definitions (
          id, entity_type_id, key, label, description, help_text, example_text,
          help_article_id, data_type, required, searchable, secret_by_default,
          sort_order, is_archived, created_at, updated_at, revision
        ) VALUES (?, ?, 'pessoa-nome', 'Nome', 'Descrição', 'Ajuda', 'Aris',
                  'campos', 'short_text', 1, 1, 0, 0, 0, ?, ?, 3)`,
      )
      .run(fieldId, ids.entityTypeId, now, now);
    legacy
      .prepare(
        `INSERT INTO field_values (
          id, entity_id, field_definition_id, value_text, created_at, updated_at, revision
        ) VALUES (?, ?, ?, 'Aris', ?, ?, 2)`,
      )
      .run(valueId, ids.entityId, fieldId, now, now);
    legacy.close();

    const context = await openTestDatabase(directories);
    expect(context.schemaVersion).toBe(20);
    expect(
      context.native
        .prepare(
          `SELECT label, description, help_text, example_text, help_article_id, data_type,
                  required, searchable, revision
           FROM field_definitions WHERE id = ?`,
        )
        .get(fieldId),
    ).toEqual({
      label: 'Nome',
      description: 'Descrição',
      help_text: 'Ajuda',
      example_text: 'Aris',
      help_article_id: 'campos',
      data_type: 'short_text',
      required: 1,
      searchable: 1,
      revision: 3,
    });
    expect(
      context.native
        .prepare('SELECT value_text, revision FROM field_values WHERE id = ?')
        .get(valueId),
    ).toEqual({ value_text: 'Aris', revision: 2 });
    expect(
      context.native
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'index'
             AND name IN ('field_definitions_type_archived_sort_idx', 'field_values_entity_idx')
           ORDER BY name`,
        )
        .all(),
    ).toEqual([
      { name: 'field_definitions_type_archived_sort_idx' },
      { name: 'field_values_entity_idx' },
    ]);
    expect(
      context.native
        .prepare("PRAGMA foreign_key_list('field_values')")
        .all()
        .some(
          (row) =>
            (row as { table?: string; from?: string; to?: string }).table === 'field_definitions' &&
            (row as { from?: string }).from === 'field_definition_id' &&
            (row as { to?: string }).to === 'id',
        ),
    ).toBe(true);
    expect(context.native.pragma('foreign_key_check')).toEqual([]);
  });

  it('migra alt text legado para descricao contextual e passa a rejeitar valores ausentes', async () => {
    const root = await createTemporaryRoot();
    const directories = getDataDirectories(root);
    await ensureDataDirectories(directories);
    const databasePath = path.join(directories.database, 'app.db');
    const legacy = new Database(databasePath);
    legacy.pragma('foreign_keys = ON');
    applyThroughVersion(legacy, 19);
    const target = seedCampaignStructure(legacy, 'Legado');
    const fieldId = randomUUID();
    const attachmentId = randomUUID();
    const nullAttachmentId = randomUUID();
    const blankAttachmentId = randomUUID();
    const valueId = randomUUID();
    const now = timestamp();
    insertField(legacy, fieldId, target.entityTypeId, 'retrato', 'image', now);
    insertAttachment(legacy, attachmentId, target.campaignId, 'ready', now);
    insertAttachment(legacy, nullAttachmentId, target.campaignId, 'ready', now);
    insertAttachment(legacy, blankAttachmentId, target.campaignId, 'ready', now);
    legacy
      .prepare(
        `INSERT INTO image_field_values (
          id, entity_id, field_definition_id, attachment_id, caption, alt_text,
          sort_order, created_at, updated_at, revision
        ) VALUES (?, ?, ?, ?, NULL, NULL, 0, ?, ?, 7)`,
      )
      .run(valueId, target.entityId, fieldId, attachmentId, now, now);
    legacy.close();

    const context = await openTestDatabase(directories);
    expect(context.schemaVersion).toBe(20);
    expect(
      context.native
        .prepare('SELECT id, alt_text, revision FROM image_field_values WHERE id = ?')
        .get(valueId),
    ).toEqual({
      id: valueId,
      alt_text: 'Imagem de Legado pessoa no campo retrato',
      revision: 7,
    });
    const insert = context.native.prepare(
      `INSERT INTO image_field_values (
        id, entity_id, field_definition_id, attachment_id, caption, alt_text,
        sort_order, created_at, updated_at, revision
      ) VALUES (?, ?, ?, ?, NULL, ?, 1, ?, ?, 1)`,
    );
    expect(() =>
      insert.run(randomUUID(), target.entityId, fieldId, nullAttachmentId, null, now, now),
    ).toThrow();
    expect(() =>
      insert.run(randomUUID(), target.entityId, fieldId, blankAttachmentId, '   ', now, now),
    ).toThrow();
    expect(context.native.pragma('foreign_key_check')).toEqual([]);
  });

  it('impõe tipo, campanha, prontidão e proteção do anexo no banco', async () => {
    const root = await createTemporaryRoot();
    const directories = getDataDirectories(root);
    await ensureDataDirectories(directories);
    const context = await openTestDatabase(directories);
    const first = seedCampaignStructure(context.native, 'Primeira');
    const second = seedCampaignStructure(context.native, 'Segunda');
    const secondTypeInFirstCampaign = randomUUID();
    const now = timestamp();
    insertEntityType(
      context.native,
      secondTypeInFirstCampaign,
      first.campaignId,
      'Objetos',
      'Objeto',
      'objetos',
      now,
    );

    const imageFieldId = randomUUID();
    const textFieldId = randomUUID();
    const foreignTypeImageFieldId = randomUUID();
    insertField(context.native, imageFieldId, first.entityTypeId, 'retrato', 'image', now);
    insertField(context.native, textFieldId, first.entityTypeId, 'apelido', 'short_text', now);
    insertField(
      context.native,
      foreignTypeImageFieldId,
      secondTypeInFirstCampaign,
      'mapa',
      'image',
      now,
    );

    const readyAttachmentId = randomUUID();
    const failedAttachmentId = randomUUID();
    const foreignAttachmentId = randomUUID();
    insertAttachment(context.native, readyAttachmentId, first.campaignId, 'ready', now);
    insertAttachment(context.native, failedAttachmentId, first.campaignId, 'failed', now);
    insertAttachment(context.native, foreignAttachmentId, second.campaignId, 'ready', now);

    const insertImageValue = context.native.prepare(
      `INSERT INTO image_field_values (
        id, entity_id, field_definition_id, attachment_id, caption, alt_text,
        sort_order, created_at, updated_at, revision
      ) VALUES (?, ?, ?, ?, 'Retrato', 'Pessoa diante de uma ponte', 0, ?, ?, 1)`,
    );
    const imageValueId = randomUUID();
    insertImageValue.run(imageValueId, first.entityId, imageFieldId, readyAttachmentId, now, now);

    for (const [fieldId, attachmentId] of [
      [textFieldId, readyAttachmentId],
      [foreignTypeImageFieldId, readyAttachmentId],
      [imageFieldId, failedAttachmentId],
      [imageFieldId, foreignAttachmentId],
    ]) {
      expect(() =>
        insertImageValue.run(randomUUID(), first.entityId, fieldId, attachmentId, now, now),
      ).toThrow(/image field value must match/u);
    }

    expect(() =>
      context.native
        .prepare(
          `INSERT INTO field_values (
            id, entity_id, field_definition_id, value_text, created_at, updated_at, revision
          ) VALUES (?, ?, ?, 'inválido', ?, ?, 1)`,
        )
        .run(randomUUID(), first.entityId, imageFieldId, now, now),
    ).toThrow(/image fields must use image_field_values/u);
    expect(() =>
      context.native
        .prepare("UPDATE attachments SET processing_status = 'failed' WHERE id = ?")
        .run(readyAttachmentId),
    ).toThrow(/referenced attachment must remain ready/u);
    expect(() =>
      context.native
        .prepare("UPDATE field_definitions SET data_type = 'short_text' WHERE id = ?")
        .run(imageFieldId),
    ).toThrow(/field type is incompatible/u);
    expect(() =>
      context.native
        .prepare('UPDATE entities SET entity_type_id = ? WHERE id = ?')
        .run(secondTypeInFirstCampaign, first.entityId),
    ).toThrow(/entity type is incompatible/u);

    const attachments = new AttachmentRepository(context.native);
    expect(() =>
      attachments.prepareAttachmentDeletion({
        campaignId: first.campaignId,
        attachmentId: readyAttachmentId,
        revision: 1,
      }),
    ).toThrow(/não pode ser excluído enquanto estiver em uso/u);
    expect(context.native.pragma('foreign_key_check')).toEqual([]);
  });

  it('rejeita configurações incompatíveis de campos de imagem no banco', async () => {
    const root = await createTemporaryRoot();
    const directories = getDataDirectories(root);
    await ensureDataDirectories(directories);
    const context = await openTestDatabase(directories);
    const { entityTypeId } = seedCampaignStructure(context.native, 'Configuração');
    const now = timestamp();
    const insert = context.native.prepare(
      `INSERT INTO field_definitions (
        id, entity_type_id, key, label, data_type, required, searchable,
        default_value_json, sort_order, is_archived, created_at, updated_at, revision
      ) VALUES (?, ?, ?, 'Imagem', 'image', ?, ?, ?, 0, 0, ?, ?, 1)`,
    );

    insert.run(randomUUID(), entityTypeId, 'imagem', 0, 0, null, now, now);
    expect(() =>
      insert.run(randomUUID(), entityTypeId, 'imagem-obrigatoria', 1, 0, null, now, now),
    ).toThrow();
    expect(() =>
      insert.run(randomUUID(), entityTypeId, 'imagem-pesquisavel', 0, 1, null, now, now),
    ).toThrow();
    expect(() =>
      insert.run(randomUUID(), entityTypeId, 'imagem-padrao', 0, 0, '"valor"', now, now),
    ).toThrow();
  });
});

function applyThroughVersion(database: Database.Database, maximumVersion: number): void {
  database.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
  const insert = database.prepare(
    'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
  );
  for (const migration of migrations.filter(({ version }) => version <= maximumVersion)) {
    database.exec(migration.sql);
    insert.run(migration.version, migration.name, migration.checksum, timestamp());
  }
}

function seedCampaignStructure(
  database: Database.Database,
  name: string,
): { campaignId: string; entityTypeId: string; entityId: string } {
  const campaignId = randomUUID();
  const entityTypeId = randomUUID();
  const entityId = randomUUID();
  const now = timestamp();
  database
    .prepare('INSERT INTO campaigns (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(campaignId, name, now, now);
  insertEntityType(
    database,
    entityTypeId,
    campaignId,
    'Pessoas',
    'Pessoa',
    `pessoas-${campaignId.slice(0, 8)}`,
    now,
  );
  database
    .prepare(
      `INSERT INTO entities (
        id, campaign_id, entity_type_id, name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(entityId, campaignId, entityTypeId, `${name} pessoa`, now, now);
  return { campaignId, entityTypeId, entityId };
}

function insertEntityType(
  database: Database.Database,
  id: string,
  campaignId: string,
  name: string,
  singularName: string,
  slug: string,
  now: string,
): void {
  database
    .prepare(
      `INSERT INTO entity_types (
        id, campaign_id, name, singular_name, slug, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, campaignId, name, singularName, slug, now, now);
}

function insertField(
  database: Database.Database,
  id: string,
  entityTypeId: string,
  key: string,
  dataType: 'image' | 'short_text',
  now: string,
): void {
  database
    .prepare(
      `INSERT INTO field_definitions (
        id, entity_type_id, key, label, data_type, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, entityTypeId, key, key, dataType, now, now);
}

function insertAttachment(
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
      id.replaceAll('-', '').padEnd(64, '0').slice(0, 64),
      `${campaignId}/${id}-thumb.webp`,
      processingStatus,
      now,
      now,
    );
}

async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rpg-custom-image-fields-'));
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
