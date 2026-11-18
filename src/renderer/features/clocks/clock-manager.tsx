import { useCallback, useEffect, useRef, useState } from 'react';
import type { Campaign } from '../../../core/contracts/campaigns';
import {
  clockDivisionCounts,
  clockStatuses,
  clockTypes,
  type Clock,
  type ClockStatus,
  type ClockType,
} from '../../../core/contracts/clocks';
import type { Entity } from '../../../core/contracts/entities';
import { manualNarrativeDefaults } from '../../../core/contracts/narrative';
import {
  presentUserFacingError,
  type UserFacingError,
} from '../../../core/errors/user-facing-error';
import { Button, ButtonGroup } from '../../components/actions';
import { UserFacingErrorNotice } from '../../components/user-facing-error-notice';
import {
  NarrativeMetadataFields,
  type NarrativeMetadataValues,
} from '../narrative/narrative-metadata-fields';
import { useSessionSourceOptions } from '../narrative/session-source-options';

type View = 'list' | 'detail' | 'create' | 'edit';
type Filter = '' | ClockStatus;
type ClockOperation = 'clocks.list' | 'clocks.get' | 'clocks.mutate' | 'entities.list';
interface ClockForm {
  name: string;
  description: string;
  consequence: string;
  clockType: ClockType;
  segmentsTotal: number;
  segmentsFilled: number;
  entityId: string;
  sessionId: string;
  metadata: NarrativeMetadataValues;
}
type PendingConclusion = 'create' | 'edit' | 'complete' | null;

const typeLabels: Record<ClockType, string> = {
  progress: 'Progresso',
  threat: 'Ameaça',
  countdown: 'Contagem regressiva',
  project: 'Projeto',
  investigation: 'Investigação',
  custom: 'Personalizado',
};
const statusLabels: Record<ClockStatus, string> = {
  active: 'Ativo',
  completed: 'Concluído',
};
const inputClass = 'rounded-lg border semantic-border semantic-input px-3 py-2';
const emptyForm: ClockForm = {
  name: '',
  description: '',
  consequence: '',
  clockType: 'progress',
  segmentsTotal: 4,
  segmentsFilled: 0,
  entityId: '',
  sessionId: '',
  metadata: {
    ...manualNarrativeDefaults,
    sourceId: null,
  },
};

export function ClockManager({
  campaign,
  onBack,
}: {
  campaign: Campaign;
  onBack: () => void;
}): React.JSX.Element {
  const [view, setView] = useState<View>('list');
  const [items, setItems] = useState<Clock[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('');
  const [selected, setSelected] = useState<Clock | null>(null);
  const [requestedClockId, setRequestedClockId] = useState<string | null>(null);
  const [form, setForm] = useState<ClockForm>(emptyForm);
  const [pendingConclusion, setPendingConclusion] = useState<PendingConclusion>(null);
  const [entitiesLoading, setEntitiesLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<ClockOperation, UserFacingError>>>({});
  const [createIdempotencyKey, setCreateIdempotencyKey] = useState(() =>
    globalThis.crypto.randomUUID(),
  );
  const [notice, setNotice] = useState('');
  const sessionSource = useSessionSourceOptions(campaign.id);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const entityRequest = useRef(0);

  const setOperationError = useCallback(
    (operation: ClockOperation, error: UserFacingError | null): void => {
      setErrors((current) => {
        if (error === null) {
          return { ...current, [operation]: undefined };
        }
        return { ...current, [operation]: error };
      });
    },
    [],
  );

  useEffect(
    () => () => {
      listRequest.current += 1;
      detailRequest.current += 1;
      entityRequest.current += 1;
    },
    [],
  );

  const loadList = useCallback(
    async (append = false, requestedCursor: string | null = null): Promise<void> => {
      const requestNumber = ++listRequest.current;
      const requestCursor = append ? requestedCursor : null;
      setLoading(true);
      setOperationError('clocks.list', null);
      if (!append) {
        setItems([]);
        setCursor(null);
      }
      try {
        const result = await window.campaignManager.clocks.list({
          campaignId: campaign.id,
          ...(filter === '' ? {} : { status: filter }),
          ...(requestCursor === null ? {} : { cursor: requestCursor }),
          limit: 50,
        });
        if (requestNumber !== listRequest.current) return;
        if (!result.ok) {
          setOperationError('clocks.list', presentUserFacingError(result.error, 'clocks.list'));
          return;
        }
        setItems((previous) =>
          append && requestCursor !== null
            ? [...previous, ...result.data.items]
            : result.data.items,
        );
        setCursor(result.data.nextCursor);
      } catch (reason) {
        if (requestNumber === listRequest.current)
          setOperationError('clocks.list', presentUserFacingError(reason, 'clocks.list'));
      } finally {
        if (requestNumber === listRequest.current) setLoading(false);
      }
    },
    [campaign.id, filter, setOperationError],
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadEntities = useCallback(async (): Promise<void> => {
    const requestNumber = ++entityRequest.current;
    setEntitiesLoading(true);
    setOperationError('entities.list', null);
    try {
      const loaded: Entity[] = [];
      let cursorValue: string | null = null;
      do {
        const result = await window.campaignManager.entities.list({
          campaignId: campaign.id,
          limit: 100,
          filters: { archived: false },
          sort: 'name',
          order: 'asc',
          ...(cursorValue === null ? {} : { cursor: cursorValue }),
        });
        if (requestNumber !== entityRequest.current) return;
        if (!result.ok) {
          setOperationError('entities.list', presentUserFacingError(result.error, 'entities.list'));
          return;
        }
        loaded.push(...result.data.items);
        cursorValue = result.data.nextCursor;
      } while (cursorValue !== null);
      if (requestNumber === entityRequest.current) setEntities(loaded);
    } catch (reason) {
      if (requestNumber === entityRequest.current)
        setOperationError('entities.list', presentUserFacingError(reason, 'entities.list'));
    } finally {
      if (requestNumber === entityRequest.current) setEntitiesLoading(false);
    }
  }, [campaign.id, setOperationError]);

  useEffect(() => {
    void loadEntities();
  }, [loadEntities]);

  async function loadClock(id: string): Promise<void> {
    const requestNumber = ++detailRequest.current;
    setRequestedClockId(id);
    setSelected(null);
    setOperationError('clocks.get', null);
    setLoading(true);
    setView('detail');
    try {
      const result = await window.campaignManager.clocks.get({
        campaignId: campaign.id,
        id,
      });
      if (requestNumber !== detailRequest.current) return;
      if (!result.ok) {
        setOperationError('clocks.get', presentUserFacingError(result.error, 'clocks.get'));
        return;
      }
      setSelected(result.data);
    } catch (reason) {
      if (requestNumber === detailRequest.current)
        setOperationError('clocks.get', presentUserFacingError(reason, 'clocks.get'));
    } finally {
      if (requestNumber === detailRequest.current) setLoading(false);
    }
  }

  async function confirmConclusion(generateEvent: boolean): Promise<void> {
    const pending = pendingConclusion;
    setPendingConclusion(null);
    if (pending === 'complete') await performComplete(generateEvent);
    else if (pending === 'create' || pending === 'edit') await performSave(generateEvent);
  }

  async function openClock(clock: Clock): Promise<void> {
    await loadClock(clock.id);
  }

  function beginCreate(): void {
    setSelected(null);
    setCreateIdempotencyKey(globalThis.crypto.randomUUID());
    setForm(emptyForm);
    setOperationError('clocks.mutate', null);
    setView('create');
  }

  function beginEdit(): void {
    if (selected === null || selected.status === 'completed') return;
    setForm({
      name: selected.name,
      description: selected.description ?? '',
      consequence: selected.consequence,
      clockType: selected.clockType,
      segmentsTotal: selected.segmentsTotal,
      segmentsFilled: selected.segmentsFilled,
      entityId: selected.entityId,
      sessionId: selected.sessionId ?? '',
      metadata: {
        canonState: selected.canonState,
        knowledgeState: selected.knowledgeState,
        visibility: selected.visibility,
        originKind: selected.originKind,
        sourceId: selected.sourceId,
      },
    });
    setOperationError('clocks.mutate', null);
    setView('edit');
  }

  async function save(): Promise<void> {
    if (busy || (view !== 'create' && view !== 'edit')) return;
    if (form.segmentsFilled > form.segmentsTotal) {
      setOperationError(
        'clocks.mutate',
        presentUserFacingError(
          {
            code: 'CLOCK_PROGRESS_EXCEEDS_TOTAL',
            message: 'O progresso atual excede o total escolhido.',
          },
          'clocks.mutate',
        ),
      );
      return;
    }
    if (form.segmentsFilled === form.segmentsTotal) {
      setPendingConclusion(view);
      return;
    }
    await performSave();
  }

  async function performSave(generateEvent?: boolean): Promise<void> {
    setBusy(true);
    setOperationError('clocks.mutate', null);
    try {
      const result =
        view === 'create'
          ? await window.campaignManager.clocks.create({
              campaignId: campaign.id,
              idempotencyKey: createIdempotencyKey,
              name: form.name,
              description: form.description.trim() === '' ? null : form.description,
              consequence: form.consequence,
              clockType: form.clockType,
              segmentsTotal: form.segmentsTotal as (typeof clockDivisionCounts)[number],
              segmentsFilled: form.segmentsFilled,
              entityId: form.entityId,
              ...form.metadata,
              sourceId: form.metadata.originKind === 'session' ? null : form.metadata.sourceId,
              ...(form.metadata.originKind === 'session' && form.sessionId !== ''
                ? { sessionId: form.sessionId }
                : {}),
              ...(generateEvent === undefined ? {} : { generateEvent }),
            })
          : selected === null
            ? null
            : await window.campaignManager.clocks.update({
                campaignId: campaign.id,
                id: selected.id,
                revision: selected.revision,
                patch: {
                  name: form.name,
                  description: form.description.trim() === '' ? null : form.description,
                  consequence: form.consequence,
                  clockType: form.clockType,
                  segmentsTotal: form.segmentsTotal as (typeof clockDivisionCounts)[number],
                  segmentsFilled: form.segmentsFilled,
                  entityId: form.entityId,
                  ...form.metadata,
                  ...(form.metadata.originKind === 'session' ? { sessionId: form.sessionId } : {}),
                },
                ...(generateEvent === undefined ? {} : { generateEvent }),
              });
      if (result === null) {
        setOperationError('clocks.mutate', presentUserFacingError(undefined, 'clocks.mutate'));
        return;
      }
      if (!result.ok) {
        setOperationError('clocks.mutate', presentUserFacingError(result.error, 'clocks.mutate'));
        return;
      }
      if (view === 'create') setCreateIdempotencyKey(globalThis.crypto.randomUUID());
      setSelected(result.data);
      setView('detail');
      setNotice(
        result.data.status === 'completed'
          ? 'Relógio concluído.'
          : view === 'create'
            ? 'Relógio criado.'
            : 'Relógio atualizado.',
      );
      await loadList();
    } catch (reason) {
      setOperationError('clocks.mutate', presentUserFacingError(reason, 'clocks.mutate'));
    } finally {
      setBusy(false);
    }
  }

  function complete(): void {
    if (busy || selected?.status !== 'active') return;
    setPendingConclusion('complete');
  }

  async function performComplete(generateEvent: boolean): Promise<void> {
    if (busy || selected?.status !== 'active') return;
    setBusy(true);
    setOperationError('clocks.mutate', null);
    try {
      const result = await window.campaignManager.clocks.complete({
        campaignId: campaign.id,
        id: selected.id,
        revision: selected.revision,
        generateEvent,
      });
      if (!result.ok) {
        setOperationError('clocks.mutate', presentUserFacingError(result.error, 'clocks.mutate'));
        return;
      }

      setSelected(result.data);
      setNotice('Relógio concluído com o progresso atual.');
      await loadList();
    } catch (reason) {
      setOperationError('clocks.mutate', presentUserFacingError(reason, 'clocks.mutate'));
    } finally {
      setBusy(false);
    }
  }

  function returnToList(): void {
    detailRequest.current += 1;
    setRequestedClockId(null);
    setSelected(null);
    setOperationError('clocks.get', null);
    setOperationError('clocks.mutate', null);
    setNotice('');
    setView('list');
  }

  return (
    <section className="space-y-5" aria-labelledby="clocks-title">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="clocks-title" className="text-2xl font-semibold">
            Relógios
          </h1>
          <p className="mt-1 text-sm semantic-text-secondary">
            Acompanhe objetivos e acontecimentos da campanha.
          </p>
        </div>
        <ButtonGroup aria-label="Navegação dos relógios">
          {view !== 'list' ? (
            <Button onClick={returnToList}>Voltar à lista</Button>
          ) : (
            <>
              <Button onClick={onBack}>Voltar</Button>
              <Button onClick={beginCreate}>Novo relógio</Button>
            </>
          )}
        </ButtonGroup>
      </header>

      <p className="text-sm semantic-text-secondary">
        As divisões representam partes de um objetivo ou acontecimento, não partidas da campanha.
        Todos os tipos usam a mesma regra: somente uma alteração explícita do narrador muda o
        preenchimento.
      </p>
      {notice !== '' ? (
        <p role="status" className="rounded-lg border semantic-border p-3">
          {notice}
        </p>
      ) : null}
      {(['clocks.list', 'entities.list', 'clocks.get', 'clocks.mutate'] as const).map(
        (operation) => {
          const error = errors[operation];
          if (error === undefined) return null;
          return (
            <UserFacingErrorNotice
              key={operation}
              error={error}
              operation={operation}
              onRetry={
                operation === 'clocks.mutate'
                  ? undefined
                  : () => {
                      if (operation === 'entities.list') void loadEntities();
                      else if (operation === 'clocks.list') void loadList();
                      else if (requestedClockId !== null) void loadClock(requestedClockId);
                    }
              }
            />
          );
        },
      )}
      {errors['clocks.mutate'] !== undefined && view === 'edit' && selected !== null ? (
        <Button onClick={() => void openClock(selected)}>
          Descartar edição e recarregar relógio
        </Button>
      ) : null}
      {errors['clocks.mutate']?.code === 'CLOCK_ENTITY_ARCHIVED' &&
      view === 'detail' &&
      selected?.status === 'active' ? (
        <Button onClick={() => void openClock(selected)}>Atualizar relógio e entidade</Button>
      ) : null}

      {view === 'list' ? (
        <div className="space-y-4">
          <label className="grid max-w-sm gap-1 text-sm font-medium">
            Mostrar
            <select
              className={inputClass}
              value={filter}
              onChange={(event) => setFilter(event.target.value as Filter)}
            >
              <option value="">Todos os relógios</option>
              {clockStatuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
          </label>
          {loading && items.length === 0 ? <p role="status">Carregando relógios…</p> : null}
          {!loading && items.length === 0 && errors['clocks.list'] === undefined ? (
            <div className="rounded-xl border semantic-border p-5">
              <h2 className="font-semibold">Ainda não há relógios</h2>
              <p className="mt-1 text-sm semantic-text-secondary">
                Crie um relógio para acompanhar um objetivo ou acontecimento.
              </p>
            </div>
          ) : null}
          <ul className="grid gap-3">
            {items.map((clock) => (
              <li key={clock.id}>
                <button
                  type="button"
                  className="w-full rounded-xl border semantic-border p-4 text-left hover:semantic-surface"
                  onClick={() => void openClock(clock)}
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{clock.name}</span>
                    <span>{statusLabels[clock.status]}</span>
                  </span>
                  {clock.entityArchivedAt !== null ? (
                    <span className="mt-1 block font-semibold text-amber-700 dark:text-amber-300">
                      Entidade arquivada — encerre o relógio manualmente
                    </span>
                  ) : null}
                  <span className="mt-1 block text-sm">Entidade: {clock.entityName}</span>
                  <span className="mt-1 block text-sm semantic-text-secondary">
                    {typeLabels[clock.clockType]} · {clock.segmentsFilled} de {clock.segmentsTotal}{' '}
                    divisões
                  </span>
                  <ClockProgress clock={clock} />
                </button>
              </li>
            ))}
          </ul>
          {cursor !== null ? (
            <Button disabled={loading} onClick={() => void loadList(true, cursor)}>
              {loading ? 'Carregando…' : 'Carregar mais'}
            </Button>
          ) : null}
          {loading && items.length > 0 ? <p role="status">Atualizando lista…</p> : null}
          <Button variant="secondary" disabled={loading} onClick={() => void loadList()}>
            Atualizar lista
          </Button>
        </div>
      ) : null}

      {view === 'detail' ? (
        loading ? (
          <p role="status">Carregando relógio…</p>
        ) : selected === null ? (
          errors['clocks.get'] === undefined ? (
            <p>O relógio não está disponível.</p>
          ) : null
        ) : (
          <article className="space-y-4 rounded-xl border semantic-border p-5">
            <div>
              <h2 className="text-xl font-semibold">{selected.name}</h2>
              <p className="mt-1 text-sm semantic-text-secondary">
                {typeLabels[selected.clockType]} · {statusLabels[selected.status]}
              </p>
            </div>
            {selected.description !== null ? <p>{selected.description}</p> : null}
            <p>Entidade: {selected.entityName}</p>
            <p>Consequência: {selected.consequence}</p>
            {selected.entityArchivedAt !== null ? (
              <p
                className="rounded-lg border border-amber-600 p-3 font-semibold text-amber-800 dark:text-amber-200"
                role="status"
              >
                Entidade arquivada — encerre o relógio manualmente. Não é possível gerar Evento
                enquanto a entidade estiver arquivada.
              </p>
            ) : null}
            <p>
              Progresso: {selected.segmentsFilled} de {selected.segmentsTotal} divisões
            </p>
            <ClockProgress clock={selected} />
            {selected.status === 'active' ? (
              <ButtonGroup aria-label="Ações do relógio">
                <Button onClick={beginEdit}>Editar</Button>
                <Button disabled={busy} onClick={complete}>
                  {busy ? 'Concluindo…' : 'Concluir relógio'}
                </Button>
              </ButtonGroup>
            ) : (
              <p className="text-sm semantic-text-secondary">
                Relógio concluído. Este registro permanece disponível para consulta e não pode mais
                ser alterado ou reaberto.
              </p>
            )}
          </article>
        )
      ) : null}

      {view === 'create' || view === 'edit' ? (
        <form
          className="grid max-w-2xl gap-4 rounded-xl border semantic-border p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className="grid gap-1 text-sm font-medium">
            Nome
            <input
              className={inputClass}
              required
              maxLength={200}
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Entidade vinculada
            <select
              className={inputClass}
              required
              value={form.entityId}
              disabled={entitiesLoading}
              onChange={(event) =>
                setForm((current) => ({ ...current, entityId: event.target.value }))
              }
            >
              <option value="">Selecione uma entidade ativa…</option>
              {selected?.entityArchivedAt !== null &&
              selected !== null &&
              !entities.some((entity) => entity.id === selected.entityId) ? (
                <option value={selected.entityId}>
                  {selected.entityName} — arquivada (vínculo existente)
                </option>
              ) : null}
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
            </select>
            {entitiesLoading ? <span role="status">Carregando entidades…</span> : null}
            {!entitiesLoading && entities.length === 0 ? (
              <span>
                Não há entidades ativas nesta campanha. Crie ou restaure uma antes do relógio.
              </span>
            ) : null}
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Consequência
            <textarea
              className={inputClass}
              rows={3}
              required
              maxLength={10000}
              value={form.consequence}
              onChange={(event) =>
                setForm((current) => ({ ...current, consequence: event.target.value }))
              }
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Descrição (opcional)
            <textarea
              className={inputClass}
              rows={3}
              maxLength={10000}
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
            />
          </label>
          <NarrativeMetadataFields
            values={form.metadata}
            disabled={busy}
            onChange={(metadata) =>
              setForm((current) => ({
                ...current,
                metadata,
                sessionId: metadata.originKind === 'session' ? current.sessionId : '',
              }))
            }
            sessionSource={{
              ...sessionSource,
              value: form.sessionId,
              onChange: (sourceId) => setForm((current) => ({ ...current, sessionId: sourceId })),
            }}
          />
          <label className="grid gap-1 text-sm font-medium">
            Tipo
            <select
              className={inputClass}
              value={form.clockType}
              onChange={(event) =>
                setForm((current) => ({ ...current, clockType: event.target.value as ClockType }))
              }
            >
              {clockTypes.map((type) => (
                <option key={type} value={type}>
                  {typeLabels[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Total de divisões
            <select
              className={inputClass}
              value={form.segmentsTotal}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  segmentsTotal: Number(event.target.value),
                }))
              }
            >
              {clockDivisionCounts.map((total) => (
                <option key={total} value={total}>
                  {total} divisões
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Divisões preenchidas
            <select
              className={inputClass}
              value={form.segmentsFilled}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  segmentsFilled: Number(event.target.value),
                }))
              }
            >
              {form.segmentsFilled > form.segmentsTotal ? (
                <option value={form.segmentsFilled} disabled>
                  {form.segmentsFilled} (excede o novo total; escolha outro valor)
                </option>
              ) : null}
              {Array.from({ length: form.segmentsTotal + 1 }, (_, index) => (
                <option key={index} value={index}>
                  {index}
                </option>
              ))}
            </select>
          </label>
          {form.segmentsFilled > form.segmentsTotal ? (
            <p role="alert">
              O progresso atual excede o total escolhido. Escolha um preenchimento compatível; o
              valor não será reduzido automaticamente.
            </p>
          ) : null}
          <p className="text-sm semantic-text-secondary">
            Ao preencher todas as divisões, o relógio será concluído nesta operação. Você também
            poderá concluí-lo com o progresso atual, inclusive sem divisões preenchidas.
          </p>
          <ButtonGroup aria-label="Ações do formulário">
            <Button disabled={busy || form.segmentsFilled > form.segmentsTotal} type="submit">
              {busy ? 'Salvando…' : view === 'create' ? 'Criar relógio' : 'Salvar alterações'}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              type="button"
              onClick={() => setView(selected === null ? 'list' : 'detail')}
            >
              Cancelar
            </Button>
          </ButtonGroup>
        </form>
      ) : null}
      {pendingConclusion !== null ? (
        <div
          aria-labelledby="clock-conclusion-title"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          role="dialog"
        >
          <div className="w-full max-w-lg space-y-4 rounded-xl border semantic-border semantic-surface p-5">
            <h2 className="text-xl font-semibold" id="clock-conclusion-title">
              Concluir relógio
            </h2>
            <p>
              O progresso atual será preservado. Deseja gerar um Evento Rascunho para revisão com o
              título do relógio e a consequência informada?
            </p>
            {selected?.entityArchivedAt !== null && selected !== null ? (
              <p className="rounded-lg border border-amber-600 p-3" role="status">
                A entidade está arquivada; não é possível gerar Evento. Você ainda pode concluir o
                relógio sem Evento ou cancelar.
              </p>
            ) : null}
            <ButtonGroup aria-label="Decisão sobre Evento de conclusão">
              {selected?.entityArchivedAt === null || selected === null ? (
                <Button disabled={busy} onClick={() => void confirmConclusion(true)}>
                  Concluir e gerar Evento
                </Button>
              ) : null}
              <Button disabled={busy} onClick={() => void confirmConclusion(false)}>
                Concluir sem Evento
              </Button>
              <Button
                disabled={busy}
                variant="secondary"
                onClick={() => setPendingConclusion(null)}
              >
                Cancelar
              </Button>
            </ButtonGroup>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ClockProgress({ clock }: { clock: Clock }): React.JSX.Element {
  return (
    <span
      className="mt-3 flex gap-1"
      role="progressbar"
      aria-label={`Progresso de ${clock.name}`}
      aria-valuemin={0}
      aria-valuemax={clock.segmentsTotal}
      aria-valuenow={clock.segmentsFilled}
    >
      {Array.from({ length: clock.segmentsTotal }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={`h-3 flex-1 rounded-sm border semantic-border ${
            index < clock.segmentsFilled ? 'bg-current' : ''
          }`}
        />
      ))}
    </span>
  );
}
