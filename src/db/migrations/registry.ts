import { createHash } from 'node:crypto';
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

export interface MigrationDefinition {
  version: number;
  name: string;
  checksum: string;
  sql: string;
}

function checksum(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

export const migrations: readonly MigrationDefinition[] = [
  {
    version: 1,
    name: 'phase-zero-foundation',
    checksum: checksum(phaseZeroMigration),
    sql: phaseZeroMigration,
  },
  {
    version: 2,
    name: 'phase-one-campaigns',
    checksum: checksum(campaignsMigration),
    sql: campaignsMigration,
  },
  {
    version: 3,
    name: 'phase-one-entity-types',
    checksum: checksum(entityTypesMigration),
    sql: entityTypesMigration,
  },
  {
    version: 4,
    name: 'phase-one-field-definitions',
    checksum: checksum(fieldDefinitionsMigration),
    sql: fieldDefinitionsMigration,
  },
  {
    version: 5,
    name: 'phase-one-entities',
    checksum: checksum(entitiesMigration),
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
    checksum: checksum(removeDeferredPhaseFeaturesMigration),
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
    checksum: checksum(fieldDefinitionContextualHelpMigration),
    sql: fieldDefinitionContextualHelpMigration,
  },
  {
    version: 17,
    name: 'phase-two-campaign-cover-attachments',
    checksum: checksum(campaignCoverAttachmentsMigration),
    sql: campaignCoverAttachmentsMigration,
  },
  {
    version: 18,
    name: 'phase-two-entity-reference-images',
    checksum: checksum(entityReferenceImagesMigration),
    sql: entityReferenceImagesMigration,
  },
  {
    version: 19,
    name: 'phase-two-custom-image-fields',
    checksum: checksum(customImageFieldsMigration),
    sql: customImageFieldsMigration,
  },
  {
    version: 20,
    name: 'phase-two-image-field-alt-text-integrity',
    checksum: checksum(imageFieldAltTextIntegrityMigration),
    sql: imageFieldAltTextIntegrityMigration,
  },
  {
    version: 21,
    name: 'phase-two-relationship-views',
    checksum: checksum(relationshipViewsMigration),
    sql: relationshipViewsMigration,
  },
];

export const latestMigrationVersion = migrationManifest.latestVersion;

if (
  migrations.length !== latestMigrationVersion ||
  migrations.some((migration, index) => migration.version !== index + 1)
)
  throw new Error('O manifesto de migrações não corresponde ao registro.');
