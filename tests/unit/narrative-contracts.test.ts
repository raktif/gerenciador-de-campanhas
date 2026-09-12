import { describe, expect, it } from 'vitest';
import {
  canonStateSchema,
  identifierSchema,
  manualNarrativeDefaults,
  narrativeMetadataSchema,
  revisionSchema,
  sessionStatusSchema,
  sourceSchema,
  timestampSchema,
} from '../../src/core/contracts/narrative';

describe('contratos narrativos compartilhados', () => {
  it('mantém os valores padrão de uma entrada manual', () => {
    expect(manualNarrativeDefaults).toEqual({
      canonState: 'accepted',
      knowledgeState: 'fact',
      visibility: 'gm',
      originKind: 'manual',
    });
  });

  it('valida metadados narrativos independentes', () => {
    expect(
      narrativeMetadataSchema.parse({
        canonState: 'accepted',
        knowledgeState: 'rumor',
        visibility: 'players',
        originKind: 'session',
        sourceId: '00000000-0000-4000-8000-000000000001',
      }),
    ).toEqual({
      canonState: 'accepted',
      knowledgeState: 'rumor',
      visibility: 'players',
      originKind: 'session',
      sourceId: '00000000-0000-4000-8000-000000000001',
    });
  });

  it('rejeita estados, identificadores, datas e revisões inválidos', () => {
    expect(() => canonStateSchema.parse('published')).toThrow();
    expect(() => sessionStatusSchema.parse('paused')).toThrow();
    expect(() => identifierSchema.parse('id-livre')).toThrow();
    expect(() => timestampSchema.parse('31/08/2026')).toThrow();
    expect(() => revisionSchema.parse(0)).toThrow();
  });

  it('exige a referência correspondente ao tipo da fonte', () => {
    const base = {
      id: '00000000-0000-4000-8000-000000000001',
      sessionId: null,
      documentChunkId: null,
      aiRunId: null,
      importBatchId: null,
      rulesetPackId: null,
      description: null,
      createdAt: '2026-08-31T12:00:00.000Z',
    };
    expect(
      sourceSchema.parse({
        ...base,
        kind: 'session',
        sessionId: '10000000-0000-4000-8000-000000000001',
      }),
    ).toMatchObject({ kind: 'session' });
    expect(() => sourceSchema.parse({ ...base, kind: 'session' })).toThrow();
    expect(() => sourceSchema.parse({ ...base, kind: 'generator' })).toThrow();
  });
});
