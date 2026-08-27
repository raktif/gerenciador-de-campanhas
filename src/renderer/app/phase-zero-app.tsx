import { useCallback, useEffect, useState } from 'react';
import type { ApplicationStatus, PhaseZeroTestRecord } from '../../core/contracts/phase-zero';
import type { Result } from '../../core/contracts/result';

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
      setFeedback({ tone: 'error', message: result.error.message });
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
      setFeedback({ tone: 'error', message: result.error.message });
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
        : { tone: 'error', message: result.error.message },
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
        : { tone: 'error', message: result.error.message },
    );
  }

  return (
    <main className="min-h-screen bg-stone-100 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-8 py-10">
        <header className="mb-10 border-b border-stone-300 pb-8">
          <p className="mb-3 text-sm font-semibold tracking-[0.18em] text-amber-800 uppercase">
            Fundação técnica · Fase 0
          </p>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-slate-950">
            Gerenciador de Campanhas de RPG
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">
            Diagnóstico local da aplicação, persistência embutida e diretório de dados.
          </p>
        </header>

        <section aria-labelledby="status-title" className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-2xl border border-stone-300 bg-white p-7 shadow-sm">
            <div className="mb-6 flex items-center justify-between gap-4">
              <h2 id="status-title" className="text-xl font-semibold">
                Status da aplicação
              </h2>
              <StatusBadge ready={status !== null} />
            </div>

            <dl className="divide-y divide-stone-200">
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

          <aside className="rounded-2xl border border-slate-800 bg-slate-900 p-7 text-slate-50 shadow-sm">
            <h2 className="text-xl font-semibold">Dados locais</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              O banco e os arquivos do usuário ficam fora do diretório de instalação.
            </p>
            <code
              className="mt-5 block break-all rounded-lg bg-slate-950 p-4 text-xs leading-5 text-emerald-300"
              data-testid="data-directory"
            >
              {status?.dataDirectory ?? 'Localizando…'}
            </code>
            <button
              className="mt-6 w-full rounded-lg border border-slate-600 px-4 py-3 font-medium transition hover:border-slate-300 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 disabled:cursor-wait disabled:opacity-60"
              disabled={busyAction !== null}
              onClick={() => void openDataDirectory()}
              type="button"
            >
              Abrir pasta de dados
            </button>
          </aside>
        </section>

        <section
          aria-labelledby="persistence-title"
          className="mt-6 rounded-2xl border border-stone-300 bg-white p-7 shadow-sm"
        >
          <h2 id="persistence-title" className="text-xl font-semibold">
            Teste de persistência
          </h2>
          <p className="mt-2 max-w-3xl leading-7 text-slate-600">
            Grave um identificador no SQLite, feche completamente o aplicativo, abra novamente e
            recupere o mesmo valor.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ActionButton disabled={busyAction !== null} onClick={() => void writeTest()} primary>
              Gravar teste
            </ActionButton>
            <ActionButton disabled={busyAction !== null} onClick={() => void readTest()}>
              Ler teste
            </ActionButton>
            <ActionButton disabled={busyAction !== null} onClick={() => void loadStatus()}>
              Atualizar status
            </ActionButton>
          </div>
          <p
            aria-live="polite"
            className={`mt-6 rounded-lg border p-4 text-sm ${feedbackClassName(feedback.tone)}`}
            data-testid="feedback"
            role={feedback.tone === 'error' ? 'alert' : 'status'}
          >
            {feedback.message}
          </p>
        </section>

        <footer className="mt-auto pt-10 text-sm text-slate-500">
          Aplicativo local · nenhuma porta HTTP · nenhum dado enviado pela rede
        </footer>
      </div>
    </main>
  );
}

function StatusBadge({ ready }: { ready: boolean }): React.JSX.Element {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${ready ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}
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
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className="font-mono text-sm text-slate-900" data-testid={testId}>
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
    <button
      className={`rounded-lg border px-5 py-3 font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:cursor-wait disabled:opacity-60 ${primary ? 'border-amber-700 bg-amber-700 text-white hover:bg-amber-800' : 'border-stone-300 bg-stone-50 text-slate-800 hover:bg-stone-100'}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(
    new Date(value),
  );
}

function feedbackClassName(tone: Feedback['tone']): string {
  if (tone === 'error') return 'border-red-300 bg-red-50 text-red-800';
  if (tone === 'success') return 'border-emerald-300 bg-emerald-50 text-emerald-800';
  return 'border-stone-300 bg-stone-50 text-slate-700';
}
