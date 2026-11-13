import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { campaignStatuses } from '../../core/contracts/campaigns';
import {
  canonStates,
  eventEntityRoles,
  inboxStatuses,
  knowledgeStates,
  noteTypes,
  originKinds,
  sessionIntentionStatuses,
  sessionParticipantRoles,
  sessionStatuses,
  visibilityStates,
} from '../../core/contracts/narrative';
import {
  fieldDataTypes,
  fieldSemanticRoles,
  referenceDeleteBehaviors,
  referenceDirections,
} from '../../core/contracts/field-definitions';
import {
  attachmentMimeTypes,
  attachmentProcessingStatuses,
  attachmentSourceKinds,
} from '../../core/contracts/attachments';
import {
  relationshipViewTypes,
  type RelationshipViewport,
} from '../../core/contracts/relationship-views';
import {
  campaignSignalGeneratorKinds,
  campaignSignalSeverities,
  campaignSignalStatuses,
  campaignSignalTypes,
  signalEvidenceObjectTypes,
} from '../../core/contracts/campaign-signals';

export const schemaMigrations = sqliteTable('schema_migrations', {
  version: integer('version').primaryKey(),
  name: text('name').notNull(),
  checksum: text('checksum').notNull(),
  appliedAt: text('applied_at').notNull(),
});

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  revision: integer('revision').notNull().default(1),
});

export const phaseZeroTest = sqliteTable('phase_zero_test', {
  id: integer('id').primaryKey(),
  value: text('value').notNull(),
  savedAt: text('saved_at').notNull(),
});

export const campaigns = sqliteTable(
  'campaigns',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    systemName: text('system_name'),
    concept: text('concept'),
    genre: text('genre'),
    tone: text('tone'),
    summary: text('summary'),
    imagePath: text('image_path'),
    coverAttachmentId: text('cover_attachment_id').references(
      (): AnySQLiteColumn => attachments.id,
      { onDelete: 'restrict' },
    ),
    status: text('status', { enum: campaignStatuses }).notNull().default('active'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    archivedAt: text('archived_at'),
    revision: integer('revision').notNull().default(1),
  },
  (table) => [
    check(
      'campaigns_id_uuid',
      sql`length(${table.id}) = 36
        AND substr(${table.id}, 9, 1) = '-'
        AND substr(${table.id}, 14, 1) = '-'
        AND substr(${table.id}, 19, 1) = '-'
        AND substr(${table.id}, 24, 1) = '-'
        AND ${table.id} = lower(${table.id})
        AND replace(${table.id}, '-', '') NOT GLOB '*[^0-9a-f]*'`,
    ),
    check('campaigns_name_not_blank', sql`length(trim(${table.name})) > 0`),
    check('campaigns_status_valid', sql`${table.status} IN ('active', 'archived', 'deleted')`),
    check('campaigns_created_at_not_blank', sql`length(${table.createdAt}) > 0`),
    check('campaigns_updated_at_not_blank', sql`length(${table.updatedAt}) > 0`),
    check('campaigns_revision_positive', sql`${table.revision} > 0`),
    index('campaigns_status_updated_at_idx').on(
      table.status,
      sql`${table.updatedAt} DESC`,
      sql`${table.id} DESC`,
    ),
  ],
);

export const attachments = sqliteTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    originalFilename: text('original_filename').notNull(),
    storedFilename: text('stored_filename').notNull(),
    relativePath: text('relative_path').notNull(),
    mimeType: text('mime_type', { enum: attachmentMimeTypes }).notNull(),
    fileSize: integer('file_size').notNull(),
    checksumSha256: text('checksum_sha256').notNull(),
    visibility: text('visibility', { enum: visibilityStates }).notNull().default('gm'),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    thumbnailRelativePath: text('thumbnail_relative_path').notNull(),
    sourceKind: text('source_kind', { enum: attachmentSourceKinds }).notNull(),
    sourceUrl: text('source_url'),
    processedMimeType: text('processed_mime_type', { enum: attachmentMimeTypes }).notNull(),
    processingStatus: text('processing_status', { enum: attachmentProcessingStatuses }).notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    revision: integer('revision').notNull().default(1),
  },
  (table) => [
    check(
      'attachments_id_uuid',
      sql`length(${table.id}) = 36
        AND substr(${table.id}, 9, 1) = '-'
        AND substr(${table.id}, 14, 1) = '-'
        AND substr(${table.id}, 19, 1) = '-'
        AND substr(${table.id}, 24, 1) = '-'
        AND ${table.id} = lower(${table.id})
        AND replace(${table.id}, '-', '') NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      'attachments_original_filename_valid',
      sql`length(trim(${table.originalFilename})) BETWEEN 1 AND 255`,
    ),
    check(
      'attachments_stored_filename_valid',
      sql`length(${table.storedFilename}) BETWEEN 1 AND 255
        AND ${table.storedFilename} = lower(${table.storedFilename})
        AND substr(${table.storedFilename}, 1, 1) GLOB '[a-z0-9]'
        AND substr(${table.storedFilename}, -1, 1) GLOB '[a-z0-9]'
        AND ${table.storedFilename} NOT GLOB '*[^a-z0-9._-]*'
        AND ${table.storedFilename} NOT IN ('.', '..')`,
    ),
    check(
      'attachments_relative_path_valid',
      sql`length(${table.relativePath}) BETWEEN 1 AND 1000
        AND ${table.relativePath} = lower(${table.relativePath})
        AND substr(${table.relativePath}, 1, 1) GLOB '[a-z0-9]'
        AND substr(${table.relativePath}, -1, 1) GLOB '[a-z0-9]'
        AND ${table.relativePath} NOT GLOB '*[^a-z0-9._/-]*'
        AND instr(${table.relativePath}, '//') = 0
        AND ${table.relativePath} NOT LIKE './%'
        AND ${table.relativePath} NOT LIKE '../%'
        AND ${table.relativePath} NOT LIKE '%/./%'
        AND ${table.relativePath} NOT LIKE '%/../%'
        AND ${table.relativePath} NOT LIKE '%/.'
        AND ${table.relativePath} NOT LIKE '%/..'`,
    ),
    check(
      'attachments_mime_type_valid',
      sql`${table.mimeType} IN ('image/png', 'image/jpeg', 'image/webp')`,
    ),
    check('attachments_file_size_valid', sql`${table.fileSize} BETWEEN 1 AND 10485760`),
    check(
      'attachments_checksum_valid',
      sql`length(${table.checksumSha256}) = 64
        AND ${table.checksumSha256} = lower(${table.checksumSha256})
        AND ${table.checksumSha256} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check('attachments_visibility_valid', sql`${table.visibility} IN ('gm', 'players', 'public')`),
    check('attachments_width_valid', sql`${table.width} BETWEEN 1 AND 1280`),
    check('attachments_height_valid', sql`${table.height} BETWEEN 1 AND 1024`),
    check(
      'attachments_thumbnail_path_valid',
      sql`length(${table.thumbnailRelativePath}) BETWEEN 1 AND 1000
        AND ${table.thumbnailRelativePath} = lower(${table.thumbnailRelativePath})
        AND substr(${table.thumbnailRelativePath}, 1, 1) GLOB '[a-z0-9]'
        AND substr(${table.thumbnailRelativePath}, -1, 1) GLOB '[a-z0-9]'
        AND ${table.thumbnailRelativePath} NOT GLOB '*[^a-z0-9._/-]*'
        AND instr(${table.thumbnailRelativePath}, '//') = 0
        AND ${table.thumbnailRelativePath} NOT LIKE './%'
        AND ${table.thumbnailRelativePath} NOT LIKE '../%'
        AND ${table.thumbnailRelativePath} NOT LIKE '%/./%'
        AND ${table.thumbnailRelativePath} NOT LIKE '%/../%'
        AND ${table.thumbnailRelativePath} NOT LIKE '%/.'
        AND ${table.thumbnailRelativePath} NOT LIKE '%/..'
        AND ${table.thumbnailRelativePath} <> ${table.relativePath}`,
    ),
    check(
      'attachments_source_kind_valid',
      sql`${table.sourceKind} IN ('file', 'url', 'clipboard', 'drag_drop')`,
    ),
    check(
      'attachments_source_url_valid',
      sql`${table.sourceUrl} IS NULL OR length(trim(${table.sourceUrl})) BETWEEN 1 AND 2048`,
    ),
    check(
      'attachments_source_url_coherent',
      sql`(${table.sourceKind} = 'url' AND ${table.sourceUrl} IS NOT NULL)
        OR (${table.sourceKind} <> 'url' AND ${table.sourceUrl} IS NULL)`,
    ),
    check(
      'attachments_processed_mime_type_valid',
      sql`${table.processedMimeType} IN ('image/png', 'image/jpeg', 'image/webp')`,
    ),
    check(
      'attachments_processing_status_valid',
      sql`${table.processingStatus} IN ('pending', 'ready', 'failed')`,
    ),
    check('attachments_created_at_not_blank', sql`length(${table.createdAt}) > 0`),
    check('attachments_updated_at_not_blank', sql`length(${table.updatedAt}) > 0`),
    check('attachments_revision_positive', sql`${table.revision} > 0`),
    uniqueIndex('attachments_stored_filename_unique').on(table.storedFilename),
    uniqueIndex('attachments_relative_path_unique').on(table.relativePath),
    uniqueIndex('attachments_thumbnail_path_unique').on(table.thumbnailRelativePath),
    index('attachments_campaign_status_created_idx').on(
      table.campaignId,
      table.processingStatus,
      sql`${table.createdAt} DESC`,
      sql`${table.id} DESC`,
    ),
    index('attachments_campaign_checksum_idx').on(table.campaignId, table.checksumSha256),
  ],
);

export const entityTypes = sqliteTable(
  'entity_types',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    packId: text('pack_id'),
    name: text('name').notNull(),
    singularName: text('singular_name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    icon: text('icon'),
    color: text('color'),
    sortOrder: integer('sort_order').notNull().default(0),
    isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    revision: integer('revision').notNull().default(1),
  },
  (table) => [
    check(
      'entity_types_id_uuid',
      sql`length(${table.id}) = 36
        AND substr(${table.id}, 9, 1) = '-'
        AND substr(${table.id}, 14, 1) = '-'
        AND substr(${table.id}, 19, 1) = '-'
        AND substr(${table.id}, 24, 1) = '-'
        AND ${table.id} = lower(${table.id})
        AND replace(${table.id}, '-', '') NOT GLOB '*[^0-9a-f]*'`,
    ),
    check('entity_types_name_valid', sql`length(trim(${table.name})) BETWEEN 1 AND 120`),
    check(
      'entity_types_singular_name_valid',
      sql`length(trim(${table.singularName})) BETWEEN 1 AND 120`,
    ),
    check(
      'entity_types_slug_valid',
      sql`length(${table.slug}) BETWEEN 1 AND 100
        AND ${table.slug} = lower(${table.slug})
        AND ${table.slug} NOT GLOB '*[^a-z0-9-]*'
        AND substr(${table.slug}, 1, 1) <> '-'
        AND substr(${table.slug}, -1, 1) <> '-'
        AND instr(${table.slug}, '--') = 0`,
    ),
    check(
      'entity_types_description_length',
      sql`${table.description} IS NULL OR length(${table.description}) <= 2000`,
    ),
    check('entity_types_icon_length', sql`${table.icon} IS NULL OR length(${table.icon}) <= 120`),
    check('entity_types_color_length', sql`${table.color} IS NULL OR length(${table.color}) <= 64`),
    check('entity_types_sort_order_nonnegative', sql`${table.sortOrder} >= 0`),
    check('entity_types_created_at_not_blank', sql`length(${table.createdAt}) > 0`),
    check('entity_types_updated_at_not_blank', sql`length(${table.updatedAt}) > 0`),
    check('entity_types_revision_positive', sql`${table.revision} > 0`),
    uniqueIndex('entity_types_campaign_slug_unique').on(table.campaignId, table.slug),
    index('entity_types_campaign_archived_sort_idx').on(
      table.campaignId,
      table.isArchived,
      table.sortOrder,
      table.name,
      table.id,
    ),
  ],
);

export const fieldDefinitions = sqliteTable(
  'field_definitions',
  {
    id: text('id').primaryKey(),
    entityTypeId: text('entity_type_id')
      .notNull()
      .references(() => entityTypes.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    label: text('label').notNull(),
    description: text('description'),
    helpText: text('help_text'),
    exampleText: text('example_text'),
    helpArticleId: text('help_article_id'),
    dataType: text('data_type', { enum: fieldDataTypes }).notNull(),
    semanticRole: text('semantic_role', { enum: fieldSemanticRoles }),
    required: integer('required', { mode: 'boolean' }).notNull().default(false),
    searchable: integer('searchable', { mode: 'boolean' }).notNull().default(false),
    secretByDefault: integer('secret_by_default', { mode: 'boolean' }).notNull().default(false),
    defaultValue: text('default_value_json', { mode: 'json' }).$type<unknown>(),
    options: text('options_json', { mode: 'json' }).$type<unknown>(),
    validation: text('validation_json', { mode: 'json' }).$type<unknown>(),
    referenceRelationshipTypeId: text('reference_relationship_type_id'),
    referenceDirection: text('reference_direction', { enum: referenceDirections }),
    allowedTargetTypeIds: text('allowed_target_type_ids_json', { mode: 'json' }).$type<string[]>(),
    onDeleteBehavior: text('on_delete_behavior', { enum: referenceDeleteBehaviors }),
    sortOrder: integer('sort_order').notNull().default(0),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    revision: integer('revision').notNull().default(1),
  },
  (table) => [
    check(
      'field_definitions_id_uuid',
      sql`length(${table.id}) = 36
        AND substr(${table.id}, 9, 1) = '-'
        AND substr(${table.id}, 14, 1) = '-'
        AND substr(${table.id}, 19, 1) = '-'
        AND substr(${table.id}, 24, 1) = '-'
        AND ${table.id} = lower(${table.id})
        AND replace(${table.id}, '-', '') NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      'field_definitions_key_valid',
      sql`length(${table.key}) BETWEEN 1 AND 100
        AND ${table.key} = lower(${table.key})
        AND ${table.key} NOT GLOB '*[^a-z0-9-]*'
        AND substr(${table.key}, 1, 1) <> '-'
        AND substr(${table.key}, -1, 1) <> '-'
        AND instr(${table.key}, '--') = 0`,
    ),
    check('field_definitions_label_valid', sql`length(trim(${table.label})) BETWEEN 1 AND 120`),
    check(
      'field_definitions_description_length',
      sql`${table.description} IS NULL OR length(${table.description}) <= 2000`,
    ),
    check(
      'field_definitions_help_text_valid',
      sql`${table.helpText} IS NULL OR length(trim(${table.helpText})) BETWEEN 1 AND 2000`,
    ),
    check(
      'field_definitions_example_text_valid',
      sql`${table.exampleText} IS NULL OR length(trim(${table.exampleText})) BETWEEN 1 AND 2000`,
    ),
    check(
      'field_definitions_help_article_id_valid',
      sql`${table.helpArticleId} IS NULL OR (
        length(${table.helpArticleId}) BETWEEN 1 AND 120
        AND ${table.helpArticleId} = lower(${table.helpArticleId})
        AND ${table.helpArticleId} NOT GLOB '*[^a-z0-9-]*'
        AND substr(${table.helpArticleId}, 1, 1) <> '-'
        AND substr(${table.helpArticleId}, -1, 1) <> '-'
        AND instr(${table.helpArticleId}, '--') = 0
      )`,
    ),
    check(
      'field_definitions_data_type_valid',
      sql`${table.dataType} IN (${sql.join(
        fieldDataTypes.map((value) => sql`${value}`),
        sql`, `,
      )})`,
    ),
    check(
      'field_definitions_semantic_role_valid',
      sql`${table.semanticRole} IS NULL OR ${table.semanticRole} IN (${sql.join(
        fieldSemanticRoles.map((value) => sql`${value}`),
        sql`, `,
      )})`,
    ),
    check(
      'field_definitions_reference_direction_valid',
      sql`${table.referenceDirection} IS NULL OR ${table.referenceDirection} IN ('outgoing', 'incoming')`,
    ),
    check(
      'field_definitions_on_delete_valid',
      sql`${table.onDeleteBehavior} IS NULL OR ${table.onDeleteBehavior} IN ('restrict', 'unlink')`,
    ),
    check(
      'field_definitions_image_configuration_valid',
      sql`${table.dataType} <> 'image' OR (
        ${table.required} = 0
        AND ${table.searchable} = 0
        AND ${table.defaultValue} IS NULL
        AND ${table.options} IS NULL
        AND ${table.validation} IS NULL
        AND ${table.referenceRelationshipTypeId} IS NULL
        AND ${table.referenceDirection} IS NULL
        AND ${table.allowedTargetTypeIds} IS NULL
        AND ${table.onDeleteBehavior} IS NULL
      )`,
    ),
    check('field_definitions_sort_order_nonnegative', sql`${table.sortOrder} >= 0`),
    check('field_definitions_created_at_not_blank', sql`length(${table.createdAt}) > 0`),
    check('field_definitions_updated_at_not_blank', sql`length(${table.updatedAt}) > 0`),
    check('field_definitions_revision_positive', sql`${table.revision} > 0`),
    uniqueIndex('field_definitions_type_key_unique').on(table.entityTypeId, table.key),
    index('field_definitions_type_archived_sort_idx').on(
      table.entityTypeId,
      table.isArchived,
      table.sortOrder,
      table.label,
      table.id,
    ),
  ],
);

export const entities = sqliteTable(
  'entities',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    entityTypeId: text('entity_type_id')
      .notNull()
      .references(() => entityTypes.id, { onDelete: 'restrict' }),
    referenceImageAttachmentId: text('reference_image_attachment_id').references(
      () => attachments.id,
      { onDelete: 'restrict' },
    ),
    name: text('name').notNull(),
    summary: text('summary'),
    canonState: text('canon_state', { enum: canonStates }).notNull().default('accepted'),
    knowledgeState: text('knowledge_state', { enum: knowledgeStates }).notNull().default('fact'),
    visibility: text('visibility', { enum: visibilityStates }).notNull().default('gm'),
    originKind: text('origin_kind', { enum: originKinds }).notNull().default('manual'),
    sourceId: text('source_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    archivedAt: text('archived_at'),
    revision: integer('revision').notNull().default(1),
  },
  (table) => [
    check('entities_name_valid', sql`length(trim(${table.name})) BETWEEN 1 AND 200`),
    check(
      'entities_summary_length',
      sql`${table.summary} IS NULL OR length(${table.summary}) <= 10000`,
    ),
    check('entities_revision_positive', sql`${table.revision} > 0`),
    index('entities_reference_image_attachment_idx')
      .on(table.referenceImageAttachmentId)
      .where(sql`${table.referenceImageAttachmentId} IS NOT NULL`),
    index('entities_campaign_archived_name_idx').on(
      table.campaignId,
      table.archivedAt,
      table.name,
      table.id,
    ),
    index('entities_campaign_type_archived_idx').on(
      table.campaignId,
      table.entityTypeId,
      table.archivedAt,
      table.name,
      table.id,
    ),
  ],
);

export const fieldValues = sqliteTable(
  'field_values',
  {
    id: text('id').primaryKey(),
    entityId: text('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    fieldDefinitionId: text('field_definition_id')
      .notNull()
      .references(() => fieldDefinitions.id, { onDelete: 'restrict' }),
    valueText: text('value_text'),
    valueNumber: real('value_number'),
    valueBoolean: integer('value_boolean', { mode: 'boolean' }),
    valueDate: text('value_date'),
    valueJson: text('value_json', { mode: 'json' }).$type<unknown>(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    revision: integer('revision').notNull().default(1),
  },
  (table) => [
    uniqueIndex('field_values_entity_definition_unique').on(
      table.entityId,
      table.fieldDefinitionId,
    ),
    index('field_values_entity_idx').on(table.entityId, table.fieldDefinitionId),
  ],
);

export const imageFieldValues = sqliteTable(
  'image_field_values',
  {
    id: text('id').primaryKey(),
    entityId: text('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    fieldDefinitionId: text('field_definition_id')
      .notNull()
      .references(() => fieldDefinitions.id, { onDelete: 'restrict' }),
    attachmentId: text('attachment_id')
      .notNull()
      .references(() => attachments.id, { onDelete: 'restrict' }),
    caption: text('caption'),
    altText: text('alt_text').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    revision: integer('revision').notNull().default(1),
  },
  (table) => [
    check(
      'image_field_values_id_uuid',
      sql`length(${table.id}) = 36
        AND substr(${table.id}, 9, 1) = '-'
        AND substr(${table.id}, 14, 1) = '-'
        AND substr(${table.id}, 19, 1) = '-'
        AND substr(${table.id}, 24, 1) = '-'
        AND ${table.id} = lower(${table.id})
        AND replace(${table.id}, '-', '') NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      'image_field_values_caption_valid',
      sql`${table.caption} IS NULL OR length(trim(${table.caption})) BETWEEN 1 AND 1000`,
    ),
    check(
      'image_field_values_alt_text_valid',
      sql`length(trim(${table.altText})) BETWEEN 1 AND 1000`,
    ),
    check('image_field_values_sort_order_nonnegative', sql`${table.sortOrder} >= 0`),
    check('image_field_values_created_at_not_blank', sql`length(${table.createdAt}) > 0`),
    check('image_field_values_updated_at_not_blank', sql`length(${table.updatedAt}) > 0`),
    check('image_field_values_revision_positive', sql`${table.revision} > 0`),
    uniqueIndex('image_field_values_entity_field_attachment_unique').on(
      table.entityId,
      table.fieldDefinitionId,
      table.attachmentId,
    ),
    index('image_field_values_entity_field_sort_idx').on(
      table.entityId,
      table.fieldDefinitionId,
      table.sortOrder,
      table.id,
    ),
    index('image_field_values_attachment_idx').on(table.attachmentId),
  ],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    sequenceNumber: integer('sequence_number').notNull(),
    title: text('title').notNull(),
    playedAt: text('played_at'),
    status: text('status', { enum: sessionStatuses }).notNull().default('planned'),
    summaryMarkdown: text('summary_markdown'),
    gmNotesMarkdown: text('gm_notes_markdown'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    revision: integer('revision').notNull().default(1),
  },
  (table) => [
    check('sessions_sequence_positive', sql`${table.sequenceNumber} > 0`),
    check('sessions_title_valid', sql`length(trim(${table.title})) BETWEEN 1 AND 200`),
    check('sessions_revision_positive', sql`${table.revision} > 0`),
    uniqueIndex('sessions_campaign_sequence_unique').on(table.campaignId, table.sequenceNumber),
    index('sessions_campaign_status_sequence_idx').on(
      table.campaignId,
      table.status,
      sql`${table.sequenceNumber} DESC`,
      sql`${table.id} DESC`,
    ),
    index('sessions_campaign_played_at_idx').on(
      table.campaignId,
      sql`${table.playedAt} DESC`,
      sql`${table.sequenceNumber} DESC`,
      sql`${table.id} DESC`,
    ),
  ],
);

export const sources = sqliteTable(
  'sources',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: originKinds }).notNull(),
    sessionId: text('session_id').references(() => sessions.id, { onDelete: 'restrict' }),
    documentChunkId: text('document_chunk_id'),
    aiRunId: text('ai_run_id'),
    importBatchId: text('import_batch_id'),
    rulesetPackId: text('ruleset_pack_id'),
    inboxItemId: text('inbox_item_id'),
    description: text('description'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('sources_kind_created_at_idx').on(
      table.kind,
      sql`${table.createdAt} DESC`,
      sql`${table.id} DESC`,
    ),
    uniqueIndex('sources_session_unique')
      .on(table.sessionId)
      .where(sql`${table.kind} = 'session' AND ${table.inboxItemId} IS NULL`),
    uniqueIndex('sources_inbox_item_unique').on(table.inboxItemId),
  ],
);

export const relationshipTypes = sqliteTable(
  'relationship_types',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    packId: text('pack_id'),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    inverseName: text('inverse_name'),
    description: text('description'),
    semanticRole: text('semantic_role'),
    isSymmetric: integer('is_symmetric', { mode: 'boolean' }).notNull().default(false),
    allowedSourceTypes: text('allowed_source_types_json', { mode: 'json' }).$type<string[]>(),
    allowedTargetTypes: text('allowed_target_types_json', { mode: 'json' }).$type<string[]>(),
    icon: text('icon'),
    color: text('color'),
    sortOrder: integer('sort_order').notNull().default(0),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    revision: integer('revision').notNull().default(1),
  },
  (table) => [
    check('relationship_types_name_valid', sql`length(trim(${table.name})) BETWEEN 1 AND 120`),
    check('relationship_types_sort_order_nonnegative', sql`${table.sortOrder} >= 0`),
    check('relationship_types_revision_positive', sql`${table.revision} > 0`),
    uniqueIndex('relationship_types_campaign_slug_unique').on(table.campaignId, table.slug),
    index('relationship_types_campaign_archived_sort_idx').on(
      table.campaignId,
      table.isArchived,
      table.sortOrder,
      table.name,
      table.id,
    ),
  ],
);

export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => sessions.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    descriptionMarkdown: text('description_markdown'),
    eventOrder: integer('event_order').notNull().default(0),
    occurredAtLabel: text('occurred_at_label'),
    canonState: text('canon_state', { enum: canonStates }).notNull().default('accepted'),
    knowledgeState: text('knowledge_state', { enum: knowledgeStates }).notNull().default('fact'),
    visibility: text('visibility', { enum: visibilityStates }).notNull().default('gm'),
    originKind: text('origin_kind', { enum: originKinds }).notNull().default('manual'),
    sourceId: text('source_id').references(() => sources.id, { onDelete: 'restrict' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    archivedAt: text('archived_at'),
    revision: integer('revision').notNull().default(1),
  },
  (table) => [
    check('events_title_valid', sql`length(trim(${table.title})) BETWEEN 1 AND 200`),
    check('events_order_nonnegative', sql`${table.eventOrder} >= 0`),
    check('events_revision_positive', sql`${table.revision} > 0`),
    index('events_campaign_archived_order_idx').on(
      table.campaignId,
      table.archivedAt,
      table.sessionId,
      table.eventOrder,
      table.createdAt,
      table.id,
    ),
    index('events_campaign_created_at_idx').on(
      table.campaignId,
      table.archivedAt,
      sql`${table.createdAt} DESC`,
      sql`${table.id} DESC`,
    ),
  ],
);

export const relationships = sqliteTable(
  'relationships',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    relationshipTypeId: text('relationship_type_id')
      .notNull()
      .references(() => relationshipTypes.id, { onDelete: 'restrict' }),
    sourceEntityId: text('source_entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'restrict' }),
    targetEntityId: text('target_entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'restrict' }),
    description: text('description'),
    strength: real('strength'),
    canonState: text('canon_state', { enum: canonStates }).notNull().default('accepted'),
    knowledgeState: text('knowledge_state', { enum: knowledgeStates }).notNull().default('fact'),
    visibility: text('visibility', { enum: visibilityStates }).notNull().default('gm'),
    originKind: text('origin_kind', { enum: originKinds }).notNull().default('manual'),
    sourceId: text('source_id').references(() => sources.id, { onDelete: 'restrict' }),
    validFromEventId: text('valid_from_event_id').references(() => events.id, {
      onDelete: 'restrict',
    }),
    validToEventId: text('valid_to_event_id').references(() => events.id, {
      onDelete: 'restrict',
    }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    archivedAt: text('archived_at'),
    revision: integer('revision').notNull().default(1),
  },
  (table) => [
    check('relationships_revision_positive', sql`${table.revision} > 0`),
    index('relationships_campaign_type_archived_idx').on(
      table.campaignId,
      table.relationshipTypeId,
      table.archivedAt,
      sql`${table.updatedAt} DESC`,
      sql`${table.id} DESC`,
    ),
    index('relationships_source_entity_idx').on(
      table.campaignId,
      table.sourceEntityId,
      table.archivedAt,
      table.relationshipTypeId,
      table.id,
    ),
    index('relationships_target_entity_idx').on(
      table.campaignId,
      table.targetEntityId,
      table.archivedAt,
      table.relationshipTypeId,
      table.id,
    ),
  ],
);

export const relationshipViews = sqliteTable(
  'relationship_views',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    viewType: text('view_type', { enum: relationshipViewTypes }).notNull(),
    sourceEntityId: text('source_entity_id').references(() => entities.id, {
      onDelete: 'cascade',
    }),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    viewportJson: text('viewport_json', { mode: 'json' })
      .$type<RelationshipViewport>()
      .notNull()
      .default({ x: 0, y: 0, zoom: 1 }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    revision: integer('revision').notNull().default(1),
  },
  (table) => [
    check(
      'relationship_views_id_uuid',
      sql`length(${table.id}) = 36
        AND substr(${table.id}, 9, 1) = '-'
        AND substr(${table.id}, 14, 1) = '-'
        AND substr(${table.id}, 19, 1) = '-'
        AND substr(${table.id}, 24, 1) = '-'
        AND ${table.id} = lower(${table.id})
        AND replace(${table.id}, '-', '') NOT GLOB '*[^0-9a-f]*'`,
    ),
    check('relationship_views_name_valid', sql`length(trim(${table.name})) BETWEEN 1 AND 120`),
    check('relationship_views_type_valid', sql`${table.viewType} IN ('campaign', 'neighborhood')`),
    check('relationship_views_default_valid', sql`${table.isDefault} IN (0, 1)`),
    check(
      'relationship_views_viewport_valid',
      sql`json_valid(${table.viewportJson})
        AND json_type(${table.viewportJson}) = 'object'
        AND json_type(${table.viewportJson}, '$.x') IN ('integer', 'real')
        AND json_type(${table.viewportJson}, '$.y') IN ('integer', 'real')
        AND json_type(${table.viewportJson}, '$.zoom') IN ('integer', 'real')
        AND json_extract(${table.viewportJson}, '$.x') BETWEEN -1000000 AND 1000000
        AND json_extract(${table.viewportJson}, '$.y') BETWEEN -1000000 AND 1000000
        AND json_extract(${table.viewportJson}, '$.zoom') BETWEEN 0.1 AND 4`,
    ),
    check('relationship_views_created_at_not_blank', sql`length(${table.createdAt}) > 0`),
    check('relationship_views_updated_at_not_blank', sql`length(${table.updatedAt}) > 0`),
    check('relationship_views_revision_positive', sql`${table.revision} > 0`),
    check(
      'relationship_views_source_coherent',
      sql`(${table.viewType} = 'campaign' AND ${table.sourceEntityId} IS NULL)
        OR (${table.viewType} = 'neighborhood' AND ${table.sourceEntityId} IS NOT NULL)`,
    ),
    index('relationship_views_campaign_type_idx').on(
      table.campaignId,
      table.viewType,
      sql`${table.updatedAt} DESC`,
      sql`${table.id} DESC`,
    ),
    uniqueIndex('relationship_views_default_campaign_unique')
      .on(table.campaignId, table.viewType)
      .where(sql`${table.isDefault} = 1 AND ${table.viewType} = 'campaign'`),
    uniqueIndex('relationship_views_default_neighborhood_unique')
      .on(table.campaignId, table.viewType, table.sourceEntityId)
      .where(sql`${table.isDefault} = 1 AND ${table.viewType} = 'neighborhood'`),
  ],
);

export const relationshipViewNodes = sqliteTable(
  'relationship_view_nodes',
  {
    relationshipViewId: text('relationship_view_id')
      .notNull()
      .references(() => relationshipViews.id, { onDelete: 'cascade' }),
    entityId: text('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    x: real('x').notNull(),
    y: real('y').notNull(),
    width: real('width').notNull(),
    height: real('height').notNull(),
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.relationshipViewId, table.entityId] }),
    check('relationship_view_nodes_x_valid', sql`${table.x} BETWEEN -1000000 AND 1000000`),
    check('relationship_view_nodes_y_valid', sql`${table.y} BETWEEN -1000000 AND 1000000`),
    check(
      'relationship_view_nodes_width_valid',
      sql`${table.width} > 0 AND ${table.width} <= 4096`,
    ),
    check(
      'relationship_view_nodes_height_valid',
      sql`${table.height} > 0 AND ${table.height} <= 4096`,
    ),
    check('relationship_view_nodes_pinned_valid', sql`${table.pinned} IN (0, 1)`),
    check('relationship_view_nodes_updated_at_not_blank', sql`length(${table.updatedAt}) > 0`),
    index('relationship_view_nodes_entity_idx').on(table.entityId, table.relationshipViewId),
  ],
);

export const campaignSignals = sqliteTable(
  'campaign_signals',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    signalType: text('signal_type', { enum: campaignSignalTypes }).notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    score: integer('score').notNull(),
    severity: text('severity', { enum: campaignSignalSeverities }).notNull(),
    status: text('status', { enum: campaignSignalStatuses }).notNull(),
    generatedAt: text('generated_at').notNull(),
    lastDetectedAt: text('last_detected_at').notNull(),
    dismissedUntil: text('dismissed_until'),
    ruleVersion: text('rule_version').notNull(),
    generatorKind: text('generator_kind', { enum: campaignSignalGeneratorKinds }).notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    revision: integer('revision').notNull().default(1),
  },
  (table) => [
    check(
      'campaign_signals_id_uuid',
      sql`length(${table.id}) = 36
        AND substr(${table.id}, 9, 1) = '-'
        AND substr(${table.id}, 14, 1) = '-'
        AND substr(${table.id}, 19, 1) = '-'
        AND substr(${table.id}, 24, 1) = '-'
        AND length(replace(${table.id}, '-', '')) = 32
        AND replace(${table.id}, '-', '') NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      'campaign_signals_type_valid',
      sql`${table.signalType} IN (
        'explicit_need', 'blocked_goal', 'open_consequence', 'clock_pressure',
        'shared_resource', 'recent_change', 'open_thread', 'stale_thread',
        'uninvestigated_clue', 'ignored_demand', 'cross_plot_bridge',
        'potential_contradiction', 'inactive_entity', 'unresolved_mystery',
        'unfulfilled_promise'
      )`,
    ),
    check(
      'campaign_signals_title_not_blank',
      sql`length(trim(${table.title}, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) > 0`,
    ),
    check(
      'campaign_signals_summary_not_blank',
      sql`length(trim(${table.summary}, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) > 0`,
    ),
    check(
      'campaign_signals_score_valid',
      sql`typeof(${table.score}) = 'integer' AND ${table.score} BETWEEN -5 AND 5`,
    ),
    check('campaign_signals_severity_valid', sql`${table.severity} IN ('low', 'medium', 'high')`),
    check(
      'campaign_signals_status_valid',
      sql`${table.status} IN ('new', 'viewed', 'dismissed', 'snoozed', 'converted', 'resolved', 'stale')`,
    ),
    check(
      'campaign_signals_generated_at_valid',
      sql`length(${table.generatedAt}) = 24
        AND ${table.generatedAt} GLOB '????-??-??T??:??:??.???Z'
        AND coalesce(strftime('%Y-%m-%dT%H:%M:%fZ', ${table.generatedAt}) = ${table.generatedAt}, 0)`,
    ),
    check(
      'campaign_signals_last_detected_at_valid',
      sql`length(${table.lastDetectedAt}) = 24
        AND ${table.lastDetectedAt} GLOB '????-??-??T??:??:??.???Z'
        AND coalesce(strftime('%Y-%m-%dT%H:%M:%fZ', ${table.lastDetectedAt}) = ${table.lastDetectedAt}, 0)`,
    ),
    check(
      'campaign_signals_dismissed_until_valid',
      sql`${table.dismissedUntil} IS NULL OR (
        length(${table.dismissedUntil}) = 24
        AND ${table.dismissedUntil} GLOB '????-??-??T??:??:??.???Z'
        AND coalesce(strftime('%Y-%m-%dT%H:%M:%fZ', ${table.dismissedUntil}) = ${table.dismissedUntil}, 0)
      )`,
    ),
    check(
      'campaign_signals_rule_version_not_blank',
      sql`length(trim(${table.ruleVersion}, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) > 0`,
    ),
    check('campaign_signals_generator_kind_valid', sql`${table.generatorKind} = 'deterministic'`),
    check(
      'campaign_signals_created_at_valid',
      sql`length(${table.createdAt}) = 24
        AND ${table.createdAt} GLOB '????-??-??T??:??:??.???Z'
        AND coalesce(strftime('%Y-%m-%dT%H:%M:%fZ', ${table.createdAt}) = ${table.createdAt}, 0)`,
    ),
    check(
      'campaign_signals_updated_at_valid',
      sql`length(${table.updatedAt}) = 24
        AND ${table.updatedAt} GLOB '????-??-??T??:??:??.???Z'
        AND coalesce(strftime('%Y-%m-%dT%H:%M:%fZ', ${table.updatedAt}) = ${table.updatedAt}, 0)`,
    ),
    check(
      'campaign_signals_revision_positive',
      sql`typeof(${table.revision}) = 'integer' AND ${table.revision} BETWEEN 1 AND 9007199254740991`,
    ),
    index('campaign_signals_campaign_status_updated_idx').on(
      table.campaignId,
      table.status,
      sql`${table.updatedAt} DESC`,
      sql`${table.id} DESC`,
    ),
    index('campaign_signals_campaign_type_detected_idx').on(
      table.campaignId,
      table.signalType,
      sql`${table.lastDetectedAt} DESC`,
      sql`${table.id} DESC`,
    ),
  ],
);

export const signalEvidence = sqliteTable(
  'signal_evidence',
  {
    id: text('id').primaryKey(),
    signalId: text('signal_id')
      .notNull()
      .references(() => campaignSignals.id, { onDelete: 'cascade' }),
    objectType: text('object_type', { enum: signalEvidenceObjectTypes }).notNull(),
    objectId: text('object_id').notNull(),
    role: text('role').notNull(),
    description: text('description'),
    graphPathJson: text('graph_path_json', { mode: 'json' }).$type<unknown[]>(),
    sortOrder: integer('sort_order').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    check(
      'signal_evidence_id_uuid',
      sql`length(${table.id}) = 36
        AND substr(${table.id}, 9, 1) = '-'
        AND substr(${table.id}, 14, 1) = '-'
        AND substr(${table.id}, 19, 1) = '-'
        AND substr(${table.id}, 24, 1) = '-'
        AND length(replace(${table.id}, '-', '')) = 32
        AND replace(${table.id}, '-', '') NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      'signal_evidence_object_type_valid',
      sql`${table.objectType} IN ('entity', 'relationship', 'assertion', 'event', 'session', 'note')`,
    ),
    check(
      'signal_evidence_object_id_uuid',
      sql`length(${table.objectId}) = 36
        AND substr(${table.objectId}, 9, 1) = '-'
        AND substr(${table.objectId}, 14, 1) = '-'
        AND substr(${table.objectId}, 19, 1) = '-'
        AND substr(${table.objectId}, 24, 1) = '-'
        AND length(replace(${table.objectId}, '-', '')) = 32
        AND replace(${table.objectId}, '-', '') NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      'signal_evidence_role_not_blank',
      sql`instr(${table.role}, char(0)) = 0
        AND length(trim(${table.role}, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) BETWEEN 1 AND 100`,
    ),
    check(
      'signal_evidence_description_valid',
      sql`${table.description} IS NULL OR (
        instr(${table.description}, char(0)) = 0
        AND length(trim(${table.description}, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) BETWEEN 1 AND 2000
      )`,
    ),
    check(
      'signal_evidence_graph_path_valid',
      sql`${table.graphPathJson} IS NULL OR (
        json_valid(${table.graphPathJson}) AND json_type(${table.graphPathJson}) = 'array'
      )`,
    ),
    check(
      'signal_evidence_sort_order_nonnegative',
      sql`typeof(${table.sortOrder}) = 'integer' AND ${table.sortOrder} BETWEEN 0 AND 9007199254740991`,
    ),
    check(
      'signal_evidence_created_at_valid',
      sql`length(${table.createdAt}) = 24
        AND ${table.createdAt} GLOB '????-??-??T??:??:??.???Z'
        AND coalesce(strftime('%Y-%m-%dT%H:%M:%fZ', ${table.createdAt}) = ${table.createdAt}, 0)`,
    ),
    index('signal_evidence_signal_order_idx').on(table.signalId, table.sortOrder, table.id),
    index('signal_evidence_object_idx').on(table.objectType, table.objectId),
  ],
);

export const assertions = sqliteTable(
  'assertions',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    subjectEntityId: text('subject_entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'restrict' }),
    predicate: text('predicate'),
    objectEntityId: text('object_entity_id').references(() => entities.id, {
      onDelete: 'restrict',
    }),
    statement: text('statement'),
    value: text('value_json', { mode: 'json' }).$type<unknown>(),
    canonState: text('canon_state', { enum: canonStates }).notNull().default('accepted'),
    knowledgeState: text('knowledge_state', { enum: knowledgeStates }).notNull().default('fact'),
    visibility: text('visibility', { enum: visibilityStates }).notNull().default('gm'),
    originKind: text('origin_kind', { enum: originKinds }).notNull().default('manual'),
    sourceId: text('source_id').references(() => sources.id, { onDelete: 'restrict' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    archivedAt: text('archived_at'),
    revision: integer('revision').notNull().default(1),
  },
  (table) => [
    check('assertions_revision_positive', sql`${table.revision} > 0`),
    index('assertions_campaign_subject_archived_idx').on(
      table.campaignId,
      table.subjectEntityId,
      table.archivedAt,
      sql`${table.updatedAt} DESC`,
      sql`${table.id} DESC`,
    ),
    index('assertions_campaign_archived_updated_idx').on(
      table.campaignId,
      table.archivedAt,
      sql`${table.updatedAt} DESC`,
      sql`${table.id} DESC`,
    ),
  ],
);

export const notes = sqliteTable(
  'notes',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    bodyMarkdown: text('body_markdown').notNull(),
    noteType: text('note_type', { enum: noteTypes }).notNull().default('general'),
    canonState: text('canon_state', { enum: canonStates }).notNull().default('accepted'),
    knowledgeState: text('knowledge_state', { enum: knowledgeStates }).notNull().default('fact'),
    visibility: text('visibility', { enum: visibilityStates }).notNull().default('gm'),
    originKind: text('origin_kind', { enum: originKinds }).notNull().default('manual'),
    sourceId: text('source_id').references(() => sources.id, { onDelete: 'restrict' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    archivedAt: text('archived_at'),
    revision: integer('revision').notNull().default(1),
  },
  (table) => [
    check('notes_title_valid', sql`length(trim(${table.title})) BETWEEN 1 AND 200`),
    check('notes_body_valid', sql`length(${table.bodyMarkdown}) BETWEEN 1 AND 100000`),
    check('notes_revision_positive', sql`${table.revision} > 0`),
    index('notes_campaign_type_archived_updated_idx').on(
      table.campaignId,
      table.noteType,
      table.archivedAt,
      sql`${table.updatedAt} DESC`,
      sql`${table.id} DESC`,
    ),
  ],
);

export const noteEntityLinks = sqliteTable(
  'note_entity_links',
  {
    noteId: text('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    entityId: text('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'restrict' }),
    role: text('role').notNull().default('related'),
  },
  (table) => [
    primaryKey({ columns: [table.noteId, table.entityId, table.role] }),
    index('note_entity_links_entity_idx').on(table.entityId, table.noteId),
  ],
);

export const sessionParticipants = sqliteTable(
  'session_participants',
  {
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    entityId: text('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'restrict' }),
    role: text('role', { enum: sessionParticipantRoles }).notNull(),
    attended: integer('attended', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.entityId] }),
    index('session_participants_entity_idx').on(table.entityId, table.sessionId),
  ],
);

export const sessionIntentions = sqliteTable(
  'session_intentions',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    entityId: text('entity_id').references(() => entities.id, { onDelete: 'restrict' }),
    text: text('text').notNull(),
    status: text('status', { enum: sessionIntentionStatuses }).notNull().default('open'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    revision: integer('revision').notNull().default(1),
  },
  (table) => [
    check('session_intentions_text_valid', sql`length(trim(${table.text})) BETWEEN 1 AND 10000`),
    check('session_intentions_revision_positive', sql`${table.revision} > 0`),
    index('session_intentions_session_status_idx').on(
      table.sessionId,
      table.status,
      table.createdAt,
      table.id,
    ),
  ],
);

export const eventEntityLinks = sqliteTable(
  'event_entity_links',
  {
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    entityId: text('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'restrict' }),
    role: text('role', { enum: eventEntityRoles }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.entityId, table.role] }),
    index('event_entity_links_entity_idx').on(table.entityId, table.eventId, table.sortOrder),
  ],
);

export const inboxItems = sqliteTable(
  'inbox_items',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => sessions.id, { onDelete: 'restrict' }),
    rawText: text('raw_text').notNull(),
    status: text('status', { enum: inboxStatuses }).notNull().default('new'),
    originKind: text('origin_kind', { enum: originKinds }).notNull().default('manual'),
    capturedAt: text('captured_at').notNull(),
    convertedObjectType: text('converted_object_type'),
    convertedObjectId: text('converted_object_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    revision: integer('revision').notNull().default(1),
  },
  (table) => [
    check('inbox_items_raw_text_valid', sql`length(trim(${table.rawText})) BETWEEN 1 AND 10000`),
    check('inbox_items_revision_positive', sql`${table.revision} > 0`),
    index('inbox_items_campaign_status_captured_idx').on(
      table.campaignId,
      table.status,
      sql`${table.capturedAt} DESC`,
      sql`${table.id} DESC`,
    ),
    index('inbox_items_session_status_idx').on(
      table.sessionId,
      table.status,
      sql`${table.capturedAt} DESC`,
      sql`${table.id} DESC`,
    ),
  ],
);

export const inboxEntityConversions = sqliteTable(
  'inbox_entity_conversions',
  {
    inboxItemId: text('inbox_item_id').primaryKey(),
    entityId: text('entity_id').notNull(),
    sourceId: text('source_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('inbox_entity_conversions_entity_unique').on(table.entityId)],
);

export const inboxRelationshipConversions = sqliteTable(
  'inbox_relationship_conversions',
  {
    inboxItemId: text('inbox_item_id').primaryKey(),
    relationshipId: text('relationship_id').notNull().unique(),
    sourceId: text('source_id').notNull().unique(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('inbox_relationship_conversions_relationship_unique').on(table.relationshipId),
  ],
);

export const inboxAssertionConversions = sqliteTable('inbox_assertion_conversions', {
  inboxItemId: text('inbox_item_id').primaryKey(),
  assertionId: text('assertion_id').notNull().unique(),
  sourceId: text('source_id').notNull().unique(),
  createdAt: text('created_at').notNull(),
});
export const inboxNoteConversions = sqliteTable('inbox_note_conversions', {
  inboxItemId: text('inbox_item_id').primaryKey(),
  noteId: text('note_id').notNull().unique(),
  sourceId: text('source_id').notNull().unique(),
  createdAt: text('created_at').notNull(),
});
export const inboxEventConversions = sqliteTable('inbox_event_conversions', {
  inboxItemId: text('inbox_item_id').primaryKey(),
  eventId: text('event_id').notNull().unique(),
  sourceId: text('source_id').notNull().unique(),
  createdAt: text('created_at').notNull(),
});
