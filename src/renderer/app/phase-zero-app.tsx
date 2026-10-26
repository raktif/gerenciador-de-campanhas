import { useCallback, useEffect, useState } from 'react';
import type { ApplicationStatus, PhaseZeroTestRecord } from '../../core/contracts/phase-zero';
import type { Result } from '../../core/contracts/result';
import { userFacingErrorMessage } from '../../core/errors/user-facing-error';
import { Button, ToolbarActions } from '../components/actions';

type Feedback =
  | { tone: 'neutral'; message: string }
  | { tone: 'success'; message: string }
  | { tone: 'error'; message: string };

export function PhaseZeroApp(): React.JSX.Element {
  const [status, setStatus] = useState<ApplicationStatus | null>(null);
  const [feedback, setFeedback] = useState<Feedback>({
    tone: 'neutral',
    message: 'Verificando a fundação local…',
  });
  const [busyAction, setBusyAction] = useState<string | null>('status');

  const loadStatus = useCallback(async (): Promise<void> => {
    setBusyAction('status');
    const result = await window.campaignManager.phaseZero.getStatus();
    if (result.ok) {
      setStatus(result.data);
      setFeedback({ tone: 'success', message: 'A fundação local está pronta.' });
    } else {
      setFeedback({
        tone: 'error',
        message: userFacingErrorMessage(result.error, 'phase-zero.operation'),
      });
    }
    setBusyAction(null);
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function writeTest(): Promise<void> {
    setBusyAction('write');
    presentTestResult(await window.campaignManager.phaseZero.writeTest(), 'Valor persistido');
    setBusyAction(null);
  }

  async function readTest(): Promise<void> {
    setBusyAction('read');
    const result = await window.campaignManager.phaseZero.readTest();
    if (!result.ok) {
      setFeedback({
        tone: 'error',
        message: userFacingErrorMessage(result.error, 'phase-zero.operation'),
      });
    } else if (result.data === null) {
      setFeedback({ tone: 'neutral', message: 'Nenhum valor de teste foi gravado ainda.' });
    } else {
      setFeedback({
        tone: 'success',
        message: `Valor recuperado: ${result.data.value} (${formatDate(result.data.savedAt)})`,
      });
    }
    setBusyAction(null);
  }

  async function openDataDirectory(): Promise<void> {
    setBusyAction('folder');
    const result = await window.campaignManager.phaseZero.openDataDirectory();
    setFeedback(
      result.ok
        ? { tone: 'success', message: 'Pasta de dados aberta pelo sistema.' }
        : { tone: 'error', message: userFacingErrorMessage(result.error, 'phase-zero.operation') },
    );
    setBusyAction(null);
  }

  function presentTestResult(result: Result<PhaseZeroTestRecord>, prefix: string): void {
    setFeedback(
      result.ok
        ? {
            tone: 'success',
            message: `${prefix}: ${result.data.value} (${formatDate(result.data.savedAt)})`,
          }
        : { tone: 'error', message: userFacingErrorMessage(result.error, 'phase-zero.operation') },
    );
  }

  return (
    <main className="min-h-screen semantic-surface-muted semantic-text-primary">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-8 py-10">
        <header className="mb-10 border-b semantic-border pb-8">
          <p className="mb-3 text-sm font-semibold tracking-[0.18em] semantic-accent-text uppercase">
            Fundação técnica · Fase 0
          </p>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight semantic-text-primary">
            Gerenciador de Campanhas de RPG
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 semantic-text-secondary">
            Diagnóstico local da aplicação, persistência embutida e diretório de dados.
          </p>
        </header>

        <section aria-labelledby="status-title" className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-2xl border semantic-border semantic-surface p-7 shadow-sm">
            <div className="mb-6 flex items-center justify-between gap-4">
              <h2 id="status-title" className="text-xl font-semibold">
                Status da aplicação
              </h2>
              <StatusBadge ready={status !== null} />
            </div>

            <dl className="divide-y semantic-divide">
              <StatusRow
                label="Aplicação"
                value={status?.application ?? 'verificando'}
                testId="app-status"
              />
              <StatusRow
                label="Banco"
                value={status?.database ?? 'verificando'}
                testId="db-status"
              />
              <StatusRow label="Versão" value={status?.applicationVersion ?? '—'} />
              <StatusRow
                label="Schema"
                value={status === null ? '—' : String(status.schemaVersion)}
                testId="schema-version"
              />
              <StatusRow label="SQLite" value={status?.sqliteVersion ?? '—'} />
              <StatusRow
                label="FTS5"
                value={status?.fts5Available === true ? 'disponível' : 'verificando'}
              />
            </dl>
          </div>

          <aside className="rounded-2xl border semantic-navigation-border semantic-navigation-surface-elevated p-7 shadow-sm">
            <h2 className="text-xl font-semibold">Dados locais</h2>
            <p className="mt-3 text-sm leading-6 semantic-text-secondary">
              O banco e os arquivos do usuário ficam fora do diretório de instalação.
            </p>
            <code
              className="mt-5 block break-all rounded-lg semantic-navigation-surface p-4 text-xs leading-5"
              data-testid="data-directory"
            >
              {status?.dataDirectory ?? 'Localizando…'}
            </code>
            <Button
              className="mt-6 semantic-navigation-border bg-transparent semantic-hover-accent-border semantic-navigation-current "
              disabled={busyAction !== null}
              fullWidth
              onClick={() => void openDataDirectory()}
              size="large"
            >
              Abrir pasta de dados
            </Button>
          </aside>
        </section>

        <section
          aria-labelledby="persistence-title"
          className="mt-6 rounded-2xl border semantic-border semantic-surface p-7 shadow-sm"
        >
          <h2 id="persistence-title" className="text-xl font-semibold">
            Teste de persistência
          </h2>
          <p className="mt-2 max-w-3xl leading-7 semantic-text-secondary">
            Grave um identificador no SQLite, feche completamente o aplicativo, abra novamente e
            recupere o mesmo valor.
          </p>
          <ToolbarActions aria-label="Ações do teste de persistência" className="mt-6">
            <ActionButton disabled={busyAction !== null} onClick={() => void writeTest()} primary>
              Gravar teste
            </ActionButton>
            <ActionButton disabled={busyAction !== null} onClick={() => void readTest()}>
              Ler teste
            </ActionButton>
            <ActionButton disabled={busyAction !== null} onClick={() => void loadStatus()}>
              Atualizar status
            </ActionButton>
          </ToolbarActions>
          <p
            aria-live="polite"
            className={`mt-6 rounded-lg border p-4 text-sm ${feedbackClassName(feedback.tone)}`}
            data-testid="feedback"
            role={feedback.tone === 'error' ? 'alert' : 'status'}
          >
            {feedback.message}
          </p>
        </section>

        <footer className="mt-auto pt-10 text-sm semantic-text-secondary">
          Aplicativo local · nenhuma porta HTTP · nenhum dado enviado pela rede
        </footer>
      </div>
    </main>
  );
}

function StatusBadge({ ready }: { ready: boolean }): React.JSX.Element {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${ready ? 'semantic-success-surface semantic-success-text' : 'semantic-warning-surface semantic-accent-text'}`}
    >
      {ready ? 'Operacional' : 'Verificando'}
    </span>
  );
}

function StatusRow({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-4 py-4">
      <dt className="font-medium semantic-text-secondary">{label}</dt>
      <dd className="font-mono text-sm semantic-text-primary" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

function ActionButton({
  children,
  disabled,
  onClick,
  primary = false,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
  primary?: boolean;
}): React.JSX.Element {
  return (
    <Button
      disabled={disabled}
      onClick={onClick}
      size="large"
      variant={primary ? 'primary' : 'secondary'}
    >
      {children}
    </Button>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(
    new Date(value),
  );
}

function feedbackClassName(tone: Feedback['tone']): string {
  if (tone === 'error') return 'semantic-danger-border semantic-danger-surface semantic-error-text';
  if (tone === 'success')
    return 'semantic-success-border semantic-success-surface semantic-success-text';
  return 'semantic-border semantic-surface-muted semantic-text-secondary';
}
