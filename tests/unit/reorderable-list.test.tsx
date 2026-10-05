import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReorderableList } from '../../src/renderer/components/reorderable-list';
import {
  directionFromAltArrow,
  dropPlacement,
  relativeMoveForDirection,
} from '../../src/renderer/components/reorderable-list-model';

const items = [
  { id: 'a', label: 'Alfa' },
  { id: 'b', label: 'Beta' },
  { id: 'c', label: 'Gama' },
];

describe('modelo da lista reorden\u00e1vel', () => {
  it('calcula movimentos relativos e respeita os limites', () => {
    expect(relativeMoveForDirection(items, 'b', 'up')).toEqual({
      sourceId: 'b',
      targetId: 'a',
      placement: 'before',
    });
    expect(relativeMoveForDirection(items, 'b', 'down')).toEqual({
      sourceId: 'b',
      targetId: 'c',
      placement: 'after',
    });
    expect(relativeMoveForDirection(items, 'a', 'up')).toBeNull();
    expect(relativeMoveForDirection(items, 'c', 'down')).toBeNull();
    expect(() => relativeMoveForDirection(items, 'ausente', 'up')).toThrow('origem');
  });

  it('reconhece somente Alt com setas e divide o alvo do drop ao meio', () => {
    expect(directionFromAltArrow({ altKey: true, key: 'ArrowUp' })).toBe('up');
    expect(directionFromAltArrow({ altKey: true, key: 'ArrowDown' })).toBe('down');
    expect(directionFromAltArrow({ altKey: false, key: 'ArrowUp' })).toBeNull();
    expect(directionFromAltArrow({ altKey: true, key: 'Enter' })).toBeNull();
    expect(dropPlacement(19, 10, 20)).toBe('before');
    expect(dropPlacement(20, 10, 20)).toBe('after');
  });
});

describe('ReorderableList', () => {
  it('exp\u00f5e instru\u00e7\u00f5es, controles nomeados e regi\u00e3o viva', () => {
    const markup = renderToStaticMarkup(
      <ReorderableList
        ariaLabel="Ordenar tipos"
        getLabel={(item) => item.label}
        items={items}
        onMove={() => undefined}
        renderItem={(item) => <strong>{item.label}</strong>}
      />,
    );

    expect(markup).toContain('aria-label="Ordenar tipos"');
    expect(markup).toContain('Mover Alfa para cima');
    expect(markup).toContain('Mover Beta para baixo');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('Alt com seta');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('☰');
    expect(markup).toContain('↑');
    expect(markup).toContain('↓');
    expect(markup).not.toContain('\\u2630');
    expect(markup).not.toContain('\\u2191');
    expect(markup).not.toContain('\\u2193');
  });

  it('representa estado ocupado e erro acess\u00edvel', () => {
    const markup = renderToStaticMarkup(
      <ReorderableList
        ariaLabel="Ordenar campos"
        busy
        error="Falha ao mover."
        getLabel={(item) => item.label}
        items={items}
        onMove={() => undefined}
        renderItem={(item) => item.label}
      />,
    );

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Falha ao mover.');
  });

  it('oculta todos os affordances de reordena\u00e7\u00e3o em uma lista somente leitura', () => {
    const markup = renderToStaticMarkup(
      <ReorderableList
        ariaLabel="Tipos arquivados"
        getLabel={(item) => item.label}
        items={items}
        onMove={() => undefined}
        reorderable={false}
        renderItem={(item) => item.label}
      />,
    );

    expect(markup).not.toContain('Mover Alfa para cima');
    expect(markup).not.toContain('Arrastar para reordenar');
    expect(markup).not.toContain('aria-describedby');
    expect(markup).not.toContain('draggable="true"');
    expect(markup).not.toContain('tabindex="0"');
  });

  it('não associa instruções nem controles quando existe somente um item', () => {
    const markup = renderToStaticMarkup(
      <ReorderableList
        ariaLabel="Tipo único"
        getLabel={(item) => item.label}
        items={items.slice(0, 1)}
        onMove={() => undefined}
        renderItem={(item) => item.label}
      />,
    );

    expect(markup).not.toContain('Alt com seta');
    expect(markup).not.toContain('aria-describedby');
    expect(markup).not.toContain('Reordenar Alfa');
    expect(markup).not.toContain('draggable="true"');
    expect(markup).not.toContain('tabindex="0"');
  });
});
