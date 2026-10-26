import { useEffect, useId, useRef, type Ref } from 'react';
import type { NarrativeMetadata } from '../../../core/contracts/narrative';
import type { UserFacingError } from '../../../core/errors/user-facing-error';
import { UserFacingErrorNotice } from '../../components/user-facing-error-notice';
import { Button } from '../../components/actions';
import { ContextualHelp } from '../../components/contextual-help';
import { contextualHelpCatalog, type ContextualHelpKey } from '../../content/contextual-help';

export interface NarrativeMetadataValues extends Omit<NarrativeMetadata, 'sourceId'> {
  sourceId: string | null;
}

export interface SessionSourceOption {
  id: string;
  label: string;
}

type SessionSourceError = UserFacingError | string;

export function NarrativeMetadataFields({
  values,
  disabled,
  onChange,
  sessionSource,
  hideSourceIdentifier = false,
}: {
  values: NarrativeMetadataValues;
  disabled: boolean;
  onChange: (values: NarrativeMetadataValues) => void;
  sessionSource?: {
    options: readonly SessionSourceOption[];
    value: string;
    onChange: (sessionId: string) => void;
    error?: SessionSourceError | undefined;
    loading?: boolean | undefined;
    available?: boolean | undefined;
    retry?: (() => void) | undefined;
  };
  hideSourceIdentifier?: boolean;
}): React.JSX.Element {
  const originSelectRef = useRef<HTMLSelectElement>(null);
  const sessionSelectRef = useRef<HTMLSelectElement>(null);
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const retryFocusPhaseRef = useRef<SessionRetryFocusPhase>('idle');

  useEffect(() => {
    const next = advanceSessionRetryFocus({
      available: sessionSource?.available,
      error: sessionSource?.error,
      loading: sessionSource?.loading,
      phase: retryFocusPhaseRef.current,
    });
    retryFocusPhaseRef.current = next.phase;
    if (next.target === undefined) return;

    if (next.target === 'session') {
      sessionSelectRef.current?.focus();
    } else if (next.target === 'retry') {
      retryButtonRef.current?.focus();
    } else {
      originSelectRef.current?.focus();
    }
  }, [sessionSource?.available, sessionSource?.error, sessionSource?.loading]);

  const retrySessions = (): void => {
    retryFocusPhaseRef.current = 'awaiting-loading';
    originSelectRef.current?.focus();
    sessionSource?.retry?.();
  };

  return (
    <fieldset className="grid gap-4 rounded-2xl border semantic-border p-5 md:grid-cols-2">
      <legend className="px-2 font-semibold">Metadados narrativos</legend>
      <Select
        helpKey="narrative.canonState"
        label="Estado canônico"
        value={values.canonState}
        disabled={disabled}
        onChange={(value) =>
          onChange({ ...values, canonState: value as NarrativeMetadata['canonState'] })
        }
        options={canonOptions}
      />
      <Select
        helpKey="narrative.knowledgeState"
        label="Natureza do conhecimento"
        value={values.knowledgeState}
        disabled={disabled}
        onChange={(value) =>
          onChange({ ...values, knowledgeState: value as NarrativeMetadata['knowledgeState'] })
        }
        options={knowledgeOptions}
      />
      <Select
        helpKey="narrative.visibility"
        label="Visibilidade"
        value={values.visibility}
        disabled={disabled}
        onChange={(value) =>
          onChange({ ...values, visibility: value as NarrativeMetadata['visibility'] })
        }
        options={visibilityOptions}
      />
      <Select
        helpKey="narrative.originKind"
        id="narrative-origin-kind"
        label="Origem"
        selectRef={originSelectRef}
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
      {values.originKind === 'session' && sessionSource !== undefined ? (
        <div className={labelClass}>
          <div className="flex items-center gap-1">
            <label htmlFor="narrative-source-session">Sessão de origem *</label>
            <ContextualHelp
              content={contextualHelpCatalog['narrative.sourceSession']}
              label="Sessão de origem"
            />
          </div>
          <select
            aria-describedby={sessionSourceDescription(sessionSource)}
            aria-invalid={sessionSource.error === undefined ? undefined : true}
            className={inputClass}
            disabled={
              disabled || (sessionSource.loading ?? false) || sessionSource.available === false
            }
            id="narrative-source-session"
            ref={sessionSelectRef}
            required
            value={sessionSource.value}
            onChange={(event) => sessionSource.onChange(event.target.value)}
          >
            <option value="">Selecione uma sessão…</option>
            {sessionSource.options.map((session) => (
              <option key={session.id} value={session.id}>
                {session.label}
              </option>
            ))}
          </select>
          <span
            className="mt-1 block text-xs font-normal semantic-text-secondary"
            id="narrative-source-session-help"
          >
            Escolha a sessão desta campanha que deu origem ao evento.
          </span>
          {sessionSource.loading ? (
            <span
              className="mt-1 block text-sm font-normal semantic-text-secondary"
              id="narrative-source-session-loading"
              role="status"
            >
              Carregando sessões…
            </span>
          ) : null}
          {!sessionSource.loading &&
          sessionSource.error === undefined &&
          sessionSource.available === false ? (
            <span
              aria-live="polite"
              className="mt-1 block text-sm font-normal semantic-text-secondary"
              id="narrative-source-session-unavailable"
              role="status"
            >
              Não há sessões nesta campanha. Crie uma sessão ou escolha outra origem.
            </span>
          ) : null}
          {sessionSource.error === undefined ? null : (
            <div className="mt-1 text-sm font-normal semantic-error-text">
              {typeof sessionSource.error === 'string' ? (
                <>
                  <span id="narrative-source-session-error">{sessionSource.error}</span>
                  <Button
                    className="mt-2"
                    onClick={retrySessions}
                    ref={retryButtonRef}
                    size="small"
                  >
                    Tentar carregar sessões novamente
                  </Button>
                </>
              ) : (
                <>
                  <span className="sr-only" id="narrative-source-session-error">
                    {sessionSource.error.title}
                  </span>
                  <UserFacingErrorNotice
                    compact
                    error={sessionSource.error}
                    operation="sessions.list"
                    onRetry={retrySessions}
                    retryLabel="Tentar carregar sessões novamente"
                    retryButtonRef={retryButtonRef}
                  />
                </>
              )}
            </div>
          )}
        </div>
      ) : values.originKind === 'manual' || hideSourceIdentifier ? null : (
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
  helpKey,
  id,
  label,
  value,
  disabled,
  onChange,
  options,
  selectRef,
}: {
  helpKey: ContextualHelpKey;
  id?: string | undefined;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
  selectRef?: Ref<HTMLSelectElement> | undefined;
}): React.JSX.Element {
  const generatedId = useId();
  const selectId = id ?? `narrative-metadata-${generatedId.replaceAll(':', '')}`;
  return (
    <div className={labelClass}>
      <div className="flex items-center gap-1">
        <label htmlFor={selectId}>{label}</label>
        <ContextualHelp content={contextualHelpCatalog[helpKey]} label={label} />
      </div>
      <select
        className={inputClass}
        disabled={disabled}
        id={selectId}
        onChange={(event) => onChange(event.target.value)}
        ref={selectRef}
        value={value}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
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
  'mt-2 w-full rounded-xl border semantic-border semantic-surface px-4 py-2.5 semantic-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 semantic-focus-outline semantic-disabled-surface';
export const labelClass = 'block text-sm font-semibold semantic-text-primary';

export function sessionSourceDescription({
  available,
  error,
  loading,
}: {
  available?: boolean | undefined;
  error?: SessionSourceError | undefined;
  loading?: boolean | undefined;
}): string {
  const helpId = 'narrative-source-session-help';
  if (loading) {
    return `${helpId} narrative-source-session-loading`;
  }
  if (error !== undefined) {
    return `${helpId} narrative-source-session-error`;
  }
  if (available === false) {
    return `${helpId} narrative-source-session-unavailable`;
  }
  return helpId;
}

export type SessionRetryFocusPhase = 'awaiting-loading' | 'awaiting-result' | 'idle';

export function advanceSessionRetryFocus({
  available,
  error,
  loading,
  phase,
}: {
  available?: boolean | undefined;
  error?: SessionSourceError | undefined;
  loading?: boolean | undefined;
  phase: SessionRetryFocusPhase;
}): {
  phase: SessionRetryFocusPhase;
  target: 'origin' | 'retry' | 'session' | undefined;
} {
  if (phase === 'idle') return { phase, target: undefined };
  if (phase === 'awaiting-loading') {
    return loading ? { phase: 'awaiting-result', target: undefined } : { phase, target: undefined };
  }
  if (loading) return { phase, target: undefined };
  if (error !== undefined) return { phase: 'idle', target: 'retry' };
  if (available) return { phase: 'idle', target: 'session' };
  return { phase: 'idle', target: 'origin' };
}

export function knowledgeLabel(value: NarrativeMetadata['knowledgeState']): string {
  return knowledgeOptions.find(([key]) => key === value)?.[1] ?? value;
}
export function canonLabel(value: NarrativeMetadata['canonState']): string {
  return canonOptions.find(([key]) => key === value)?.[1] ?? value;
}
export function visibilityLabel(value: NarrativeMetadata['visibility']): string {
  return visibilityOptions.find(([key]) => key === value)?.[1] ?? value;
}
