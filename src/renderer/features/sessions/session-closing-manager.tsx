import { useCallback, useEffect, useState } from 'react';
import type { Campaign } from '../../../core/contracts/campaigns';
import type { Session } from '../../../core/contracts/sessions';
import type {
  SessionClosingStep,
  SessionClosingStepStatus,
  SessionClosingWorkflow,
  SessionPreparation,
} from '../../../core/contracts/session-closing';
import { Button, ButtonGroup } from '../../components/actions';
import {
  presentUserFacingError,
  type UserFacingError,
} from '../../../core/errors/user-facing-error';
import { UserFacingErrorNotice } from '../../components/user-facing-error-notice';

const stepLabels: Record<SessionClosingStep, string> = {
  inbox: 'Caixa de Entrada',
  events: 'Eventos',
  changes: 'Mudanças',
  clocks: 'Relógios',
  consequences: 'Consequências',
  threads: 'Fios Abertos',
  signals: 'Recálculo de Sinais',
  next_session: 'Preparação da próxima sessão',
};
const statusLabels: Record<SessionClosingStepStatus, string> = {
  pending: 'Pendente',
  completed: 'Confirmada',
  skipped: 'Ignorada',
};

export function SessionClosingManager({
  campaign,
  session,
}: {
  campaign: Campaign;
  session: Session;
}): React.JSX.Element {
  const [workflow, setWorkflow] = useState<SessionClosingWorkflow | null>(null);
  const [preparation, setPreparation] = useState<SessionPreparation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UserFacingError | null>(null);
  const [quickConfirmation, setQuickConfirmation] = useState(false);
  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [workflowResult, preparationResult] = await Promise.all([
        window.campaignManager.sessionClosing.get({
          campaignId: campaign.id,
          sessionId: session.id,
        }),
        window.campaignManager.sessionClosing.getPreparation({
          campaignId: campaign.id,
          sessionId: session.id,
        }),
      ]);
      if (!workflowResult.ok) {
        setError(presentUserFacingError(workflowResult.error, 'sessions.mutate'));
        return;
      }
      if (!preparationResult.ok) {
        setError(presentUserFacingError(preparationResult.error, 'sessions.mutate'));
        return;
      }
      setWorkflow(workflowResult.data);
      setPreparation(preparationResult.data);
    } catch (reason) {
      setError(presentUserFacingError(reason, 'sessions.mutate'));
    } finally {
      setLoading(false);
    }
  }, [campaign.id, session.id]);
  useEffect(() => {
    void load();
  }, [load]);
  async function updateStep(
    step: SessionClosingStep,
    status: SessionClosingStepStatus,
    revision: number,
  ): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await window.campaignManager.sessionClosing.updateStep({
        campaignId: campaign.id,
        sessionId: session.id,
        step,
        status,
        revision,
      });
      if (result.ok) setWorkflow(result.data);
      else setError(presentUserFacingError(result.error, 'sessions.mutate'));
    } catch (reason) {
      setError(presentUserFacingError(reason, 'sessions.mutate'));
    } finally {
      setBusy(false);
    }
  }
  async function quickClose(): Promise<void> {
    setBusy(true);
    setError(null);
    setQuickConfirmation(false);
    try {
      const result = await window.campaignManager.sessionClosing.quickClose({
        campaignId: campaign.id,
        sessionId: session.id,
      });
      if (result.ok) setWorkflow(result.data);
      else setError(presentUserFacingError(result.error, 'sessions.mutate'));
    } catch (reason) {
      setError(presentUserFacingError(reason, 'sessions.mutate'));
    } finally {
      setBusy(false);
    }
  }
  async function selectItem(id: string, revision: number, selected: boolean): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await window.campaignManager.sessionClosing.selectPreparationItem({
        campaignId: campaign.id,
        sessionId: session.id,
        id,
        revision,
        selected,
      });
      if (result.ok) setPreparation(result.data);
      else setError(presentUserFacingError(result.error, 'sessions.mutate'));
    } catch (reason) {
      setError(presentUserFacingError(reason, 'sessions.mutate'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="mt-6 rounded-2xl border semantic-border semantic-surface p-6"
      aria-labelledby="session-closing-title"
      aria-busy={loading || busy}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="session-closing-title" className="text-xl font-semibold">
            Encerramento da sessão
          </h2>
          <p className="mt-1 text-sm semantic-text-secondary">
            Cada etapa é salva separadamente e pode ser retomada sem alterar registros narrativos
            automaticamente.
          </p>
        </div>
        {quickConfirmation ? (
          <ButtonGroup aria-label="Confirmar encerramento rápido">
            <Button size="small" onClick={() => setQuickConfirmation(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button size="small" variant="primary" onClick={() => void quickClose()} busy={busy}>
              Confirmar encerramento rápido
            </Button>
          </ButtonGroup>
        ) : (
          <Button size="small" onClick={() => setQuickConfirmation(true)} disabled={busy}>
            Encerrar rapidamente
          </Button>
        )}
      </div>
      {error === null ? null : (
        <div className="mt-4">
          <UserFacingErrorNotice
            compact
            error={error}
            operation="sessions.mutate"
            onRetry={() => void load()}
          />
        </div>
      )}
      {loading ? (
        <p className="mt-5 text-sm semantic-text-secondary">
          Carregando progresso do encerramento…
        </p>
      ) : workflow === null ? null : (
        <ol className="mt-5 grid gap-3">
          {workflow.steps.map((step) => (
            <li key={step.id} className="rounded-xl semantic-surface-muted p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{stepLabels[step.step]}</p>
                  <p className="text-sm semantic-text-secondary">{statusLabels[step.status]}</p>
                </div>
                <ButtonGroup aria-label={`Ações da etapa ${stepLabels[step.step]}`}>
                  <Button
                    size="small"
                    disabled={busy || step.status === 'completed'}
                    onClick={() => void updateStep(step.step, 'completed', step.revision)}
                  >
                    {step.status === 'completed' ? 'Confirmada' : 'Confirmar'}
                  </Button>
                  <Button
                    size="small"
                    disabled={busy || step.status === 'skipped'}
                    onClick={() => void updateStep(step.step, 'skipped', step.revision)}
                  >
                    Ignorar
                  </Button>
                  {step.status !== 'pending' ? (
                    <Button
                      size="small"
                      disabled={busy}
                      onClick={() => void updateStep(step.step, 'pending', step.revision)}
                    >
                      Reabrir
                    </Button>
                  ) : null}
                </ButtonGroup>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-6 border-t semantic-border pt-5">
        <h3 className="text-lg font-semibold">Elementos relevantes para a próxima sessão</h3>
        <p className="mt-1 text-sm semantic-text-secondary">
          A lista é determinística. Marque explicitamente o que deseja levar adiante.
        </p>
        {loading ? null : preparation === null || preparation.items.length === 0 ? (
          <p className="mt-4 text-sm semantic-text-secondary">
            Nenhum elemento relevante foi encontrado.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {preparation.items.map((item) => (
              <li key={item.id} className="flex gap-3 rounded-xl semantic-surface-muted p-3">
                <input
                  aria-label={`Selecionar ${item.label}`}
                  className="semantic-accent-control mt-1 size-4"
                  type="checkbox"
                  checked={item.selected}
                  disabled={busy}
                  onChange={(event) =>
                    void selectItem(item.id, item.revision, event.target.checked)
                  }
                />
                <div>
                  <p className="font-semibold">{item.label}</p>
                  <p className="text-sm semantic-text-secondary">{item.reason}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
