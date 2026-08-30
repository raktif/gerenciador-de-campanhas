import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { campaignStatuses } from '../../core/contracts/campaigns';
import {
  canonStates,
  knowledgeStates,
  originKinds,
  visibilityStates,
} from '../../core/contracts/entities';
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
