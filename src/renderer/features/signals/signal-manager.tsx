import { useCallback, useEffect, useRef, useState } from 'react';
import type { Campaign } from '../../../core/contracts/campaigns';
import type {
  CampaignSignalReviewItem,
  ReviewCampaignSignalInput,
} from '../../../core/contracts/campaign-signal-engine';
import type { CampaignSignal } from '../../../core/contracts/campaign-signals';
import { campaignSignalPriorityLabels } from '../../../core/contracts/campaign-signals';
import {
  presentUserFacingError,
  type UserFacingError,
} from '../../../core/errors/user-facing-error';
import { Button, ButtonGroup } from '../../components/actions';
import { UserFacingErrorNotice } from '../../components/user-facing-error-notice';
import { signalListViewState } from './signal-manager-model';

const statusLabels: Record<CampaignSignal['status'], string> = {
  new: 'Novo',
  viewed: 'Revisado',
  dismissed: 'Descartado',
  snoozed: 'Adiado',
  converted: 'Convertido',
  resolved: 'Resolvido',
  stale: 'Condição não detectada',
};

export function SignalManager({
  campaign,
  onOpenCanonRegistry,
}: {
  campaign: Campaign;
  onOpenCanonRegistry: (input: ReviewCampaignSignalInput, mode: 'review' | 'correct') => void;
}): React.JSX.Element {
  const [items, setItems] = useState<CampaignSignalReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UserFacingError | null>(null);
  const [errorOperation, setErrorOperation] = useState<'signals.list' | 'signals.mutate'>(
    'signals.list',
  );
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [snoozeUntil, setSnoozeUntil] = useState('');
  const requestSequence = useRef(0);
  const campaignIdRef = useRef(campaign.id);
  const itemsRef = useRef(items);
  campaignIdRef.current = campaign.id;
  itemsRef.current = items;

  const load = useCallback(async (): Promise<void> => {
    const requestId = ++requestSequence.current;
    const isCurrent = (): boolean =>
      requestSequence.current === requestId && campaignIdRef.current === campaign.id;
    setLoading(true);
    setError(null);
    try {
      const result = await window.campaignManager.campaignSignals.list({
        campaignId: campaign.id,
      });
      if (!isCurrent()) return;
      if (result.ok) {
        const nextById = new Map(result.data.items.map(({ signal }) => [signal.id, signal]));
        const expiredCount = itemsRef.current.filter(({ signal }) => {
          const next = nextById.get(signal.id);
          return (
            signal.status === 'snoozed' &&
            signal.dismissedUntil !== null &&
            next !== undefined &&
            next.status !== 'snoozed' &&
            next.dismissedUntil === null
          );
        }).length;
        if (expiredCount > 0)
          setAnnouncement(
            `O prazo de adiamento venceu para ${String(expiredCount)} sinal(is); os itens voltaram à lista para revisão.`,
          );
        setItems(result.data.items);
      } else {
        setErrorOperation('signals.list');
        setError(presentUserFacingError(result.error, 'signals.list'));
      }
    } catch (failure) {
      if (!isCurrent()) return;
      setErrorOperation('signals.list');
      setError(presentUserFacingError(failure, 'signals.list'));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [campaign.id]);

  useEffect(() => {
    void load();
    return () => {
      requestSequence.current += 1;
    };
  }, [load]);

  useEffect(() => {
    const nextDeadline = items
      .filter(
        ({ signal }) =>
          signal.status === 'snoozed' &&
          signal.dismissedUntil !== null &&
          Date.parse(signal.dismissedUntil) > Date.now(),
      )
      .reduce(
        (earliest, { signal }) => Math.min(earliest, Date.parse(signal.dismissedUntil ?? '')),
        Number.POSITIVE_INFINITY,
      );
    if (!Number.isFinite(nextDeadline)) return;
    const timer = window.setTimeout(
      () => void load(),
      Math.min(Math.max(0, nextDeadline - Date.now()), 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [items, load]);

  async function recalculate(): Promise<void> {
    const campaignId = campaign.id;
    setBusy(true);
    setError(null);
    try {
      const result = await window.campaignManager.campaignSignals.recalculate({
        campaignId,
      });
      if (campaignIdRef.current !== campaignId) return;
      if (!result.ok) {
        setErrorOperation('signals.mutate');
        setError(presentUserFacingError(result.error, 'signals.mutate'));
        return;
      }
      setItems(result.data.items);
      setAnnouncement(
        `Recálculo concluído: ${String(result.data.detectedCount)} condição(ões) detectada(s) entre as regras disponíveis (necessidades e possíveis contradições).` +
          (result.data.expiredSnoozes > 0
            ? ` ${String(result.data.expiredSnoozes)} adiamento(s) venceram e voltaram à revisão.`
            : ''),
      );
    } catch (failure) {
      if (campaignIdRef.current !== campaignId) return;
      setErrorOperation('signals.mutate');
      setError(presentUserFacingError(failure, 'signals.mutate'));
    } finally {
      if (campaignIdRef.current === campaignId) setBusy(false);
    }
  }

  async function runAction(
    item: CampaignSignalReviewItem,
    action: 'review' | 'dismiss' | 'reactivate' | 'snooze' | 'markException',
  ): Promise<void> {
    setBusy(true);
    setError(null);
    const input = {
      campaignId: campaign.id,
      id: item.signal.id,
      revision: item.signal.revision,
    };
    const campaignId = campaign.id;
    try {
      const result =
        action === 'review'
          ? await window.campaignManager.campaignSignals.review(input)
          : action === 'dismiss'
            ? await window.campaignManager.campaignSignals.dismiss(input)
            : action === 'reactivate'
              ? await window.campaignManager.campaignSignals.reactivate(input)
              : action === 'snooze'
                ? await window.campaignManager.campaignSignals.snooze({
                    ...input,
                    dismissedUntil: new Date(snoozeUntil).toISOString(),
                  })
                : await window.campaignManager.campaignSignals.markContradictionException(input);
      if (!result.ok) {
        if (campaignIdRef.current !== campaignId) return;
        const failure = presentUserFacingError(result.error, 'signals.mutate');
        setErrorOperation('signals.mutate');
        if (result.error.code === 'REVISION_CONFLICT') {
          await load();
          setError(failure);
        } else setError(failure);
        return;
      }
      if (campaignIdRef.current !== campaignId) return;
      setAnnouncement(
        action === 'review'
          ? 'Aviso marcado como mantido para acompanhamento.'
          : action === 'dismiss'
            ? 'Aviso descartado.'
            : action === 'reactivate'
              ? 'Sinal reativado para revisão.'
              : action === 'snooze'
                ? 'Sinal adiado.'
                : 'Exceção registrada para este par de afirmações.',
      );
      if (action === 'snooze') setSnoozeUntil('');
      await load();
    } catch (failure) {
      if (campaignIdRef.current !== campaignId) return;
      const userFailure = presentUserFacingError(failure, 'signals.mutate');
      setErrorOperation('signals.mutate');
      if (
        typeof failure === 'object' &&
        failure !== null &&
        'code' in failure &&
        failure.code === 'REVISION_CONFLICT'
      ) {
        await load();
        setError(userFailure);
      } else setError(userFailure);
    } finally {
      if (campaignIdRef.current === campaignId) setBusy(false);
    }
  }

  const viewState = signalListViewState(loading, error !== null, items.length);

  return (
    <section aria-labelledby="signals-title">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] semantic-accent-text uppercase">
            Motor determinístico
          </p>
          <h1 className="mt-2 text-3xl font-semibold semantic-text-primary" id="signals-title">
            Sinais da campanha
          </h1>
          <p className="mt-2 max-w-3xl leading-7 semantic-text-secondary">
            O motor detecta necessidades textuais explícitas e pares de afirmações estruturalmente
            idênticas marcadas como fato e refutadas. Os avisos não determinam qual afirmação está
            errada nem alteram o cânone.
          </p>
        </div>
        <Button disabled={busy || loading} onClick={() => void recalculate()} variant="primary">
          {busy ? 'Processando…' : 'Recalcular sinais'}
        </Button>
      </header>

      {announcement === null ? null : (
        <p aria-live="polite" className="mt-5 rounded-xl semantic-success-surface p-3">
          {announcement}
        </p>
      )}
      {error === null ? null : (
        <div className="mt-5">
          <UserFacingErrorNotice
            error={error}
            operation={errorOperation}
            onRetry={() => void load()}
            retryLabel={errorOperation === 'signals.mutate' ? 'Atualizar sinais' : undefined}
          />
        </div>
      )}

      {viewState === 'loading' ? (
        <p aria-busy="true" className="mt-8 semantic-text-secondary" role="status">
          Carregando sinais…
        </p>
      ) : viewState === 'error' ? null : viewState === 'empty' ? (
        <div className="mt-8 rounded-2xl border border-dashed semantic-border px-6 py-10 text-center">
          <h2 className="text-lg font-semibold semantic-text-primary">Nenhum sinal registrado</h2>
          <p className="mt-2 semantic-text-secondary">
            Recalcule para avaliar as regras atuais. Esta tela não afirma ausência de possíveis
            contradições antes do cálculo.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4">
          {items.map((item) => (
            <SignalCard
              busy={busy}
              item={item}
              key={item.signal.id}
              onAction={runAction}
              onOpenCanonRegistry={onOpenCanonRegistry}
              onSnoozeUntilChange={setSnoozeUntil}
              snoozeUntil={snoozeUntil}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function SignalCard({
  busy,
  item,
  onAction,
  onOpenCanonRegistry,
  onSnoozeUntilChange,
  snoozeUntil,
}: {
  busy: boolean;
  item: CampaignSignalReviewItem;
  onAction: (
    item: CampaignSignalReviewItem,
    action: 'review' | 'dismiss' | 'reactivate' | 'snooze' | 'markException',
  ) => Promise<void>;
  onOpenCanonRegistry: (input: ReviewCampaignSignalInput, mode: 'review' | 'correct') => void;
  onSnoozeUntilChange: (value: string) => void;
  snoozeUntil: string;
}): React.JSX.Element {
  const { signal, evidence } = item;
  const canSnooze = ['new', 'viewed', 'stale'].includes(signal.status);
  const canDismiss = ['new', 'viewed', 'stale', 'snoozed'].includes(signal.status);
  const canReactivate = ['dismissed', 'snoozed', 'stale'].includes(signal.status);
  const isContradiction = signal.signalType === 'potential_contradiction';
  const canMarkException = isContradiction && signal.status !== 'resolved';
  const deadline = snoozeUntil === '' ? Number.NaN : new Date(snoozeUntil).getTime();

  return (
    <article className="rounded-2xl border semantic-border semantic-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide semantic-text-secondary">
            {statusLabels[signal.status]} · Prioridade{' '}
            {campaignSignalPriorityLabels[signal.priority]}
          </p>
          <h2 className="mt-1 text-xl font-semibold semantic-text-primary">{signal.title}</h2>
        </div>
        {signal.status === 'snoozed' && signal.dismissedUntil !== null ? (
          <p className="text-sm semantic-text-secondary">
            Adiado até {new Date(signal.dismissedUntil).toLocaleString()}
          </p>
        ) : null}
      </div>
      <p className="mt-3 whitespace-pre-wrap semantic-text-primary">{signal.summary}</p>
      <p className="mt-2 text-xs semantic-text-secondary">
        Última detecção:{' '}
        <time dateTime={signal.lastDetectedAt}>
          {new Date(signal.lastDetectedAt).toLocaleString()}
        </time>
      </p>
      {signal.status === 'stale' ? (
        <p className="mt-3 text-sm semantic-text-secondary">
          {isContradiction
            ? 'Este par não corresponde atualmente à regra ou requer nova revisão após mudança relevante. O aviso permanece visível; reativá-lo não altera as afirmações.'
            : 'Esta necessidade já não está preenchida em um campo detectável. O sinal permanece visível para revisão; reativá-lo é uma decisão manual e não repõe o dado.'}
        </p>
      ) : null}
      {isContradiction ? (
        <p className="mt-3 rounded-lg semantic-warning-surface p-3 text-sm semantic-warning-text">
          Possibilidade determinística, não uma conclusão sobre qual afirmação está errada.
        </p>
      ) : null}
      <div className="mt-4 grid gap-2">
        {evidence.map((entry, index) => (
          <div
            className="rounded-xl semantic-surface-muted p-3 text-sm"
            key={`${entry.role}-${String(index)}`}
          >
            <p className="font-medium semantic-text-primary">
              {entry.objectName ?? 'Registro indisponível'}
              {entry.objectArchived === true ? ' (arquivada)' : ''}
            </p>
            <p className="mt-1 semantic-text-secondary">{entry.role}</p>
            {entry.description === null ? null : (
              <p className="mt-1 whitespace-pre-wrap semantic-text-primary">{entry.description}</p>
            )}
          </div>
        ))}
        {evidence.length === 0 ? (
          <p className="text-sm semantic-text-secondary">
            A evidência original foi removida junto com seu registro de origem.
          </p>
        ) : null}
      </div>

      {canSnooze ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm semantic-text-secondary">
            Adiar até
            <input
              aria-label={`Prazo para adiar ${signal.title}`}
              className="rounded-lg border semantic-border semantic-input px-3 py-2"
              onChange={(event) => onSnoozeUntilChange(event.currentTarget.value)}
              type="datetime-local"
              value={snoozeUntil}
            />
          </label>
          <Button
            disabled={busy || !Number.isFinite(deadline) || deadline <= Date.now()}
            onClick={() => void onAction(item, 'snooze')}
            variant="secondary"
          >
            Adiar sinal
          </Button>
        </div>
      ) : null}

      <ButtonGroup aria-label="Ações do sinal" className="mt-4">
        {signal.status === 'new' ? (
          <Button disabled={busy} onClick={() => void onAction(item, 'review')} variant="secondary">
            Manter
          </Button>
        ) : null}
        {isContradiction ? (
          <>
            <Button
              disabled={busy}
              onClick={() =>
                onOpenCanonRegistry(
                  { campaignId: signal.campaignId, id: signal.id, revision: signal.revision },
                  'review',
                )
              }
              variant="secondary"
            >
              Revisar
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                onOpenCanonRegistry(
                  { campaignId: signal.campaignId, id: signal.id, revision: signal.revision },
                  'correct',
                )
              }
              variant="secondary"
            >
              Corrigir
            </Button>
            {canMarkException ? (
              <Button
                disabled={busy}
                onClick={() => void onAction(item, 'markException')}
                variant="secondary"
              >
                Marcar exceção
              </Button>
            ) : null}
          </>
        ) : null}
        {canReactivate ? (
          <Button
            disabled={busy}
            onClick={() => void onAction(item, 'reactivate')}
            variant="secondary"
          >
            Reativar para revisão
          </Button>
        ) : null}
        {canDismiss ? (
          <Button
            disabled={busy}
            onClick={() => void onAction(item, 'dismiss')}
            variant="secondary"
          >
            {isContradiction ? 'Descartar aviso' : 'Descartar'}
          </Button>
        ) : null}
      </ButtonGroup>
    </article>
  );
}
