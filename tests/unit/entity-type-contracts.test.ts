import { describe, expect, it } from 'vitest';
import {
  createEntityTypeInputSchema,
  entityTypePageRequestSchema,
  entityTypePatchSchema,
} from '../../src/core/contracts/entity-types';

const campaignId = '00000000-0000-4000-8000-000000000001';

describe('contratos de tipos de entidade', () => {
  it('normaliza a criação e aplica valores padrão', () => {
    expect(
      createEntityTypeInputSchema.parse({
        campaignId,
        name: '  Personagens  ',
        singularName: '  Personagem  ',
        slug: 'personagens-jogadores',
      }),
    ).toEqual({
      campaignId,
      name: 'Personagens',
      singularName: 'Personagem',
      slug: 'personagens-jogadores',
      sortOrder: 0,
    });
  });

  it('rejeita slugs instáveis e atualizações vazias', () => {
    expect(() =>
      createEntityTypeInputSchema.parse({
        campaignId,
        name: 'Personagens',
        singularName: 'Personagem',
        slug: 'Personagens--Jogadores',
      }),
    ).toThrow();
    expect(() => entityTypePatchSchema.parse({})).toThrow();
  });

  it('configura paginação ativa e ordenação manual por padrão', () => {
    expect(entityTypePageRequestSchema.parse({ campaignId })).toMatchObject({
      campaignId,
      limit: 50,
      filters: { isArchived: false },
      sort: 'sortOrder',
      order: 'asc',
    });
  });
});
