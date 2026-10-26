import { useState, type Ref } from 'react';
import type {
  UserFacingError,
  UserFacingErrorOperation,
} from '../../core/errors/user-facing-error';
import { createUserFacingDiagnostic } from '../../core/errors/user-facing-error';
import { Button, ButtonGroup } from './actions';

export function UserFacingErrorNotice({
  error,
  operation,
  onRetry,
  retryLabel = 'Tentar novamente',
  retryButtonRef,
  retryDisabled = false,
  compact = false,
}: {
  error: UserFacingError;
  operation: UserFacingErrorOperation;
  onRetry?: (() => void) | undefined;
  retryLabel?: string | undefined;
  retryButtonRef?: Ref<HTMLButtonElement> | undefined;
  retryDisabled?: boolean | undefined;
  compact?: boolean | undefined;
}): React.JSX.Element {
  const [copyFeedback, setCopyFeedback] = useState<string>();
  const diagnostic = createUserFacingDiagnostic(error, operation);

  async function copyDiagnostic(): Promise<void> {
    try {
      const result = await window.campaignManager.diagnostics.copyStartupDiagnostic(diagnostic);
      setCopyFeedback(
        result.ok
          ? 'Diagnóstico copiado.'
          : 'Não foi possível copiar o diagnóstico neste dispositivo.',
      );
    } catch {
      setCopyFeedback('Não foi possível copiar o diagnóstico neste dispositivo.');
    }
  }

  return (
    <div
      className={`${compact ? 'p-3 text-sm' : 'p-4'} semantic-error-notice rounded-xl border`}
      role="alert"
    >
      <p className="font-semibold">{error.title}</p>
      <p className="mt-1 leading-6">{error.message}</p>
      {error.suggestedAction === undefined ? null : (
        <p className="mt-2 text-sm leading-5">{error.suggestedAction}</p>
      )}
      {error.helpArticleId === undefined ? null : (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold">Ajuda para resolver</summary>
          <p className="mt-1">
            Ao abrir a Ajuda do Gerenciador, procure por “{error.helpArticleId}”.
          </p>
        </details>
      )}
      <ButtonGroup aria-label="Ações do erro" className="mt-3">
        {error.canRetry && onRetry !== undefined ? (
          <Button
            disabled={retryDisabled}
            onClick={onRetry}
            ref={retryButtonRef}
            size="small"
            variant="link"
          >
            {retryLabel}
          </Button>
        ) : null}
        {error.canCopyDiagnostics ? (
          <Button onClick={() => void copyDiagnostic()} size="small" variant="link">
            Copiar diagnóstico
          </Button>
        ) : null}
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">Ver detalhes técnicos</summary>
          <p className="mt-1">Código: {error.code}</p>
        </details>
      </ButtonGroup>
      {copyFeedback === undefined ? null : (
        <p aria-live="polite" className="mt-2 text-sm" role="status">
          {copyFeedback}
        </p>
      )}
    </div>
  );
}
