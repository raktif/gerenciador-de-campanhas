import { useEffect, useRef, useState } from 'react';
import type { AttachmentDisplay } from '../../core/contracts/attachments';
import type { Result } from '../../core/contracts/result';
import { Button } from './actions';

export function ImageLightbox({
  alt,
  load,
  onClose,
}: {
  alt: string;
  load: () => Promise<Result<AttachmentDisplay>>;
  onClose: () => void;
}): React.JSX.Element {
  const [state, setState] = useState<{
    loading: boolean;
    url: string | null;
    error: string | null;
  }>({ loading: true, url: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => closeRef.current?.focus(), []);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setState({ loading: true, url: null, error: null });
    void load()
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setState({ loading: false, url: null, error: result.error.message });
          return;
        }
        objectUrl = URL.createObjectURL(
          new Blob([Uint8Array.from(result.data.bytes).buffer], { type: result.data.mimeType }),
        );
        setState({ loading: false, url: objectUrl, error: null });
      })
      .catch(() => {
        if (active)
          setState({
            loading: false,
            url: null,
            error: 'Não foi possível carregar a imagem ampliada.',
          });
      });
    return () => {
      active = false;
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [attempt, load]);

  return (
    <div
      className="fixed inset-0 z-70 grid place-items-center semantic-overlay p-4"
      data-testid="image-lightbox-backdrop"
      onClick={(event) => {
        if (shouldCloseLightboxFromBackdrop(event.target, event.currentTarget)) onClose();
      }}
      role="presentation"
    >
      <div
        aria-busy={state.loading}
        aria-label={`Visualização ampliada: ${alt}`}
        aria-modal="true"
        className="relative flex max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] flex-col items-center gap-4 rounded-2xl semantic-surface p-4 shadow-2xl"
        onKeyDown={(event) => {
          if (isLightboxDismissKey(event.key)) {
            event.preventDefault();
            onClose();
          } else trapLightboxFocus(event, dialogRef.current);
        }}
        ref={dialogRef}
        role="dialog"
      >
        <Button className="self-end" onClick={onClose} ref={closeRef} size="small">
          Fechar imagem ampliada
        </Button>
        {state.loading ? (
          <p aria-live="polite" role="status">
            Carregando imagem ampliada…
          </p>
        ) : state.error !== null ? (
          <div className="p-6 text-center">
            <p className="semantic-error-text" role="alert">
              {state.error}
            </p>
            <Button className="mt-3" onClick={() => setAttempt((value) => value + 1)}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <img
            alt={alt}
            className="max-h-[calc(100vh-8rem)] max-w-[calc(100vw-4rem)] cursor-zoom-out object-contain"
            onClick={onClose}
            src={state.url ?? undefined}
          />
        )}
      </div>
    </div>
  );
}

export function shouldCloseLightboxFromBackdrop(
  target: EventTarget | null,
  backdrop: EventTarget | null,
): boolean {
  return target !== null && target === backdrop;
}

export function isLightboxDismissKey(key: string): boolean {
  return key === 'Escape';
}

export function trapLightboxFocus(
  event: React.KeyboardEvent<HTMLElement>,
  container: HTMLElement | null,
): void {
  if (event.key !== 'Tab' || container === null) return;
  const focusable = container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (first === undefined || last === undefined) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
