import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RelationshipType } from '../../src/core/contracts/relationship-types';
import {
  RelationshipTypeForm,
  toCreateValues,
  toPatch,
} from '../../src/renderer/features/relationship-types/relationship-type-form';

describe('formulário de tipo de relação', () => {
  it('usa o seletor visual compartilhado no lugar da entrada livre', () => {
    const markup = renderToStaticMarkup(
      createElement(RelationshipTypeForm, {
        busy: false,
        entityTypes: [],
        error: null,
        mode: 'create',
        onCancel: () => undefined,
        onSubmit: () => Promise.resolve(),
      }),
    );

    expect(markup).toContain('aria-label="Paleta de cores"');
    expect(markup.match(/name="relationship-type-color-palette"/g)).toHaveLength(13);
    expect(markup).toContain('Seletor visual');
    expect(markup).toContain('Matiz');
    expect(markup).toContain('Saturação');
    expect(markup).toContain('Luminosidade');
    expect(markup).toContain('Cor hexadecimal');
    expect(markup).toContain('Ícone');
    expect(markup).not.toContain('Slug');
  });

  it('normaliza a cor na criação e preserva null', () => {
    expect(toCreateValues({ ...emptyValues, name: 'Conhece', color: '#abcdef' })).toMatchObject({
      color: '#ABCDEF',
    });
    expect(toCreateValues({ ...emptyValues, name: 'Conhece', color: '  ' })).toMatchObject({
      color: null,
    });
  });

  it('preserva valor legado intocado ao editar outro campo', () => {
    const legacy = { ...relationshipType, color: 'amber' };
    expect(
      toPatch({ ...toFormValues(legacy), description: 'Descrição atualizada.' }, legacy),
    ).toEqual({ description: 'Descrição atualizada.' });
  });

  it('preserva cores históricas com espaços ou string vazia ao editar outro campo', () => {
    for (const color of [' amber ', '']) {
      const historical = { ...relationshipType, color };
      expect(
        toPatch({ ...toFormValues(historical), description: 'Descrição atualizada.' }, historical),
      ).toEqual({ description: 'Descrição atualizada.' });
    }
  });

  it('normaliza substituição explícita, permite limpar e não cria patch vazio', () => {
    const values = toFormValues(relationshipType);
    expect(toPatch({ ...values, color: '#abcdef' }, relationshipType)).toEqual({
      color: '#ABCDEF',
    });
    expect(toPatch({ ...values, color: '' }, relationshipType)).toEqual({ color: null });
    expect(toPatch(values, relationshipType)).toBeNull();
  });
});

const emptyValues = {
  name: '',
  inverseName: '',
  description: '',
  semanticRole: '',
  isSymmetric: false,
  allowedSourceTypeIds: [] as string[],
  allowedTargetTypeIds: [] as string[],
  icon: '',
  color: '',
};

const relationshipType: RelationshipType = {
  id: '30000000-0000-4000-8000-000000000001',
  campaignId: '00000000-0000-4000-8000-000000000001',
  packId: null,
  name: 'Conhece',
  slug: 'conhece',
  inverseName: null,
  description: null,
  semanticRole: null,
  isSymmetric: false,
  allowedSourceTypeIds: null,
  allowedTargetTypeIds: null,
  icon: null,
  color: '#B45309',
  sortOrder: 0,
  isArchived: false,
  createdAt: '2026-08-28T12:00:00.000Z',
  updatedAt: '2026-08-28T12:00:00.000Z',
  revision: 1,
};

function toFormValues(type: RelationshipType): typeof emptyValues {
  return {
    name: type.name,
    inverseName: type.inverseName ?? '',
    description: type.description ?? '',
    semanticRole: type.semanticRole ?? '',
    isSymmetric: type.isSymmetric,
    allowedSourceTypeIds: type.allowedSourceTypeIds ?? [],
    allowedTargetTypeIds: type.allowedTargetTypeIds ?? [],
    icon: type.icon ?? '',
    color: type.color ?? '',
  };
}
