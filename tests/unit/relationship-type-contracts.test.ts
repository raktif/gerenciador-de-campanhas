import { describe, expect, it } from 'vitest';
import {
  createRelationshipTypeInputSchema,
  moveRelationshipTypeInputSchema,
  relationshipTypePageRequestSchema,
  relationshipTypePatchSchema,
  relationshipTypeSchema,
} from '../../src/core/contracts/relationship-types';

const campaignId = '00000000-0000-4000-8000-000000000001';
const sourceId = '30000000-0000-4000-8000-000000000001';
const targetId = '30000000-0000-4000-8000-000000000002';

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

  it('mantém a ordem fora dos inputs públicos de criação e edição', () => {
    expect(() =>
      createRelationshipTypeInputSchema.parse({
        campaignId,
        name: 'Conhece',
        slug: 'conhece',
        sortOrder: 2,
      }),
    ).toThrow();
    expect(() => relationshipTypePatchSchema.parse({ sortOrder: 2 })).toThrow();
  });

  it('normaliza cores canônicas nas mutações e preserva leitura legada', () => {
    expect(
      createRelationshipTypeInputSchema.parse({
        campaignId,
        name: 'Conhece',
        slug: 'conhece',
        color: '  #a1b2c3 ',
      }),
    ).toMatchObject({ color: '#A1B2C3' });
    expect(relationshipTypePatchSchema.parse({ color: '#abcdef' })).toEqual({
      color: '#ABCDEF',
    });
    expect(relationshipTypePatchSchema.parse({ color: null })).toEqual({ color: null });
    expect(() => relationshipTypePatchSchema.parse({ color: 'amber' })).toThrow();

    const legacy = relationshipTypeSchema.parse({
      id: sourceId,
      campaignId,
      packId: null,
      name: 'Conhece',
      slug: 'conhece',
      inverseName: null,
      description: null,
      semanticRole: null,
      isSymmetric: true,
      allowedSourceTypeIds: null,
      allowedTargetTypeIds: null,
      icon: null,
      color: 'amber',
      sortOrder: 0,
      isArchived: false,
      createdAt: '2026-08-28T12:00:00.000Z',
      updatedAt: '2026-08-28T12:00:00.000Z',
      revision: 1,
    });
    expect(legacy.color).toBe('amber');
  });

  it('valida movimento relativo estrito com revisões da origem e do destino', () => {
    const input = {
      campaignId,
      sourceId,
      sourceRevision: 2,
      targetId,
      targetRevision: 3,
      placement: 'after' as const,
    };
    expect(moveRelationshipTypeInputSchema.parse(input)).toEqual(input);
    expect(() => moveRelationshipTypeInputSchema.parse({ ...input, targetRevision: -1 })).toThrow();
    expect(() => moveRelationshipTypeInputSchema.parse({ ...input, targetId: sourceId })).toThrow();
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
