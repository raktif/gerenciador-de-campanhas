import { useId, useLayoutEffect, useRef, useState } from 'react';
import { IconButton } from './actions';

export interface ContextualHelpContent {
  description?: string;
  purpose?: string;
  example?: string;
  consequence?: string;
  helpArticleId?: string;
}

export interface ContextualHelpProps {
  content: ContextualHelpContent;
  label: string;
}

interface PopoverPosition {
  left: number;
  top: number;
}

const viewportMargin = 16;
const triggerGap = 8;
const transientCloseDelay = 120;

export function ContextualHelp({ content, label }: ContextualHelpProps): React.JSX.Element {
  const reactId = useId();
  const popoverId = `contextual-help-${reactId.replaceAll(':', '')}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinnedRef = useRef(false);
  const triggerHoveredRef = useRef(false);
  const popoverHoveredRef = useRef(false);
  const triggerFocusedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition>({
    left: viewportMargin,
    top: viewportMargin,
  });

  function cancelScheduledClose(): void {
    if (closeTimerRef.current === null) return;
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }

  function show(): void {
    cancelScheduledClose();
    const popover = popoverRef.current;
    if (popover === null || popover.matches(':popover-open')) return;
    popover.showPopover();
  }

  function hide({ restoreFocus = false } = {}): void {
    cancelScheduledClose();
    pinnedRef.current = false;
    const popover = popoverRef.current;
    if (popover?.matches(':popover-open')) popover.hidePopover();
    if (restoreFocus) triggerRef.current?.focus();
  }

  function scheduleTransientClose(): void {
    cancelScheduledClose();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      if (
        pinnedRef.current ||
        triggerHoveredRef.current ||
        popoverHoveredRef.current ||
        triggerFocusedRef.current
      )
        return;
      hide();
    }, transientCloseDelay);
  }

  function positionPopover(): void {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (trigger === null || popover === null) return;
    const triggerBox = trigger.getBoundingClientRect();
    const popoverBox = popover.getBoundingClientRect();
    const maximumLeft = Math.max(
      viewportMargin,
      window.innerWidth - popoverBox.width - viewportMargin,
    );
    const left = Math.min(Math.max(viewportMargin, triggerBox.left), maximumLeft);
    const fitsBelow =
      triggerBox.bottom + triggerGap + popoverBox.height <= window.innerHeight - viewportMargin;
    const preferredTop = fitsBelow
      ? triggerBox.bottom + triggerGap
      : triggerBox.top - popoverBox.height - triggerGap;
    const maximumTop = Math.max(
      viewportMargin,
      window.innerHeight - popoverBox.height - viewportMargin,
    );
    setPosition({
      left,
      top: Math.min(Math.max(viewportMargin, preferredTop), maximumTop),
    });
  }

  useLayoutEffect(() => {
    if (!open) return;
    positionPopover();
    window.addEventListener('resize', positionPopover);
    window.addEventListener('scroll', positionPopover, true);
    return () => {
      window.removeEventListener('resize', positionPopover);
      window.removeEventListener('scroll', positionPopover, true);
    };
  }, [open]);

  return (
    <span className="inline-flex align-middle">
      <IconButton
        aria-controls={popoverId}
        aria-describedby={popoverId}
        aria-expanded={open}
        aria-label={`Ajuda sobre ${label}`}
        className="contextual-help-trigger ml-1 size-8 rounded-full font-bold"
        onBlur={() => {
          triggerFocusedRef.current = false;
          scheduleTransientClose();
        }}
        onClick={(event) => {
          event.preventDefault();
          if (pinnedRef.current) {
            hide({ restoreFocus: true });
            return;
          }
          pinnedRef.current = true;
          show();
        }}
        onFocus={() => {
          triggerFocusedRef.current = true;
          show();
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          hide({ restoreFocus: true });
        }}
        onPointerEnter={() => {
          triggerHoveredRef.current = true;
          show();
        }}
        onPointerLeave={() => {
          triggerHoveredRef.current = false;
          scheduleTransientClose();
        }}
        popoverTarget={popoverId}
        ref={triggerRef}
        size="small"
      >
        <span aria-hidden="true">?</span>
      </IconButton>
      <div
        className="contextual-help-popover m-0 max-h-[min(28rem,calc(100vh-2rem))] w-[min(24rem,calc(100vw-2rem))] overflow-auto rounded-2xl border p-4 text-left text-sm font-normal shadow-xl"
        id={popoverId}
        onPointerEnter={() => {
          popoverHoveredRef.current = true;
          cancelScheduledClose();
        }}
        onPointerLeave={() => {
          popoverHoveredRef.current = false;
          scheduleTransientClose();
        }}
        onToggle={(event) => {
          const isOpen = event.currentTarget.matches(':popover-open');
          setOpen(isOpen);
          if (!isOpen) pinnedRef.current = false;
        }}
        popover="auto"
        ref={popoverRef}
        role="tooltip"
        style={{
          inset: 'unset',
          left: `${String(position.left)}px`,
          position: 'fixed',
          top: `${String(position.top)}px`,
        }}
      >
        {content.description === undefined ? null : <p>{content.description}</p>}
        {content.purpose === undefined ? null : (
          <p className="mt-3">
            <strong className="semantic-strong font-semibold">Finalidade: </strong>
            {content.purpose}
          </p>
        )}
        {content.example === undefined ? null : (
          <p className="mt-3">
            <strong className="semantic-strong font-semibold">Exemplo: </strong>
            {content.example}
          </p>
        )}
        {content.consequence === undefined ? null : (
          <p className="mt-3">
            <strong className="semantic-strong font-semibold">Consequência: </strong>
            {content.consequence}
          </p>
        )}
      </div>
    </span>
  );
}
