import { describe, expect, it } from 'vitest';
import { sessionClosingSteps, sessionClosingWorkflowSchema, sessionPreparationItemSchema, updateSessionClosingStepInputSchema } from '../../src/core/contracts/session-closing';

describe('contratos do encerramento de sessão', () => {
  it('define as oito etapas e valida estados de retomada', () => {
    expect(sessionClosingSteps).toHaveLength(8);
    expect(updateSessionClosingStepInputSchema.safeParse({ campaignId: crypto.randomUUID(), sessionId: crypto.randomUUID(), step: 'events', revision: 1, status: 'completed' }).success).toBe(true);
    expect(updateSessionClosingStepInputSchema.safeParse({ campaignId: crypto.randomUUID(), sessionId: crypto.randomUUID(), step: 'unknown', revision: 1, status: 'completed' }).success).toBe(false);
  });
  it('rejeita checklist incompleta e item de preparação sem revisão positiva', () => {
    expect(sessionClosingWorkflowSchema.safeParse({ campaignId: crypto.randomUUID(), sessionId: crypto.randomUUID(), steps: [] }).success).toBe(false);
    expect(sessionPreparationItemSchema.safeParse({ id: crypto.randomUUID(), campaignId: crypto.randomUUID(), sessionId: crypto.randomUUID(), objectType: 'clock', objectId: crypto.randomUUID(), label: 'Relógio', reason: 'Ativo', selected: false, updatedAt: new Date().toISOString(), revision: 0 }).success).toBe(false);
  });
});
