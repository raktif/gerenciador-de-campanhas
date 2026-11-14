import { useCallback, useEffect, useRef, useState } from 'react';
import { AppError } from '../../../core/errors/app-error';
import type { Assertion } from '../../../core/contracts/assertions';
import type { Campaign } from '../../../core/contracts/campaigns';
import type {
  ContradictionReview,
  ReviewCampaignSignalInput,
} from '../../../core/contracts/campaign-signal-engine';
import {
  presentUserFacingError,
  type UserFacingError,
} from '../../../core/errors/user-facing-error';
import {
  useNavigation,
  useNavigationState,
  useNavigationTraversal,
} from '../../app/navigation-provider';
import { Button } from '../../components/actions';
import { UserFacingErrorNotice } from '../../components/user-facing-error-notice';
import { AssertionManager } from '../assertions/assertion-manager';
import { registrySourceLabel, registrySessionLabel } from '../assertions/canon-registry-model';
import { originOptions } from '../narrative/narrative-metadata-fields';

export interface ContradictionReviewContext extends ReviewCampaignSignalInput {
  mode: 'review' | 'correct';
}

export function ContradictionReviewManager({
  campaign,
  context,
  onBack,
}: {
  campaign: Campaign;
  context: ContradictionReviewContext;
  onBack: () => void;
}): React.JSX.Element {
  const [pair, setPair] = useState<ContradictionReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UserFacingError | null>(null);
  const scope = `contradiction:${campaign.id}:${context.id}`;
  const [target, setTarget, replaceTarget] = useNavigationState<Assertion | null>(
    `${scope}:target`,
    null,
  );
  const navigation = useNavigation();
  const traversal = useNavigationTraversal();
  const request = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const readPair = useCallback(async (): Promise<ContradictionReview> => {
    if (context.campaignId !== campaign.id)
      throw new Error('Este aviso pertence a outra campanha.');
    const result = await window.campaignManager.campaignSignals.getContradictionReview({
      campaignId: campaign.id,
      id: context.id,
      revision: context.revision,
    });
    if (!result.ok) throw new AppError(result.error.code, result.error.message);
    if (
      result.data.signal.campaignId !== campaign.id ||
      result.data.assertions.some(({ assertion }) => assertion.campaignId !== campaign.id)
    )
      throw new Error('O par não está disponível nesta campanha.');
    return result.data;
  }, [campaign.id, context.campaignId, context.id, context.revision]);

  const load = useCallback(async (): Promise<void> => {
    const sequence = ++request.current;
    setLoading(true);
    setPair(null);
    setError(null);
    try {
      const current = await readPair();
      if (sequence === request.current) setPair(current);
    } catch (failure) {
      if (sequence === request.current) setError(presentUserFacingError(failure, 'signals.list'));
    } finally {
      if (sequence === request.current) setLoading(false);
    }
  }, [readPair]);

  useEffect(() => {
    void load();
    return () => {
      request.current += 1;
    };
  }, [load, traversal]);
  useEffect(() => {
    if (!loading && (target === null || pair === null)) heading.current?.focus();
  }, [loading, target, pair]);

  async function choose(assertion: Assertion): Promise<void> {
    const sequence = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const current = await readPair();
      if (sequence !== request.current) return;
      const selected = current.assertions.find(
        (entry) => entry.assertion.id === assertion.id,
      )?.assertion;
      if (selected?.archivedAt !== null || selected.revision !== assertion.revision)
        throw new Error(
          'A afirmação escolhida mudou ou não está disponível. Atualize o par antes de corrigir.',
        );
      setPair(current);
      setTarget(selected);
    } catch (failure) {
      if (sequence === request.current) {
        setPair(null);
        setError(presentUserFacingError(failure, 'signals.list'));
      }
    } finally {
      if (sequence === request.current) setLoading(false);
    }
  }

  function returnToPair(): void {
    navigation?.flush();
    if (navigation?.previousState?.[`${scope}:target`] === null) window.history.back();
    else replaceTarget(null);
    void load();
  }

  const selected =
    target === null
      ? null
      : pair?.assertions.find(
          ({ assertion }) => assertion.id === target.id && assertion.revision === target.revision,
        );
  if (!loading && error === null && target !== null && selected != null)
    return (
      <AssertionManager
        key={`${target.id}:${String(target.revision)}`}
        campaign={campaign}
        registry
        initialEditing={selected.assertion}
        navigationScope={`${scope}:editor:${target.id}:${String(target.revision)}`}
        onFinishEditing={returnToPair}
        onBack={returnToPair}
      />
    );

  return (
    <section aria-labelledby="contradiction-review-title">
      <Button onClick={onBack} variant="ghost">
        ← Voltar para sinais
      </Button>
      {target === null ? null : <Button onClick={returnToPair}>Voltar ao par</Button>}
      <h1
        id="contradiction-review-title"
        tabIndex={-1}
        ref={heading}
        className="mt-5 text-3xl font-semibold"
      >
        {context.mode === 'correct'
          ? 'Escolher afirmação para corrigir'
          : 'Revisar possível contradição'}
      </h1>
      <p className="mt-3">
        Nenhuma afirmação é identificada como errada. Revise as duas e escolha explicitamente qual
        editar.
      </p>
      {loading ? <p role="status">Carregando o par de afirmações…</p> : null}
      {error === null ? null : (
        <>
          <p role="alert">
            Não foi possível abrir o par atual. O aviso ou suas afirmações podem ter mudado, sido
            arquivados ou removidos. Volte aos sinais e atualize antes de revisar ou corrigir.
          </p>
          <UserFacingErrorNotice
            error={error}
            operation="signals.list"
            onRetry={() => void load()}
          />
        </>
      )}
      {!loading && error === null && target !== null && selected == null ? (
        <p role="alert">
          A afirmação escolhida mudou ou não está disponível. Volte ao par para escolher novamente.
        </p>
      ) : null}
      {!loading && error === null && pair !== null && target === null
        ? pair.assertions.map((entry) => {
            const { assertion, subjectName, objectName } = entry;
            return (
              <article key={assertion.id} className="mt-5 rounded-xl border semantic-border p-4">
                <h2 className="text-xl font-semibold">
                  {assertion.knowledgeState === 'fact'
                    ? 'Afirmação marcada como fato'
                    : 'Afirmação marcada como refutada'}
                </h2>
                <p>Assunto: {subjectName}</p>
                {assertion.statement === null ? null : (
                  <p className="whitespace-pre-wrap">{assertion.statement}</p>
                )}
                {assertion.predicate === null ? null : <p>Predicado: {assertion.predicate}</p>}
                {objectName === null ? null : <p>Objeto: {objectName}</p>}
                {assertion.value === null ? null : <p>Valor: {JSON.stringify(assertion.value)}</p>}
                <ContradictionProvenance entry={entry} />
                <Button disabled={loading} onClick={() => void choose(assertion)}>
                  {assertion.knowledgeState === 'fact'
                    ? 'Corrigir afirmação marcada como fato'
                    : 'Corrigir afirmação marcada como refutada'}
                </Button>
              </article>
            );
          })
        : null}
    </section>
  );
}

export function ContradictionProvenance({
  entry,
}: {
  entry: ContradictionReview['assertions'][number];
}): React.JSX.Element {
  const { assertion, sourceState } = entry;
  const originLabel =
    originOptions.find(([value]) => value === assertion.originKind)?.[1] ?? assertion.originKind;
  return (
    <dl className="mt-3 grid gap-2 text-sm">
      <div>
        <dt className="font-semibold">Origem</dt>
        <dd>{originLabel}</dd>
      </div>
      <div>
        <dt className="font-semibold">Fonte</dt>
        <dd>
          {sourceState === 'unavailable'
            ? 'Fonte vinculada indisponível'
            : registrySourceLabel(assertion, entry, originLabel)}
        </dd>
      </div>
      <div>
        <dt className="font-semibold">Sessão</dt>
        <dd>{registrySessionLabel(assertion, entry)}</dd>
      </div>
    </dl>
  );
}
