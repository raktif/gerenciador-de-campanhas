import { useState } from 'react';
import type {
  Campaign,
  CampaignPatch,
  CreateCampaignInput,
} from '../../../core/contracts/campaigns';

interface CommonCampaignFormProps {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
}

type LifecycleAction = 'archive' | 'restore' | 'moveToTrash';

type CampaignFormProps = CommonCampaignFormProps &
  (
    | {
        mode: 'create';
        onSubmit: (input: CreateCampaignInput) => Promise<void>;
      }
    | {
        mode: 'edit';
        campaign: Campaign;
        onLifecycle: (action: LifecycleAction) => Promise<void>;
        onManageEntityTypes: () => void;
        onManageEntities: () => void;
        onManageRelationshipTypes: () => void;
        onManageRelationships: () => void;
        onManageAssertions: () => void;
        onManageNotes: () => void;
        onSubmit: (patch: CampaignPatch) => Promise<void>;
      }
  );

interface FormValues {
  name: string;
  systemName: string;
  concept: string;
  genre: string;
  tone: string;
  summary: string;
  imagePath: string;
}

const emptyValues: FormValues = {
  name: '',
  systemName: '',
  concept: '',
  genre: '',
  tone: '',
  summary: '',
  imagePath: '',
};

export function CampaignForm(props: CampaignFormProps): React.JSX.Element {
  const { busy, error, onCancel } = props;
  const campaign = props.mode === 'edit' ? props.campaign : null;
  const [values, setValues] = useState<FormValues>(() =>
    campaign === null ? emptyValues : toFormValues(campaign),
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<LifecycleAction | null>(null);

  function update(field: keyof FormValues, value: string): void {
    setValidationError(null);
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>): void {
    event.preventDefault();
    if (props.mode === 'create') {
      void props.onSubmit(toCreateCampaignInput(values));
      return;
    }

    const patch = toCampaignPatch(values, props.campaign);
    if (patch === null) {
      setValidationError('Altere ao menos um campo antes de salvar.');
      return;
    }
    void props.onSubmit(patch);
  }

  const editing = props.mode === 'edit';

  return (
    <section aria-labelledby="campaign-form-title" className="mx-auto w-full max-w-4xl">
      <button
        className="mb-6 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold text-slate-600 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
        disabled={busy}
        onClick={onCancel}
        type="button"
      >
        <span aria-hidden="true">←</span>
        Voltar para campanhas
      </button>

      <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-[0_20px_60px_-35px_rgba(15,23,42,0.35)]">
        <header className="border-b border-stone-200 bg-stone-50 px-8 py-7 sm:px-10">
          <p className="text-xs font-bold tracking-[0.2em] text-amber-800 uppercase">
            {editing ? 'Detalhes da campanha' : 'Nova campanha'}
          </p>
          <h1 id="campaign-form-title" className="mt-2 text-3xl font-semibold tracking-tight">
            {editing ? campaign?.name : 'Comece pelo essencial'}
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-slate-600">
            {editing
              ? 'Revise e atualize as informações centrais deste mundo.'
              : 'Apenas o nome é obrigatório. Você poderá ampliar e reorganizar tudo depois.'}
          </p>
          {campaign === null ? null : (
            <p className="mt-4 text-sm font-semibold text-slate-500">
              Status: {campaignStatusLabel(campaign.status)}
            </p>
          )}
        </header>

        <form className="space-y-8 px-8 py-8 sm:px-10" onSubmit={submit}>
          {props.mode === 'edit' && props.campaign.status === 'active' ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
              <div>
                <h2 className="font-semibold text-slate-950">Estrutura da campanha</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Configure as categorias usadas para pessoas, locais, facções e outros elementos.
                </p>
              </div>
              <div className="mt-4 flex shrink-0 gap-3 sm:mt-0">
                <button
                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
                  disabled={busy}
                  onClick={props.onManageAssertions}
                  type="button"
                >
                  Afirmações
                </button>
                <button
                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
                  disabled={busy}
                  onClick={props.onManageNotes}
                  type="button"
                >
                  Notas
                </button>
                <button
                  className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
                  onClick={props.onManageRelationships}
                  type="button"
                >
                  Relações
                </button>
                <button
                  className="rounded-xl border border-slate-900 px-5 py-3 font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
                  disabled={busy}
                  onClick={props.onManageEntities}
                  type="button"
                >
                  Ver entidades
                </button>
                <button
                  className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
                  disabled={busy}
                  onClick={props.onManageEntityTypes}
                  type="button"
                >
                  Gerenciar tipos de entidade
                </button>
                <button
                  className="rounded-xl bg-amber-700 px-5 py-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
                  disabled={busy}
                  onClick={props.onManageRelationshipTypes}
                  type="button"
                >
                  Tipos de relação
                </button>
              </div>
            </div>
          ) : null}

          <div>
            <label className="block text-sm font-semibold text-slate-800" htmlFor="campaign-name">
              Nome da campanha <span className="text-amber-800">*</span>
            </label>
            <input
              autoFocus
              className={inputClassName}
              disabled={busy}
              id="campaign-name"
              name="name"
              onChange={(event) => update('name', event.target.value)}
              placeholder="Ex.: As Crônicas de Ethéria"
              required
              value={values.name}
            />
          </div>

          <fieldset className="grid gap-6 md:grid-cols-2">
            <legend className="sr-only">Detalhes opcionais</legend>
            <TextField
              disabled={busy}
              id="campaign-system"
              label="Sistema"
              onChange={(value) => update('systemName', value)}
              placeholder="Ex.: sistema próprio"
              value={values.systemName}
            />
            <TextField
              disabled={busy}
              id="campaign-genre"
              label="Gênero"
              onChange={(value) => update('genre', value)}
              placeholder="Ex.: fantasia política"
              value={values.genre}
            />
            <TextField
              disabled={busy}
              id="campaign-tone"
              label="Tom"
              onChange={(value) => update('tone', value)}
              placeholder="Ex.: esperançoso e misterioso"
              value={values.tone}
            />
            <TextField
              disabled={busy}
              id="campaign-image"
              label="Referência da imagem"
              onChange={(value) => update('imagePath', value)}
              placeholder="Caminho local ou referência"
              value={values.imagePath}
            />
          </fieldset>

          <div>
            <label
              className="block text-sm font-semibold text-slate-800"
              htmlFor="campaign-concept"
            >
              Conceito
            </label>
            <textarea
              className={`${inputClassName} min-h-24 resize-y`}
              disabled={busy}
              id="campaign-concept"
              onChange={(event) => update('concept', event.target.value)}
              placeholder="Qual é a ideia central desta campanha?"
              value={values.concept}
            />
          </div>

          <div>
            <label
              className="block text-sm font-semibold text-slate-800"
              htmlFor="campaign-summary"
            >
              Resumo
            </label>
            <textarea
              className={`${inputClassName} min-h-32 resize-y`}
              disabled={busy}
              id="campaign-summary"
              onChange={(event) => update('summary', event.target.value)}
              placeholder="Registre o ponto de partida, personagens ou conflitos que já conhece."
              value={values.summary}
            />
          </div>

          {error === null && validationError === null ? null : (
            <p
              aria-live="assertive"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              role="alert"
            >
              {error ?? validationError}
            </p>
          )}

          {props.mode === 'edit' && pendingAction !== null ? (
            <div
              aria-labelledby="lifecycle-confirmation-title"
              className="rounded-2xl border border-amber-300 bg-amber-50 p-5"
              role="alert"
            >
              <h2 id="lifecycle-confirmation-title" className="font-semibold text-slate-950">
                {confirmationTitle(pendingAction)}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {confirmationDescription(pendingAction)}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                  disabled={busy}
                  onClick={() => setPendingAction(null)}
                  type="button"
                >
                  Cancelar ação
                </button>
                <button
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={busy}
                  onClick={() => void props.onLifecycle(pendingAction)}
                  type="button"
                >
                  {confirmationButtonLabel(pendingAction)}
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-stone-200 pt-7">
            {props.mode === 'edit' ? (
              <LifecycleButtons busy={busy} campaign={props.campaign} onSelect={setPendingAction} />
            ) : (
              <span />
            )}
            <div className="flex flex-wrap justify-end gap-3">
              <button
                className="rounded-xl border border-stone-300 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:opacity-60"
                disabled={busy}
                onClick={onCancel}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="rounded-xl bg-amber-700 px-6 py-3 font-semibold text-white shadow-sm hover:bg-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:cursor-wait disabled:opacity-60"
                disabled={busy}
                type="submit"
              >
                {busy
                  ? editing
                    ? 'Salvando alterações…'
                    : 'Criando campanha…'
                  : editing
                    ? 'Salvar alterações'
                    : 'Criar campanha'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}

function LifecycleButtons({
  busy,
  campaign,
  onSelect,
}: {
  busy: boolean;
  campaign: Campaign;
  onSelect: (action: LifecycleAction) => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-3">
      {campaign.status === 'active' ? (
        <button
          className={secondaryActionClassName}
          disabled={busy}
          onClick={() => onSelect('archive')}
          type="button"
        >
          Arquivar
        </button>
      ) : (
        <button
          className={secondaryActionClassName}
          disabled={busy}
          onClick={() => onSelect('restore')}
          type="button"
        >
          Restaurar
        </button>
      )}
      {campaign.status === 'deleted' ? null : (
        <button
          className="rounded-xl border border-red-300 bg-white px-5 py-3 font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-60"
          disabled={busy}
          onClick={() => onSelect('moveToTrash')}
          type="button"
        >
          Mover para lixeira
        </button>
      )}
    </div>
  );
}

function campaignStatusLabel(status: Campaign['status']): string {
  if (status === 'active') return 'Ativa';
  if (status === 'archived') return 'Arquivada';
  return 'Na lixeira';
}

function confirmationTitle(action: LifecycleAction): string {
  if (action === 'archive') return 'Arquivar esta campanha?';
  if (action === 'restore') return 'Restaurar esta campanha?';
  return 'Mover esta campanha para a lixeira?';
}

function confirmationDescription(action: LifecycleAction): string {
  if (action === 'archive') return 'A campanha continuará preservada e poderá ser restaurada.';
  if (action === 'restore') return 'A campanha voltará para a lista de campanhas ativas.';
  return 'Nenhum dado será apagado; a campanha poderá ser restaurada pela lixeira.';
}

function confirmationButtonLabel(action: LifecycleAction): string {
  if (action === 'archive') return 'Confirmar arquivamento';
  if (action === 'restore') return 'Confirmar restauração';
  return 'Confirmar envio à lixeira';
}

function TextField({
  disabled,
  id,
  label,
  onChange,
  placeholder,
  value,
}: {
  disabled: boolean;
  id: string;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}): React.JSX.Element {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-800" htmlFor={id}>
        {label}
      </label>
      <input
        className={inputClassName}
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </div>
  );
}

export function toCreateCampaignInput(values: FormValues): CreateCampaignInput {
  return {
    name: values.name.trim(),
    ...optionalValue('systemName', values.systemName),
    ...optionalValue('concept', values.concept),
    ...optionalValue('genre', values.genre),
    ...optionalValue('tone', values.tone),
    ...optionalValue('summary', values.summary),
    ...optionalValue('imagePath', values.imagePath),
  };
}

export function toCampaignPatch(values: FormValues, campaign: Campaign): CampaignPatch | null {
  const patch: CampaignPatch = {};
  const name = values.name.trim();
  if (name !== campaign.name) patch.name = name;

  assignNullableChange(patch, 'systemName', values.systemName, campaign.systemName);
  assignNullableChange(patch, 'concept', values.concept, campaign.concept);
  assignNullableChange(patch, 'genre', values.genre, campaign.genre);
  assignNullableChange(patch, 'tone', values.tone, campaign.tone);
  assignNullableChange(patch, 'summary', values.summary, campaign.summary);
  assignNullableChange(patch, 'imagePath', values.imagePath, campaign.imagePath);

  return Object.keys(patch).length === 0 ? null : patch;
}

function toFormValues(campaign: Campaign): FormValues {
  return {
    name: campaign.name,
    systemName: campaign.systemName ?? '',
    concept: campaign.concept ?? '',
    genre: campaign.genre ?? '',
    tone: campaign.tone ?? '',
    summary: campaign.summary ?? '',
    imagePath: campaign.imagePath ?? '',
  };
}

function assignNullableChange(
  patch: CampaignPatch,
  field: Exclude<keyof CampaignPatch, 'name'>,
  value: string,
  currentValue: string | null,
): void {
  const trimmed = value.trim();
  const normalized = trimmed === '' ? null : trimmed;
  if (normalized !== currentValue) patch[field] = normalized;
}

function optionalValue<Field extends Exclude<keyof CreateCampaignInput, 'name'>>(
  field: Field,
  value: string,
): Partial<Pick<CreateCampaignInput, Field>> {
  const trimmed = value.trim();
  return trimmed === '' ? {} : ({ [field]: trimmed } as Pick<CreateCampaignInput, Field>);
}

const inputClassName =
  'mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-slate-950 shadow-sm outline-none placeholder:text-slate-400 focus:border-amber-700 focus:ring-3 focus:ring-amber-700/15 disabled:bg-stone-100 disabled:text-slate-500';

const secondaryActionClassName =
  'rounded-xl border border-stone-300 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:opacity-60';
