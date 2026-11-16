import { createHash } from 'node:crypto';

export interface MigrationChecksums {
  checksum: string;
  crlfChecksum?: string;
}

/** Only LF/CRLF are interchangeable; all other SQL bytes remain significant. */
export function createMigrationChecksums(sql: string): MigrationChecksums {
  const lfSql = sql.replace(/\r\n/g, '\n');
  return {
    checksum: hash(lfSql),
    crlfChecksum: hash(lfSql.replace(/\n/g, '\r\n')),
  };
}

export function matchesMigrationChecksum(
  definition: MigrationChecksums,
  appliedChecksum: string,
): boolean {
  return appliedChecksum === definition.checksum || appliedChecksum === definition.crlfChecksum;
}

function hash(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}
