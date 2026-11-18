import { createMigrationChecksums, type MigrationChecksums } from './checksum';
import migrationManifest from './manifest.json';
import phaseZeroMigration from './0001_phase_zero.sql?raw';
import campaignsMigration from './0002_campaigns.sql?raw';
import entityTypesMigration from './0003_entity_types.sql?raw';
import fieldDefinitionsMigration from './0004_field_definitions.sql?raw';
import entitiesMigration from './0005_entities.sql?raw';
import legacyTagsAndSearchMigration from './0006_tags_and_search_legacy.sql?raw';
import removeDeferredPhaseFeaturesMigration from './0007_remove_deferred_phase_features.sql?raw';
import phaseTwoFoundationMigration from './0008_phase_two_foundation.sql?raw';
import inboxCaptureIntegrityMigration from './0009_inbox_capture_integrity.sql?raw';
import inboxEntityProvenanceMigration from './0010_inbox_entity_provenance.sql?raw';
import inboxEntityProvenanceIntegrityMigration from './0011_inbox_entity_provenance_integrity.sql?raw';
import inboxRelationshipProvenanceMigration from './0012_inbox_relationship_provenance.sql?raw';
import inboxNarrativeProvenanceMigration from './0013_inbox_narrative_provenance.sql?raw';
import assertionInboxSourceUpdateGuardMigration from './0014_assertion_inbox_source_update_guard.sql?raw';
import noteEventInboxSourceUpdateGuardsMigration from './0015_note_event_inbox_source_update_guards.sql?raw';
import fieldDefinitionContextualHelpMigration from './0016_field_definition_contextual_help.sql?raw';
import campaignCoverAttachmentsMigration from './0017_campaign_cover_attachments.sql?raw';
import entityReferenceImagesMigration from './0018_entity_reference_images.sql?raw';
import customImageFieldsMigration from './0019_custom_image_fields.sql?raw';
import imageFieldAltTextIntegrityMigration from './0020_image_field_alt_text_integrity.sql?raw';
import relationshipViewsMigration from './0021_relationship_views.sql?raw';
import campaignSignalsMigration from './0022_campaign_signals.sql?raw';
import campaignSignalPriorityAndContradictionExceptionsMigration from './0023_campaign_signal_priority_and_contradiction_exceptions.sql?raw';
import storyThreadsMigration from './0024_story_threads.sql?raw';
import clocksMigration from './0025_clocks.sql?raw';
import clockCompletedReplaceGuardMigration from './0026_clock_completed_replace_guard.sql?raw';
import clockEntityConsequenceMigration from './0027_clock_entity_consequence_and_generated_events.sql?raw';
import clockCreateIdempotencyMigration from './0028_clock_create_idempotency.sql?raw';
import demandsMigration from './0029_demands.sql?raw';
import richTextFieldsMigration from './0030_rich_text_fields.sql?raw';
import structuredValueSnapshotsMigration from './0031_structured_value_migration_snapshots.sql?raw';
import restoreStructuredValueSnapshotsMigration from './0032_restore_structured_value_snapshots.sql?raw';
import clearEntityJsonFieldValuesMigration from './0033_clear_entity_json_field_values.sql?raw';
import clearDerivedEntityFieldCopiesMigration from './0034_clear_derived_entity_field_copies.sql?raw';

export const clearEntityJsonFieldValuesVersion = 33;
export const clearDerivedEntityFieldCopiesVersion = 34;

export interface MigrationDefinition extends MigrationChecksums {
  version: number;
  name: string;
  sql: string;
  requiresForeignKeysDisabled?: boolean;
  requiresLegacyAlterTable?: boolean;
}

// Dynamic checksums accept only the LF/CRLF forms of the current SQL.
// Historical fixed checksums (v6, v8–15) intentionally have no CRLF alternative.
export const migrations: readonly MigrationDefinition[] = [
  {
    version: 1,
    name: 'phase-zero-foundation',
    ...createMigrationChecksums(phaseZeroMigration),
    sql: phaseZeroMigration,
  },
  {
    version: 2,
    name: 'phase-one-campaigns',
    ...createMigrationChecksums(campaignsMigration),
    sql: campaignsMigration,
  },
  {
    version: 3,
    name: 'phase-one-entity-types',
    ...createMigrationChecksums(entityTypesMigration),
    sql: entityTypesMigration,
  },
  {
    version: 4,
    name: 'phase-one-field-definitions',
    ...createMigrationChecksums(fieldDefinitionsMigration),
    sql: fieldDefinitionsMigration,
  },
  {
    version: 5,
    name: 'phase-one-entities',
    ...createMigrationChecksums(entitiesMigration),
    sql: entitiesMigration,
  },
  {
    version: 6,
    name: 'phase-one-tags-and-search',
    // O SQL original foi aplicado localmente antes da correção de escopo. O checksum histórico
    // precisa permanecer estável para que esses bancos possam avançar à migração corretiva.
    checksum: '64b1b0a1f40c047184f2bb055309fcb383488c85a4f740c77861e81cd292e58e',
    sql: legacyTagsAndSearchMigration,
  },
  {
    version: 7,
    name: 'phase-one-remove-deferred-features',
    ...createMigrationChecksums(removeDeferredPhaseFeaturesMigration),
    sql: removeDeferredPhaseFeaturesMigration,
  },
  {
    version: 8,
    name: 'phase-two-foundation',
    // A versão 8 já foi aplicada em bancos existentes. A correção da consulta
    // de fontes legadas preserva o checksum histórico para mantê-los válidos.
    checksum: '490b9ac7d6cc08df9d5a57df72b9972a7d05b18f24ad60bff16ca95f4d9fb430',
    sql: phaseTwoFoundationMigration,
  },
  {
    version: 9,
    name: 'phase-two-inbox-capture-integrity',
    // As migrações 9–15 foram aplicadas durante o refinamento da Fase 2.
    // Seus checksums históricos preservam a abertura dos bancos já existentes;
    // o SQL atual continua sendo usado para bancos novos.
    checksum: '98b4b72f7029aaaba84433f0fe5cb2bdbadd00004098df35e5f5a8e7ed121f53',
    sql: inboxCaptureIntegrityMigration,
  },
  {
    version: 10,
    name: 'phase-two-inbox-entity-provenance',
    checksum: '231c122e84d2c099f10179b8fe116d24343956b910ce89ae4aa01272d5ddb882',
    sql: inboxEntityProvenanceMigration,
  },
  {
    version: 11,
    name: 'phase-two-inbox-entity-provenance-integrity',
    checksum: 'eddcdc1dbfb3ff45db2df81b74ad516ececd84c25c5b5512b225ee21ef368f60',
    sql: inboxEntityProvenanceIntegrityMigration,
  },
  {
    version: 12,
    name: 'phase-two-inbox-relationship-provenance',
    checksum: '251229d0508b50df24036cd83dc4ddeac61b783a9b9a7f57fb6afc88ebf897c0',
    sql: inboxRelationshipProvenanceMigration,
  },
  {
    version: 13,
    name: 'phase-two-inbox-narrative-provenance',
    checksum: '83397d20dd00791adfaf2cf20cb3a8a11dcdfcf252556210dc171b26959f9809',
    sql: inboxNarrativeProvenanceMigration,
  },
  {
    version: 14,
    name: 'phase-two-assertion-inbox-source-update-guard',
    checksum: 'f8fa3ebcc50f00c3a113e0bcdc3a25c0a3d5dffa67e01cb032f13625009ce7de',
    sql: assertionInboxSourceUpdateGuardMigration,
  },
  {
    version: 15,
    name: 'phase-two-note-event-inbox-source-update-guards',
    checksum: '6b0a1cefbc4ef60b8344e295262fc5895eb8a1253fa0cc91026d9af4de4b5894',
    sql: noteEventInboxSourceUpdateGuardsMigration,
  },
  {
    version: 16,
    name: 'phase-two-field-definition-contextual-help',
    ...createMigrationChecksums(fieldDefinitionContextualHelpMigration),
    sql: fieldDefinitionContextualHelpMigration,
  },
  {
    version: 17,
    name: 'phase-two-campaign-cover-attachments',
    ...createMigrationChecksums(campaignCoverAttachmentsMigration),
    sql: campaignCoverAttachmentsMigration,
  },
  {
    version: 18,
    name: 'phase-two-entity-reference-images',
    ...createMigrationChecksums(entityReferenceImagesMigration),
    sql: entityReferenceImagesMigration,
  },
  {
    version: 19,
    name: 'phase-two-custom-image-fields',
    ...createMigrationChecksums(customImageFieldsMigration),
    sql: customImageFieldsMigration,
  },
  {
    version: 20,
    name: 'phase-two-image-field-alt-text-integrity',
    ...createMigrationChecksums(imageFieldAltTextIntegrityMigration),
    sql: imageFieldAltTextIntegrityMigration,
  },
  {
    version: 21,
    name: 'phase-two-relationship-views',
    ...createMigrationChecksums(relationshipViewsMigration),
    sql: relationshipViewsMigration,
  },
  {
    version: 22,
    name: 'phase-three-campaign-signals-foundation',
    ...createMigrationChecksums(campaignSignalsMigration),
    sql: campaignSignalsMigration,
  },
  {
    version: 23,
    name: 'phase-three-campaign-signal-priority-and-contradiction-exceptions',
    ...createMigrationChecksums(campaignSignalPriorityAndContradictionExceptionsMigration),
    sql: campaignSignalPriorityAndContradictionExceptionsMigration,
    requiresForeignKeysDisabled: true,
    requiresLegacyAlterTable: true,
  },
  {
    version: 24,
    name: 'phase-three-story-threads',
    ...createMigrationChecksums(storyThreadsMigration),
    sql: storyThreadsMigration,
  },
  {
    version: 25,
    name: 'phase-three-clocks',
    ...createMigrationChecksums(clocksMigration),
    sql: clocksMigration,
  },
  {
    version: 26,
    name: 'phase-three-clock-completed-replace-guard',
    ...createMigrationChecksums(clockCompletedReplaceGuardMigration),
    sql: clockCompletedReplaceGuardMigration,
  },
  {
    version: 27,
    name: 'phase-three-clock-entity-consequence-and-generated-events',
    ...createMigrationChecksums(clockEntityConsequenceMigration),
    sql: clockEntityConsequenceMigration,
  },
  {
    version: 28,
    name: 'clock-create-idempotency',
    ...createMigrationChecksums(clockCreateIdempotencyMigration),
    sql: clockCreateIdempotencyMigration,
  },
  {
    version: 29,
    name: 'phase-three-demands',
    ...createMigrationChecksums(demandsMigration),
    sql: demandsMigration,
  },
  {
    version: 30,
    name: 'phase-three-rich-text-fields',
    ...createMigrationChecksums(richTextFieldsMigration),
    sql: richTextFieldsMigration,
    requiresForeignKeysDisabled: true,
    requiresLegacyAlterTable: true,
  },
  {
    version: 31,
    name: 'phase-three-structured-value-migration-snapshots',
    ...createMigrationChecksums(structuredValueSnapshotsMigration),
    sql: structuredValueSnapshotsMigration,
  },
  {
    version: 32,
    name: 'phase-three-restore-structured-value-snapshots',
    ...createMigrationChecksums(restoreStructuredValueSnapshotsMigration),
    sql: restoreStructuredValueSnapshotsMigration,
  },
  {
    version: clearEntityJsonFieldValuesVersion,
    name: 'phase-three-clear-entity-json-field-values',
    ...createMigrationChecksums(clearEntityJsonFieldValuesMigration),
    sql: clearEntityJsonFieldValuesMigration,
  },
  {
    version: clearDerivedEntityFieldCopiesVersion,
    name: 'phase-three-clear-derived-entity-field-copies',
    ...createMigrationChecksums(clearDerivedEntityFieldCopiesMigration),
    sql: clearDerivedEntityFieldCopiesMigration,
  },
];

export const latestMigrationVersion = migrationManifest.latestVersion;

if (
  migrations.length !== latestMigrationVersion ||
  migrations.some((migration, index) => migration.version !== index + 1)
)
  throw new Error('O manifesto de migrações não corresponde ao registro.');
