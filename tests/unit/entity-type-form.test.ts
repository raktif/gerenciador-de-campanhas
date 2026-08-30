import { describe, expect, it } from 'vitest';
import type { EntityType } from '../../src/core/contracts/entity-types';
import {
  toCreateEntityTypeValues,
  toEntityTypePatch,
} from '../../src/renderer/features/entity-types/entity-type-form';

describe('formulário de tipo de entidade', () => {
  it('normaliza a criação e omite apresentação vazia', () => {
    expect(
      toCreateEntityTypeValues({
        name: '  Personagens  ',
        singularName: '  Personagem  ',
        slug: '  personagens  ',
        description: '   ',
        icon: '',
        color: '  #92400e  ',
        sortOrder: '10',
      }),
    ).toEqual({
      name: 'Personagens',
      singularName: 'Personagem',
      slug: 'personagens',
      color: '#92400e',
      sortOrder: 10,
    });
  });

  it('gera somente alterações e permite limpar campos opcionais', () => {
    expect(
      toEntityTypePatch(
        {
          name: entityType.name,
          singularName: '  Protagonista  ',
          slug: entityType.slug,
          description: '   ',
          icon: entityType.icon ?? '',
          color: entityType.color ?? '',
          sortOrder: '20',
        },
        entityType,
      ),
    ).toEqual({ singularName: 'Protagonista', description: null, sortOrder: 20 });
  });

  it('não cria atualização quando nada mudou', () => {
    expect(
      toEntityTypePatch(
        {
          name: entityType.name,
          singularName: entityType.singularName,
          slug: entityType.slug,
          description: entityType.description ?? '',
          icon: entityType.icon ?? '',
          color: entityType.color ?? '',
          sortOrder: String(entityType.sortOrder),
        },
        entityType,
      ),
    ).toBeNull();
  });
});

const entityType: EntityType = {
  id: '10000000-0000-4000-8000-000000000001',
  campaignId: '00000000-0000-4000-8000-000000000001',
  packId: null,
  name: 'Personagens',
  singularName: 'Personagem',
  slug: 'personagens',
  description: 'Pessoas importantes.',
  icon: 'P',
  color: '#92400e',
  sortOrder: 10,
  isSystem: false,
  isArchived: false,
  createdAt: '2026-08-28T12:00:00.000Z',
  updatedAt: '2026-08-28T12:00:00.000Z',
  revision: 1,
};
