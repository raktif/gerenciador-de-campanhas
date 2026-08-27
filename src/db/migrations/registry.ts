import { createHash } from 'node:crypto';
import phaseZeroMigration from './0001_phase_zero.sql?raw';

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
];
