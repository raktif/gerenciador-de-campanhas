import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { EntityType } from '../../src/core/contracts/entity-types';
import {
  EntityTypeForm,
  toCreateEntityTypeValues,
  toEntityTypePatch,
} from '../../src/renderer/features/entity-types/entity-type-form';

describe('formulário de tipo de entidade', () => {
  it('usa o seletor visual no lugar da entrada livre', () => {
    const markup = renderToStaticMarkup(
      createElement(EntityTypeForm, {
        busy: false,
        error: null,
        mode: 'create',
        onCancel: () => undefined,
        onSubmit: () => Promise.resolve(),
      }),
    );

    expect(markup).not.toContain('Ícone ou símbolo');
    expect(markup.match(/type="radio"/g)).toHaveLength(34);
    expect(markup).toContain('<legend');
    expect(markup).toContain('Ícone');
    expect(markup).toContain('Paleta de cores');
    expect(markup).toContain('Seletor visual');
    expect(markup).toContain('Cor hexadecimal');
  });

  it('normaliza a criação e omite apresentação vazia', () => {
    expect(
      toCreateEntityTypeValues({
        name: '  Personagens  ',
        singularName: '  Personagem  ',
        slug: '  personagens  ',
        description: '   ',
        icon: null,
        color: '  #92400e  ',
      }),
    ).toEqual({
      name: 'Personagens',
      singularName: 'Personagem',
      slug: 'personagens',
      color: '#92400E',
    });
  });

  it('edita outro campo sem remover implicitamente um ícone legado', () => {
    expect(
      toEntityTypePatch(
        {
          name: entityType.name,
          singularName: '  Protagonista  ',
          slug: entityType.slug,
          description: '   ',
          icon: { legacy: entityType.icon ?? '' },
          color: entityType.color ?? '',
        },
        entityType,
      ),
    ).toEqual({ singularName: 'Protagonista', description: null });
  });

  it('preserva cor legada intocada e somente a substitui por valor canônico explícito', () => {
    const legacy = { ...entityType, color: 'amber' };
    expect(
      toEntityTypePatch(
        {
          name: legacy.name,
          singularName: 'Protagonista',
          slug: legacy.slug,
          description: legacy.description ?? '',
          icon: { legacy: legacy.icon ?? '' },
          color: legacy.color,
        },
        legacy,
      ),
    ).toEqual({ singularName: 'Protagonista' });

    expect(
      toEntityTypePatch(
        {
          name: legacy.name,
          singularName: legacy.singularName,
          slug: legacy.slug,
          description: legacy.description ?? '',
          icon: { legacy: legacy.icon ?? '' },
          color: '#abcdef',
        },
        legacy,
      ),
    ).toEqual({ color: '#ABCDEF' });
  });

  it('preserva cores históricas com espaços ou string vazia ao editar outro campo', () => {
    for (const color of [' amber ', '']) {
      const historical = { ...entityType, color };
      expect(
        toEntityTypePatch(
          {
            name: historical.name,
            singularName: 'Protagonista',
            slug: historical.slug,
            description: historical.description ?? '',
            icon: { legacy: historical.icon ?? '' },
            color,
          },
          historical,
        ),
      ).toEqual({ singularName: 'Protagonista' });
    }
  });

  it('gera mutações válidas ao escolher um ícone ou Nenhum', () => {
    const values = {
      name: entityType.name,
      singularName: entityType.singularName,
      slug: entityType.slug,
      description: entityType.description ?? '',
      icon: 'person' as const,
      color: entityType.color ?? '',
    };
    expect(toEntityTypePatch(values, entityType)).toEqual({ icon: 'person' });
    expect(toEntityTypePatch({ ...values, icon: null }, entityType)).toEqual({ icon: null });
  });

  it('não cria atualização quando nada mudou', () => {
    expect(
      toEntityTypePatch(
        {
          name: entityType.name,
          singularName: entityType.singularName,
          slug: entityType.slug,
          description: entityType.description ?? '',
          icon: { legacy: entityType.icon ?? '' },
          color: entityType.color ?? '',
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
