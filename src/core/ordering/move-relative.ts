export const relativePlacements = ['before', 'after'] as const;
export type RelativePlacement = (typeof relativePlacements)[number];

export interface RelativeMove {
  sourceId: string;
  targetId: string;
  placement: RelativePlacement;
}

export function moveRelative<Item extends { id: string }>(
  items: readonly Item[],
  move: RelativeMove,
): Item[] {
  if (move.sourceId === move.targetId)
    throw new Error('A origem e o destino devem ser diferentes.');

  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id))
      throw new Error(`Identificador duplicado na cole\u00e7\u00e3o: ${item.id}`);
    ids.add(item.id);
  }
  if (!ids.has(move.sourceId)) throw new Error('O item de origem n\u00e3o foi encontrado.');
  if (!ids.has(move.targetId)) throw new Error('O item de destino n\u00e3o foi encontrado.');

  const withoutSource = items.filter((item) => item.id !== move.sourceId);
  const targetIndex = withoutSource.findIndex((item) => item.id === move.targetId);
  const insertionIndex = targetIndex + (move.placement === 'after' ? 1 : 0);
  const source = items.find((item) => item.id === move.sourceId);
  if (source === undefined) throw new Error('O item de origem n\u00e3o foi encontrado.');

  return [
    ...withoutSource.slice(0, insertionIndex),
    source,
    ...withoutSource.slice(insertionIndex),
  ];
}
