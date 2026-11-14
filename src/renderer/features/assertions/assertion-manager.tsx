import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigationState, useRestoredRecord } from '../../app/navigation-provider';
import type { Assertion, CreateAssertionInput } from '../../../core/contracts/assertions';
import type { OriginKind } from '../../../core/contracts/narrative';
import {
  choosePromotionTarget,
  createLatestRequestGate,
  canonRegistryCategoryFilter,
  canonRegistryCategoryOptions,
  promotePossibilityWhenConfirmed,
  registryAssertionText,
  requiresFreshPromotionConfirmation,
  registrySessionLabel,
  registrySourceLabel,
  registrySubjectLabel,
  shouldShowRegistryEmptyState,
  type CanonRegistrySourceMetadata,
} from './canon-registry-model';
import type { Campaign } from '../../../core/contracts/campaigns';
import type { Entity } from '../../../core/contracts/entities';
import {
  NarrativeMetadataFields,
  canonLabel,
  canonOptions,
  inputClass,
  knowledgeLabel,
  knowledgeOptions,
  originOptions,
  visibilityLabel,
  visibilityOptions,
  type NarrativeMetadataValues,
} from '../narrative/narrative-metadata-fields';
import { useSessionSourceOptions } from '../narrative/session-source-options';
import {
  presentUserFacingError,
  userFacingErrorMessage,
  type UserFacingError,
} from '../../../core/errors/user-facing-error';
import { UserFacingErrorNotice } from '../../components/user-facing-error-notice';
import { Button, ButtonGroup, FormActions, ToolbarActions } from '../../components/actions';

type View = 'list' | 'create' | 'edit';
export interface NarrativeContext {
  entityId: string;
  entityName: string;
}

export function AssertionManager({
  campaign,
  context,
  registry = false,
  onBack,
  initialDraft,
  onCreated,
  onCancelInitialDraft,
}: {
  campaign: Campaign;
  context?: NarrativeContext;
  registry?: boolean;
  onBack: () => void;
  initialDraft?: { subjectEntityId: string; statement: string };
  onCreated?: () => Promise<UserFacingError | null>;
  onCancelInitialDraft?: () => void;
}): React.JSX.Element {
  const [items, setItems] = useState<Assertion[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [sourceMetadata, setSourceMetadata] = useState<Record<string, CanonRegistrySourceMetadata>>(
    {},
  );
  const [view, setView] = useNavigationState<View>(
    `${registry ? 'canon-registry' : 'assertions'}:${campaign.id}:view`,
    () => (initialDraft === undefined ? 'list' : 'create'),
  );
  const [editing, , setEditing] = useNavigationState<Assertion | null>(
    `${registry ? 'canon-registry' : 'assertions'}:${campaign.id}:editing`,
    null,
  );
  const [archived, , setArchived] = useNavigationState(
    `${registry ? 'canon-registry' : 'assertions'}:${campaign.id}:archived`,
    false,
  );
  const [knowledge, , setKnowledge] = useNavigationState(`assertions:${campaign.id}:knowledge`, '');
  const [canon, , setCanon] = useNavigationState(`assertions:${campaign.id}:canon`, '');
  const [registryCategory, setRegistryCategory] = useNavigationState(
    `canon-registry:${campaign.id}:category`,
    '',
  );
  const [visibility, , setVisibility] = useNavigationState(
    `assertions:${campaign.id}:visibility`,
    '',
  );
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UserFacingError | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [pending, setPending] = useState<Assertion | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<Assertion | null>(null);
  const loadRequestGate = useRef(createLatestRequestGate());
  const activeFilterKey = JSON.stringify([
    campaign.id,
    registry,
    registryCategory,
    context?.entityId ?? null,
    archived,
    knowledge,
    canon,
    visibility,
  ]);
  const activeFilterKeyRef = useRef(activeFilterKey);
  activeFilterKeyRef.current = activeFilterKey;
  const viewRef = useRef(view);
  viewRef.current = view;
  const campaignIdRef = useRef(campaign.id);
  campaignIdRef.current = campaign.id;
  useRestoredRecord(
    view === 'edit' ? editing?.id : undefined,
    (id) => window.campaignManager.assertions.get({ campaignId: campaign.id, id }),
    setEditing,
    (failure) => setError(presentUserFacingError(failure, 'assertions.mutate')),
    setBusy,
  );

  const load = useCallback(
    async (append = false): Promise<boolean> => {
      const requestId = loadRequestGate.current.begin();
      const requestFilterKey = activeFilterKey;
      const isCurrentRequest = (): boolean =>
        loadRequestGate.current.isCurrent(requestId) &&
        activeFilterKeyRef.current === requestFilterKey;
      setLoading(true);
      setError(null);
      try {
        const categoryFilter =
          registryCategory === '' ? {} : canonRegistryCategoryFilter(registryCategory);
        const request = {
          campaignId: campaign.id,
          ...(append && cursor !== null ? { cursor } : {}),
          filters: {
            archived,
            ...(context === undefined ? {} : { entityId: context.entityId }),
            ...(registry
              ? categoryFilter
              : {
                  ...(knowledge === ''
                    ? {}
                    : { knowledgeState: knowledge as Assertion['knowledgeState'] }),
                  ...(canon === '' ? {} : { canonState: canon as Assertion['canonState'] }),
                }),
            ...(visibility === '' ? {} : { visibility: visibility as Assertion['visibility'] }),
          },
        };
        if (registry) {
          const result = await window.campaignManager.assertions.listRegistry(request);
          if (!isCurrentRequest()) return false;
          if (result.ok) {
            const nextSources = Object.fromEntries(
              result.data.items.map((entry) => [
                entry.assertion.id,
                {
                  subjectName: entry.subjectName,
                  subjectArchived: entry.subjectArchived,
                  objectName: entry.objectName,
                  objectArchived: entry.objectArchived,
                  sourceDescription: entry.sourceDescription,
                  sessionTitle: entry.sessionTitle,
                },
              ]),
            );
            setSourceMetadata((current) => (append ? { ...current, ...nextSources } : nextSources));
            const nextItems = result.data.items.map((entry) => entry.assertion);
            setItems((current) => (append ? [...current, ...nextItems] : nextItems));
            setCursor(result.data.nextCursor);
            return true;
          }
          setError(presentUserFacingError(result.error, 'assertions.list'));
          return false;
        } else {
          const result = await window.campaignManager.assertions.list(request);
          if (!isCurrentRequest()) return false;
          if (result.ok) {
            setSourceMetadata({});
            setItems((current) =>
              append ? [...current, ...result.data.items] : result.data.items,
            );
            setCursor(result.data.nextCursor);
            return true;
          }
          setError(presentUserFacingError(result.error, 'assertions.list'));
          return false;
        }
      } catch {
        if (isCurrentRequest()) setError(presentUserFacingError(undefined, 'assertions.list'));
        return false;
      } finally {
        if (isCurrentRequest()) setLoading(false);
      }
    },
    [
      archived,
      activeFilterKey,
      campaign.id,
      canon,
      context,
      cursor,
      knowledge,
      registry,
      registryCategory,
      visibility,
    ],
  );
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    setPendingPromotion(null);
  }, [archived, campaign.id, context?.entityId, registryCategory, visibility]);
  useEffect(() => {
    if (view !== 'list') setPendingPromotion(null);
  }, [view]);

  useEffect(() => {
    setItems([]);
    setCursor(null);
    void load(false);
  }, [
    archived,
    campaign.id,
    canon,
    context?.entityId,
    knowledge,
    registry,
    registryCategory,
    visibility,
  ]);
  useEffect(() => {
    void loadAllEntities(campaign.id)
      .then(setEntities)
      .catch(() => setError(presentUserFacingError(undefined, 'entities.list')));
  }, [campaign.id]);

  async function beginEdit(item: Assertion): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.campaignManager.assertions.get({
        campaignId: campaign.id,
        id: item.id,
      });
      if (!result.ok) {
        setError(presentUserFacingError(result.error, 'assertions.mutate'));
        return;
      }
      setPendingPromotion(null);
      setEditing(result.data);
      setView('edit');
    } catch {
      setError(presentUserFacingError(undefined, 'assertions.mutate'));
    } finally {
      setBusy(false);
    }
  }
  async function submit(input: CreateAssertionInput): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result =
        editing === null
          ? await window.campaignManager.assertions.create(input)
          : await window.campaignManager.assertions.update({
              campaignId: campaign.id,
              id: editing.id,
              revision: editing.revision,
              patch: {
                subjectEntityId: input.subjectEntityId,
                predicate: input.predicate,
                objectEntityId: input.objectEntityId,
                statement: input.statement,
                value: input.value,
                canonState: input.canonState,
                knowledgeState: input.knowledgeState,
                visibility: input.visibility,
                originKind: input.originKind,
                ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
              },
            });
      if (result.ok) {
        if (editing === null && initialDraft !== undefined && onCreated !== undefined) {
          const failure = await onCreated();
          if (failure !== null) setError(failure);
          return;
        }
        setAnnouncement(editing === null ? 'Afirmação criada.' : 'Afirmação atualizada.');
        setEditing(null);
        setView('list');
        const conversionError = editing === null ? await onCreated?.() : null;
        await load(false);
        if (conversionError !== null && conversionError !== undefined) setError(conversionError);
      } else setError(presentUserFacingError(result.error, 'assertions.mutate'));
    } catch {
      setError(presentUserFacingError(undefined, 'assertions.mutate'));
    } finally {
      setBusy(false);
    }
  }
  async function lifecycle(item: Assertion, restore: boolean): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    const input = { campaignId: campaign.id, id: item.id, revision: item.revision };
    try {
      const result = restore
        ? await window.campaignManager.assertions.restore(input)
        : await window.campaignManager.assertions.archive(input);
      if (result.ok) {
        setAnnouncement(restore ? 'Afirmação restaurada.' : 'Afirmação arquivada.');
        setPending(null);
        await load(false);
      } else setError(presentUserFacingError(result.error, 'assertions.mutate'));
    } catch {
      setError(presentUserFacingError(undefined, 'assertions.mutate'));
    } finally {
      setBusy(false);
    }
  }

  async function confirmPromotion(): Promise<void> {
    if (busy || pendingPromotion === null) return;
    const promotionCampaignId = campaign.id;
    setBusy(true);
    setError(null);
    try {
      const result = await promotePossibilityWhenConfirmed(
        pendingPromotion,
        campaign.id,
        true,
        (request) => window.campaignManager.assertions.promotePossibilityToFact(request),
      );
      if (result === null) return;
      if (result.ok) {
        setPendingPromotion(null);
        setAnnouncement('Possibilidade promovida a fato. Os demais metadados foram preservados.');
        if (viewRef.current === 'list') await loadRef.current(false);
      } else if (requiresFreshPromotionConfirmation(result.error.code)) {
        setPendingPromotion(null);
        if (viewRef.current === 'list' && campaignIdRef.current === promotionCampaignId) {
          setItems([]);
          setSourceMetadata({});
          setCursor(null);
          const refreshed = await loadRef.current(false);
          if (refreshed) setError(presentUserFacingError(result.error, 'assertions.mutate'));
        } else setError(presentUserFacingError(result.error, 'assertions.mutate'));
      } else {
        setPendingPromotion(null);
        setError(presentUserFacingError(result.error, 'assertions.mutate'));
      }
    } catch {
      setError(presentUserFacingError(undefined, 'assertions.mutate'));
    } finally {
      setBusy(false);
    }
  }

  if (view !== 'list')
    return (
      <>
        <AssertionForm
          key={editing === null ? 'create' : `${editing.id}:${String(editing.revision)}`}
          campaign={campaign}
          {...(context === undefined ? {} : { context })}
          {...(initialDraft === undefined ? {} : { initialDraft })}
          entities={entities}
          assertion={editing}
          busy={busy}
          error={null}
          onCancel={() => {
            if (onCancelInitialDraft !== undefined) {
              onCancelInitialDraft();
              return;
            }
            setPendingPromotion(null);
            setEditing(null);
            setView('list');
            setError(null);
          }}
          onSubmit={submit}
        />
        {error === null ? null : (
          <div className="mx-auto mt-5 max-w-5xl">
            <UserFacingErrorNotice error={error} operation="assertions.mutate" />
          </div>
        )}
      </>
    );
  return (
    <section aria-labelledby="assertions-title">
      <Button onClick={onBack} size="small" variant="ghost">
        ← {context === undefined ? 'Voltar para detalhes da campanha' : `Voltar para entidades`}
      </Button>
      <header className="mt-6 flex flex-wrap items-end justify-between gap-5 border-b semantic-border pb-6">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] semantic-accent-text uppercase">
            {campaign.name}
          </p>
          <h1 className="mt-2 text-4xl font-semibold" id="assertions-title">
            {registry ? 'Registro de Cânone' : 'Afirmações'}
          </h1>
          <p className="mt-2 semantic-text-secondary">
            {registry
              ? 'Revise afirmações existentes e seus estados, natureza e proveniência.'
              : context === undefined
                ? 'Fatos, rumores e possibilidades com proveniência explícita.'
                : `Contexto: ${context.entityName}`}
          </p>
        </div>
        <Button
          disabled={busy || entities.length === 0}
          onClick={() => {
            setPendingPromotion(null);
            setEditing(null);
            setView('create');
          }}
          size="large"
          variant="primary"
        >
          Nova afirmação
        </Button>
      </header>
      <ToolbarActions
        aria-label={registry ? 'Filtros do Registro de Cânone' : 'Filtros de afirmações'}
        className="mt-5 items-end gap-3"
      >
        {registry ? (
          <label className="block font-semibold">
            Categoria
            <select
              className={inputClass}
              value={registryCategory}
              onChange={(event) => {
                setPendingPromotion(null);
                setRegistryCategory(event.target.value);
              }}
            >
              <option value="">Todas as categorias</option>
              {canonRegistryCategoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <Filter
              label="Natureza"
              value={knowledge}
              options={knowledgeOptions}
              onChange={setKnowledge}
            />
            <Filter
              label="Estado canônico"
              value={canon}
              options={canonOptions}
              onChange={setCanon}
            />
          </>
        )}
        <Filter
          label="Visibilidade"
          value={visibility}
          options={visibilityOptions}
          onChange={(value) => {
            setPendingPromotion(null);
            setVisibility(value);
          }}
        />
        <Button
          aria-pressed={!archived}
          onClick={() => {
            setPendingPromotion(null);
            setArchived(false);
          }}
        >
          Ativas
        </Button>
        <Button
          aria-pressed={archived}
          onClick={() => {
            setPendingPromotion(null);
            setArchived(true);
          }}
        >
          Arquivadas
        </Button>
      </ToolbarActions>
      {announcement === null ? null : (
        <p
          aria-live="polite"
          className="mt-5 rounded-xl border semantic-success-border semantic-success-surface p-4 semantic-success-text"
          role="status"
        >
          {announcement}
        </p>
      )}
      {error === null ? null : (
        <div className="mt-5">
          <UserFacingErrorNotice
            error={error}
            operation="assertions.list"
            onRetry={() => void load(false)}
          />
        </div>
      )}
      {pending === null ? null : (
        <div
          className="mt-5 rounded-xl border semantic-warning-border semantic-warning-surface p-5"
          role="alert"
        >
          <p className="font-semibold">Arquivar esta afirmação?</p>
          <ButtonGroup aria-label="Ações de confirmação" className="mt-3">
            <Button disabled={busy} onClick={() => setPending(null)}>
              Cancelar ação
            </Button>
            <Button busy={busy} onClick={() => void lifecycle(pending, false)} variant="primary">
              Confirmar arquivamento da afirmação
            </Button>
          </ButtonGroup>
        </div>
      )}
      {pendingPromotion === null ? null : (
        <div
          className="mt-5 rounded-xl border semantic-warning-border semantic-warning-surface p-5"
          role="alert"
        >
          <p className="font-semibold">Promover esta possibilidade a fato?</p>
          <p className="mt-2">
            Declaração:{' '}
            {registryAssertionText(pendingPromotion, sourceMetadata[pendingPromotion.id])}
          </p>
          <p className="mt-1">
            Assunto: {registrySubjectLabel(sourceMetadata[pendingPromotion.id])}
          </p>
          <p className="mt-2">
            A natureza do conhecimento mudará somente após sua confirmação. O estado canônico, a
            visibilidade e a proveniência serão preservados.
          </p>
          <ButtonGroup aria-label="Confirmação da promoção" className="mt-3">
            <Button disabled={busy} onClick={() => setPendingPromotion(null)}>
              Cancelar promoção
            </Button>
            <Button busy={busy} onClick={() => void confirmPromotion()} variant="primary">
              Confirmar promoção a fato
            </Button>
          </ButtonGroup>
        </div>
      )}
      {loading && items.length === 0 ? (
        <p aria-live="polite" className="mt-8">
          Carregando afirmações…
        </p>
      ) : shouldShowRegistryEmptyState({
          loading,
          hasError: error !== null,
          itemCount: items.length,
        }) ? (
        <div className="mt-8 rounded-2xl border border-dashed semantic-border semantic-surface p-12 text-center">
          <h2 className="text-xl font-semibold">Nenhuma afirmação encontrada</h2>
        </div>
      ) : (
        <div className="mt-7 grid gap-4" data-testid="assertion-list">
          {items.map((item) => (
            <article
              className="rounded-2xl border semantic-border semantic-surface p-6"
              key={item.id}
            >
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <Badge>{canonLabel(item.canonState)}</Badge>
                <Badge>{knowledgeLabel(item.knowledgeState)}</Badge>
                <Badge>{visibilityLabel(item.visibility)}</Badge>
              </div>
              <p className="mt-4 text-lg font-medium">
                {registry
                  ? registryAssertionText(item, sourceMetadata[item.id])
                  : assertionText(item, entities)}
              </p>
              {item.knowledgeState === 'possibility' ? (
                <p className="mt-2 font-semibold semantic-accent-text">
                  Possibilidade — não confirmada como fato
                </p>
              ) : null}
              {registry ? (
                <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold">Assunto</dt>
                    <dd>{registrySubjectLabel(sourceMetadata[item.id])}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Natureza</dt>
                    <dd>{knowledgeLabel(item.knowledgeState)}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Estado canônico</dt>
                    <dd>{canonLabel(item.canonState)}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Visibilidade</dt>
                    <dd>{visibilityLabel(item.visibility)}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Origem</dt>
                    <dd>{originLabel(item.originKind)}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Fonte</dt>
                    <dd>
                      {registrySourceLabel(
                        item,
                        sourceMetadata[item.id],
                        originLabel(item.originKind),
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Sessão</dt>
                    <dd>{registrySessionLabel(item, sourceMetadata[item.id])}</dd>
                  </div>
                </dl>
              ) : null}
              <ToolbarActions aria-label="Ações da afirmação" className="mt-5 justify-end">
                {registry && item.knowledgeState === 'possibility' ? (
                  <Button
                    disabled={busy || pendingPromotion !== null}
                    onClick={() => {
                      setPendingPromotion((current) => choosePromotionTarget(current, item));
                    }}
                  >
                    Promover possibilidade a fato
                  </Button>
                ) : null}
                <Button disabled={busy} onClick={() => void beginEdit(item)}>
                  Editar afirmação
                </Button>
                {item.archivedAt === null ? (
                  <Button disabled={busy} onClick={() => setPending(item)}>
                    Arquivar afirmação
                  </Button>
                ) : (
                  <Button disabled={busy} onClick={() => void lifecycle(item, true)}>
                    Restaurar afirmação
                  </Button>
                )}
              </ToolbarActions>
            </article>
          ))}
        </div>
      )}
      {cursor === null ? null : (
        <Button busy={loading} className="mt-6" onClick={() => void load(true)}>
          {loading ? 'Carregando…' : 'Carregar mais afirmações'}
        </Button>
      )}
    </section>
  );
}

function AssertionForm({
  campaign,
  entities,
  assertion,
  context,
  initialDraft,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  campaign: Campaign;
  entities: Entity[];
  assertion: Assertion | null;
  context?: NarrativeContext;
  initialDraft?: { subjectEntityId: string; statement: string };
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (input: CreateAssertionInput) => Promise<void>;
}): React.JSX.Element {
  const [structured, setStructured] = useState(assertion?.statement === null);
  const [subject, setSubject] = useState(
    assertion?.subjectEntityId ?? initialDraft?.subjectEntityId ?? context?.entityId ?? '',
  );
  const [object, setObject] = useState(assertion?.objectEntityId ?? '');
  const [statement, setStatement] = useState(assertion?.statement ?? initialDraft?.statement ?? '');
  const [predicate, setPredicate] = useState(assertion?.predicate ?? '');
  const [value, setValue] = useState(
    assertion?.value === null || assertion?.value === undefined
      ? ''
      : JSON.stringify(assertion.value),
  );
  const [metadata, setMetadata] = useState<NarrativeMetadataValues>({
    canonState: assertion?.canonState ?? 'accepted',
    knowledgeState: assertion?.knowledgeState ?? 'fact',
    visibility: assertion?.visibility ?? 'gm',
    originKind: assertion?.originKind ?? 'manual',
    sourceId: assertion?.sourceId ?? null,
  });
  const [validation, setValidation] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState(assertion?.sessionId ?? '');
  const sessionSource = useSessionSourceOptions(campaign.id);
  const sessionUnavailable = metadata.originKind === 'session' && !sessionSource.available;
  function submit(event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>): void {
    event.preventDefault();
    setValidation(null);
    try {
      if (subject === '') throw new Error('Escolha a entidade sujeito.');
      if (structured && predicate.trim() === '') throw new Error('Informe o predicado.');
      if (structured && predicate.trim().length > 200)
        throw new Error('O predicado deve ter no máximo 200 caracteres.');
      if (structured && object === '' && value.trim() === '')
        throw new Error('Informe uma entidade objeto ou um valor JSON.');
      if (!structured && statement.trim() === '') throw new Error('Informe a afirmação textual.');
      if (sessionUnavailable)
        throw new Error(
          sessionSource.loading
            ? 'Aguarde o carregamento das sessões de origem.'
            : 'A origem por sessão não está disponível. Escolha outra origem ou recarregue as sessões.',
        );
      if (metadata.originKind === 'session' && sessionId === '')
        throw new Error('Escolha a sessão de origem.');
      if (!structured && statement.trim().length > 10000)
        throw new Error('A afirmação textual deve ter no máximo 10000 caracteres.');
      let parsed: CreateAssertionInput['value'] = null;
      if (structured && value.trim() !== '')
        parsed = JSON.parse(value) as CreateAssertionInput['value'];
      const metadataInput = {
        canonState: metadata.canonState,
        knowledgeState: metadata.knowledgeState,
        visibility: metadata.visibility,
        originKind: metadata.originKind,
      };
      void onSubmit({
        campaignId: campaign.id,
        subjectEntityId: subject,
        predicate: structured ? predicate.trim() || null : null,
        objectEntityId: structured ? object || null : null,
        statement: structured ? null : statement.trim() || null,
        value: structured ? parsed : null,
        ...metadataInput,
        ...(metadata.originKind === 'session' ? { sessionId } : {}),
      });
    } catch (reason) {
      setValidation(message(reason));
    }
  }
  return (
    <section className="mx-auto max-w-4xl">
      <Button disabled={busy} onClick={onCancel} size="small" variant="ghost">
        ← Voltar para afirmações
      </Button>
      <div className="mt-6 rounded-3xl border semantic-border semantic-surface p-8">
        <h1 className="text-3xl font-semibold">
          {assertion === null ? 'Nova afirmação' : 'Editar afirmação'}
        </h1>
        <form className="mt-7 space-y-6" noValidate onSubmit={submit}>
          <label className="block font-semibold">
            Entidade sujeito *
            <select
              autoFocus
              className={inputClass}
              disabled={busy || context !== undefined}
              required
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            >
              <option value="">Selecione…</option>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend className="font-semibold">Formato</legend>
            <ButtonGroup aria-label="Formato da afirmação" className="mt-2">
              <Button aria-pressed={!structured} onClick={() => setStructured(false)}>
                Textual
              </Button>
              <Button aria-pressed={structured} onClick={() => setStructured(true)}>
                Estruturada
              </Button>
            </ButtonGroup>
          </fieldset>
          {structured ? (
            <div className="grid gap-5 md:grid-cols-2">
              <label className="block font-semibold">
                Predicado *
                <input
                  className={inputClass}
                  disabled={busy}
                  maxLength={200}
                  required
                  value={predicate}
                  onChange={(event) => setPredicate(event.target.value)}
                />
              </label>
              <label className="block font-semibold">
                Entidade objeto (opcional)
                <select
                  className={inputClass}
                  disabled={busy}
                  value={object}
                  onChange={(event) => setObject(event.target.value)}
                >
                  <option value="">Nenhuma</option>
                  {entities.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block font-semibold md:col-span-2">
                Valor JSON (opcional)
                <textarea
                  className={inputClass}
                  disabled={busy}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
              </label>
            </div>
          ) : (
            <label className="block font-semibold">
              Afirmação textual *
              <textarea
                className={`${inputClass} min-h-32`}
                disabled={busy}
                maxLength={10000}
                required
                value={statement}
                onChange={(event) => setStatement(event.target.value)}
              />
            </label>
          )}
          <NarrativeMetadataFields
            disabled={busy}
            hideSourceIdentifier
            sessionSource={{ ...sessionSource, value: sessionId, onChange: setSessionId }}
            values={metadata}
            onChange={setMetadata}
          />
          {error === null && validation === null ? null : (
            <p className="rounded-xl semantic-danger-surface p-4 semantic-error-text" role="alert">
              {error ?? validation}
            </p>
          )}
          <FormActions>
            <Button disabled={busy} onClick={onCancel}>
              Cancelar
            </Button>
            <Button busy={busy} disabled={sessionUnavailable} type="submit" variant="primary">
              {busy ? 'Salvando…' : assertion === null ? 'Criar afirmação' : 'Salvar afirmação'}
            </Button>
          </FormActions>
        </form>
      </div>
    </section>
  );
}

async function loadAllEntities(campaignId: string): Promise<Entity[]> {
  const items: Entity[] = [];
  let cursor: string | undefined;
  do {
    const result = await window.campaignManager.entities.list({
      campaignId,
      limit: 100,
      ...(cursor === undefined ? {} : { cursor }),
      filters: { archived: false },
    });
    if (!result.ok) throw new Error(userFacingErrorMessage(result.error, 'entities.list'));
    items.push(...result.data.items);
    cursor = result.data.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return items;
}
function assertionText(item: Assertion, entities: Entity[]): string {
  if (item.statement !== null) return item.statement;
  const name = (id: string | null) =>
    id === null ? '' : (entities.find((entity) => entity.id === id)?.name ?? id);
  const complement =
    item.objectEntityId !== null
      ? name(item.objectEntityId)
      : item.value === null
        ? ''
        : JSON.stringify(item.value);
  return `${name(item.subjectEntityId)} ${item.predicate ?? ''} ${complement}`.trim();
}

function originLabel(originKind: OriginKind): string {
  return originOptions.find(([value]) => value === originKind)?.[1] ?? originKind;
}

function Filter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <label className="flex w-40 max-w-full flex-col text-sm font-semibold">
      {label}
      <select
        className={inputClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Todos</option>
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
function Badge({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span className="rounded-full semantic-surface-muted px-3 py-1">{children}</span>;
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível concluir a operação.';
}
