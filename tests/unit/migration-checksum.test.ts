import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createMigrationChecksums,
  matchesMigrationChecksum,
} from '../../src/db/migrations/checksum';
import { migrations } from '../../src/db/migrations/registry';

const historicalChecksums: Record<number, string> = {
  6: '64b1b0a1f40c047184f2bb055309fcb383488c85a4f740c77861e81cd292e58e',
  8: '490b9ac7d6cc08df9d5a57df72b9972a7d05b18f24ad60bff16ca95f4d9fb430',
  9: '98b4b72f7029aaaba84433f0fe5cb2bdbadd00004098df35e5f5a8e7ed121f53',
  10: '231c122e84d2c099f10179b8fe116d24343956b910ce89ae4aa01272d5ddb882',
  11: 'eddcdc1dbfb3ff45db2df81b74ad516ececd84c25c5b5512b225ee21ef368f60',
  12: '251229d0508b50df24036cd83dc4ddeac61b783a9b9a7f57fb6afc88ebf897c0',
  13: '83397d20dd00791adfaf2cf20cb3a8a11dcdfcf252556210dc171b26959f9809',
  14: 'f8fa3ebcc50f00c3a113e0bcdc3a25c0a3d5dffa67e01cb032f13625009ce7de',
  15: '6b0a1cefbc4ef60b8344e295262fc5895eb8a1253fa0cc91026d9af4de4b5894',
};
const dynamicVersions = [1, 2, 3, 4, 5, 7, 16, 17, 18, 19, 20, 21, 22, 23];

describe('checksums de migração LF/CRLF', () => {
  it.each(dynamicVersions)('mantém checksum canônico e aceita só LF/CRLF em v%i', (version) => {
    const definition = getMigration(version);
    const lf = definition.sql.replace(/\r\n/g, '\n');
    const crlf = lf.replace(/\n/g, '\r\n');
    expect(createMigrationChecksums(lf)).toEqual(createMigrationChecksums(crlf));
    expect(definition.checksum).toBe(hash(lf));
    expect(definition.crlfChecksum).toBe(hash(crlf));
    expect(matchesMigrationChecksum(definition, hash(lf))).toBe(true);
    expect(matchesMigrationChecksum(definition, hash(crlf))).toBe(true);
    expect(matchesMigrationChecksum(definition, hash(`${lf}\nSELECT 1;`))).toBe(false);
    expect(matchesMigrationChecksum(definition, '0'.repeat(64))).toBe(false);
  });

  it('reproduz exatamente os hashes LF e CRLF confirmados para v2', () => {
    const definition = getMigration(2);
    expect(definition.checksum).toBe(
      '6b6cf4245c5b99589344988b25761091187ad216b5493e219cfcb980b98a2f8e',
    );
    expect(definition.crlfChecksum).toBe(
      '69afcd4e1b1ad34e9813ac64e56ac27ae4ad6ad6348f8b093a5424095d0461e2',
    );
  });

  it.each(Object.entries(historicalChecksums))(
    'preserva exclusivamente o checksum histórico fixo v%s',
    (version, checksum) => {
      const definition = getMigration(Number(version));
      expect(definition.checksum).toBe(checksum);
      expect(definition.crlfChecksum).toBeUndefined();
      expect(matchesMigrationChecksum(definition, checksum)).toBe(true);
      const current = createMigrationChecksums(definition.sql);
      for (const candidate of [current.checksum, current.crlfChecksum]) {
        if (candidate !== undefined) {
          expect(matchesMigrationChecksum(definition, candidate)).toBe(candidate === checksum);
        }
      }
      expect(matchesMigrationChecksum(definition, '0'.repeat(64))).toBe(false);
    },
  );

  it.each([
    'SELECT 2;\nSELECT 1;\n',
    'SELECT 1; \nSELECT 1;\n',
    '\uFEFFSELECT 1;\nSELECT 1;\n',
    'SELECT 1;\nSELECT 1;',
    'SELECT 1;\rSELECT 1;\r',
  ])('não normaliza SQL, espaços, BOM, newline final ou CR isolado: %j', (changed) => {
    const original = createMigrationChecksums('SELECT 1;\nSELECT 1;\n');
    expect(matchesMigrationChecksum(original, hash(changed))).toBe(false);
    expect(createMigrationChecksums(changed).checksum).not.toBe(original.checksum);
  });

  it('não aceita hash bruto com mistura de LF/CRLF fora das duas variantes integrais', () => {
    const original = createMigrationChecksums('SELECT 1;\nSELECT 1;\n');
    expect(matchesMigrationChecksum(original, hash('SELECT 1;\r\nSELECT 1;\n'))).toBe(false);
  });
});

function hash(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

function getMigration(version: number) {
  const definition = migrations.find((migration) => migration.version === version);
  if (!definition) throw new Error(`Migração ausente: ${String(version)}`);
  return definition;
}
