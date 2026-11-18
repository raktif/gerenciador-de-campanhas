import { describe, expect, it } from 'vitest';
import {
  clockDivisionCounts,
  clockStatuses,
  clockTypes,
  clockSchema,
  createClockInputSchema,
  updateClockInputSchema,
} from '../../src/core/contracts/clocks';

const campaignId = '00000000-0000-4000-8000-000000000001';
const id = '10000000-0000-4000-8000-000000000001';
const entityId = '20000000-0000-4000-8000-000000000001';
const timestamp = '2026-11-16T14:00:00.000Z';

describe('contratos de Relógios', () => {
  it('restringe picklist de divisões, estados e tipos aos valores deliberados', () => {
    expect(clockDivisionCounts).toEqual([4, 6, 8, 10, 12]);
    expect(clockStatuses).toEqual(['active', 'completed']);
    expect(clockTypes).toEqual([
      'progress',
      'threat',
      'countdown',
      'project',
      'investigation',
      'custom',
    ]);
    for (const total of clockDivisionCounts)
      expect(
        createClockInputSchema.parse({
          campaignId,
          idempotencyKey: '30000000-0000-4000-8000-000000000006',
          name: 'Relógio',
          clockType: 'countdown',
          segmentsTotal: total,
          segmentsFilled: total,
          entityId,
          consequence: 'A consequência do relógio.',
          generateEvent: false,
        }).segmentsTotal,
      ).toBe(total);
  });

  it('rejeita total fora da picklist, preenchimento fracionário, excedente e estados removidos', () => {
    const base = {
      campaignId,
      idempotencyKey: '30000000-0000-4000-8000-000000000007',
      name: 'Relógio',
      clockType: 'progress',
      entityId,
      consequence: 'A consequência.',
    };
    for (const segmentsTotal of [0, 5, 7, 9, 11, 13, 4.5])
      expect(createClockInputSchema.safeParse({ ...base, segmentsTotal }).success).toBe(false);
    expect(
      createClockInputSchema.safeParse({
        campaignId,
        name: 'Sem chave',
        clockType: 'progress',
        segmentsTotal: 4,
        entityId,
        consequence: 'Não deve ser criado sem chave.',
      }).success,
    ).toBe(false);
    expect(
      createClockInputSchema.safeParse({
        ...base,
        segmentsTotal: 4,
        segmentsFilled: 5,
      }).success,
    ).toBe(false);
    expect(
      createClockInputSchema.safeParse({
        ...base,
        segmentsTotal: 4,
        segmentsFilled: 2.5,
      }).success,
    ).toBe(false);
    expect(() =>
      updateClockInputSchema.parse({
        campaignId,
        id,
        revision: 1,
        status: 'inactive',
        patch: { name: 'Mudança' },
      }),
    ).toThrow();
    expect(() =>
      createClockInputSchema.parse({
        ...base,
        segmentsTotal: 4,
        status: 'failed',
      }),
    ).toThrow();
  });

  it('permite conclusão parcial e exige que total preenchido esteja concluído', () => {
    const base = {
      id,
      campaignId,
      name: 'Objetivo',
      description: null,
      consequence: 'A consequência potencial.',
      clockType: 'countdown',
      segmentsTotal: 6,
      entityId,
      entityName: 'Entidade',
      entityArchivedAt: null,
      canonState: 'accepted',
      knowledgeState: 'fact',
      visibility: 'gm',
      originKind: 'manual',
      sourceId: null,
      sessionId: null,
      generatedEventId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 1,
    } as const;
    expect(clockSchema.safeParse({ ...base, segmentsFilled: 0, status: 'completed' }).success).toBe(
      true,
    );
    expect(clockSchema.safeParse({ ...base, segmentsFilled: 3, status: 'completed' }).success).toBe(
      true,
    );
    expect(clockSchema.safeParse({ ...base, segmentsFilled: 6, status: 'active' }).success).toBe(
      false,
    );
    expect(clockSchema.safeParse({ ...base, segmentsFilled: 6, status: 'completed' }).success).toBe(
      true,
    );
  });

  it('exige decisão explícita de Evento quando atualização completa todas as divisões', () => {
    const request = {
      campaignId,
      id,
      revision: 1,
      patch: { segmentsTotal: 4, segmentsFilled: 4 },
    };
    expect(updateClockInputSchema.safeParse(request).success).toBe(false);
    expect(updateClockInputSchema.safeParse({ ...request, generateEvent: false }).success).toBe(
      true,
    );
    expect(updateClockInputSchema.safeParse({ ...request, generateEvent: true }).success).toBe(
      true,
    );
  });
});
