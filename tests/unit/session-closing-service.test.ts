import { describe, expect, it, vi } from 'vitest';
import { SessionClosingService } from '../../src/main/services/session-closing-service';
import type { SessionClosingRepository } from '../../src/db/repositories/session-closing-repository';

const campaignId = crypto.randomUUID(); const sessionId = crypto.randomUUID();
const campaigns = { findById: () => ({ id: campaignId, status: 'active' }) as never };
const workflow = {} as never;
function repository(updateStep = vi.fn()) { return { updateStep, getWorkflow: vi.fn(() => workflow), quickClose: vi.fn(() => workflow), getPreparation: vi.fn(), selectPreparationItem: vi.fn() } as unknown as SessionClosingRepository; }

describe('SessionClosingService e recálculo de sinais', () => {
  it('recalcula antes de concluir a etapa signals', () => {
    const order: string[] = []; const update = vi.fn(() => { order.push('step'); return workflow; }); const signals = { recalculate: vi.fn(() => { order.push('signals'); return {} as never; }) };
    new SessionClosingService({ repository: repository(update), campaigns, signals }).updateStep({ campaignId, sessionId, step: 'signals', revision: 1, status: 'completed' });
    expect(signals.recalculate).toHaveBeenCalledWith({ campaignId }); expect(order).toEqual(['signals', 'step']);
  });
  it('não conclui a etapa quando o recálculo falha', () => {
    const update = vi.fn(); const signals = { recalculate: vi.fn(() => { throw new Error('falha determinística'); }) };
    expect(() => new SessionClosingService({ repository: repository(update), campaigns, signals }).updateStep({ campaignId, sessionId, step: 'signals', revision: 1, status: 'completed' })).toThrow('falha determinística');
    expect(update).not.toHaveBeenCalled();
  });
  it('não exige recálculo ao ignorar ou reabrir a etapa', () => {
    const update = vi.fn(() => workflow); const signals = { recalculate: vi.fn(() => ({}) as never) };
    const service = new SessionClosingService({ repository: repository(update), campaigns, signals });
    service.updateStep({ campaignId, sessionId, step: 'signals', revision: 1, status: 'skipped' }); service.updateStep({ campaignId, sessionId, step: 'signals', revision: 2, status: 'pending' });
    expect(signals.recalculate).not.toHaveBeenCalled(); expect(update).toHaveBeenCalledTimes(2);
  });
});
