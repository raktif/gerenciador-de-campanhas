import { useId, useState } from 'react';
import type { RelativeMove, RelativePlacement } from '../../core/ordering/move-relative';
import {
  directionFromAltArrow,
  dropPlacement,
  relativeMoveForDirection,
  type MoveDirection,
} from './reorderable-list-model';

export interface ReorderableListProps<Item extends { id: string }> {
  ariaLabel: string;
  busy?: boolean;
  className?: string;
  error?: string | null;
  getLabel: (item: Item) => string;
  itemClassName?: string;
  items: readonly Item[];
  onMove: (move: RelativeMove) => Promise<void> | void;
  reorderable?: boolean;
  renderItem: (item: Item) => React.ReactNode;
}

interface DropTarget {
  id: string;
  placement: RelativePlacement;
}

export function ReorderableList<Item extends { id: string }>({
  ariaLabel,
  busy = false,
  className,
  error = null,
  getLabel,
  itemClassName,
  items,
  onMove,
  reorderable = true,
  renderItem,
}: ReorderableListProps<Item>): React.JSX.Element {
  const instructionsId = useId();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [moving, setMoving] = useState(false);
  const [internalError, setInternalError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const occupied = busy || moving;
  const presentedError = error ?? internalError;
  const canReorder = reorderable && items.length > 1;

  async function requestMove(move: RelativeMove): Promise<void> {
    if (occupied || !canReorder) return;
    const source = items.find(({ id }) => id === move.sourceId);
    const target = items.find(({ id }) => id === move.targetId);
    if (source === undefined || target === undefined || source.id === target.id) return;

    setMoving(true);
    setInternalError(null);
    try {
      await onMove(move);
      setAnnouncement(
        `${getLabel(source)} movido para ${move.placement === 'before' ? 'antes' : 'depois'} de ${getLabel(target)}.`,
      );
    } catch {
      const message = `N\u00e3o foi poss\u00edvel mover ${getLabel(source)}. Tente novamente.`;
      setInternalError(message);
      setAnnouncement(message);
    } finally {
      setMoving(false);
      setDraggedId(null);
      setDropTarget(null);
    }
  }

  function moveInDirection(item: Item, direction: MoveDirection): void {
    const move = relativeMoveForDirection(items, item.id, direction);
    if (move !== null) void requestMove(move);
  }

  return (
    <div>
      {canReorder ? (
        <p className="sr-only" id={instructionsId}>
        Reordene arrastando os itens, usando os bot\u00f5es de mover ou pressionando Alt com seta
        para cima ou para baixo.
        </p>
      ) : null}
      <ol
        aria-busy={occupied}
        aria-describedby={canReorder ? instructionsId : undefined}
        aria-label={ariaLabel}
        className={className}
      >
        {items.map((item, index) => {
          const label = getLabel(item);
          const isDropTarget = dropTarget?.id === item.id;
          return (
            <li
              className={itemClassName}
              data-drop-placement={isDropTarget ? dropTarget.placement : undefined}
              data-reordering={draggedId === item.id ? 'true' : undefined}
              draggable={canReorder && !occupied}
              key={item.id}
              onDragEnd={() => {
                setDraggedId(null);
                setDropTarget(null);
              }}
              onDragOver={(event) => {
                if (occupied || !canReorder) return;
                event.preventDefault();
                if (draggedId === item.id) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                setDropTarget({
                  id: item.id,
                  placement: dropPlacement(event.clientY, bounds.top, bounds.height),
                });
              }}
              onDragStart={(event) => {
                if (occupied || !canReorder) {
                  event.preventDefault();
                  return;
                }
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', item.id);
                setDraggedId(item.id);
                setDropTarget(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const sourceId = draggedId ?? event.dataTransfer.getData('text/plain');
                const placement = dropTarget?.id === item.id ? dropTarget.placement : 'before';
                void requestMove({ sourceId, targetId: item.id, placement });
              }}
              onKeyDown={(event) => {
                const direction = directionFromAltArrow(event);
                if (direction === null || occupied || !canReorder) return;
                event.preventDefault();
                moveInDirection(item, direction);
              }}
              tabIndex={canReorder ? 0 : undefined}
            >
              <div className="flex items-start gap-3">
                {canReorder ? (
                  <span
                    aria-hidden="true"
                    className="mt-1 cursor-grab select-none text-slate-500"
                    title="Arrastar para reordenar"
                  >
                    ☰
                  </span>
                ) : null}
                <div className="min-w-0 flex-1">{renderItem(item)}</div>
                {canReorder ? (
                  <div
                    aria-label={`Reordenar ${label}`}
                    className="flex shrink-0 gap-2"
                    role="group"
                  >
                    <button
                      aria-label={`Mover ${label} para cima`}
                      className={moveButtonClassName}
                      disabled={occupied || index === 0}
                      onClick={() => moveInDirection(item, 'up')}
                      type="button"
                    >
                      <span aria-hidden="true">↑</span>
                    </button>
                    <button
                      aria-label={`Mover ${label} para baixo`}
                      className={moveButtonClassName}
                      disabled={occupied || index === items.length - 1}
                      onClick={() => moveInDirection(item, 'down')}
                      type="button"
                    >
                      <span aria-hidden="true">↓</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      <p aria-atomic="true" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {presentedError === null ? null : (
        <p
          aria-live="assertive"
          className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {presentedError}
        </p>
      )}
    </div>
  );
}

const moveButtonClassName =
  'grid size-10 place-items-center rounded-lg border border-stone-300 bg-white font-bold text-slate-700 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:cursor-not-allowed disabled:opacity-45';
