import { describe, expect, it } from 'vitest';
import { moveRelative } from '../../src/core/ordering/move-relative';

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] as const;

describe('movimento relativo', () => {
  it('move para antes sem alterar a coleção original', () => {
    const result = moveRelative(items, { sourceId: 'd', targetId: 'b', placement: 'before' });

    expect(result.map(({ id }) => id)).toEqual(['a', 'd', 'b', 'c']);
    expect(items.map(({ id }) => id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('move para depois compensando a remoção da origem', () => {
    expect(
      moveRelative(items, { sourceId: 'a', targetId: 'c', placement: 'after' }).map(({ id }) => id),
    ).toEqual(['b', 'c', 'a', 'd']);
  });

  it('preserva a ordem em movimentos adjacentes equivalentes', () => {
    expect(
      moveRelative(items, { sourceId: 'b', targetId: 'a', placement: 'after' }).map(({ id }) => id),
    ).toEqual(['a', 'b', 'c', 'd']);
  });

  it('rejeita origem igual ao destino, itens ausentes e IDs duplicados', () => {
    expect(() =>
      moveRelative(items, { sourceId: 'a', targetId: 'a', placement: 'before' }),
    ).toThrow('diferentes');
    expect(() =>
      moveRelative(items, { sourceId: 'x', targetId: 'a', placement: 'before' }),
    ).toThrow('origem');
    expect(() => moveRelative(items, { sourceId: 'a', targetId: 'x', placement: 'after' })).toThrow(
      'destino',
    );
    expect(() =>
      moveRelative([{ id: 'a' }, { id: 'a' }], {
        sourceId: 'a',
        targetId: 'b',
        placement: 'before',
      }),
    ).toThrow('duplicado');
  });
});
