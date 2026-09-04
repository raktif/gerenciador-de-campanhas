import { describe, expect, it } from 'vitest';
import {
  assertionPageRequestSchema,
  assertionSchema,
  createAssertionInputSchema,
  updateAssertionInputSchema,
} from '../../src/core/contracts/assertions';

const campaignId = '00000000-0000-4000-8000-000000000001';
const subjectEntityId = '30000000-0000-4000-8000-000000000001';
const assertionId = '50000000-0000-4000-8000-000000000001';
const timestamp = '2026-09-02T12:00:00.000Z';

describe('contratos de afirmações', () => {
  it('normaliza texto e aplica metadados manuais e paginação seguros', () => {
    expect(
      createAssertionInputSchema.parse({
        campaignId,
        subjectEntityId,
        statement: '  Os cabos vibram durante a madrugada.  ',
      }),
    ).toEqual({
      campaignId,
      subjectEntityId,
      predicate: null,
      objectEntityId: null,
      statement: 'Os cabos vibram durante a madrugada.',
      value: null,
      canonState: 'accepted',
      knowledgeState: 'fact',
      visibility: 'gm',
      originKind: 'manual',
      sourceId: null,
    });
    expect(assertionPageRequestSchema.parse({ campaignId })).toEqual({
      campaignId,
      limit: 50,
      filters: { archived: false },
      sort: 'updatedAt',
      order: 'desc',
    });
  });

  it('aceita declaração textual ou estrutura de predicado com objeto ou JSON', () => {
    expect(
      createAssertionInputSchema.parse({
        campaignId,
        subjectEntityId,
        predicate: 'possui estado',
        value: { status: 'interditada', riscos: ['desabamento'] },
        knowledgeState: 'possibility',
      }),
    ).toMatchObject({ predicate: 'possui estado', knowledgeState: 'possibility' });
    expect(
      createAssertionInputSchema.parse({
        campaignId,
        subjectEntityId,
        predicate: 'conhece',
        objectEntityId: '30000000-0000-4000-8000-000000000002',
      }),
    ).toMatchObject({ predicate: 'conhece' });
  });

  it('rejeita conteúdo incompleto, JSON não serializável e patches vazios', () => {
    expect(() => createAssertionInputSchema.parse({ campaignId, subjectEntityId })).toThrow();
    expect(() =>
      createAssertionInputSchema.parse({ campaignId, subjectEntityId, predicate: 'sabe' }),
    ).toThrow();
    expect(() =>
      createAssertionInputSchema.parse({
        campaignId,
        subjectEntityId,
        predicate: 'registrou',
        value: { invalid: undefined },
      }),
    ).toThrow();
    expect(() =>
      updateAssertionInputSchema.parse({ campaignId, id: assertionId, revision: 1, patch: {} }),
    ).toThrow();
  });

  it('valida a forma persistida e todos os filtros narrativos', () => {
    const assertion = assertionSchema.parse({
      id: assertionId,
      campaignId,
      subjectEntityId,
      predicate: null,
      objectEntityId: null,
      statement: 'Os cabos podem pertencer à Rede Bélica.',
      value: null,
      canonState: 'accepted',
      knowledgeState: 'possibility',
      visibility: 'gm',
      originKind: 'manual',
      sourceId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      revision: 1,
    });
    expect(assertion.knowledgeState).toBe('possibility');
    expect(
      assertionPageRequestSchema.parse({
        campaignId,
        filters: {
          entityId: subjectEntityId,
          canonState: 'accepted',
          knowledgeState: 'possibility',
          visibility: 'gm',
          originKind: 'manual',
          archived: false,
        },
        sort: 'createdAt',
        order: 'asc',
      }),
    ).toMatchObject({
      filters: { knowledgeState: 'possibility', originKind: 'manual' },
      sort: 'createdAt',
      order: 'asc',
    });
  });
});
