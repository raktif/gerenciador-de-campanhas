import { describe, expect, it } from 'vitest';
import {
  acceptDemandSchema,
  demandContentSchema,
  demandTargetRequestSchema,
  transformDemandSchema,
  type Demand,
  type DemandDetails,
} from '../../src/core/contracts/demands';
import { isClosedDemand, planDemandTransition } from '../../src/core/domain/demand';
import { toSafeError } from '../../src/core/errors/app-error';
import { presentUserFacingError } from '../../src/core/errors/user-facing-error';
const id = '10000000-0000-4000-8000-000000000001';
const content = { title: 'Título', need: 'Necessidade', requesterEntityId: id, urgency: 'low' };
function details(
  status: Demand['status'] = 'available',
  prior: Demand['statusBeforeArchive'] = null,
): DemandDetails {
  return {
    demand: { status, statusBeforeArchive: prior } as Demand,
    links: [],
    children: [],
    canResolve: true,
  };
}
describe('3B.3 contratos e domínio determinístico', () => {
  it('recusa conteúdo que excederia o contrato existente de Evento, sem truncar texto', () => {
    expect(
      demandContentSchema.safeParse({ ...content, need: 'a'.repeat(99998), summary: '' }).success,
    ).toBe(true);
    expect(
      demandContentSchema.safeParse({ ...content, need: 'a'.repeat(99999), summary: '' }).success,
    ).toBe(false);
  });
  it('exige título, necessidade, solicitante e urgência manual; não aceita alvos fora do escopo', () => {
    expect(demandContentSchema.parse(content)).toMatchObject({
      obstacle: '',
      risks: '',
      summary: '',
      links: [],
    });
    for (const patch of [
      { title: '' },
      { need: '   ' },
      { requesterEntityId: undefined },
      { urgency: undefined },
      { links: [{ targetType: 'thread', targetId: id }] },
      { links: [{ targetType: 'clock', targetId: id, role: 'requester' }] },
    ])
      expect(demandContentSchema.safeParse({ ...content, ...patch }).success).toBe(false);
    expect(
      acceptDemandSchema.safeParse({
        campaignId: id,
        signalId: id,
        signalRevision: 1,
        content,
        canonState: 'accepted',
      }).success,
    ).toBe(false);
    expect(
      transformDemandSchema.safeParse({
        campaignId: id,
        id,
        revision: 1,
        content,
        idempotencyKey: id,
        confirmed: false,
      }).success,
    ).toBe(false);
    expect(
      demandTargetRequestSchema.safeParse({ campaignId: id, targetType: 'event' }).success,
    ).toBe(false);
  });
  it('delimita transições e confirmação sem inferir resolução ou eventos', () => {
    expect(planDemandTransition(details(), { action: 'activate' })).toBe('active');
    for (const state of ['available', 'active'] as const) {
      expect(() =>
        planDemandTransition(details(state), { action: 'resolve', confirmed: false }),
      ).toThrow('Confirme');
      expect(planDemandTransition(details(state), { action: 'resolve', confirmed: true })).toBe(
        'resolved',
      );
      expect(planDemandTransition(details(state), { action: 'fail' })).toBe('failed');
      expect(planDemandTransition(details(state), { action: 'ignore' })).toBe('ignored');
    }
    for (const state of ['failed', 'ignored'] as const)
      expect(planDemandTransition(details(state), { action: 'reopen' })).toBe('available');
    expect(() => planDemandTransition(details('resolved'), { action: 'reopen' })).toThrow();
    expect(planDemandTransition(details('archived', 'active'), { action: 'restore' })).toBe(
      'active',
    );
  });
  it('filha arquivada só encerra se o estado preservado é terminal; gate vem antes da confirmação', () => {
    for (const state of ['resolved', 'failed', 'ignored'] as const) {
      expect(isClosedDemand(details(state).demand)).toBe(true);
      expect(isClosedDemand(details('archived', state).demand)).toBe(true);
    }
    const parent = details();
    parent.children = [details('archived', 'active').demand];
    expect(() => planDemandTransition(parent, { action: 'resolve' })).toThrow('Encerre');
  });
  it('entidades arquivadas bloqueiam restaurar/reabrir, não arquivar', () => {
    const current = details('failed');
    current.links = [
      { targetType: 'entity', targetId: id, role: 'requester', label: 'Gorel', archived: true },
    ];
    expect(() => planDemandTransition(current, { action: 'reopen' })).toThrow('Restaure');
    expect(planDemandTransition(current, { action: 'archive' })).toBe('archived');
  });
  it('traduz tokens SQLite embrulhados sem expor SQL e orienta criar outro Need', () => {
    const error = new Error('consulta interna', { cause: new Error('DEMAND_NEED_LOCKED') });
    const safe = toSafeError(error);
    expect(safe.code).toBe('DEMAND_NEED_LOCKED');
    expect(presentUserFacingError(safe, 'entities.mutate').suggestedAction).toContain(
      'outro campo de Need',
    );
    expect(toSafeError(new Error('SELECT secrets FROM private'))).toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });
});
