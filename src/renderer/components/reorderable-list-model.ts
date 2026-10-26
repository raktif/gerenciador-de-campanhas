import type { RelativeMove, RelativePlacement } from '../../core/ordering/move-relative';

export type MoveDirection = 'up' | 'down';

export function relativeMoveForDirection(
  items: readonly { id: string }[],
  sourceId: string,
  direction: MoveDirection,
): RelativeMove | null {
  const sourceIndex = items.findIndex(({ id }) => id === sourceId);
  if (sourceIndex < 0) throw new Error('O item de origem n\u00e3o foi encontrado.');
  const targetIndex = direction === 'up' ? sourceIndex - 1 : sourceIndex + 1;
  const target = items[targetIndex];
  if (target === undefined) return null;
  return {
    sourceId,
    targetId: target.id,
    placement: direction === 'up' ? 'before' : 'after',
  };
}

export function directionFromAltArrow(input: {
  altKey: boolean;
  key: string;
}): MoveDirection | null {
  if (!input.altKey) return null;
  if (input.key === 'ArrowUp') return 'up';
  if (input.key === 'ArrowDown') return 'down';
  return null;
}

export function dropPlacement(pointerY: number, top: number, height: number): RelativePlacement {
  return pointerY < top + height / 2 ? 'before' : 'after';
}
