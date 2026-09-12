import { describe, expect, it } from 'vitest';
import {
  createRelationshipTypeInputSchema,
  relationshipTypePageRequestSchema,
  relationshipTypePatchSchema,
} from '../../src/core/contracts/relationship-types';

const campaignId = '00000000-0000-4000-8000-000000000001';

describe('contratos de tipos de relação', () => {
  it('normaliza a criação e aplica valores padrão', () => {
    expect(
      createRelationshipTypeInputSchema.parse({
        campaignId,
        name: '  Trabalha em  ',
        slug: 'trabalha-em',
      }),
    ).toEqual({
      campaignId,
      name: 'Trabalha em',
      slug: 'trabalha-em',
      inverseName: null,
      description: null,
      semanticRole: null,
      isSymmetric: false,
      allowedSourceTypeIds: null,
      allowedTargetTypeIds: null,
      icon: null,
      color: null,
      sortOrder: 0,
    });
  });

  it('rejeita slug, papel semântico, IDs repetidos e patch vazio', () => {
    expect(() =>
      createRelationshipTypeInputSchema.parse({ campaignId, name: 'Conhece', slug: 'Conhece' }),
    ).toThrow();
    expect(() =>
      createRelationshipTypeInputSchema.parse({
        campaignId,
        name: 'Conhece',
        slug: 'conhece',
        semanticRole: 'Conhece Pessoa',
      }),
    ).toThrow();
    const typeId = '10000000-0000-4000-8000-000000000001';
    expect(() =>
      createRelationshipTypeInputSchema.parse({
        campaignId,
        name: 'Conhece',
        slug: 'conhece',
        allowedSourceTypeIds: [typeId, typeId],
      }),
    ).toThrow();
    expect(() => relationshipTypePatchSchema.parse({})).toThrow();
  });

  it('usa paginação ativa e ordenação manual por padrão', () => {
    expect(relationshipTypePageRequestSchema.parse({ campaignId })).toMatchObject({
      campaignId,
      limit: 50,
      filters: { isArchived: false },
      sort: 'sortOrder',
      order: 'asc',
    });
  });
});
