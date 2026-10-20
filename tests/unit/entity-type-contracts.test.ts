import { describe, expect, it } from 'vitest';
import {
  createEntityTypeInputSchema,
  entityTypeSchema,
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

  it('aceita somente identificadores estáveis do catálogo nas novas mutações', () => {
    expect(
      createEntityTypeInputSchema.parse({
        campaignId,
        name: 'Personagens',
        singularName: 'Personagem',
        slug: 'personagens',
        icon: 'person',
      }),
    ).toMatchObject({ icon: 'person' });
    expect(entityTypePatchSchema.parse({ icon: 'forest' })).toEqual({ icon: 'forest' });
    expect(entityTypePatchSchema.parse({ icon: null })).toEqual({ icon: null });

    for (const icon of ['P', '🧙', '<svg />', 'unknown']) {
      expect(() =>
        createEntityTypeInputSchema.parse({
          campaignId,
          name: 'Personagens',
          singularName: 'Personagem',
          slug: 'personagens',
          icon,
        }),
      ).toThrow();
      expect(() => entityTypePatchSchema.parse({ icon })).toThrow();
    }
  });

  it('normaliza cores canônicas nas mutações e preserva leitura legada', () => {
    expect(
      createEntityTypeInputSchema.parse({
        campaignId,
        name: 'Personagens',
        singularName: 'Personagem',
        slug: 'personagens',
        color: '  #a1b2c3 ',
      }),
    ).toMatchObject({ color: '#A1B2C3' });
    expect(entityTypePatchSchema.parse({ color: '#abcdef' })).toEqual({ color: '#ABCDEF' });
    expect(entityTypePatchSchema.parse({ color: null })).toEqual({ color: null });
    expect(() => entityTypePatchSchema.parse({ color: 'amber' })).toThrow();

    const legacy = entityTypeSchema.parse({
      id: sourceId,
      campaignId,
      packId: null,
      name: 'Personagens',
      singularName: 'Personagem',
      slug: 'personagens',
      description: null,
      icon: null,
      color: 'amber',
      sortOrder: 0,
      isSystem: false,
      isArchived: false,
      createdAt: '2026-08-28T12:00:00.000Z',
      updatedAt: '2026-08-28T12:00:00.000Z',
      revision: 1,
    });
    expect(legacy.color).toBe('amber');
  });

  it('preserva a leitura de ícones legados sem aceitá-los em novas mutações', () => {
    const legacy = entityTypeSchema.parse({
      id: sourceId,
      campaignId,
      packId: null,
      name: 'Personagens',
      singularName: 'Personagem',
      slug: 'personagens',
      description: null,
      icon: 'P',
      color: null,
      sortOrder: 0,
      isSystem: false,
      isArchived: false,
      createdAt: '2026-08-28T12:00:00.000Z',
      updatedAt: '2026-08-28T12:00:00.000Z',
      revision: 1,
    });

    expect(legacy.icon).toBe('P');
    expect(entityTypePatchSchema.parse({ name: 'Heróis' })).toEqual({ name: 'Heróis' });
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
