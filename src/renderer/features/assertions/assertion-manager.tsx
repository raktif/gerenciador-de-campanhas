import { useCallback, useEffect, useState } from 'react';
import type { Assertion, CreateAssertionInput } from '../../../core/contracts/assertions';
import type { Campaign } from '../../../core/contracts/campaigns';
import type { Entity } from '../../../core/contracts/entities';
import {
  NarrativeMetadataFields,
  canonLabel,
  canonOptions,
  inputClass,
  knowledgeLabel,
  knowledgeOptions,
  primaryClass,
  secondaryClass,
  visibilityLabel,
  visibilityOptions,
  type NarrativeMetadataValues,
} from '../narrative/narrative-metadata-fields';

type View = 'list' | 'create' | 'edit';
export interface NarrativeContext {
  entityId: string;
  entityName: string;
}

export function AssertionManager({
  campaign,
  context,
  onBack,
}: {
  campaign: Campaign;
  context?: NarrativeContext;
  onBack: () => void;
}): React.JSX.Element {
  const [items, setItems] = useState<Assertion[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<Assertion | null>(null);
  const [archived, setArchived] = useState(false);
  const [knowledge, setKnowledge] = useState('');
  const [canon, setCanon] = useState('');
  const [visibility, setVisibility] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [pending, setPending] = useState<Assertion | null>(null);

  const load = useCallback(
    async (append = false): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const result = await window.campaignManager.assertions.list({
          campaignId: campaign.id,
          ...(append && cursor !== null ? { cursor } : {}),
          filters: {
            archived,
            ...(context === undefined ? {} : { entityId: context.entityId }),
            ...(knowledge === ''
              ? {}
              : { knowledgeState: knowledge as Assertion['knowledgeState'] }),
            ...(canon === '' ? {} : { canonState: canon as Assertion['canonState'] }),
            ...(visibility === '' ? {} : { visibility: visibility as Assertion['visibility'] }),
          },
        });
        if (result.ok) {
          setItems((current) => (append ? [...current, ...result.data.items] : result.data.items));
          setCursor(result.data.nextCursor);
        } else setError(result.error.message);
      } catch {
        setError(unexpectedGatewayError);
      } finally {
        setLoading(false);
      }
    },
    [archived, campaign.id, canon, context, cursor, knowledge, visibility],
  );

  useEffect(() => {
    setItems([]);
    setCursor(null);
    void load(false);
  }, [archived, campaign.id, canon, context?.entityId, knowledge, visibility]);
  useEffect(() => {
    void loadAllEntities(campaign.id)
      .then(setEntities)
      .catch(() => setError(unexpectedGatewayError));
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
        setError(result.error.message);
        return;
      }
      setEditing(result.data);
      setView('edit');
    } catch {
      setError(unexpectedGatewayError);
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
                sourceId: input.sourceId,
              },
            });
      if (result.ok) {
        setAnnouncement(editing === null ? 'Afirmação criada.' : 'Afirmação atualizada.');
        setEditing(null);
        setView('list');
        await load(false);
      } else setError(result.error.message);
    } catch {
      setError(unexpectedGatewayError);
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
      } else setError(result.error.message);
    } catch {
      setError(unexpectedGatewayError);
    } finally {
      setBusy(false);
    }
  }

  if (view !== 'list')
    return (
      <AssertionForm
        campaign={campaign}
        {...(context === undefined ? {} : { context })}
        entities={entities}
        assertion={editing}
        busy={busy}
        error={error}
        onCancel={() => {
          setEditing(null);
          setView('list');
          setError(null);
        }}
        onSubmit={submit}
      />
    );
  return (
    <section aria-labelledby="assertions-title">
      <button className={secondaryClass} onClick={onBack} type="button">
        ← {context === undefined ? 'Voltar para detalhes da campanha' : `Voltar para entidades`}
      </button>
      <header className="mt-6 flex flex-wrap items-end justify-between gap-5 border-b border-stone-200 pb-6">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-amber-800 uppercase">
            {campaign.name}
          </p>
          <h1 className="mt-2 text-4xl font-semibold" id="assertions-title">
            Afirmações
          </h1>
          <p className="mt-2 text-slate-600">
            {context === undefined
              ? 'Fatos, rumores e possibilidades com proveniência explícita.'
              : `Contexto: ${context.entityName}`}
          </p>
        </div>
        <button
          className={primaryClass}
          disabled={busy || entities.length === 0}
          onClick={() => {
            setEditing(null);
            setView('create');
          }}
          type="button"
        >
          Nova afirmação
        </button>
      </header>
      <div className="mt-5 flex flex-wrap gap-3">
        <Filter
          label="Natureza"
          value={knowledge}
          options={knowledgeOptions}
          onChange={setKnowledge}
        />
        <Filter label="Estado canônico" value={canon} options={canonOptions} onChange={setCanon} />
        <Filter
          label="Visibilidade"
          value={visibility}
          options={visibilityOptions}
          onChange={setVisibility}
        />
        <button
          aria-pressed={!archived}
          className={secondaryClass}
          onClick={() => setArchived(false)}
          type="button"
        >
          Ativas
        </button>
        <button
          aria-pressed={archived}
          className={secondaryClass}
          onClick={() => setArchived(true)}
          type="button"
        >
          Arquivadas
        </button>
      </div>
      {announcement === null ? null : (
        <p
          aria-live="polite"
          className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800"
          role="status"
        >
          {announcement}
        </p>
      )}
      {error === null ? null : (
        <div
          className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"
          role="alert"
        >
          {error}
          <button className="ml-3 underline" onClick={() => void load(false)} type="button">
            Tentar novamente
          </button>
        </div>
      )}
      {pending === null ? null : (
        <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-5" role="alert">
          <p className="font-semibold">Arquivar esta afirmação?</p>
          <div className="mt-3 flex gap-3">
            <button
              className={secondaryClass}
              disabled={busy}
              onClick={() => setPending(null)}
              type="button"
            >
              Cancelar ação
            </button>
            <button
              className={primaryClass}
              disabled={busy}
              onClick={() => void lifecycle(pending, false)}
              type="button"
            >
              Confirmar arquivamento da afirmação
            </button>
          </div>
        </div>
      )}
      {loading && items.length === 0 ? (
        <p aria-live="polite" className="mt-8">
          Carregando afirmações…
        </p>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
          <h2 className="text-xl font-semibold">Nenhuma afirmação encontrada</h2>
        </div>
      ) : (
        <div className="mt-7 grid gap-4" data-testid="assertion-list">
          {items.map((item) => (
            <article className="rounded-2xl border border-stone-200 bg-white p-6" key={item.id}>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <Badge>{canonLabel(item.canonState)}</Badge>
                <Badge>{knowledgeLabel(item.knowledgeState)}</Badge>
                <Badge>{visibilityLabel(item.visibility)}</Badge>
              </div>
              <p className="mt-4 text-lg font-medium">{assertionText(item, entities)}</p>
              {item.knowledgeState === 'possibility' ? (
                <p className="mt-2 font-semibold text-amber-800">
                  Possibilidade — não confirmada como fato
                </p>
              ) : null}
              <div className="mt-5 flex justify-end gap-3">
                <button
                  className={secondaryClass}
                  disabled={busy}
                  onClick={() => void beginEdit(item)}
                  type="button"
                >
                  Editar afirmação
                </button>
                {item.archivedAt === null ? (
                  <button
                    className={secondaryClass}
                    disabled={busy}
                    onClick={() => setPending(item)}
                    type="button"
                  >
                    Arquivar afirmação
                  </button>
                ) : (
                  <button
                    className={secondaryClass}
                    disabled={busy}
                    onClick={() => void lifecycle(item, true)}
                    type="button"
                  >
                    Restaurar afirmação
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {cursor === null ? null : (
        <button
          className={`${secondaryClass} mt-6`}
          disabled={loading}
          onClick={() => void load(true)}
          type="button"
        >
          {loading ? 'Carregando…' : 'Carregar mais afirmações'}
        </button>
      )}
    </section>
  );
}

function AssertionForm({
  campaign,
  entities,
  assertion,
  context,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  campaign: Campaign;
  entities: Entity[];
  assertion: Assertion | null;
  context?: NarrativeContext;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (input: CreateAssertionInput) => Promise<void>;
}): React.JSX.Element {
  const [structured, setStructured] = useState(assertion?.statement === null);
  const [subject, setSubject] = useState(assertion?.subjectEntityId ?? context?.entityId ?? '');
  const [object, setObject] = useState(assertion?.objectEntityId ?? '');
  const [statement, setStatement] = useState(assertion?.statement ?? '');
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
      if (!structured && statement.trim().length > 10000)
        throw new Error('A afirmação textual deve ter no máximo 10000 caracteres.');
      let parsed: CreateAssertionInput['value'] = null;
      if (structured && value.trim() !== '')
        parsed = JSON.parse(value) as CreateAssertionInput['value'];
      void onSubmit({
        campaignId: campaign.id,
        subjectEntityId: subject,
        predicate: structured ? predicate.trim() || null : null,
        objectEntityId: structured ? object || null : null,
        statement: structured ? null : statement.trim() || null,
        value: structured ? parsed : null,
        ...metadata,
      });
    } catch (reason) {
      setValidation(message(reason));
    }
  }
  return (
    <section className="mx-auto max-w-4xl">
      <button className={secondaryClass} disabled={busy} onClick={onCancel} type="button">
        ← Voltar para afirmações
      </button>
      <div className="mt-6 rounded-3xl border border-stone-200 bg-white p-8">
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
            <div className="mt-2 flex gap-3">
              <button
                aria-pressed={!structured}
                className={secondaryClass}
                onClick={() => setStructured(false)}
                type="button"
              >
                Textual
              </button>
              <button
                aria-pressed={structured}
                className={secondaryClass}
                onClick={() => setStructured(true)}
                type="button"
              >
                Estruturada
              </button>
            </div>
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
          <NarrativeMetadataFields disabled={busy} values={metadata} onChange={setMetadata} />
          {error === null && validation === null ? null : (
            <p className="rounded-xl bg-red-50 p-4 text-red-800" role="alert">
              {error ?? validation}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button className={secondaryClass} disabled={busy} onClick={onCancel} type="button">
              Cancelar
            </button>
            <button className={primaryClass} disabled={busy} type="submit">
              {busy ? 'Salvando…' : assertion === null ? 'Criar afirmação' : 'Salvar afirmação'}
            </button>
          </div>
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
    if (!result.ok) throw new Error(result.error.message);
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
    <label className="text-sm font-semibold">
      {label}
      <select
        className={`${inputClass} ml-2 mt-0 w-auto`}
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
  return <span className="rounded-full bg-stone-100 px-3 py-1">{children}</span>;
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível concluir a operação.';
}
const unexpectedGatewayError =
  'Não foi possível concluir a operação. Revise os dados e tente novamente.';
