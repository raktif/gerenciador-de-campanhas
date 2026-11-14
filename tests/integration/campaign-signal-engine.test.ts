import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import Database from 'better-sqlite3';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { campaignSignalChannels } from '../../src/core/contracts/ipc-channels';
import {
  ensureDataDirectories,
  getDataDirectories,
  type DataDirectories,
} from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import { CampaignSignalRepository } from '../../src/db/repositories/campaign-signal-repository';
import { AssertionRepository } from '../../src/db/repositories/assertion-repository';
import { InboxRepository } from '../../src/db/repositories/inbox-repository';
import { CampaignRepository } from '../../src/db/repositories/campaign-repository';
import { CampaignSignalService } from '../../src/main/services/campaign-signal-service';
import { registerCampaignSignalIpcHandlers } from '../../src/main/ipc/campaign-signal-handlers';
import { TestLogger } from '../helpers/test-logger';

const roots: string[] = [];
const contexts: DatabaseContext[] = [];
const start = '2026-11-14T14:00:00.000Z';

afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('persistência e recálculo de sinais em SQLite real', () => {
  it('escopo da fonte contextual recusa compartilhamento narrativo/conversões entre A e B no SQLite e IPC, sem dados parciais', async () => {
    const database = await openDatabase();
    const a = seedNeed(database.native, 'Assunto A', 'Necessidade A');
    const b = seedNeed(database.native, 'Assunto B', 'Necessidade B');
    const fact = seedAssertion(database.native, a, 'fact', 'Conteúdo A.');
    const disproved = seedAssertion(database.native, a, 'disproved', 'Conteúdo A.');
    const foreignAssertion = seedAssertion(database.native, b, 'fact', 'Afirmação B.');
    const sourceId = randomUUID();
    database.native
      .prepare(
        "INSERT INTO sources (id, kind, description, created_at) VALUES (?, 'manual', 'PRIVATE B ONLY', ?)",
      )
      .run(sourceId, start);
    database.native
      .prepare('UPDATE assertions SET source_id = ? WHERE id = ?')
      .run(sourceId, foreignAssertion.id);
    database.native
      .prepare('UPDATE assertions SET source_id = ? WHERE id IN (?, ?)')
      .run(sourceId, fact.id, disproved.id);
    const service = createService(database);
    const signal = service
      .recalculate({ campaignId: a.campaignId })
      .items.find((item) => item.signal.signalType === 'potential_contradiction')?.signal;
    if (signal === undefined) throw new Error('Par esperado.');
    const input = { campaignId: a.campaignId, id: signal.id, revision: signal.revision };
    const invoke = contextualIpc(service);
    const reproduced = await invoke(input);
    expect(reproduced).toMatchObject({
      ok: false,
      error: { code: 'ASSERTION_SOURCE_CAMPAIGN_MISMATCH' },
    });
    expect(reproduced).not.toHaveProperty('data');
    expect(JSON.stringify(reproduced)).not.toContain('PRIVATE B ONLY');
    database.native
      .prepare('UPDATE assertions SET source_id = NULL WHERE id = ?')
      .run(foreignAssertion.id);
    expect(
      service
        .getContradictionReview(input)
        .assertions.every(
          (entry) =>
            entry.sourceState === 'available' && entry.sourceDescription === 'PRIVATE B ONLY',
        ),
    ).toBe(true); // Current associations prove A only, not historical ownership.
    const relationType = randomUUID();
    const relationId = randomUUID();
    database.native
      .prepare(
        `INSERT INTO relationship_types (id, campaign_id, name, slug, created_at, updated_at)
       VALUES (?, ?, 'Vínculo', 'vinculo', ?, ?)`,
      )
      .run(relationType, b.campaignId, start, start);
    database.native
      .prepare(
        `INSERT INTO relationships (id, campaign_id, relationship_type_id, source_entity_id, target_entity_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(relationId, b.campaignId, relationType, b.entityId, b.entityId, start, start);
    const noteId = randomUUID();
    database.native
      .prepare(
        "INSERT INTO notes (id, campaign_id, title, body_markdown, created_at, updated_at) VALUES (?, ?, 'Nota B', 'Corpo', ?, ?)",
      )
      .run(noteId, b.campaignId, start, start);
    const eventId = randomUUID();
    database.native
      .prepare(
        "INSERT INTO events (id, campaign_id, title, created_at, updated_at) VALUES (?, ?, 'Evento B', ?, ?)",
      )
      .run(eventId, b.campaignId, start, start);
    const localRelationType = randomUUID();
    const localRelation = randomUUID();
    database.native
      .prepare(
        `INSERT INTO relationship_types (id, campaign_id, name, slug, created_at, updated_at)
       VALUES (?, ?, 'Vínculo A', 'vinculo-a', ?, ?)`,
      )
      .run(localRelationType, a.campaignId, start, start);
    database.native
      .prepare(
        `INSERT INTO relationships (id, campaign_id, relationship_type_id, source_entity_id, target_entity_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(localRelation, a.campaignId, localRelationType, a.entityId, a.entityId, start, start);
    const localNote = randomUUID();
    const localEvent = randomUUID();
    database.native
      .prepare(
        "INSERT INTO notes (id, campaign_id, title, body_markdown, created_at, updated_at) VALUES (?, ?, 'Nota A', 'Corpo', ?, ?)",
      )
      .run(localNote, a.campaignId, start, start);
    database.native
      .prepare(
        "INSERT INTO events (id, campaign_id, title, created_at, updated_at) VALUES (?, ?, 'Evento A', ?, ?)",
      )
      .run(localEvent, a.campaignId, start, start);
    const targets = [
      ['entities', b.entityId, 'inbox_entity_conversions', 'entity_id', a.entityId],
      ['assertions', foreignAssertion.id, 'inbox_assertion_conversions', 'assertion_id', fact.id],
      [
        'relationships',
        relationId,
        'inbox_relationship_conversions',
        'relationship_id',
        localRelation,
      ],
      ['notes', noteId, 'inbox_note_conversions', 'note_id', localNote],
      ['events', eventId, 'inbox_event_conversions', 'event_id', localEvent],
    ] as const;
    for (const [table, id, conversion, targetColumn, localId] of targets) {
      database.native
        .prepare(`UPDATE ${table} SET source_id = ?, archived_at = ? WHERE id = ?`)
        .run(sourceId, start, id);
      expect(() => service.getContradictionReview(input), table).toThrow(
        'não pertence exclusivamente',
      );
      const failure = await invoke(input);
      expect(failure, table).toMatchObject({
        ok: false,
        error: { code: 'ASSERTION_SOURCE_CAMPAIGN_MISMATCH' },
      });
      expect(failure).not.toHaveProperty('data');
      expect(JSON.stringify(failure)).not.toContain('PRIVATE B ONLY');
      database.native.prepare('UPDATE sources SET description = NULL WHERE id = ?').run(sourceId);
      expect(await invoke(input)).toMatchObject({
        ok: false,
        error: { code: 'ASSERTION_SOURCE_CAMPAIGN_MISMATCH' },
      });
      database.native.prepare(`UPDATE ${table} SET source_id = NULL WHERE id = ?`).run(id);
      expect(await invoke(input)).toMatchObject({
        ok: true,
        data: { assertions: [{ sourceDescription: null }, { sourceDescription: null }] },
      });
      // Conversion records remain references even when the narrative source link is absent.
      const inboxId = randomUUID();
      database.native
        .prepare(
          `INSERT INTO inbox_items (id, campaign_id, raw_text, captured_at, created_at, updated_at)
         VALUES (?, ?, 'Captura B', ?, ?, ?)`,
        )
        .run(inboxId, b.campaignId, start, start, start);
      database.native
        .prepare(
          `INSERT INTO ${conversion} (inbox_item_id, ${targetColumn}, source_id, created_at) VALUES (?, ?, ?, ?)`,
        )
        .run(inboxId, id, sourceId, start);
      expect(() => service.getContradictionReview(input), conversion).toThrow(
        'não pertence exclusivamente',
      );
      const conversionFailure = await invoke(input);
      expect(conversionFailure).toMatchObject({
        ok: false,
        error: { code: 'ASSERTION_SOURCE_CAMPAIGN_MISMATCH' },
      });
      expect(conversionFailure).not.toHaveProperty('data');
      database.native
        .prepare('UPDATE inbox_items SET campaign_id = ? WHERE id = ?')
        .run(a.campaignId, inboxId);
      // Target B still proves foreign scope even with the conversion's capture in A.
      const foreignTargetFailure = await invoke(input);
      expect(foreignTargetFailure).toMatchObject({
        ok: false,
        error: { code: 'ASSERTION_SOURCE_CAMPAIGN_MISMATCH' },
      });
      expect(foreignTargetFailure).not.toHaveProperty('data');
      database.native
        .prepare(`UPDATE ${conversion} SET ${targetColumn} = ? WHERE inbox_item_id = ?`)
        .run(localId, inboxId);
      expect(await invoke(input)).toMatchObject({ ok: true });
      database.native
        .prepare('UPDATE inbox_items SET campaign_id = ? WHERE id = ?')
        .run(b.campaignId, inboxId);
      const foreignCaptureFailure = await invoke(input);
      expect(foreignCaptureFailure).toMatchObject({
        ok: false,
        error: { code: 'ASSERTION_SOURCE_CAMPAIGN_MISMATCH' },
      });
      expect(foreignCaptureFailure).not.toHaveProperty('data');
      database.native.prepare(`DELETE FROM ${conversion} WHERE inbox_item_id = ?`).run(inboxId);
      expect(await invoke(input)).toMatchObject({ ok: true });
      database.native
        .prepare("UPDATE sources SET description = 'PRIVATE B ONLY' WHERE id = ?")
        .run(sourceId);
    }
    expect(database.native.pragma('foreign_key_check')).toEqual([]);
    // Interleaving cannot publish a snapshot that misses an uncommitted foreign association.
    const writer = new Database(database.databasePath);
    database.native.pragma('busy_timeout = 0');
    try {
      writer.exec('BEGIN IMMEDIATE');
      writer
        .prepare('UPDATE assertions SET source_id = ? WHERE id = ?')
        .run(sourceId, foreignAssertion.id);
      const locked = await invoke(input);
      expect(locked).toMatchObject({ ok: false, error: { code: 'DATABASE_BUSY' } });
      expect(locked).not.toHaveProperty('data');
      writer.exec('COMMIT');
      expect(await invoke(input)).toMatchObject({
        ok: false,
        error: { code: 'ASSERTION_SOURCE_CAMPAIGN_MISMATCH' },
      });
    } finally {
      if (writer.inTransaction) writer.exec('ROLLBACK');
      writer.close();
    }
    database.native
      .prepare('UPDATE assertions SET source_id = NULL WHERE id = ?')
      .run(foreignAssertion.id);
    expect(await invoke(input)).toMatchObject({ ok: true });
  });

  it('sessão da fonte contextual deve coincidir com captura da mesma campanha; manual/session/null e recuperação via IPC', async () => {
    const database = await openDatabase();
    const a = seedNeed(database.native, 'Assunto A', 'Necessidade A');
    seedAssertion(database.native, a, 'fact', 'Conteúdo A.');
    const originalId = seedAssertion(database.native, a, 'disproved', 'Conteúdo A.').id;
    const repository = new AssertionRepository(database.orm);
    const original = repository.findById(a.campaignId, originalId);
    if (original === null) throw new Error('Afirmação ausente.');
    database.native.prepare('DELETE FROM assertions WHERE id = ?').run(originalId);
    const session1 = randomUUID();
    const session2 = randomUUID();
    const insertSession = database.native.prepare(
      `INSERT INTO sessions (id, campaign_id, sequence_number, title, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'completed', ?, ?)`,
    );
    insertSession.run(session1, a.campaignId, 1, 'SESSION 1', start, start);
    insertSession.run(session2, a.campaignId, 2, 'SESSION 2', start, start);
    const inbox = new InboxRepository(database.orm);
    const captureId = randomUUID();
    const sourceId = randomUUID();
    inbox.insert({
      id: captureId,
      campaignId: a.campaignId,
      sessionId: session1,
      originKind: 'session',
      rawText: 'Captura na sessão 1',
      status: 'reviewing',
      revision: 1,
      capturedAt: start,
      createdAt: start,
      updatedAt: start,
      convertedObjectType: null,
      convertedObjectId: null,
    });
    inbox.convertToAssertion(
      { campaignId: a.campaignId, id: captureId, revision: 1 },
      { ...original, sourceId, originKind: 'session' },
      sourceId,
      start,
    );
    const service = createService(database);
    const signal = service
      .recalculate({ campaignId: a.campaignId })
      .items.find((item) => item.signal.signalType === 'potential_contradiction')?.signal;
    if (signal === undefined) throw new Error('Par esperado.');
    const input = { campaignId: a.campaignId, id: signal.id, revision: signal.revision };
    const invoke = contextualIpc(service);
    expect(
      service
        .getContradictionReview(input)
        .assertions.find((entry) => entry.assertion.id === original.id),
    ).toMatchObject({ sessionTitle: 'SESSION 1', sourceState: 'available' });
    database.native
      .prepare('UPDATE sources SET session_id = ? WHERE id = ?')
      .run(session2, sourceId);
    expect(() => service.getContradictionReview(input)).toThrow('não corresponde à captura');
    const failure = await invoke(input);
    expect(failure).toMatchObject({
      ok: false,
      error: { code: 'ASSERTION_SOURCE_CAPTURE_MISMATCH' },
    });
    expect(failure).not.toHaveProperty('data');
    expect(JSON.stringify(failure)).not.toContain('SESSION 2');
    expect(
      database.native.prepare('SELECT session_id FROM sources WHERE id = ?').get(sourceId),
    ).toEqual({ session_id: session2 });
    expect(
      database.native.prepare('SELECT session_id FROM inbox_items WHERE id = ?').get(captureId),
    ).toEqual({ session_id: session1 });
    database.native
      .prepare('UPDATE sources SET session_id = ? WHERE id = ?')
      .run(session1, sourceId);
    expect(await invoke(input)).toMatchObject({ ok: true });
    database.native
      .prepare("UPDATE inbox_items SET origin_kind = 'manual', session_id = NULL WHERE id = ?")
      .run(captureId);
    expect(await invoke(input)).toMatchObject({
      ok: false,
      error: { code: 'ASSERTION_SOURCE_CAPTURE_MISMATCH' },
    });
    database.native
      .prepare("UPDATE sources SET kind = 'manual', session_id = NULL WHERE id = ?")
      .run(sourceId);
    database.native
      .prepare("UPDATE assertions SET origin_kind = 'manual' WHERE id = ?")
      .run(original.id);
    expect(
      service
        .getContradictionReview(input)
        .assertions.find((entry) => entry.assertion.id === original.id),
    ).toMatchObject({ sessionTitle: null, assertion: { originKind: 'manual' } });
    // A manual capture with a session pointer is not a valid manual/null source.
    database.native
      .prepare('UPDATE inbox_items SET session_id = ? WHERE id = ?')
      .run(session1, captureId);
    expect(await invoke(input)).toMatchObject({
      ok: false,
      error: { code: 'ASSERTION_SOURCE_CAPTURE_MISMATCH' },
    });
    database.native.prepare('UPDATE inbox_items SET session_id = NULL WHERE id = ?').run(captureId);
    expect(await invoke(input)).toMatchObject({ ok: true });
    database.native
      .prepare("UPDATE inbox_items SET origin_kind = 'session' WHERE id = ?")
      .run(captureId);
    expect(await invoke(input)).toMatchObject({
      ok: false,
      error: { code: 'ASSERTION_SOURCE_CAPTURE_MISMATCH' },
    });
    database.native
      .prepare("UPDATE inbox_items SET origin_kind = 'manual' WHERE id = ?")
      .run(captureId);
    expect(await invoke(input)).toMatchObject({ ok: true });
    expect(database.native.pragma('foreign_key_check')).toEqual([]);
  });
  it('proveniência contextual reutiliza fontes reais de sessão/captura, distingue ausência e recusa origens alheias', async () => {
    const database = await openDatabase();
    const seeded = seedNeed(database.native, 'Gorel', 'Entender os cabos');
    const other = seedNeed(database.native, 'Outra campanha', 'Outro registro');
    const fact = seedAssertion(database.native, seeded, 'fact', 'A torre está aberta.');
    const disproved = seedAssertion(database.native, seeded, 'disproved', 'A torre está aberta.');
    const service = createService(database);
    const signal = service
      .recalculate({ campaignId: seeded.campaignId })
      .items.find((item) => item.signal.signalType === 'potential_contradiction')?.signal;
    if (signal === undefined) throw new Error('Par esperado.');
    const input = { campaignId: seeded.campaignId, id: signal.id, revision: signal.revision };
    expect(
      service
        .getContradictionReview(input)
        .assertions.every(
          (entry) =>
            entry.sourceState === 'unlinked' &&
            entry.sourceDescription === null &&
            entry.sessionTitle === null,
        ),
    ).toBe(true);
    const sessionId = randomUUID();
    const foreignSessionId = randomUUID();
    const insertSession = database.native.prepare(
      `INSERT INTO sessions (id, campaign_id, sequence_number, title, status, created_at, updated_at)
       VALUES (?, ?, 1, ?, 'completed', ?, ?)`,
    );
    insertSession.run(sessionId, seeded.campaignId, 'Sessão da torre', start, start);
    insertSession.run(foreignSessionId, other.campaignId, 'Sessão sigilosa alheia', start, start);
    const sessionSourceId = randomUUID();
    database.native
      .prepare(
        `INSERT INTO sources (id, kind, session_id, description, created_at)
       VALUES (?, 'session', ?, 'Relato da sessão', ?)`,
      )
      .run(sessionSourceId, sessionId, start);
    database.native
      .prepare("UPDATE assertions SET origin_kind = 'session', source_id = ? WHERE id = ?")
      .run(sessionSourceId, fact.id);
    expect(
      service
        .getContradictionReview(input)
        .assertions.find((entry) => entry.assertion.id === fact.id),
    ).toMatchObject({
      sourceState: 'available',
      sourceDescription: 'Relato da sessão',
      sessionTitle: 'Sessão da torre',
      assertion: { sessionId, originKind: 'session' },
    });
    const inbox = new InboxRepository(database.orm);
    const captureId = randomUUID();
    const captureSourceId = randomUUID();
    const captureAssertionId = randomUUID();
    const captured = inbox.insert({
      id: captureId,
      campaignId: seeded.campaignId,
      sessionId: null,
      rawText: 'Texto original da captura',
      status: 'reviewing',
      originKind: 'manual',
      capturedAt: start,
      createdAt: start,
      updatedAt: start,
      revision: 1,
      convertedObjectType: null,
      convertedObjectId: null,
    });
    const assertionRepository = new AssertionRepository(database.orm);
    const original = assertionRepository.findById(seeded.campaignId, disproved.id);
    if (original === null) throw new Error('Afirmação ausente.');
    inbox.convertToAssertion(
      { campaignId: seeded.campaignId, id: captured.id, revision: captured.revision },
      { ...original, id: captureAssertionId, sourceId: captureSourceId },
      captureSourceId,
      start,
    );
    const captureSignal = service
      .recalculate({ campaignId: seeded.campaignId })
      .items.find(
        (item) =>
          item.signal.signalType === 'potential_contradiction' &&
          database.native
            .prepare('SELECT 1 FROM signal_evidence WHERE signal_id = ? AND object_id = ?')
            .get(item.signal.id, captureAssertionId) !== undefined,
      )?.signal;
    if (captureSignal === undefined) throw new Error('Par capturado ausente.');
    const captureInput = { ...input, id: captureSignal.id, revision: captureSignal.revision };
    expect(
      service
        .getContradictionReview(captureInput)
        .assertions.find((entry) => entry.assertion.id === captureAssertionId),
    ).toMatchObject({
      sourceState: 'available',
      sourceDescription: 'Texto original da captura',
      sessionTitle: null,
      assertion: { originKind: 'manual', sourceId: captureSourceId },
    });
    // Sources have no campaign column; always validate their linked session/capture before publishing.
    database.native
      .prepare('UPDATE sources SET session_id = ? WHERE id = ?')
      .run(foreignSessionId, sessionSourceId);
    expect(() => service.getContradictionReview(input)).toThrow(
      'A fonte da afirmação não pertence',
    );
    database.native
      .prepare('UPDATE sources SET session_id = ? WHERE id = ?')
      .run(sessionId, sessionSourceId);
    const foreignCaptureId = randomUUID();
    inbox.insert({
      ...captured,
      id: foreignCaptureId,
      campaignId: other.campaignId,
      rawText: 'Captura sigilosa alheia',
    });
    database.native
      .prepare('UPDATE sources SET inbox_item_id = ? WHERE id = ?')
      .run(foreignCaptureId, captureSourceId);
    expect(() => service.getContradictionReview(captureInput)).toThrow(
      'A fonte da afirmação não pertence',
    );
    database.native
      .prepare('UPDATE sources SET inbox_item_id = ? WHERE id = ?')
      .run(captureId, captureSourceId);
    database.native
      .prepare('UPDATE sources SET description = NULL WHERE id = ?')
      .run(captureSourceId);
    expect(
      service
        .getContradictionReview(captureInput)
        .assertions.find((entry) => entry.assertion.id === captureAssertionId),
    ).toMatchObject({ sourceState: 'available', sourceDescription: null });
    database.native
      .prepare("UPDATE sources SET kind = 'manual', session_id = NULL WHERE id = ?")
      .run(sessionSourceId);
    expect(() => service.getContradictionReview(captureInput)).toThrow(
      'A fonte não corresponde à origem',
    );
    database.native
      .prepare("UPDATE sources SET kind = 'session', session_id = ? WHERE id = ?")
      .run(sessionId, sessionSourceId);
    // Corrupted legacy storage: simulate a dangling source, never synthesize successful provenance.
    database.native.pragma('foreign_keys = OFF');
    database.native.prepare('DELETE FROM sources WHERE id = ?').run(captureSourceId);
    database.native.pragma('foreign_keys = ON');
    expect(() => service.getContradictionReview(captureInput)).toThrow(
      'Não é possível comprovar o escopo',
    );
    const unavailable = await contextualIpc(service)(captureInput);
    expect(unavailable).toMatchObject({
      ok: false,
      error: { code: 'ASSERTION_SOURCE_SCOPE_UNVERIFIABLE' },
    });
    expect(unavailable).not.toHaveProperty('data');
    database.native.pragma('foreign_keys = OFF');
    database.native.exec('DROP TABLE sources');
    database.native.pragma('foreign_keys = ON');
    expect(() => service.getContradictionReview(input)).toThrow();
  });
  it('consulta contextual do par relê afirmações reais e recusa evidência ausente, arquivo, exclusão e campanha alheia', async () => {
    const database = await openDatabase();
    const seeded = seedNeed(database.native, 'Gorel', 'Entender os cabos');
    const fact = seedAssertion(database.native, seeded, 'fact', 'A torre está aberta.');
    const disproved = seedAssertion(database.native, seeded, 'disproved', 'A torre está aberta.');
    const service = createService(database);
    const signal = service
      .recalculate({ campaignId: seeded.campaignId })
      .items.find((item) => item.signal.signalType === 'potential_contradiction')?.signal;
    if (signal === undefined) throw new Error('Par esperado.');
    const input = { campaignId: seeded.campaignId, id: signal.id, revision: signal.revision };
    const pair = service.getContradictionReview(input);
    expect(
      database.native
        .prepare('SELECT status, revision FROM campaign_signals WHERE id = ?')
        .get(signal.id),
    ).toEqual({ status: signal.status, revision: signal.revision });
    expect(pair.assertions.map((entry) => entry.assertion.id).sort()).toEqual(
      [fact.id, disproved.id].sort(),
    );
    expect(pair.assertions.map((entry) => entry.assertion.knowledgeState).sort()).toEqual([
      'disproved',
      'fact',
    ]);
    const writer = new Database(database.databasePath);
    database.native.pragma('busy_timeout = 0');
    try {
      writer.exec('BEGIN IMMEDIATE');
      writer
        .prepare('UPDATE assertions SET statement = ? WHERE id = ?')
        .run('Mudança concorrente.', fact.id);
      expect(() => service.getContradictionReview(input)).toThrow('O banco está ocupado');
    } finally {
      if (writer.inTransaction) writer.exec('ROLLBACK');
      writer.close();
    }
    expect(() =>
      service.getContradictionReview({ ...input, revision: input.revision + 1 }),
    ).toThrow('O aviso mudou');
    const other = seedNeed(database.native, 'Outra campanha', 'Outro registro');
    expect(() =>
      service.getContradictionReview({ ...input, campaignId: other.campaignId }),
    ).toThrow('O sinal não foi encontrado');
    database.native
      .prepare('UPDATE assertions SET archived_at = ? WHERE id = ?')
      .run(start, fact.id);
    expect(() => service.getContradictionReview(input)).toThrow('O par está desatualizado');
    database.native.prepare('UPDATE assertions SET archived_at = NULL WHERE id = ?').run(fact.id);
    database.native
      .prepare('UPDATE assertions SET statement = ? WHERE id = ?')
      .run('Outra declaração.', fact.id);
    expect(() => service.getContradictionReview(input)).toThrow('O par está desatualizado');
    database.native
      .prepare('UPDATE assertions SET statement = ? WHERE id = ?')
      .run('A torre está aberta.', fact.id);
    expect(service.getContradictionReview(input).assertions).toHaveLength(2);
    const thirdEvidenceId = randomUUID();
    database.native
      .prepare(
        `INSERT INTO signal_evidence (id, signal_id, object_type, object_id, role, sort_order, created_at)
       VALUES (?, ?, 'assertion', ?, 'Terceira evidência real', 2, ?)`,
      )
      .run(thirdEvidenceId, signal.id, fact.id, start);
    expect(
      database.native
        .prepare('SELECT count(*) AS total FROM signal_evidence WHERE signal_id = ?')
        .get(signal.id),
    ).toEqual({ total: 3 });
    expect(() => service.getContradictionReview(input)).toThrow('evidências não estão disponíveis');
    try {
      service.getContradictionReview(input);
    } catch (error) {
      expect(error).toMatchObject({ code: 'POTENTIAL_CONTRADICTION_NO_LONGER_DETECTED' });
    }
    database.native.prepare('DELETE FROM signal_evidence WHERE id = ?').run(thirdEvidenceId);
    expect(service.getContradictionReview(input).assertions).toHaveLength(2);
    database.native.prepare('DELETE FROM signal_evidence WHERE signal_id = ?').run(signal.id);
    expect(() => service.getContradictionReview(input)).toThrow('evidências não estão disponíveis');
    database.native.prepare('DELETE FROM assertions WHERE id = ?').run(fact.id);
    expect(() => service.getContradictionReview(input)).toThrow('O par está desatualizado');
    database.native.prepare('DELETE FROM campaign_signals WHERE id = ?').run(signal.id);
    expect(() => service.getContradictionReview(input)).toThrow('O sinal não foi encontrado');
  });
  it('isola campanhas, é idempotente, preserva descarte e atualiza/remete evidências', async () => {
    const database = await openDatabase();
    const first = seedNeed(database.native, 'Gorel', 'Entender os cabos');
    const second = seedNeed(database.native, 'Outra campanha', 'Outra necessidade');
    const service = createService(database);

    const initial = service.recalculate({ campaignId: first.campaignId });
    expect(initial.detectedCount).toBe(1);
    expect(initial.items).toHaveLength(1);
    const original = initial.items[0];
    expect(original?.signal.summary).toBe('Entender os cabos');
    expect(original?.evidence).toMatchObject([
      {
        objectType: 'entity',
        objectName: 'Gorel',
        role: 'Necessidade explícita no campo “Necessidade”',
        description: 'Entender os cabos',
      },
    ]);

    const repeated = service.recalculate({ campaignId: first.campaignId });
    expect(repeated.items).toHaveLength(1);
    expect(repeated.items[0]?.signal.id).toBe(original?.signal.id);
    expect(repeated.items[0]?.signal.revision).toBe(original?.signal.revision);
    expect(service.list({ campaignId: second.campaignId }).items).toHaveLength(0);

    const dismissed = service.dismiss({
      campaignId: first.campaignId,
      id: original?.signal.id ?? '',
      revision: original?.signal.revision ?? 0,
    });

    database.native
      .prepare('UPDATE field_values SET value_text = ? WHERE entity_id = ?')
      .run('Compreender a origem dos cabos', first.entityId);
    const updated = service.recalculate({ campaignId: first.campaignId }).items[0];
    expect(updated?.signal.id).toBe(dismissed.id);
    expect(updated?.signal.status).toBe('dismissed');
    expect(updated?.signal.summary).toBe('Compreender a origem dos cabos');
    expect(updated?.evidence[0]?.description).toBe('Compreender a origem dos cabos');

    service.recalculate({ campaignId: second.campaignId });
    expect(service.list({ campaignId: first.campaignId }).items).toHaveLength(1);
    expect(service.list({ campaignId: second.campaignId }).items).toHaveLength(1);

    database.native.prepare('DELETE FROM entities WHERE id = ?').run(first.entityId);
    const afterSourceRemoval = service.recalculate({ campaignId: first.campaignId }).items[0];
    expect(afterSourceRemoval?.signal.status).toBe('dismissed');
    expect(afterSourceRemoval?.evidence).toEqual([]);
    expect(
      database.native
        .prepare('SELECT count(*) AS total FROM signal_evidence WHERE signal_id = ?')
        .get(dismissed.id),
    ).toEqual({ total: 0 });
    expect(database.native.pragma('foreign_key_check')).toEqual([]);
  });

  it('ignora campos e tipos arquivados e restaura a mesma identidade preservando a decisão', async () => {
    const database = await openDatabase();
    const seeded = seedNeed(database.native, 'Gorel', 'Entender os cabos');
    const service = createService(database);
    const first = service.recalculate({ campaignId: seeded.campaignId }).items[0];
    if (first === undefined) throw new Error('O sinal esperado não foi detectado.');
    const dismissed = service.dismiss({
      campaignId: seeded.campaignId,
      id: first.signal.id,
      revision: first.signal.revision,
    });

    database.native
      .prepare('UPDATE field_definitions SET is_archived = 1 WHERE id = ?')
      .run(seeded.fieldDefinitionId);
    expect(service.recalculate({ campaignId: seeded.campaignId }).detectedCount).toBe(0);
    const afterFieldArchive = service.list({ campaignId: seeded.campaignId }).items[0];
    expect(afterFieldArchive?.signal).toMatchObject({
      id: dismissed.id,
      status: 'dismissed',
      summary: 'Entender os cabos',
    });

    database.native
      .prepare('UPDATE field_definitions SET is_archived = 0 WHERE id = ?')
      .run(seeded.fieldDefinitionId);
    const afterFieldRestore = service.recalculate({ campaignId: seeded.campaignId });
    expect(afterFieldRestore.detectedCount).toBe(1);
    expect(afterFieldRestore.items[0]?.signal).toMatchObject({
      id: dismissed.id,
      status: 'dismissed',
      summary: 'Entender os cabos',
    });

    database.native
      .prepare('UPDATE entity_types SET is_archived = 1 WHERE id = ?')
      .run(seeded.entityTypeId);
    expect(service.recalculate({ campaignId: seeded.campaignId }).detectedCount).toBe(0);
    expect(service.list({ campaignId: seeded.campaignId }).items[0]?.signal).toMatchObject({
      id: dismissed.id,
      status: 'dismissed',
    });

    database.native
      .prepare('UPDATE entity_types SET is_archived = 0 WHERE id = ?')
      .run(seeded.entityTypeId);
    const afterTypeRestore = service.recalculate({ campaignId: seeded.campaignId });
    expect(afterTypeRestore.detectedCount).toBe(1);
    expect(afterTypeRestore.items[0]?.signal).toMatchObject({
      id: dismissed.id,
      status: 'dismissed',
    });
    expect(
      database.native
        .prepare('SELECT count(*) AS total FROM campaign_signals WHERE campaign_id = ?')
        .get(seeded.campaignId),
    ).toEqual({ total: 1 });
  });

  it('detecta pares exatos por campanha, mantém exceções isoladas e as invalida na edição da fonte', async () => {
    const database = await openDatabase();
    const seeded = seedNeed(database.native, 'Gorel', 'Entender os cabos');
    const otherCampaign = seedNeed(database.native, 'Outra campanha', 'Outro registro');
    const firstFact = seedAssertion(database.native, seeded, 'fact', 'Torre em Vau Negro.');
    seedAssertion(database.native, seeded, 'disproved', 'Torre em Vau Negro.');
    seedAssertion(database.native, seeded, 'fact', 'Torre em Vau Negro.', { canonState: 'draft' });
    seedAssertion(database.native, seeded, 'disproved', 'Torre em Vau-Negro.');
    seedAssertion(database.native, otherCampaign, 'disproved', 'Torre em Vau Negro.');
    const service = createService(database);

    const calculated = service.recalculate({ campaignId: seeded.campaignId });
    expect(calculated.detectedCount).toBe(2);
    const contradiction = calculated.items.find(
      ({ signal }) => signal.signalType === 'potential_contradiction',
    );
    if (contradiction === undefined) throw new Error('O par esperado não foi detectado.');
    expect(contradiction.signal).toMatchObject({
      signalType: 'potential_contradiction',
      priority: 'high',
      status: 'new',
    });
    expect(contradiction.evidence).toHaveLength(2);
    expect(contradiction.evidence.map(({ objectType }) => objectType)).toEqual([
      'assertion',
      'assertion',
    ]);
    expect(contradiction.evidence.map(({ objectName }) => objectName)).toEqual(['Gorel', 'Gorel']);
    expect(JSON.stringify(contradiction)).not.toContain(firstFact.id);

    const repeated = service.recalculate({ campaignId: seeded.campaignId });
    expect(
      repeated.items.filter(({ signal }) => signal.signalType === 'potential_contradiction'),
    ).toHaveLength(1);
    expect(
      repeated.items.find(({ signal }) => signal.id === contradiction.signal.id)?.signal.id,
    ).toBe(contradiction.signal.id);

    const exception = service.markContradictionException({
      campaignId: seeded.campaignId,
      id: contradiction.signal.id,
      revision: contradiction.signal.revision,
    });
    expect(exception.status).toBe('resolved');
    expect(
      service
        .recalculate({ campaignId: seeded.campaignId })
        .items.find(({ signal }) => signal.id === contradiction.signal.id)?.signal.status,
    ).toBe('resolved');
    expect(
      database.native
        .prepare(
          'SELECT count(*) AS total FROM potential_contradiction_exceptions WHERE campaign_id = ?',
        )
        .get(seeded.campaignId),
    ).toEqual({ total: 1 });

    database.native
      .prepare('UPDATE assertions SET statement = ? WHERE id = ?')
      .run('Torre em Vau Negro, sob juramento.', firstFact.id);
    expect(
      database.native
        .prepare(
          'SELECT count(*) AS total FROM potential_contradiction_exceptions WHERE campaign_id = ?',
        )
        .get(seeded.campaignId),
    ).toEqual({ total: 0 });
    expect(
      service
        .list({ campaignId: seeded.campaignId })
        .items.find(({ signal }) => signal.id === contradiction.signal.id)?.signal.status,
    ).toBe('stale');

    database.native
      .prepare('UPDATE assertions SET statement = ? WHERE id = ?')
      .run('Torre em Vau Negro.', firstFact.id);
    const afterReversal = service
      .recalculate({ campaignId: seeded.campaignId })
      .items.find(({ signal }) => signal.id === contradiction.signal.id);
    expect(afterReversal?.signal.status).toBe('new');
    expect(afterReversal?.signal.id).toBe(contradiction.signal.id);
    if (afterReversal === undefined) throw new Error('O sinal reverso deveria continuar visível.');
    service.markContradictionException({
      campaignId: seeded.campaignId,
      id: afterReversal.signal.id,
      revision: afterReversal.signal.revision,
    });
    database.native
      .prepare('UPDATE assertions SET knowledge_state = ? WHERE id = ?')
      .run('rumor', firstFact.id);
    expect(
      database.native
        .prepare('SELECT count(*) AS total FROM potential_contradiction_exceptions')
        .get(),
    ).toEqual({ total: 0 });
    database.native
      .prepare('UPDATE assertions SET knowledge_state = ? WHERE id = ?')
      .run('fact', firstFact.id);
    expect(
      service
        .recalculate({ campaignId: seeded.campaignId })
        .items.find(({ signal }) => signal.id === contradiction.signal.id)?.signal.status,
    ).toBe('new');
  });

  it('invalida exceções após arquivamento/restauração sem afetar outro par', async () => {
    const database = await openDatabase();
    const seeded = seedNeed(database.native, 'Gorel', 'Entender os cabos');
    const otherSubjectId = randomUUID();
    database.native
      .prepare(
        `INSERT INTO entities (id, campaign_id, entity_type_id, name, created_at, updated_at)
         VALUES (?, ?, ?, 'Mira', ?, ?)`,
      )
      .run(otherSubjectId, seeded.campaignId, seeded.entityTypeId, start, start);
    const firstFact = seedAssertion(database.native, seeded, 'fact', 'A torre está aberta.');
    seedAssertion(database.native, seeded, 'disproved', 'A torre está aberta.');
    seedAssertion(database.native, seeded, 'fact', 'A porta está fechada.', {
      subjectEntityId: otherSubjectId,
    });
    seedAssertion(database.native, seeded, 'disproved', 'A porta está fechada.', {
      subjectEntityId: otherSubjectId,
    });
    const service = createService(database);
    const initial = service.recalculate({ campaignId: seeded.campaignId });
    const contradictions = initial.items.filter(
      ({ signal }) => signal.signalType === 'potential_contradiction',
    );
    expect(contradictions).toHaveLength(2);
    const bySubject = new Map(contradictions.map((item) => [item.evidence[0]?.objectName, item]));
    const firstPair = bySubject.get('Gorel');
    const otherPair = bySubject.get('Mira');
    if (!firstPair || !otherPair) throw new Error('Os dois pares de teste não foram detectados.');

    service.markContradictionException({
      campaignId: seeded.campaignId,
      id: firstPair.signal.id,
      revision: firstPair.signal.revision,
    });
    service.markContradictionException({
      campaignId: seeded.campaignId,
      id: otherPair.signal.id,
      revision: otherPair.signal.revision,
    });
    database.native
      .prepare('UPDATE assertions SET archived_at = ? WHERE id = ?')
      .run(start, firstFact.id);
    expect(
      database.native
        .prepare('SELECT count(*) AS total FROM potential_contradiction_exceptions')
        .get(),
    ).toEqual({ total: 1 });
    expect(
      service
        .list({ campaignId: seeded.campaignId })
        .items.find(({ signal }) => signal.id === firstPair.signal.id)?.signal.status,
    ).toBe('stale');
    expect(
      service
        .list({ campaignId: seeded.campaignId })
        .items.find(({ signal }) => signal.id === otherPair.signal.id)?.signal.status,
    ).toBe('resolved');
    database.native
      .prepare('UPDATE assertions SET archived_at = NULL WHERE id = ?')
      .run(firstFact.id);
    expect(
      database.native
        .prepare('SELECT count(*) AS total FROM potential_contradiction_exceptions')
        .get(),
    ).toEqual({ total: 1 });
    const restored = service.recalculate({ campaignId: seeded.campaignId });
    expect(
      restored.items.find(({ signal }) => signal.id === firstPair.signal.id)?.signal.status,
    ).toBe('new');
    expect(
      restored.items.find(({ signal }) => signal.id === otherPair.signal.id)?.signal.status,
    ).toBe('resolved');
  });

  it('compara valores JSON de forma estrutural, sem ignorar ordem de arrays ou diferenças de texto', async () => {
    const database = await openDatabase();
    const seeded = seedNeed(database.native, 'Gorel', 'Entender os cabos');
    seedAssertion(database.native, seeded, 'fact', 'declaração', {
      predicate: 'inventário',
      statement: null,
      value: { armamentos: ['arco', 'lança'], quantidade: 2 },
    });
    seedAssertion(database.native, seeded, 'disproved', 'declaração diferente', {
      predicate: 'inventário',
      statement: null,
      value: { quantidade: 2, armamentos: ['arco', 'lança'] },
    });
    seedAssertion(database.native, seeded, 'fact', 'lista', {
      predicate: 'lista',
      statement: null,
      value: ['norte', 'sul'],
    });
    seedAssertion(database.native, seeded, 'disproved', 'lista', {
      predicate: 'lista',
      statement: null,
      value: ['sul', 'norte'],
    });

    const result = createService(database).recalculate({ campaignId: seeded.campaignId });
    expect(
      result.items.filter(({ signal }) => signal.signalType === 'potential_contradiction'),
    ).toHaveLength(1);
  });

  it('não calcula nem grava par a partir de snapshot concorrente de afirmações', async () => {
    const database = await openDatabase();
    const seeded = seedNeed(database.native, 'Gorel', 'Entender os cabos');
    const fact = seedAssertion(database.native, seeded, 'fact', 'Torre em Vau Negro.');
    seedAssertion(database.native, seeded, 'disproved', 'Torre em Vau Negro.');
    const service = createService(database);
    const first = service.recalculate({ campaignId: seeded.campaignId });
    const contradiction = first.items.find(
      ({ signal }) => signal.signalType === 'potential_contradiction',
    );
    if (contradiction === undefined) throw new Error('O par esperado não foi detectado.');

    const writer = new Database(database.databasePath);
    writer.pragma('busy_timeout = 0');
    database.native.pragma('busy_timeout = 0');
    try {
      writer.exec('BEGIN IMMEDIATE');
      writer
        .prepare('UPDATE assertions SET statement = ? WHERE id = ?')
        .run('Torre em outra cidade.', fact.id);
      expect(() => service.recalculate({ campaignId: seeded.campaignId })).toThrow(
        'O banco está ocupado por outra operação. Tente novamente.',
      );
      expect(
        database.native
          .prepare('SELECT status FROM campaign_signals WHERE id = ?')
          .get(contradiction.signal.id),
      ).toEqual({ status: 'new' });

      writer.exec('COMMIT');
      const current = service.recalculate({ campaignId: seeded.campaignId });
      expect(current.detectedCount).toBe(1); // somente a necessidade textual
      expect(
        current.items.find(({ signal }) => signal.id === contradiction.signal.id)?.signal.status,
      ).toBe('stale');
    } finally {
      if (writer.inTransaction) writer.exec('ROLLBACK');
      writer.close();
    }
  });

  it('preserva identidade, estado, prazo, revisão e evidência na matriz de arquivamento/restauração', async () => {
    const database = await openDatabase();
    const states = ['new', 'viewed', 'dismissed', 'snoozed', 'converted', 'resolved'] as const;
    const sources = ['field', 'entity_type'] as const;
    const archiveAt = '2026-11-14T14:01:00.000Z';
    const restoreAt = '2026-11-14T14:02:00.000Z';

    for (const source of sources) {
      for (const state of states) {
        const seeded = seedNeed(database.native, `${source}-${state}`, `Necessidade ${state}`);
        const activeService = createService(database);
        const initial = activeService.recalculate({ campaignId: seeded.campaignId }).items[0];
        if (initial === undefined) throw new Error('O sinal esperado não foi detectado.');

        let decided = initial.signal;
        if (state === 'viewed')
          decided = activeService.review({
            campaignId: seeded.campaignId,
            id: initial.signal.id,
            revision: initial.signal.revision,
          });
        if (state === 'dismissed')
          decided = activeService.dismiss({
            campaignId: seeded.campaignId,
            id: initial.signal.id,
            revision: initial.signal.revision,
          });
        if (state === 'snoozed')
          decided = activeService.snooze({
            campaignId: seeded.campaignId,
            id: initial.signal.id,
            revision: initial.signal.revision,
            dismissedUntil: '2026-11-14T14:10:00.000Z',
          });
        if (state === 'converted' || state === 'resolved') {
          database.native
            .prepare('UPDATE campaign_signals SET status = ?, revision = revision + 1 WHERE id = ?')
            .run(state, initial.signal.id);
          const current = new CampaignSignalRepository(database.native).findById(
            seeded.campaignId,
            initial.signal.id,
          );
          if (current === null) throw new Error('O sinal não foi persistido.');
          decided = current;
        }

        const beforeArchive = activeService.list({ campaignId: seeded.campaignId }).items[0];
        if (beforeArchive === undefined) throw new Error('O sinal não foi listado.');
        database.native
          .prepare(
            source === 'field'
              ? 'UPDATE field_definitions SET is_archived = 1 WHERE id = ?'
              : 'UPDATE entity_types SET is_archived = 1 WHERE id = ?',
          )
          .run(source === 'field' ? seeded.fieldDefinitionId : seeded.entityTypeId);

        const archived = createService(database, () => archiveAt).recalculate({
          campaignId: seeded.campaignId,
        });
        expect(archived.detectedCount, `${source}/${state}: sem detecção arquivada`).toBe(0);
        const archivedItem = archived.items.find(({ signal }) => signal.id === decided.id);
        if (archivedItem === undefined) throw new Error(`Sinal ausente para ${source}/${state}.`);
        const expectedArchivedState = state === 'new' || state === 'viewed' ? 'stale' : state;
        expect(archivedItem.signal.status, `${source}/${state}: estado arquivado`).toBe(
          expectedArchivedState,
        );
        expect(archivedItem.signal.id).toBe(decided.id);
        expect(archivedItem.signal.dismissedUntil).toBe(decided.dismissedUntil);
        expect(archivedItem.signal.lastDetectedAt).toBe(decided.lastDetectedAt);
        expect(archivedItem.signal.revision).toBe(
          decided.revision + (expectedArchivedState === state ? 0 : 1),
        );
        expect(archivedItem.signal.updatedAt).toBe(
          expectedArchivedState === state ? decided.updatedAt : archiveAt,
        );
        expect(archivedItem.evidence).toEqual(beforeArchive.evidence);

        database.native
          .prepare(
            source === 'field'
              ? 'UPDATE field_definitions SET is_archived = 0 WHERE id = ?'
              : 'UPDATE entity_types SET is_archived = 0 WHERE id = ?',
          )
          .run(source === 'field' ? seeded.fieldDefinitionId : seeded.entityTypeId);
        const restored = createService(database, () => restoreAt).recalculate({
          campaignId: seeded.campaignId,
        });
        expect(restored.detectedCount, `${source}/${state}: detecção restaurada`).toBe(1);
        const restoredItem = restored.items.find(({ signal }) => signal.id === decided.id);
        if (restoredItem === undefined) throw new Error(`Sinal ausente após restaurar ${source}.`);
        expect(restoredItem.signal.id).toBe(decided.id);
        expect(restoredItem.signal.status).toBe(expectedArchivedState);
        expect(restoredItem.signal.dismissedUntil).toBe(decided.dismissedUntil);
        expect(restoredItem.signal.lastDetectedAt).toBe(restoreAt);
        expect(restoredItem.signal.updatedAt).toBe(restoreAt);
        expect(restoredItem.signal.revision).toBe(archivedItem.signal.revision + 1);
        expect(restoredItem.evidence).toEqual(beforeArchive.evidence);
      }
    }
  });

  it('reabre o mesmo estado após reinício', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'campaign-signal-restart-'));
    roots.push(root);
    const directories = getDataDirectories(root);
    await ensureDataDirectories(directories);
    let database = await openApplicationDatabase(directories, new TestLogger());
    contexts.push(database);
    const seeded = seedNeed(database.native, 'Gorel', 'Entender os cabos');
    const service = createService(database);

    const first = service.recalculate({ campaignId: seeded.campaignId });
    expect(first.detectedCount).toBe(1);
    expect(
      database.native
        .prepare('SELECT count(*) AS total FROM campaign_signals WHERE campaign_id = ?')
        .get(seeded.campaignId),
    ).toEqual({ total: 1 });
    const signalBeforeRestart = first.items[0]?.signal;
    if (signalBeforeRestart === undefined) throw new Error('O sinal esperado não foi detectado.');
    const dismissed = service.dismiss({
      campaignId: seeded.campaignId,
      id: signalBeforeRestart.id,
      revision: signalBeforeRestart.revision,
    });

    database.close();
    database = await openApplicationDatabase(directories, new TestLogger());
    contexts.push(database);
    const afterRestart = createService(database).recalculate({ campaignId: seeded.campaignId });
    expect(afterRestart.items).toHaveLength(1);
    expect(afterRestart.items[0]?.signal).toMatchObject({
      id: dismissed.id,
      status: 'dismissed',
      summary: 'Entender os cabos',
    });
    expect(afterRestart.items[0]?.signal.revision).toBe(dismissed.revision);
  });

  it('usa bloqueio real entre conexões, retorna erro explícito e refaz com a fonte atualizada', async () => {
    const database = await openDatabase();
    const seeded = seedNeed(database.native, 'Gorel', 'Texto antigo');
    const service = createService(database);
    const writer = new Database(database.databasePath);
    writer.pragma('busy_timeout = 0');
    database.native.pragma('busy_timeout = 0');

    try {
      writer.exec('BEGIN IMMEDIATE');
      writer
        .prepare('UPDATE field_values SET value_text = ? WHERE entity_id = ?')
        .run('Texto atualizado sob lock', seeded.entityId);

      let lockError: unknown;
      try {
        service.recalculate({ campaignId: seeded.campaignId });
      } catch (error) {
        lockError = error;
      }
      expect(lockError).toMatchObject({
        code: 'DATABASE_BUSY',
        message: 'O banco está ocupado por outra operação. Tente novamente.',
      });
      expect(
        database.native
          .prepare('SELECT count(*) AS total FROM campaign_signals WHERE campaign_id = ?')
          .get(seeded.campaignId),
      ).toEqual({ total: 0 });

      writer.exec('COMMIT');
      const retried = service.recalculate({ campaignId: seeded.campaignId });
      expect(retried.detectedCount).toBe(1);
      expect(retried.items).toHaveLength(1);
      expect(retried.items[0]?.signal.summary).toBe('Texto atualizado sob lock');
      expect(retried.items[0]?.evidence).toMatchObject([
        { objectName: 'Gorel', description: 'Texto atualizado sob lock' },
      ]);
      expect(
        database.native
          .prepare('SELECT count(DISTINCT id) AS ids FROM campaign_signals WHERE campaign_id = ?')
          .get(seeded.campaignId),
      ).toEqual({ ids: 1 });
      expect(
        database.native.prepare('SELECT count(*) AS total FROM signal_evidence').get(),
      ).toEqual({ total: 1 });
    } finally {
      if (writer.inTransaction) writer.exec('ROLLBACK');
      writer.close();
    }
  });

  it('expira para stale quando outra conexão arquiva a fonte antes do prazo do adiamento', async () => {
    const database = await openDatabase();
    const seeded = seedNeed(database.native, 'Gorel', 'Necessidade arquivada antes do prazo');
    const service = createService(database);
    const repository = new CampaignSignalRepository(database.native);
    expect('expireSnoozes' in repository).toBe(false);
    const initial = service.recalculate({ campaignId: seeded.campaignId }).items[0];
    if (initial === undefined) throw new Error('O sinal esperado não foi detectado.');
    const snoozed = service.snooze({
      campaignId: seeded.campaignId,
      id: initial.signal.id,
      revision: initial.signal.revision,
      dismissedUntil: '2026-11-14T14:01:00.000Z',
    });
    const writer = new Database(database.databasePath);

    try {
      writer.exec('BEGIN IMMEDIATE');
      writer
        .prepare('UPDATE field_definitions SET is_archived = 1 WHERE id = ?')
        .run(seeded.fieldDefinitionId);
      writer.exec('COMMIT');
      expect(
        database.native
          .prepare('SELECT is_archived FROM field_definitions WHERE id = ?')
          .get(seeded.fieldDefinitionId),
      ).toEqual({ is_archived: 1 });

      const afterDeadline = createService(database, () => '2026-11-14T14:02:00.000Z').list({
        campaignId: seeded.campaignId,
      });
      expect(afterDeadline.items).toHaveLength(1);
      expect(afterDeadline.items[0]?.signal).toMatchObject({
        id: snoozed.id,
        status: 'stale',
        dismissedUntil: null,
        summary: 'Necessidade arquivada antes do prazo',
      });
      expect(afterDeadline.items[0]?.evidence).toMatchObject([
        { objectName: 'Gorel', description: 'Necessidade arquivada antes do prazo' },
      ]);
      expect(
        database.native
          .prepare('SELECT count(*) AS total FROM campaign_signals WHERE campaign_id = ?')
          .get(seeded.campaignId),
      ).toEqual({ total: 1 });
      expect(database.native.pragma('foreign_key_check')).toEqual([]);
    } finally {
      writer.close();
    }
  });

  it('reverte toda a gravação do recálculo quando a persistência da evidência falha', async () => {
    const database = await openDatabase();
    const seeded = seedNeed(database.native, 'Gorel', 'Entender os cabos');
    const service = createService(database);
    database.native.exec(
      `CREATE TRIGGER reject_signal_evidence
         BEFORE INSERT ON signal_evidence
         BEGIN SELECT RAISE(ABORT, 'induced evidence failure'); END;`,
    );

    expect(() => service.recalculate({ campaignId: seeded.campaignId })).toThrow(
      'induced evidence failure',
    );
    expect(
      database.native
        .prepare('SELECT count(*) AS total FROM campaign_signals WHERE campaign_id = ?')
        .get(seeded.campaignId),
    ).toEqual({ total: 0 });
    expect(database.native.prepare('SELECT count(*) AS total FROM signal_evidence').get()).toEqual({
      total: 0,
    });

    database.native.exec('DROP TRIGGER reject_signal_evidence');
    expect(service.recalculate({ campaignId: seeded.campaignId }).items).toHaveLength(1);
  });

  it('rejeita via IPC recálculo e ações em campanhas arquivadas/na lixeira sem mutar o banco', async () => {
    const database = await openDatabase();
    const seeded = seedNeed(database.native, 'Gorel', 'Conteúdo restrito');
    const service = createService(database);
    const initial = service.recalculate({ campaignId: seeded.campaignId }).items[0];
    if (initial === undefined) throw new Error('O sinal esperado não foi detectado.');
    service.snooze({
      campaignId: seeded.campaignId,
      id: initial.signal.id,
      revision: initial.signal.revision,
      dismissedUntil: '2026-11-15T14:00:00.000Z',
    });
    const handlers = new Map<
      string,
      (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>
    >();
    const unregister = registerCampaignSignalIpcHandlers(
      {
        handle: (channel: string, handler: never) => handlers.set(channel, handler),
        removeHandler: (channel: string) => handlers.delete(channel),
      } as unknown as IpcMain,
      { service, logger: new TestLogger(), authorizedWebContentsId: 7 },
    );

    try {
      const recalculate = handlers.get(campaignSignalChannels.recalculate);
      if (recalculate === undefined) throw new Error('Canal de recálculo não registrado.');
      expect(await recalculate(ipcEvent(7), { campaignId: seeded.campaignId })).toMatchObject({
        ok: true,
        data: { detectedCount: 1 },
      });
      database.native
        .prepare(
          `UPDATE campaign_signals
           SET dismissed_until = '2026-11-14T13:00:00.000Z'
           WHERE id = ?`,
        )
        .run(initial.signal.id);

      for (const status of ['archived', 'deleted'] as const) {
        database.native
          .prepare('UPDATE campaigns SET status = ? WHERE id = ?')
          .run(status, seeded.campaignId);
        const before = database.native
          .prepare('SELECT * FROM campaign_signals WHERE id = ?')
          .get(initial.signal.id);
        const inputs = [
          [campaignSignalChannels.recalculate, { campaignId: seeded.campaignId }],
          [
            campaignSignalChannels.review,
            {
              campaignId: seeded.campaignId,
              id: initial.signal.id,
              revision: initial.signal.revision + 1,
            },
          ],
          [
            campaignSignalChannels.dismiss,
            {
              campaignId: seeded.campaignId,
              id: initial.signal.id,
              revision: initial.signal.revision + 1,
            },
          ],
          [
            campaignSignalChannels.reactivate,
            {
              campaignId: seeded.campaignId,
              id: initial.signal.id,
              revision: initial.signal.revision + 1,
            },
          ],
          [
            campaignSignalChannels.snooze,
            {
              campaignId: seeded.campaignId,
              id: initial.signal.id,
              revision: initial.signal.revision + 1,
              dismissedUntil: '2026-11-16T14:00:00.000Z',
            },
          ],
        ] as const;
        for (const [channel, input] of inputs) {
          const handler = handlers.get(channel);
          if (handler === undefined) throw new Error(`Canal não registrado: ${channel}`);
          const result = await handler(ipcEvent(7), input);
          expect(result).toMatchObject({
            ok: false,
            error: { code: 'INVALID_CAMPAIGN_STATE' },
          });
        }

        const list = handlers.get(campaignSignalChannels.list);
        if (list === undefined) throw new Error('Canal de listagem não registrado.');
        expect(await list(ipcEvent(7), { campaignId: seeded.campaignId })).toMatchObject({
          ok: true,
          data: { items: [{ signal: { status: 'snoozed' } }] },
        });
        const repository = new CampaignSignalRepository(database.native);
        expect(() => repository.recalculate(seeded.campaignId, start)).toThrow(
          'Somente campanhas ativas podem revisar sinais.',
        );
        expect(() =>
          repository.updateStatus(
            seeded.campaignId,
            initial.signal.id,
            initial.signal.revision + 1,
            'dismissed',
            null,
            start,
          ),
        ).toThrow('Somente campanhas ativas podem revisar sinais.');
        expect(
          database.native
            .prepare('SELECT * FROM campaign_signals WHERE id = ?')
            .get(initial.signal.id),
        ).toEqual(before);
      }
    } finally {
      unregister();
    }
  });

  it('mantém dados secretos no escopo GM da campanha proprietária, sem exposição entre campanhas', async () => {
    const database = await openDatabase();
    const secret = seedNeed(database.native, 'Gorel', 'A senha é Lua Azul');
    const unrelated = seedNeed(database.native, 'Outra campanha', 'Texto independente');
    database.native
      .prepare(`UPDATE field_definitions SET secret_by_default = 1 WHERE id = ?`)
      .run(secret.fieldDefinitionId);
    database.native
      .prepare(`UPDATE entities SET knowledge_state = 'secret', visibility = 'gm' WHERE id = ?`)
      .run(secret.entityId);

    const service = createService(database);
    const ownCampaign = service.recalculate({ campaignId: secret.campaignId });
    expect(ownCampaign.items[0]?.signal.summary).toBe('A senha é Lua Azul');
    expect(ownCampaign.items[0]?.evidence[0]?.description).toBe('A senha é Lua Azul');
    expect(service.list({ campaignId: unrelated.campaignId }).items).toEqual([]);
    expect(service.recalculate({ campaignId: unrelated.campaignId }).items[0]?.signal.summary).toBe(
      'Texto independente',
    );
    expect(service.list({ campaignId: secret.campaignId }).items[0]?.signal.summary).toBe(
      'A senha é Lua Azul',
    );
  });
  it('marca condição ausente como obsoleta, expira adiamento sem automatizar reativação e protege revisão concorrente', async () => {
    const database = await openDatabase();
    const seeded = seedNeed(database.native, 'Gorel', 'Entender os cabos');
    const service = createService(database);
    const first = service.recalculate({ campaignId: seeded.campaignId }).items[0];
    if (first === undefined) throw new Error('O sinal esperado não foi detectado.');

    const snoozed = service.snooze({
      campaignId: seeded.campaignId,
      id: first.signal.id,
      revision: first.signal.revision,
      dismissedUntil: '2026-11-14T14:01:00.000Z',
    });
    expect(() =>
      service.dismiss({
        campaignId: seeded.campaignId,
        id: first.signal.id,
        revision: first.signal.revision,
      }),
    ).toThrow('O sinal foi alterado em outra operação.');

    database.native
      .prepare('UPDATE field_values SET value_text = ? WHERE entity_id = ?')
      .run('', seeded.entityId);
    const beforeExpiry = service.recalculate({ campaignId: seeded.campaignId }).items[0];
    expect(beforeExpiry?.signal.status).toBe('snoozed');
    expect(beforeExpiry?.signal.dismissedUntil).toBe('2026-11-14T14:01:00.000Z');

    const afterExpiryService = createService(database, () => '2026-11-14T14:02:00.000Z');
    const afterExpiry = afterExpiryService.recalculate({ campaignId: seeded.campaignId });
    expect(afterExpiry.expiredSnoozes).toBe(1);
    expect(afterExpiry.items[0]?.signal.status).toBe('stale');
    expect(afterExpiry.items[0]?.signal.dismissedUntil).toBeNull();

    const manuallyReactivated = afterExpiryService.reactivate({
      campaignId: seeded.campaignId,
      id: snoozed.id,
      revision: afterExpiry.items[0]?.signal.revision ?? 0,
    });
    expect(manuallyReactivated.status).toBe('viewed');
    expect(
      afterExpiryService.recalculate({ campaignId: seeded.campaignId }).items[0]?.signal.status,
    ).toBe('stale');

    database.native
      .prepare('UPDATE field_values SET value_text = ? WHERE entity_id = ?')
      .run('Entender a origem dos cabos', seeded.entityId);
    const returned = afterExpiryService.recalculate({ campaignId: seeded.campaignId }).items[0];
    expect(returned?.signal.id).toBe(first.signal.id);
    expect(returned?.signal.status).toBe('stale');
    expect(returned?.signal.summary).toBe('Entender a origem dos cabos');
    expect(database.native.prepare('SELECT count(*) AS total FROM events').get()).toEqual({
      total: 0,
    });
  });

  it('só detecta valores textuais need e ignora campos de outra função, tipos não textuais e entidades arquivadas', async () => {
    const database = await openDatabase();
    const seeded = seedNeed(database.native, 'Gorel', 'Entender os cabos');
    const goalField = randomUUID();
    const numericNeedField = randomUUID();
    const secondEntity = randomUUID();
    const now = start;
    database.native
      .prepare(
        `INSERT INTO field_definitions (
          id, entity_type_id, key, label, data_type, semantic_role, created_at, updated_at
        ) VALUES (?, ?, 'objetivo', 'Objetivo', 'short_text', 'goal', ?, ?)`,
      )
      .run(goalField, seeded.entityTypeId, now, now);
    database.native
      .prepare(
        `INSERT INTO field_definitions (
          id, entity_type_id, key, label, data_type, semantic_role, created_at, updated_at
        ) VALUES (?, ?, 'need-score', 'Necessidade numérica', 'number', 'need', ?, ?)`,
      )
      .run(numericNeedField, seeded.entityTypeId, now, now);
    database.native
      .prepare(
        `INSERT INTO field_values (
          id, entity_id, field_definition_id, value_number, created_at, updated_at
        ) VALUES (?, ?, ?, 7, ?, ?)`,
      )
      .run(randomUUID(), seeded.entityId, numericNeedField, now, now);
    database.native
      .prepare(
        `INSERT INTO field_values (
          id, entity_id, field_definition_id, value_text, created_at, updated_at
        ) VALUES (?, ?, ?, 'Encontrar o mapa', ?, ?)`,
      )
      .run(randomUUID(), seeded.entityId, goalField, now, now);
    database.native
      .prepare(
        `INSERT INTO entities (id, campaign_id, entity_type_id, name, created_at, updated_at)
         VALUES (?, ?, ?, 'Arquivada', ?, ?)`,
      )
      .run(secondEntity, seeded.campaignId, seeded.entityTypeId, now, now);
    database.native
      .prepare(
        `INSERT INTO field_values (id, entity_id, field_definition_id, value_text, created_at, updated_at)
         VALUES (?, ?, ?, 'Não detectar', ?, ?)`,
      )
      .run(randomUUID(), secondEntity, seeded.fieldDefinitionId, now, now);
    database.native
      .prepare('UPDATE entities SET archived_at = ? WHERE id = ?')
      .run(now, secondEntity);
    const result = createService(database).recalculate({ campaignId: seeded.campaignId });
    expect(result.detectedCount).toBe(1);
    expect(result.items.map((item) => item.signal.title)).toEqual(['Necessidade explícita: Gorel']);
    expect(
      database.native.prepare('SELECT canon_state FROM entities WHERE id = ?').get(seeded.entityId),
    ).toEqual({ canon_state: 'accepted' });
    expect(database.native.prepare('SELECT count(*) AS total FROM events').get()).toEqual({
      total: 0,
    });
  });

  it('torna necessidade new obsoleta quando o campo deixa de conter texto', async () => {
    const database = await openDatabase();
    const seeded = seedNeed(database.native, 'Gorel', 'Entender os cabos');
    const service = createService(database);
    const initial = service.recalculate({ campaignId: seeded.campaignId }).items[0];
    if (initial === undefined) throw new Error('O sinal esperado não foi detectado.');
    database.native
      .prepare('UPDATE field_values SET value_text = ? WHERE entity_id = ?')
      .run(' \t ', seeded.entityId);

    const stale = service.recalculate({ campaignId: seeded.campaignId }).items[0];
    expect(stale?.signal.id).toBe(initial.signal.id);
    expect(stale?.signal.status).toBe('stale');
    expect(stale?.evidence[0]?.description).toBe('Entender os cabos');
  });

  it('reativa para revisão ao consultar após o prazo quando a necessidade ainda está detectada', async () => {
    const database = await openDatabase();
    const seeded = seedNeed(database.native, 'Gorel', 'Entender os cabos');
    const service = createService(database);
    const first = service.recalculate({ campaignId: seeded.campaignId }).items[0];
    if (first === undefined) throw new Error('O sinal esperado não foi detectado.');
    service.snooze({
      campaignId: seeded.campaignId,
      id: first.signal.id,
      revision: first.signal.revision,
      dismissedUntil: '2026-11-14T14:01:00.000Z',
    });

    const afterDeadline = createService(database, () => '2026-11-14T14:02:00.000Z').list({
      campaignId: seeded.campaignId,
    });
    expect(afterDeadline.items[0]?.signal.status).toBe('new');
    expect(afterDeadline.items[0]?.signal.dismissedUntil).toBeNull();
  });
});

function contextualIpc(service: CampaignSignalService): (input: unknown) => Promise<unknown> {
  const handlers = new Map<
    string,
    (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>
  >();
  registerCampaignSignalIpcHandlers(
    {
      handle: (channel: string, handler: never) => handlers.set(channel, handler),
      removeHandler: (channel: string) => handlers.delete(channel),
    } as unknown as IpcMain,
    { service, logger: new TestLogger(), authorizedWebContentsId: 7 },
  );
  const handler = handlers.get(campaignSignalChannels.getContradictionReview);
  if (handler === undefined) throw new Error('Consulta contextual não registrada.');
  return (input) => handler(ipcEvent(7), input);
}

async function openDatabase(existingRoot?: string): Promise<DatabaseContext> {
  const root = existingRoot ?? (await mkdtemp(path.join(os.tmpdir(), 'campaign-signal-engine-')));
  if (existingRoot === undefined) roots.push(root);
  const directories: DataDirectories = getDataDirectories(root);
  await ensureDataDirectories(directories);
  const context = await openApplicationDatabase(directories, new TestLogger());
  contexts.push(context);
  expect(context.schemaVersion).toBe(23);
  return context;
}

function ipcEvent(senderId: number): IpcMainInvokeEvent {
  const frame = {};
  return { sender: { id: senderId, mainFrame: frame }, senderFrame: frame } as never;
}

function createService(
  database: DatabaseContext,
  now: () => string = () => start,
): CampaignSignalService {
  return new CampaignSignalService({
    repository: new CampaignSignalRepository(database.native),
    campaigns: new CampaignRepository(database.orm),
    now,
  });
}

function seedNeed(
  database: DatabaseContext['native'],
  entityName: string,
  value: string,
): { campaignId: string; entityTypeId: string; entityId: string; fieldDefinitionId: string } {
  const campaignId = randomUUID();
  const entityTypeId = randomUUID();
  const entityId = randomUUID();
  const fieldDefinitionId = randomUUID();
  const now = start;
  database
    .prepare('INSERT INTO campaigns (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(campaignId, `Campanha ${entityName}`, now, now);
  database
    .prepare(
      `INSERT INTO entity_types (
        id, campaign_id, name, singular_name, slug, created_at, updated_at
      ) VALUES (?, ?, 'Personagens', 'Personagem', ?, ?, ?)`,
    )
    .run(entityTypeId, campaignId, `personagens-${campaignId.slice(0, 8)}`, now, now);
  database
    .prepare(
      `INSERT INTO field_definitions (
        id, entity_type_id, key, label, data_type, semantic_role, created_at, updated_at
      ) VALUES (?, ?, 'necessidade', 'Necessidade', 'short_text', 'need', ?, ?)`,
    )
    .run(fieldDefinitionId, entityTypeId, now, now);
  database
    .prepare(
      `INSERT INTO entities (id, campaign_id, entity_type_id, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(entityId, campaignId, entityTypeId, entityName, now, now);
  database
    .prepare(
      `INSERT INTO field_values (id, entity_id, field_definition_id, value_text, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(randomUUID(), entityId, fieldDefinitionId, value, now, now);
  return { campaignId, entityTypeId, entityId, fieldDefinitionId };
}

function seedAssertion(
  database: DatabaseContext['native'],
  seeded: { campaignId: string; entityId: string },
  knowledgeState: 'fact' | 'disproved',
  statement: string,
  options: {
    subjectEntityId?: string;
    canonState?: 'accepted' | 'draft';
    predicate?: string | null;
    objectEntityId?: string | null;
    statement?: string | null;
    value?: unknown;
  } = {},
): { id: string } {
  const id = randomUUID();
  database
    .prepare(
      `INSERT INTO assertions (
        id, campaign_id, subject_entity_id, predicate, object_entity_id, statement,
        value_json, canon_state, knowledge_state, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      seeded.campaignId,
      options.subjectEntityId ?? seeded.entityId,
      options.predicate ?? null,
      options.objectEntityId ?? null,
      Object.hasOwn(options, 'statement') ? (options.statement ?? null) : statement,
      Object.hasOwn(options, 'value') ? JSON.stringify(options.value) : null,
      options.canonState ?? 'accepted',
      knowledgeState,
      start,
      start,
    );
  return { id };
}
