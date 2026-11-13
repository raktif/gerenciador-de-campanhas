import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { getTableConfig, SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';
import { migrations } from '../../src/db/migrations/registry';
import { signalEvidence } from '../../src/db/schema';

describe('limites Unicode persistentes de evidência', () => {
  for (const mode of ['migration', 'drizzle'] as const) {
    it(`${mode}: boundary e overflow por pontos de código, após trim`, () => {
      const db = new Database(':memory:');
      try {
        const now = '2026-11-13T12:00:00.000Z';
        const campaignId = randomUUID();
        const signalId = randomUUID();
        const entityTypeId = randomUUID();
        const entityId = randomUUID();
        if (mode === 'migration') {
          db.pragma('foreign_keys = ON');
          db.pragma('recursive_triggers = OFF');
          for (const migration of migrations) db.exec(migration.sql);
          db.prepare(
            'INSERT INTO campaigns (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
          ).run(campaignId, 'Unicode', now, now);
          db.prepare(
            `INSERT INTO entity_types (id, campaign_id, name, singular_name, slug, created_at, updated_at)
             VALUES (?, ?, 'Pessoas', 'Pessoa', 'pessoas', ?, ?)`,
          ).run(entityTypeId, campaignId, now, now);
          db.prepare(
            `INSERT INTO entities (id, campaign_id, entity_type_id, name, created_at, updated_at)
             VALUES (?, ?, ?, 'Pessoa', ?, ?)`,
          ).run(entityId, campaignId, entityTypeId, now, now);
          db.prepare(
            `INSERT INTO campaign_signals (
              id, campaign_id, signal_type, title, summary, score, severity, status,
              generated_at, last_detected_at, rule_version, generator_kind, created_at, updated_at
            ) VALUES (?, ?, 'open_thread', 'Título', 'Resumo', 0, 'low', 'new',
                      ?, ?, '1', 'deterministic', ?, ?)`,
          ).run(signalId, campaignId, now, now, now, now);
        } else {
          // Execute the actual Drizzle CHECK expressions, not a handwritten copy.
          const config = getTableConfig(signalEvidence);
          const dialect = new SQLiteSyncDialect();
          const columns = config.columns.map(
            (column) =>
              `"${column.name}" ${column.getSQLType()}${column.notNull ? ' NOT NULL' : ''}`,
          );
          const checks = config.checks.map(
            ({ value }) => `CHECK (${dialect.sqlToQuery(value).sql})`,
          );
          db.exec(`CREATE TABLE signal_evidence (${[...columns, ...checks].join(', ')})`);
        }
        const insert = db.prepare(
          `INSERT INTO signal_evidence (
            id, signal_id, object_type, object_id, role, description, sort_order, created_at
          ) VALUES (@id, @signalId, 'entity', @entityId, @role, @description, 0, @now)`,
        );
        const base = { signalId, entityId, role: 'related', description: null, now };
        for (const [field, limit] of [
          ['role', 100],
          ['description', 2000],
        ] as const) {
          const updateId = randomUUID();
          insert.run({ ...base, id: updateId });
          for (const value of [`${'a'.repeat(limit - 1)}\0b`, 'a\0b', '\0a', 'a\0']) {
            expect(() => insert.run({ ...base, id: randomUUID(), [field]: value })).toThrow(
              /CHECK constraint failed/u,
            );
            expect(() =>
              db
                .prepare(`UPDATE signal_evidence SET ${field} = ? WHERE id = ?`)
                .run(value, updateId),
            ).toThrow(/CHECK constraint failed/u);
          }
          for (const character of ['a', 'é', String.fromCodePoint(0x1f600)]) {
            for (const count of [1, limit - 1, limit]) {
              const value = character.repeat(count);
              for (const text of [value, `\t\u00a0${value}\n\ufeff`]) {
                const id = randomUUID();
                insert.run({ ...base, id, [field]: text });
                const stored = db
                  .prepare(`SELECT ${field} AS value FROM signal_evidence WHERE id = ?`)
                  .get(id);
                expect(stored).toEqual({ value: text });
              }
            }
            expect(() =>
              insert.run({ ...base, id: randomUUID(), [field]: character.repeat(limit + 1) }),
            ).toThrow(/CHECK constraint failed/u);
          }
          const mixed = `${'a'.repeat(limit - 1)}${String.fromCodePoint(0x1f600)}`;
          insert.run({ ...base, id: randomUUID(), [field]: mixed });
          expect(() => insert.run({ ...base, id: randomUUID(), [field]: `${mixed}é` })).toThrow(
            /CHECK constraint failed/u,
          );
          for (const value of ['', '\t\n\u00a0\ufeff'])
            expect(() => insert.run({ ...base, id: randomUUID(), [field]: value })).toThrow(
              /CHECK constraint failed/u,
            );
        }
        const nullableId = randomUUID();
        insert.run({ ...base, id: nullableId });
        expect(
          db.prepare('SELECT description FROM signal_evidence WHERE id = ?').get(nullableId),
        ).toEqual({ description: null });
        expect(() => insert.run({ ...base, id: randomUUID(), role: null })).toThrow(
          /NOT NULL constraint failed/u,
        );
        if (mode === 'migration') expect(db.pragma('foreign_key_check')).toEqual([]);
      } finally {
        db.close();
      }
    });
  }
});
