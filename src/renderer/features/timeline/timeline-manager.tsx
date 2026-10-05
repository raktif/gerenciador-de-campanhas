import { useCallback, useEffect, useRef, useState } from 'react';
import type { Campaign } from '../../../core/contracts/campaigns';
import type { Entity } from '../../../core/contracts/entities';
import type { TimelineEntry } from '../../../core/contracts/timeline';
import {
  canonLabel,
  knowledgeLabel,
  secondaryClass,
  visibilityLabel,
} from '../narrative/narrative-metadata-fields';
import { linkSummary, originLabel, rolesForEntity, timelineGroupLabel } from './timeline-model';
import {
  presentUserFacingError,
  type UserFacingError,
} from '../../../core/errors/user-facing-error';
import { UserFacingErrorNotice } from '../../components/user-facing-error-notice';

export function TimelineManager({
  campaign,
  entity,
  onBack,
}: {
  campaign: Campaign;
  entity?: Entity;
  onBack: () => void;
}): React.JSX.Element {
  const [items, setItems] = useState<TimelineEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [archived, setArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UserFacingError | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const load = useCallback(
    async (append = false): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const baseInput = {
          campaignId: campaign.id,
          limit: 50,
          filters: { archived },
          ...(append && cursor !== null ? { cursor } : {}),
        };
        const result =
          entity === undefined
            ? await window.campaignManager.timeline.listCampaign(baseInput)
            : await window.campaignManager.timeline.listEntity({
                ...baseInput,
                entityId: entity.id,
              });
        if (result.ok) {
          setItems((current) => (append ? [...current, ...result.data.items] : result.data.items));
          setCursor(result.data.nextCursor);
          if (append)
            setAnnouncement(`${String(result.data.items.length)} eventos adicionais carregados.`);
        } else setError(presentUserFacingError(result.error, 'timeline.list'));
      } catch {
        setError(presentUserFacingError(undefined, 'timeline.list'));
      } finally {
        setLoading(false);
      }
    },
    [archived, campaign.id, cursor, entity],
  );

  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    setItems([]);
    setCursor(null);
    void load(false);
  }, [archived, campaign.id, entity?.id]);

  const title = entity === undefined ? 'Cronologia da campanha' : `Cronologia de ${entity.name}`;
  const empty =
    entity === undefined
      ? 'Nenhum evento encontrado nesta campanha.'
      : 'Nenhum evento vinculado a esta entidade.';
  return (
    <section aria-labelledby="timeline-title">
      <button className={secondaryClass} onClick={onBack} type="button">
        ← {entity === undefined ? 'Voltar para detalhes da campanha' : 'Voltar para entidades'}
      </button>
      <header className="mt-6 border-b border-stone-200 pb-6">
        <p className="text-xs font-bold tracking-[0.18em] text-amber-800 uppercase">
          {campaign.name}
        </p>
        <h1 className="mt-2 text-4xl font-semibold" id="timeline-title" ref={heading} tabIndex={-1}>
          {title}
        </h1>
        <p className="mt-2 text-slate-600">
          {entity === undefined
            ? 'Eventos são apresentados na ordem narrativa registrada.'
            : 'Consulta histórica dos eventos vinculados a esta entidade.'}
        </p>
      </header>
      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Filtrar cronologia">
        <button
          aria-pressed={!archived}
          className={secondaryClass}
          disabled={loading}
          onClick={() => setArchived(false)}
          type="button"
        >
          Eventos ativos
        </button>
        <button
          aria-pressed={archived}
          className={secondaryClass}
          disabled={loading}
          onClick={() => setArchived(true)}
          type="button"
        >
          Eventos arquivados
        </button>
      </div>
      {announcement === null ? null : (
        <p aria-live="polite" className="mt-5 text-sm text-emerald-800" role="status">
          {announcement}
        </p>
      )}
      {error === null ? null : (
        <div className="mt-5">
          <UserFacingErrorNotice
            error={error}
            operation="timeline.list"
            onRetry={() => void load(false)}
          />
        </div>
      )}
      {loading && items.length === 0 ? (
        <p aria-busy="true" aria-live="polite" className="mt-8">
          Carregando cronologia…
        </p>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
          <h2 className="text-xl font-semibold">{empty}</h2>
        </div>
      ) : (
        <ol className="mt-8 grid gap-4" data-testid="timeline-list">
          {items.map((entry) => (
            <li className="rounded-2xl border border-stone-200 bg-white p-6" key={entry.event.id}>
              <p className="text-sm font-semibold text-amber-800">
                {timelineGroupLabel(entry)} · Ordem narrativa {entry.event.eventOrder}
              </p>
              <h2 className="mt-1 text-xl font-semibold">{entry.event.title}</h2>
              {entry.event.occurredAtLabel === null ? null : (
                <p className="mt-2 text-sm text-slate-600">
                  Referência temporal: {entry.event.occurredAtLabel}
                </p>
              )}
              {entry.event.descriptionMarkdown === null ? null : (
                <p className="mt-4 whitespace-pre-wrap text-slate-700">
                  {entry.event.descriptionMarkdown}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <Badge>{canonLabel(entry.event.canonState)}</Badge>
                <Badge>{knowledgeLabel(entry.event.knowledgeState)}</Badge>
                <Badge>{visibilityLabel(entry.event.visibility)}</Badge>
                <Badge>Origem: {originLabel(entry.event.originKind)}</Badge>
              </div>
              {entity === undefined ? (
                <p className="mt-4 text-sm text-slate-600">Vínculos: {linkSummary(entry)}</p>
              ) : (
                <p className="mt-4 text-sm text-slate-600">
                  Papel nesta entidade:{' '}
                  {rolesForEntity(entry, entity.id).join(' · ') || 'Vínculo registrado'}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
      {cursor === null ? null : (
        <button
          className={`${secondaryClass} mt-6`}
          disabled={loading}
          onClick={() => void load(true)}
          type="button"
        >
          {loading ? 'Carregando…' : 'Carregar mais eventos'}
        </button>
      )}
    </section>
  );
}

function Badge({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span className="rounded-full bg-stone-100 px-3 py-1">{children}</span>;
}
