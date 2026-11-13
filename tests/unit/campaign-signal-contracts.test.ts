import { describe, expect, it } from 'vitest';
import {
  campaignSignalGeneratorKindSchema,
  campaignSignalSchema,
  campaignSignalScoreSchema,
  campaignSignalSeverityLabels,
  campaignSignalStatusSchema,
  campaignSignalTypeSchema,
  signalEvidenceSchema,
  signalEvidenceObjectTypeSchema,
  campaignSignalTimestampSchema,
  campaignSignalRevisionSchema,
  signalEvidenceSortOrderSchema,
  campaignSignalIdentifierSchema,
} from '../../src/core/contracts/campaign-signals';

const uuid = '00000000-0000-4000-8000-000000000001';
const timestamp = '2026-11-13T12:00:00.000Z';

describe('contratos da fundação de sinais de campanha', () => {
  it('rejeita datas inválidas e inteiros fora da representação segura, aceita os limites', () => {
    for (const value of [
      '9999-99-99T99:99:99.999Z',
      '2026-02-30T12:00:00.000Z',
      'not-a-date',
      '\t\n',
    ])
      expect(campaignSignalTimestampSchema.safeParse(value).success).toBe(false);
    expect(campaignSignalTimestampSchema.parse(timestamp)).toBe(timestamp);
    for (const schema of [campaignSignalRevisionSchema, signalEvidenceSortOrderSchema]) {
      expect(schema.parse(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
      for (const value of [Number.MAX_SAFE_INTEGER + 1, 0.5, -1])
        expect(schema.safeParse(value).success).toBe(false);
    }
    expect(campaignSignalRevisionSchema.safeParse(0).success).toBe(false);
    expect(signalEvidenceSortOrderSchema.parse(0)).toBe(0);
    expect(
      campaignSignalIdentifierSchema.safeParse('00000000-0000-4000-8000-00000000000-').success,
    ).toBe(false);
  });
  it('valida o conjunto explícito de tipos, estados, severidade e generator kind', () => {
    for (const value of [
      'explicit_need',
      'blocked_goal',
      'open_consequence',
      'clock_pressure',
      'shared_resource',
      'recent_change',
      'open_thread',
      'stale_thread',
      'uninvestigated_clue',
      'ignored_demand',
      'cross_plot_bridge',
      'potential_contradiction',
      'inactive_entity',
      'unresolved_mystery',
      'unfulfilled_promise',
    ])
      expect(campaignSignalTypeSchema.parse(value)).toBe(value);
    for (const value of ['new', 'viewed', 'dismissed', 'snoozed', 'converted', 'resolved', 'stale'])
      expect(campaignSignalStatusSchema.parse(value)).toBe(value);

    expect(campaignSignalGeneratorKindSchema.parse('deterministic')).toBe('deterministic');
    for (const objectType of ['entity', 'relationship', 'assertion', 'event', 'session', 'note'])
      expect(signalEvidenceObjectTypeSchema.parse(objectType)).toBe(objectType);
    expect(() => signalEvidenceObjectTypeSchema.parse('clock')).toThrow();
    expect(campaignSignalSeverityLabels).toEqual({
      low: 'Baixa',
      medium: 'Média',
      high: 'Alta',
    });
    expect(() => campaignSignalTypeSchema.parse('future_type')).toThrow();
    expect(() => campaignSignalStatusSchema.parse('ignored')).toThrow();
    expect(() => campaignSignalGeneratorKindSchema.parse('ai')).toThrow();
  });

  it('limita score a inteiros entre -5 e +5', () => {
    for (const score of [-5, -1, 0, 1, 5])
      expect(campaignSignalScoreSchema.parse(score)).toBe(score);
    for (const score of [-6, 6, 0.5, Number.NaN])
      expect(() => campaignSignalScoreSchema.parse(score)).toThrow();
  });

  it('valida sinais e evidências sem aceitar propriedades extras ou referências malformadas', () => {
    const signal = {
      id: uuid,
      campaignId: uuid,
      signalType: 'open_thread',
      title: 'Fio sem resposta',
      summary: 'A pergunta da torre segue sem resposta.',
      score: 2,
      severity: 'medium',
      status: 'new',
      generatedAt: timestamp,
      lastDetectedAt: timestamp,
      dismissedUntil: null,
      ruleVersion: '1',
      generatorKind: 'deterministic',
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 1,
    };
    expect(campaignSignalSchema.parse(signal)).toEqual(signal);
    for (const field of ['title', 'summary', 'ruleVersion'])
      for (const value of ['\t\n', '\u00a0\u2003\ufeff'])
        expect(campaignSignalSchema.safeParse({ ...signal, [field]: value }).success).toBe(false);
    expect(() => campaignSignalSchema.parse({ ...signal, extra: true })).toThrow();
    expect(() => campaignSignalSchema.parse({ ...signal, score: 5.1 })).toThrow();
    expect(() => campaignSignalSchema.parse({ ...signal, revision: 1.5 })).toThrow();
    expect(() => campaignSignalSchema.parse({ ...signal, generatedAt: 'not-a-date' })).toThrow();
    expect(() => campaignSignalSchema.parse({ ...signal, dismissedUntil: ' ' })).toThrow();
    expect(() => campaignSignalSchema.parse({ ...signal, title: '   ' })).toThrow();
    expect(() =>
      campaignSignalSchema.parse({ ...signal, id: '00000000-0000-4000-8000-00000000000A' }),
    ).toThrow();
    expect(() =>
      campaignSignalSchema.parse({ ...signal, id: '00000000--0000-4000-8000-000000000001' }),
    ).toThrow();

    const evidence = {
      id: '00000000-0000-4000-8000-000000000002',
      signalId: uuid,
      objectType: 'entity',
      objectId: '00000000-0000-4000-8000-000000000003',
      role: 'related',
      description: null,
      graphPath: [uuid],
      sortOrder: 0,
      createdAt: timestamp,
    };
    expect(signalEvidenceSchema.parse(evidence)).toEqual(evidence);
    for (const field of ['role', 'description'])
      for (const value of ['\t\n', '\u00a0\u2003\ufeff'])
        expect(signalEvidenceSchema.safeParse({ ...evidence, [field]: value }).success).toBe(false);
    expect(() => signalEvidenceSchema.parse({ ...evidence, graphPath: 'not-an-array' })).toThrow();
    expect(() => signalEvidenceSchema.parse({ ...evidence, sortOrder: -1 })).toThrow();
    expect(() => signalEvidenceSchema.parse({ ...evidence, sortOrder: 0.5 })).toThrow();
    expect(() => signalEvidenceSchema.parse({ ...evidence, createdAt: 'not-a-date' })).toThrow();
    expect(() =>
      signalEvidenceSchema.parse({ ...evidence, id: '00000000-0000-4000-8000-00000000000A' }),
    ).toThrow();
    expect(() =>
      signalEvidenceSchema.parse({
        ...evidence,
        objectId: '00000000-0000-4000-8000-00000000000A',
      }),
    ).toThrow();
    expect(() => signalEvidenceSchema.parse({ ...evidence, extra: true })).toThrow();
  });
});
