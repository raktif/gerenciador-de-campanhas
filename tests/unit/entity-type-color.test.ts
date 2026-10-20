import { describe, expect, it } from 'vitest';
import { entityTypeColorStyle } from '../../src/renderer/features/entity-types/entity-type-color';

describe('cor do cartão de tipo de entidade', () => {
  it('aplica somente cor canônica com foreground de maior contraste', () => {
    expect(entityTypeColorStyle('#B45309')).toEqual({
      backgroundColor: '#B45309',
      color: '#FFFFFF',
    });
    expect(entityTypeColorStyle('#FDE68A')).toEqual({
      backgroundColor: '#FDE68A',
      color: '#000000',
    });
    expect(entityTypeColorStyle('#b45309')).toEqual({
      backgroundColor: '#B45309',
      color: '#FFFFFF',
    });
  });

  it('não injeta valores legados ou nulos como CSS', () => {
    expect(entityTypeColorStyle(null)).toBeUndefined();
    expect(entityTypeColorStyle('amber')).toBeUndefined();
    expect(entityTypeColorStyle('var(--danger)')).toBeUndefined();
  });
});
