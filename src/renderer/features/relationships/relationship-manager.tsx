import { useCallback, useEffect, useState } from 'react';
import type { Campaign } from '../../../core/contracts/campaigns';
import type { Entity } from '../../../core/contracts/entities';
import type { RelationshipType } from '../../../core/contracts/relationship-types';
import type { Relationship } from '../../../core/contracts/relationships';
import { RelationshipNeighborhood } from './relationship-neighborhood';

interface FormState {
  relationshipTypeId: string;
  sourceEntityId: string;
  targetEntityId: string;
  description: string;
  strength: string;
}
const emptyForm: FormState = {
  relationshipTypeId: '',
  sourceEntityId: '',
  targetEntityId: '',
  description: '',
  strength: '',
};

export function RelationshipManager({
  campaign,
  onBack,
}: {
  campaign: Campaign;
  onBack: () => void;
}): React.JSX.Element {
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [types, setTypes] = useState<RelationshipType[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<Relationship | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [relations, typeResult, entityResult] = await Promise.all([
      window.campaignManager.relationships.list({
        campaignId: campaign.id,
        limit: 100,
        filters: { archived: showArchived },
      }),
      window.campaignManager.relationshipTypes.list({
        campaignId: campaign.id,
        limit: 100,
        filters: { isArchived: false },
      }),
      window.campaignManager.entities.list({
        campaignId: campaign.id,
        limit: 100,
        filters: { archived: false },
      }),
    ]);
    if (!relations.ok) setError(relations.error.message);
    else setRelationships(relations.data.items);
    if (typeResult.ok) setTypes(typeResult.data.items);
    if (entityResult.ok) setEntities(entityResult.data.items);
  }, [campaign.id, showArchived]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setAnnouncement(null);
    const values = {
      relationshipTypeId: form.relationshipTypeId,
      sourceEntityId: form.sourceEntityId,
      targetEntityId: form.targetEntityId,
      description: form.description.trim() || null,
      strength: form.strength === '' ? null : Number(form.strength),
    };
    const result =
      editing === null
        ? await window.campaignManager.relationships.create({ campaignId: campaign.id, ...values })
        : await window.campaignManager.relationships.update({
            campaignId: campaign.id,
            id: editing.id,
            revision: editing.revision,
            patch: values,
          });
    if (!result.ok) setError(result.error.message);
    else {
      setAnnouncement(
        result.data.warnings[0]?.message ??
          (editing === null ? 'Relação criada.' : 'Relação atualizada.'),
      );
      setEditing(null);
      setForm(emptyForm);
      await load();
    }
    setBusy(false);
  }
  async function lifecycle(item: Relationship): Promise<void> {
    setBusy(true);
    setError(null);
    const input = { campaignId: campaign.id, id: item.id, revision: item.revision };
    const result =
      item.archivedAt === null
        ? await window.campaignManager.relationships.archive(input)
        : await window.campaignManager.relationships.restore(input);
    if (!result.ok) setError(result.error.message);
    else await load();
    setBusy(false);
  }
  function beginEdit(item: Relationship): void {
    setEditing(item);
    setForm({
      relationshipTypeId: item.relationshipTypeId,
      sourceEntityId: item.sourceEntityId,
      targetEntityId: item.targetEntityId,
      description: item.description ?? '',
      strength: item.strength === null ? '' : String(item.strength),
    });
  }
  const entityName = (id: string) =>
    entities.find((item) => item.id === id)?.name ?? 'Entidade arquivada';
  const typeName = (id: string) => types.find((item) => item.id === id)?.name ?? 'Tipo arquivado';
  const relationshipLabel = (item: Relationship): string => {
    const type = types.find((candidate) => candidate.id === item.relationshipTypeId);
    const connector =
      type?.isSymmetric === true ? `— ${type.name} —` : `— ${typeName(item.relationshipTypeId)} →`;
    return `${entityName(item.sourceEntityId)} ${connector} ${entityName(item.targetEntityId)}`;
  };
  return (
    <section aria-labelledby="relationships-title">
      <button className={backClass} onClick={onBack} type="button">
        ← Voltar para detalhes da campanha
      </button>
      <header className="border-b border-stone-200 pb-7">
        <p className="text-xs font-bold tracking-[0.18em] text-amber-800 uppercase">
          {campaign.name}
        </p>
        <h1 className="mt-2 text-4xl font-semibold" id="relationships-title">
          Relações
        </h1>
        <p className="mt-3 text-slate-600">
          Conecte os elementos do mundo usando os tipos de relação da campanha.
        </p>
      </header>
      <RelationshipNeighborhood campaign={campaign} entities={entities} types={types} />
      {!showArchived && types.length > 0 && entities.length > 0 ? (
        <form
          className="mt-6 grid gap-4 rounded-2xl border border-stone-200 bg-white p-6 md:grid-cols-2"
          onSubmit={(event) => void save(event)}
        >
          <h2 className="text-xl font-semibold md:col-span-2">
            {editing === null ? 'Nova relação' : 'Editar relação'}
          </h2>
          <Select
            label="Tipo"
            value={form.relationshipTypeId}
            options={types.map((item) => ({ id: item.id, label: item.name }))}
            onChange={(value) => setForm({ ...form, relationshipTypeId: value })}
          />
          <span />
          <Select
            label="Origem"
            value={form.sourceEntityId}
            options={entities.map((item) => ({ id: item.id, label: item.name }))}
            onChange={(value) => setForm({ ...form, sourceEntityId: value })}
          />
          <Select
            label="Destino"
            value={form.targetEntityId}
            options={entities.map((item) => ({ id: item.id, label: item.name }))}
            onChange={(value) => setForm({ ...form, targetEntityId: value })}
          />
          <label className={labelClass}>
            Descrição
            <input
              className={inputClass}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </label>
          <label className={labelClass}>
            Intensidade
            <input
              className={inputClass}
              type="number"
              step="any"
              value={form.strength}
              onChange={(event) => setForm({ ...form, strength: event.target.value })}
            />
          </label>
          <div className="flex justify-end gap-3 md:col-span-2">
            {editing === null ? null : (
              <button
                className={secondaryClass}
                type="button"
                onClick={() => {
                  setEditing(null);
                  setForm(emptyForm);
                }}
              >
                Cancelar
              </button>
            )}
            <button className={primaryClass} disabled={busy} type="submit">
              Salvar relação
            </button>
          </div>
        </form>
      ) : null}
      <div className="mt-6 flex gap-2">
        <Filter active={!showArchived} onClick={() => setShowArchived(false)}>
          Ativas
        </Filter>
        <Filter active={showArchived} onClick={() => setShowArchived(true)}>
          Arquivadas
        </Filter>
      </div>
      {announcement === null ? null : (
        <p
          className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
          role="status"
        >
          {announcement}
        </p>
      )}
      {error === null ? null : (
        <p
          className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      )}
      <div className="mt-6 grid gap-4" data-testid="relationship-list">
        {relationships.map((item) => (
          <article className="rounded-2xl border border-stone-200 bg-white p-6" key={item.id}>
            <h2 className="text-lg font-semibold">{relationshipLabel(item)}</h2>
            {item.description === null ? null : (
              <p className="mt-2 text-slate-600">{item.description}</p>
            )}
            <div className="mt-4 flex justify-end gap-3">
              {item.archivedAt === null ? (
                <button className={secondaryClass} onClick={() => beginEdit(item)} type="button">
                  Editar
                </button>
              ) : null}
              <button
                className={secondaryClass}
                disabled={busy}
                onClick={() => void lifecycle(item)}
                type="button"
              >
                {item.archivedAt === null ? 'Arquivar' : 'Restaurar'}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <label className={labelClass}>
      {label} *
      <select
        className={inputClass}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Selecione…</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
function Filter({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      aria-pressed={active}
      className={`rounded-full px-4 py-2 text-sm font-semibold ${active ? 'bg-slate-900 text-white' : 'border border-stone-300 bg-white text-slate-600'}`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
const labelClass = 'block text-sm font-semibold text-slate-800';
const inputClass = 'mt-2 w-full rounded-xl border border-stone-300 px-4 py-2.5';
const primaryClass =
  'rounded-xl bg-amber-700 px-5 py-3 font-semibold text-white disabled:opacity-60';
const secondaryClass =
  'rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700';
const backClass = 'mb-6 rounded-lg px-2 py-1 text-sm font-semibold text-slate-600';
