import { describe, expect, it } from 'vitest';
import {
  createEntityInputSchema,
  entityPageRequestSchema,
  updateEntityInputSchema,
} from '../../src/core/contracts/entities';
const campaignId = '00000000-0000-4000-8000-000000000001';
const entityTypeId = '10000000-0000-4000-8000-000000000001';

describe('contratos de entidades', () => {
  it('normaliza criação manual com estados padrão', () => {
    expect(createEntityInputSchema.parse({ campaignId, entityTypeId, name: '  Aris  ' })).toEqual({
      campaignId,
      entityTypeId,
      name: 'Aris',
      summary: null,
      canonState: 'accepted',
      knowledgeState: 'fact',
      visibility: 'gm',
      originKind: 'manual',
      sourceId: null,
      fieldValues: [],
      referenceValues: [],
    });
  });
  it('rejeita atualização sem alterações', () => {
    expect(() =>
      updateEntityInputSchema.parse({
        campaignId,
        id: '20000000-0000-4000-8000-000000000001',
        revision: 1,
      }),
    ).toThrow();
  });
  it('aplica paginação ativa e ordenação por nome', () => {
    expect(entityPageRequestSchema.parse({ campaignId })).toMatchObject({
      limit: 50,
      filters: { archived: false },
      sort: 'name',
      order: 'asc',
    });
  });
});
