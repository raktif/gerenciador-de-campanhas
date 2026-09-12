import { sql } from 'drizzle-orm';
import {
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
      .where(sql`${table.kind} = 'session'`),
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
