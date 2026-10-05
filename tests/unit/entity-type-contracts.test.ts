import { describe, expect, it } from 'vitest';
import {
  createEntityTypeInputSchema,
  entityTypePageRequestSchema,
  entityTypePatchSchema,
  moveEntityTypeInputSchema,
} from '../../src/core/contracts/entity-types';

const campaignId = '00000000-0000-4000-8000-000000000001';
const sourceId = '10000000-0000-4000-8000-000000000001';
const targetId = '10000000-0000-4000-8000-000000000002';

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

  it('mantém a ordem fora dos inputs públicos de criação e edição', () => {
    expect(() =>
      createEntityTypeInputSchema.parse({
        campaignId,
        name: 'Personagens',
        singularName: 'Personagem',
        slug: 'personagens',
        sortOrder: 2,
      }),
    ).toThrow();
    expect(() => entityTypePatchSchema.parse({ sortOrder: 2 })).toThrow();
  });

  it('valida movimento relativo estrito com revisões da origem e do destino', () => {
    const input = {
      campaignId,
      sourceId,
      sourceRevision: 2,
      targetId,
      targetRevision: 3,
      placement: 'before' as const,
    };
    expect(moveEntityTypeInputSchema.parse(input)).toEqual(input);
    expect(() => moveEntityTypeInputSchema.parse({ ...input, targetId: sourceId })).toThrow();
    expect(() => moveEntityTypeInputSchema.parse({ ...input, unexpected: true })).toThrow();
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
