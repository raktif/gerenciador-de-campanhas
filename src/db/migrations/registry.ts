import { createHash } from 'node:crypto';
import phaseZeroMigration from './0001_phase_zero.sql?raw';
import campaignsMigration from './0002_campaigns.sql?raw';
import entityTypesMigration from './0003_entity_types.sql?raw';
import fieldDefinitionsMigration from './0004_field_definitions.sql?raw';
import entitiesMigration from './0005_entities.sql?raw';
import legacyTagsAndSearchMigration from './0006_tags_and_search_legacy.sql?raw';
import removeDeferredPhaseFeaturesMigration from './0007_remove_deferred_phase_features.sql?raw';

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
];
