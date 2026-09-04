import type { NarrativeMetadata } from '../../../core/contracts/narrative';

export interface NarrativeMetadataValues extends Omit<NarrativeMetadata, 'sourceId'> {
  sourceId: string | null;
}

export function NarrativeMetadataFields({
  values,
  disabled,
  onChange,
}: {
  values: NarrativeMetadataValues;
  disabled: boolean;
  onChange: (values: NarrativeMetadataValues) => void;
}): React.JSX.Element {
  return (
    <fieldset className="grid gap-4 rounded-2xl border border-stone-200 p-5 md:grid-cols-2">
      <legend className="px-2 font-semibold">Metadados narrativos</legend>
      <Select
        label="Estado canônico"
        value={values.canonState}
        disabled={disabled}
        onChange={(value) =>
          onChange({ ...values, canonState: value as NarrativeMetadata['canonState'] })
        }
        options={canonOptions}
      />
      <Select
        label="Natureza do conhecimento"
        value={values.knowledgeState}
        disabled={disabled}
        onChange={(value) =>
          onChange({ ...values, knowledgeState: value as NarrativeMetadata['knowledgeState'] })
        }
        options={knowledgeOptions}
      />
      <Select
        label="Visibilidade"
        value={values.visibility}
        disabled={disabled}
        onChange={(value) =>
          onChange({ ...values, visibility: value as NarrativeMetadata['visibility'] })
        }
        options={visibilityOptions}
      />
      <Select
        label="Origem"
        value={values.originKind}
        disabled={disabled}
        onChange={(value) =>
          onChange({
            ...values,
            originKind: value as NarrativeMetadata['originKind'],
            sourceId: value === 'manual' ? null : values.sourceId,
          })
        }
        options={originOptions}
      />
      {values.originKind === 'manual' ? null : (
        <label className={labelClass}>
          Identificador da fonte *
          <input
            className={inputClass}
            disabled={disabled}
            maxLength={36}
            onChange={(event) =>
              onChange({
                ...values,
                sourceId: event.target.value.trim() === '' ? null : event.target.value.trim(),
              })
            }
            placeholder="UUID da fonte"
            pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}"
            required
            value={values.sourceId ?? ''}
          />
        </label>
      )}
    </fieldset>
  );
}

function Select({
  label,
  value,
  disabled,
  onChange,
  options,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
}): React.JSX.Element {
  return (
    <label className={labelClass}>
      {label}
      <select
        className={inputClass}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

export const canonOptions = [
  ['draft', 'Rascunho'],
  ['accepted', 'Aceito'],
  ['rejected', 'Rejeitado'],
  ['archived', 'Arquivado'],
] as const;
export const knowledgeOptions = [
  ['fact', 'Fato'],
  ['rumor', 'Rumor'],
  ['suspicion', 'Suspeita'],
  ['secret', 'Segredo'],
  ['possibility', 'Possibilidade (não confirmada)'],
  ['disproved', 'Refutado'],
] as const;
export const visibilityOptions = [
  ['gm', 'Somente mestre'],
  ['players', 'Jogadores'],
  ['public', 'Público'],
] as const;
export const originOptions = [
  ['manual', 'Manual'],
  ['session', 'Sessão'],
  ['import', 'Importação'],
  ['document', 'Documento'],
  ['ruleset', 'Regras'],
  ['ai', 'IA'],
  ['generator', 'Gerador'],
] as const;
export const inputClass =
  'mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:bg-stone-100';
export const labelClass = 'block text-sm font-semibold text-slate-800';
export const primaryClass =
  'rounded-xl bg-amber-700 px-5 py-2.5 font-semibold text-white hover:bg-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:cursor-wait disabled:opacity-60';
export const secondaryClass =
  'rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:opacity-60';

export function knowledgeLabel(value: NarrativeMetadata['knowledgeState']): string {
  return knowledgeOptions.find(([key]) => key === value)?.[1] ?? value;
}
export function canonLabel(value: NarrativeMetadata['canonState']): string {
  return canonOptions.find(([key]) => key === value)?.[1] ?? value;
}
export function visibilityLabel(value: NarrativeMetadata['visibility']): string {
  return visibilityOptions.find(([key]) => key === value)?.[1] ?? value;
}
