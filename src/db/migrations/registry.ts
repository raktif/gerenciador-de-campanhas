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
    checksum: checksum(phaseTwoFoundationMigration),
    sql: phaseTwoFoundationMigration,
  },
  {
    version: 9,
    name: 'phase-two-inbox-capture-integrity',
    checksum: checksum(inboxCaptureIntegrityMigration),
    sql: inboxCaptureIntegrityMigration,
  },
  {
    version: 10,
    name: 'phase-two-inbox-entity-provenance',
    checksum: checksum(inboxEntityProvenanceMigration),
    sql: inboxEntityProvenanceMigration,
  },
  {
    version: 11,
    name: 'phase-two-inbox-entity-provenance-integrity',
    checksum: checksum(inboxEntityProvenanceIntegrityMigration),
    sql: inboxEntityProvenanceIntegrityMigration,
  },
  {
    version: 12,
    name: 'phase-two-inbox-relationship-provenance',
    checksum: checksum(inboxRelationshipProvenanceMigration),
    sql: inboxRelationshipProvenanceMigration,
  },
  {
    version: 13,
    name: 'phase-two-inbox-narrative-provenance',
    checksum: checksum(inboxNarrativeProvenanceMigration),
    sql: inboxNarrativeProvenanceMigration,
  },
  {
    version: 14,
    name: 'phase-two-assertion-inbox-source-update-guard',
    checksum: checksum(assertionInboxSourceUpdateGuardMigration),
    sql: assertionInboxSourceUpdateGuardMigration,
  },
  {
    version: 15,
    name: 'phase-two-note-event-inbox-source-update-guards',
    checksum: checksum(noteEventInboxSourceUpdateGuardsMigration),
    sql: noteEventInboxSourceUpdateGuardsMigration,
  },
];

export const latestMigrationVersion = migrationManifest.latestVersion;

if (
  migrations.length !== latestMigrationVersion ||
  migrations.some((migration, index) => migration.version !== index + 1)
)
  throw new Error('O manifesto de migrações não corresponde ao registro.');
