import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { AppError } from '../../core/errors/app-error';
import { sessionClosingSteps, sessionClosingStepSchema, sessionClosingWorkflowSchema, sessionPreparationItemSchema, sessionPreparationSchema, type GetSessionPreparationInput, type SessionClosingStep, type SessionClosingStepRecord, type SessionClosingWorkflow, type SessionPreparation, type SessionPreparationItem, type SessionPreparationObjectType } from '../../core/contracts/session-closing';

type Row = Record<string, unknown>;
export class SessionClosingRepository {
  public constructor(private readonly database: Database.Database) {}

  public getWorkflow(campaignId: string, sessionId: string, now: string): SessionClosingWorkflow {
    this.requireSession(campaignId, sessionId);
    this.database.transaction(() => {
      const insert = this.database.prepare('INSERT OR IGNORE INTO session_closing_steps (id, campaign_id, session_id, step, status, completed_at, updated_at, revision) VALUES (?, ?, ?, ?, \'pending\', NULL, ?, 1)');
      for (const step of sessionClosingSteps) insert.run(randomUUID(), campaignId, sessionId, step, now);
    })();
    const rows = this.database.prepare('SELECT * FROM session_closing_steps WHERE campaign_id = ? AND session_id = ? ORDER BY rowid').all(campaignId, sessionId) as Row[];
    return sessionClosingWorkflowSchema.parse({ campaignId, sessionId, steps: rows.map(mapStep) });
  }

  public updateStep(input: { campaignId: string; sessionId: string; step: SessionClosingStep; revision: number; status: SessionClosingStepRecord['status']; now: string }): SessionClosingWorkflow {
    this.requireSession(input.campaignId, input.sessionId);
    const completedAt = input.status === 'pending' ? null : input.now;
    const result = this.database.prepare('UPDATE session_closing_steps SET status = ?, completed_at = ?, updated_at = ?, revision = revision + 1 WHERE campaign_id = ? AND session_id = ? AND step = ? AND revision = ?').run(input.status, completedAt, input.now, input.campaignId, input.sessionId, input.step, input.revision);
    if (result.changes !== 1) throw new AppError('SESSION_CLOSING_REVISION_CONFLICT', 'A etapa do encerramento foi alterada. Recarregue o fluxo e tente novamente.');
    return this.getWorkflow(input.campaignId, input.sessionId, input.now);
  }

  public quickClose(campaignId: string, sessionId: string, now: string): SessionClosingWorkflow {
    this.requireSession(campaignId, sessionId);
    this.getWorkflow(campaignId, sessionId, now);
    const pending = this.database.prepare("SELECT step, revision FROM session_closing_steps WHERE campaign_id = ? AND session_id = ? AND status = 'pending' ORDER BY rowid").all(campaignId, sessionId) as { step: SessionClosingStep; revision: number }[];
    for (const step of pending) this.updateStep({ campaignId, sessionId, step: step.step, revision: step.revision, status: 'skipped', now });
    return this.getWorkflow(campaignId, sessionId, now);
  }

  public getPreparation(input: GetSessionPreparationInput, now: string): SessionPreparation {
    this.requireSession(input.campaignId, input.sessionId);
    this.syncCandidates(input.campaignId, input.sessionId, now);
    const rows = this.database.prepare('SELECT * FROM session_preparation_items WHERE campaign_id = ? AND session_id = ? ORDER BY object_type, object_id').all(input.campaignId, input.sessionId) as Row[];
    return sessionPreparationSchema.parse({ campaignId: input.campaignId, sessionId: input.sessionId, items: rows.map((row) => this.mapPreparationItem(input.campaignId, row)) });
  }

  public selectPreparationItem(input: { campaignId: string; sessionId: string; id: string; revision: number; selected: boolean; now: string }): SessionPreparation {
    this.requireSession(input.campaignId, input.sessionId);
    const result = this.database.prepare('UPDATE session_preparation_items SET selected = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND campaign_id = ? AND session_id = ? AND revision = ?').run(input.selected ? 1 : 0, input.now, input.id, input.campaignId, input.sessionId, input.revision);
    if (result.changes !== 1) throw new AppError('SESSION_PREPARATION_REVISION_CONFLICT', 'A seleção da próxima sessão foi alterada. Recarregue a preparação e tente novamente.');
    return this.getPreparation({ campaignId: input.campaignId, sessionId: input.sessionId }, input.now);
  }

  private syncCandidates(campaignId: string, sessionId: string, now: string): void {
    const rows = this.database.prepare(`SELECT id, 'story_thread' AS object_type, id AS object_id FROM story_threads WHERE campaign_id = ? AND status IN ('open', 'active', 'dormant')
      UNION ALL SELECT id, 'clock', id FROM clocks WHERE campaign_id = ? AND status = 'active'
      UNION ALL SELECT id, 'demand', id FROM demands WHERE campaign_id = ? AND status IN ('available', 'active')
      UNION ALL SELECT id, 'signal', id FROM campaign_signals WHERE campaign_id = ? AND status IN ('new', 'viewed', 'snoozed')`).all(campaignId, campaignId, campaignId, campaignId) as Row[];
    const insert = this.database.prepare('INSERT OR IGNORE INTO session_preparation_items (id, campaign_id, session_id, object_type, object_id, story_thread_id, clock_id, demand_id, signal_id, selected, updated_at, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1)');
    for (const row of rows) {
      const type = String(row.object_type) as SessionPreparationObjectType;
      insert.run(randomUUID(), campaignId, sessionId, type, String(row.object_id), type === 'story_thread' ? row.object_id : null, type === 'clock' ? row.object_id : null, type === 'demand' ? row.object_id : null, type === 'signal' ? row.object_id : null, now);
    }
  }

  private mapPreparationItem(campaignId: string, row: Row): SessionPreparationItem {
    const type = String(row.object_type) as SessionPreparationObjectType; const objectId = String(row.object_id); let label = 'Registro'; let reason = 'Elemento relevante detectado deterministicamente.';
    if (type === 'story_thread') { const source = this.database.prepare('SELECT title, status FROM story_threads WHERE id = ? AND campaign_id = ?').get(objectId, campaignId) as Row | undefined; label = textValue(source?.title) || 'Fio arquivado'; reason = `Fio aberto em estado ${textValue(source?.status) || 'historico'}.`; }
    if (type === 'clock') { const source = this.database.prepare('SELECT name, segments_filled, segments_total FROM clocks WHERE id = ? AND campaign_id = ?').get(objectId, campaignId) as Row | undefined; label = textValue(source?.name) || 'Relogio arquivado'; reason = `Relogio ativo: ${textValue(source?.segments_filled) || '0'}/${textValue(source?.segments_total) || '0'} divisoes.`; }
    if (type === 'demand') { const source = this.database.prepare('SELECT title, urgency FROM demands WHERE id = ? AND campaign_id = ?').get(objectId, campaignId) as Row | undefined; label = textValue(source?.title) || 'Demanda arquivada'; reason = `Demanda ${textValue(source?.urgency) || 'pendente'} ainda disponivel.`; }
    if (type === 'signal') { const source = this.database.prepare('SELECT title, summary FROM campaign_signals WHERE id = ? AND campaign_id = ?').get(objectId, campaignId) as Row | undefined; label = textValue(source?.title) || 'Sinal historico'; reason = textValue(source?.summary) || 'Sinal deterministico aguardando revisao.'; }
    return sessionPreparationItemSchema.parse({ id: String(row.id), campaignId, sessionId: String(row.session_id), objectType: type, objectId, label, reason, selected: Boolean(row.selected), updatedAt: String(row.updated_at), revision: Number(row.revision) });
  }

  private requireSession(campaignId: string, sessionId: string): void { const row = this.database.prepare('SELECT id FROM sessions WHERE id = ? AND campaign_id = ?').get(sessionId, campaignId); if (row === undefined) throw new AppError('SESSION_NOT_FOUND', 'A sessão não foi encontrada nesta campanha.'); }
}

function textValue(value: unknown): string { if (typeof value === 'string') return value; if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') return value.toString(); return ''; }
function mapStep(row: Row): SessionClosingStepRecord { return sessionClosingStepSchema.parse({ id: textValue(row.id), campaignId: textValue(row.campaign_id), sessionId: textValue(row.session_id), step: row.step, status: row.status, completedAt: row.completed_at === null ? null : textValue(row.completed_at), updatedAt: textValue(row.updated_at), revision: Number(row.revision) }); }
