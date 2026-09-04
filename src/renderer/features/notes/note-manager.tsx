import { useCallback, useEffect, useState } from 'react';
import type { Campaign } from '../../../core/contracts/campaigns';
import type { Entity } from '../../../core/contracts/entities';
import type {
  CreateNoteInput,
  Note,
  NoteDetails,
  NoteEntityLinkInput,
} from '../../../core/contracts/notes';
import type { NarrativeContext } from '../assertions/assertion-manager';
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
const noteTypeOptions = [
  ['general', 'Geral'],
  ['idea', 'Ideia'],
  ['scene', 'Cena'],
  ['clue', 'Pista'],
  ['secret', 'Segredo'],
  ['preparation', 'Preparação'],
  ['reference', 'Referência'],
] as const;

export function NoteManager({
  campaign,
  context,
  onBack,
}: {
  campaign: Campaign;
  context?: NarrativeContext;
  onBack: () => void;
}): React.JSX.Element {
  const [items, setItems] = useState<Note[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<NoteDetails | null>(null);
  const [archived, setArchived] = useState(false);
  const [type, setType] = useState('');
  const [knowledge, setKnowledge] = useState('');
  const [canon, setCanon] = useState('');
  const [visibility, setVisibility] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [pending, setPending] = useState<Note | null>(null);
  const load = useCallback(
    async (append = false): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const result = await window.campaignManager.notes.list({
          campaignId: campaign.id,
          ...(append && cursor !== null ? { cursor } : {}),
          filters: {
            archived,
            ...(context === undefined ? {} : { entityId: context.entityId }),
            ...(type === '' ? {} : { noteType: type as Note['noteType'] }),
            ...(knowledge === '' ? {} : { knowledgeState: knowledge as Note['knowledgeState'] }),
            ...(canon === '' ? {} : { canonState: canon as Note['canonState'] }),
            ...(visibility === '' ? {} : { visibility: visibility as Note['visibility'] }),
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
    [archived, campaign.id, canon, context, cursor, knowledge, type, visibility],
  );
  useEffect(() => {
    setItems([]);
    setCursor(null);
    void load(false);
  }, [archived, campaign.id, canon, context?.entityId, knowledge, type, visibility]);
  useEffect(() => {
    void loadAllEntities(campaign.id)
      .then(setEntities)
      .catch(() => setError(unexpectedGatewayError));
  }, [campaign.id]);
  async function beginEdit(item: Note): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.campaignManager.notes.get({
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
  async function submit(input: CreateNoteInput): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    const { links } = input;
    const patch = {
      title: input.title,
      bodyMarkdown: input.bodyMarkdown,
      noteType: input.noteType,
      canonState: input.canonState,
      knowledgeState: input.knowledgeState,
      visibility: input.visibility,
      originKind: input.originKind,
      sourceId: input.sourceId,
    };
    try {
      const result =
        editing === null
          ? await window.campaignManager.notes.create(input)
          : await window.campaignManager.notes.update({
              campaignId: campaign.id,
              id: editing.note.id,
              revision: editing.note.revision,
              patch,
              links,
            });
      if (result.ok) {
        setAnnouncement(editing === null ? 'Nota criada.' : 'Nota atualizada.');
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
  async function lifecycle(item: Note, restore: boolean): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    const input = { campaignId: campaign.id, id: item.id, revision: item.revision };
    try {
      const result = restore
        ? await window.campaignManager.notes.restore(input)
        : await window.campaignManager.notes.archive(input);
      if (result.ok) {
        setAnnouncement(restore ? 'Nota restaurada.' : 'Nota arquivada.');
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
      <NoteForm
        campaign={campaign}
        {...(context === undefined ? {} : { context })}
        entities={entities}
        details={editing}
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
    <section aria-labelledby="notes-title">
      <button className={secondaryClass} onClick={onBack} type="button">
        ← {context === undefined ? 'Voltar para detalhes da campanha' : 'Voltar para entidades'}
      </button>
      <header className="mt-6 flex flex-wrap items-end justify-between gap-5 border-b border-stone-200 pb-6">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-amber-800 uppercase">
            {campaign.name}
          </p>
          <h1 className="mt-2 text-4xl font-semibold" id="notes-title">
            Notas
          </h1>
          <p className="mt-2 text-slate-600">
            {context === undefined
              ? 'Preparação, pistas e referências ligadas ao mundo.'
              : `Contexto: ${context.entityName}`}
          </p>
        </div>
        <button
          className={primaryClass}
          disabled={busy}
          onClick={() => {
            setEditing(null);
            setView('create');
          }}
          type="button"
        >
          Nova nota
        </button>
      </header>
      <div className="mt-5 flex flex-wrap gap-3">
        <Filter label="Tipo" value={type} options={noteTypeOptions} onChange={setType} />
        <Filter
          label="Natureza"
          value={knowledge}
          options={knowledgeOptions}
          onChange={setKnowledge}
        />
        <Filter label="Estado" value={canon} options={canonOptions} onChange={setCanon} />
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
          <p className="font-semibold">Arquivar “{pending.title}”?</p>
          <p className="mt-1 text-sm">O corpo e todos os vínculos serão preservados.</p>
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
              Confirmar arquivamento da nota
            </button>
          </div>
        </div>
      )}
      {loading && items.length === 0 ? (
        <p aria-live="polite" className="mt-8">
          Carregando notas…
        </p>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
          <h2 className="text-xl font-semibold">Nenhuma nota encontrada</h2>
        </div>
      ) : (
        <div className="mt-7 grid gap-4" data-testid="note-list">
          {items.map((item) => (
            <article className="rounded-2xl border border-stone-200 bg-white p-6" key={item.id}>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <Badge>{noteTypeLabel(item.noteType)}</Badge>
                <Badge>{canonLabel(item.canonState)}</Badge>
                <Badge>{knowledgeLabel(item.knowledgeState)}</Badge>
                <Badge>{visibilityLabel(item.visibility)}</Badge>
              </div>
              <h2 className="mt-4 text-xl font-semibold">{item.title}</h2>
              <p className="mt-3 whitespace-pre-wrap text-slate-700">{item.bodyMarkdown}</p>
              <div className="mt-5 flex justify-end gap-3">
                <button
                  className={secondaryClass}
                  disabled={busy}
                  onClick={() => void beginEdit(item)}
                  type="button"
                >
                  Editar {item.title}
                </button>
                {item.archivedAt === null ? (
                  <button
                    className={secondaryClass}
                    disabled={busy}
                    onClick={() => setPending(item)}
                    type="button"
                  >
                    Arquivar {item.title}
                  </button>
                ) : (
                  <button
                    className={secondaryClass}
                    disabled={busy}
                    onClick={() => void lifecycle(item, true)}
                    type="button"
                  >
                    Restaurar {item.title}
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
          {loading ? 'Carregando…' : 'Carregar mais notas'}
        </button>
      )}
    </section>
  );
}

function NoteForm({
  campaign,
  entities,
  details,
  context,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  campaign: Campaign;
  entities: Entity[];
  details: NoteDetails | null;
  context?: NarrativeContext;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (input: CreateNoteInput) => Promise<void>;
}): React.JSX.Element {
  const [title, setTitle] = useState(details?.note.title ?? '');
  const [body, setBody] = useState(details?.note.bodyMarkdown ?? '');
  const [noteType, setNoteType] = useState<Note['noteType']>(details?.note.noteType ?? 'general');
  const [links, setLinks] = useState<NoteEntityLinkInput[]>(() =>
    details === null
      ? context === undefined
        ? []
        : [{ entityId: context.entityId, role: 'related' }]
      : details.links.map(({ entityId, role }) => ({ entityId, role })),
  );
  const [metadata, setMetadata] = useState<NarrativeMetadataValues>({
    canonState: details?.note.canonState ?? 'accepted',
    knowledgeState: details?.note.knowledgeState ?? 'fact',
    visibility: details?.note.visibility ?? 'gm',
    originKind: details?.note.originKind ?? 'manual',
    sourceId: details?.note.sourceId ?? null,
  });
  const [validation, setValidation] = useState<string | null>(null);
  function submit(event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>): void {
    event.preventDefault();
    setValidation(null);
    if (title.trim() === '' || title.trim().length > 200) {
      setValidation('O título deve ter entre 1 e 200 caracteres.');
      return;
    }
    if (body.trim() === '' || body.length > 100000) {
      setValidation('O corpo deve ter entre 1 e 100000 caracteres.');
      return;
    }
    if (
      links.some(
        (link) =>
          link.entityId === '' || link.role.trim().length < 1 || link.role.trim().length > 100,
      )
    ) {
      setValidation('Cada vínculo exige entidade e papel entre 1 e 100 caracteres.');
      return;
    }
    const keys = new Set(links.map((link) => `${link.entityId}\u0000${link.role.trim()}`));
    if (keys.size !== links.length) {
      setValidation('Remova vínculos duplicados.');
      return;
    }
    void onSubmit({
      campaignId: campaign.id,
      title: title.trim(),
      bodyMarkdown: body,
      noteType,
      links: links.map((link) => ({ ...link, role: link.role.trim() })),
      ...metadata,
    });
  }
  function updateLink(index: number, patch: Partial<NoteEntityLinkInput>): void {
    setLinks((current) =>
      current.map((link, position) => (position === index ? { ...link, ...patch } : link)),
    );
  }
  return (
    <section className="mx-auto max-w-4xl">
      <button className={secondaryClass} disabled={busy} onClick={onCancel} type="button">
        ← Voltar para notas
      </button>
      <div className="mt-6 rounded-3xl border border-stone-200 bg-white p-8">
        <h1 className="text-3xl font-semibold">
          {details === null ? 'Nova nota' : `Editar ${details.note.title}`}
        </h1>
        <form className="mt-7 space-y-6" noValidate onSubmit={submit}>
          <label className="block font-semibold">
            Título *
            <input
              autoFocus
              className={inputClass}
              disabled={busy}
              maxLength={200}
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="block font-semibold">
            Corpo em Markdown *
            <textarea
              className={`${inputClass} min-h-56 whitespace-pre-wrap`}
              disabled={busy}
              maxLength={100000}
              required
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </label>
          <label className="block font-semibold">
            Tipo da nota
            <select
              className={inputClass}
              disabled={busy}
              value={noteType}
              onChange={(event) => setNoteType(event.target.value as Note['noteType'])}
            >
              {noteTypeOptions.map(([key, text]) => (
                <option key={key} value={key}>
                  {text}
                </option>
              ))}
            </select>
          </label>
          <NarrativeMetadataFields disabled={busy} values={metadata} onChange={setMetadata} />
          <fieldset className="rounded-2xl border border-stone-200 p-5">
            <legend className="px-2 font-semibold">Vínculos com entidades</legend>
            <div className="mt-3 grid gap-4">
              {links.map((link, index) => (
                <div
                  className="grid gap-3 rounded-xl bg-stone-50 p-4 md:grid-cols-[1fr_1fr_auto]"
                  key={`${String(index)}:${link.entityId}`}
                >
                  <label className="text-sm font-semibold">
                    Entidade
                    <select
                      className={inputClass}
                      disabled={busy || link.entityId === context?.entityId}
                      required
                      value={link.entityId}
                      onChange={(event) => updateLink(index, { entityId: event.target.value })}
                    >
                      <option value="">Selecione…</option>
                      {entities.map((entity) => (
                        <option key={entity.id} value={entity.id}>
                          {entity.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-semibold">
                    Papel
                    <input
                      className={inputClass}
                      disabled={busy}
                      maxLength={100}
                      required
                      value={link.role}
                      onChange={(event) => updateLink(index, { role: event.target.value })}
                    />
                  </label>
                  <button
                    className={secondaryClass}
                    disabled={busy || link.entityId === context?.entityId}
                    onClick={() =>
                      setLinks((current) => current.filter((_, position) => position !== index))
                    }
                    type="button"
                  >
                    Remover vínculo
                  </button>
                </div>
              ))}
            </div>
            <button
              className={`${secondaryClass} mt-4`}
              disabled={busy || entities.length === 0}
              onClick={() => setLinks((current) => [...current, { entityId: '', role: 'related' }])}
              type="button"
            >
              Adicionar vínculo
            </button>
          </fieldset>
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
              {busy ? 'Salvando…' : details === null ? 'Criar nota' : 'Salvar nota'}
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
function noteTypeLabel(value: Note['noteType']): string {
  return noteTypeOptions.find(([key]) => key === value)?.[1] ?? value;
}
function Badge({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span className="rounded-full bg-stone-100 px-3 py-1">{children}</span>;
}
const unexpectedGatewayError =
  'Não foi possível concluir a operação. Revise os dados e tente novamente.';
