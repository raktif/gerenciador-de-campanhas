import { useState } from 'react';
import type {
  Campaign,
  CampaignPatch,
  CreateCampaignInput,
} from '../../../core/contracts/campaigns';
import { Button, ButtonGroup, FormActions } from '../../components/actions';

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
      <Button className="mb-6" disabled={busy} onClick={onCancel} size="small" variant="ghost">
        <span aria-hidden="true">←</span>
        Voltar para campanhas
      </Button>

      <div className="overflow-hidden rounded-3xl border semantic-border semantic-surface semantic-domain-card">
        <header className="border-b semantic-border semantic-surface-muted px-8 py-7 sm:px-10">
          <p className="text-xs font-bold tracking-[0.2em] semantic-accent-text uppercase">
            {editing ? 'Detalhes da campanha' : 'Nova campanha'}
          </p>
          <h1 id="campaign-form-title" className="mt-2 text-3xl font-semibold tracking-tight">
            {editing ? campaign?.name : 'Comece pelo essencial'}
          </h1>
          <p className="mt-3 max-w-2xl leading-7 semantic-text-secondary">
            {editing
              ? 'Revise e atualize as informações centrais deste mundo.'
              : 'Apenas o nome é obrigatório. Você poderá ampliar e reorganizar tudo depois.'}
          </p>
          {campaign === null ? null : (
            <p className="mt-4 text-sm font-semibold semantic-text-secondary">
              Status: {campaignStatusLabel(campaign.status)}
            </p>
          )}
        </header>

        <form className="space-y-8 px-8 py-8 sm:px-10" onSubmit={submit}>
          <div>
            <label
              className="block text-sm font-semibold semantic-text-primary"
              htmlFor="campaign-name"
            >
              Nome da campanha <span className="semantic-accent-text">*</span>
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
              className="block text-sm font-semibold semantic-text-primary"
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
              className="block text-sm font-semibold semantic-text-primary"
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
              className="rounded-xl border semantic-danger-border semantic-danger-surface px-4 py-3 text-sm semantic-error-text"
              role="alert"
            >
              {error ?? validationError}
            </p>
          )}

          {props.mode === 'edit' && pendingAction !== null ? (
            <div
              aria-labelledby="lifecycle-confirmation-title"
              className="rounded-2xl border semantic-warning-border semantic-warning-surface p-5"
              role="alert"
            >
              <h2 id="lifecycle-confirmation-title" className="font-semibold semantic-text-primary">
                {confirmationTitle(pendingAction)}
              </h2>
              <p className="mt-2 text-sm leading-6 semantic-text-secondary">
                {confirmationDescription(pendingAction)}
              </p>
              <ButtonGroup
                align="end"
                aria-label="Ações de confirmação da campanha"
                className="mt-4"
              >
                <Button disabled={busy} onClick={() => setPendingAction(null)}>
                  Cancelar ação
                </Button>
                <Button
                  busy={busy}
                  onClick={() => void props.onLifecycle(pendingAction)}
                  variant={pendingAction === 'moveToTrash' ? 'danger' : 'primary'}
                >
                  {confirmationButtonLabel(pendingAction)}
                </Button>
              </ButtonGroup>
            </div>
          ) : null}

          <FormActions layout="between">
            {props.mode === 'edit' ? (
              <LifecycleButtons busy={busy} campaign={props.campaign} onSelect={setPendingAction} />
            ) : (
              <span />
            )}
            <ButtonGroup align="end" aria-label="Ações principais da campanha">
              <Button disabled={busy} onClick={onCancel}>
                Cancelar
              </Button>
              <Button busy={busy} type="submit" variant="primary">
                {busy
                  ? editing
                    ? 'Salvando alterações…'
                    : 'Criando campanha…'
                  : editing
                    ? 'Salvar alterações'
                    : 'Criar campanha'}
              </Button>
            </ButtonGroup>
          </FormActions>
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
    <ButtonGroup aria-label="Ações de ciclo de vida da campanha">
      {campaign.status === 'active' ? (
        <Button disabled={busy} onClick={() => onSelect('archive')}>
          Arquivar
        </Button>
      ) : (
        <Button disabled={busy} onClick={() => onSelect('restore')}>
          Restaurar
        </Button>
      )}
      {campaign.status === 'deleted' ? null : (
        <Button disabled={busy} onClick={() => onSelect('moveToTrash')} variant="danger">
          Mover para lixeira
        </Button>
      )}
    </ButtonGroup>
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
      <label className="block text-sm font-semibold semantic-text-primary" htmlFor={id}>
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
  'mt-2 w-full rounded-xl border semantic-border semantic-surface px-4 py-3 semantic-text-primary shadow-sm outline-none semantic-placeholder semantic-focus-border focus:ring-3 semantic-focus-ring semantic-disabled-surface semantic-disabled-text';
