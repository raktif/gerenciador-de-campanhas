import type { Campaign } from '../../../core/contracts/campaigns';

export function CampaignList({
  campaigns,
  onOpen,
}: {
  campaigns: Campaign[];
  onOpen: (campaign: Campaign) => void;
}): React.JSX.Element {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" data-testid="campaign-list">
      {campaigns.map((campaign) => (
        <article
          className="group relative overflow-hidden rounded-2xl border border-stone-200 bg-white p-6 shadow-[0_16px_45px_-35px_rgba(15,23,42,0.45)] transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-[0_22px_55px_-35px_rgba(146,64,14,0.5)]"
          key={campaign.id}
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-700 via-orange-600 to-rose-700 opacity-80" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold tracking-[0.16em] text-amber-800 uppercase">
                {statusLabel(campaign.status)}
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                {campaign.name}
              </h2>
            </div>
            <span
              aria-label={statusLabel(campaign.status)}
              className={`mt-1 size-2.5 shrink-0 rounded-full ring-4 ${statusIndicatorClassName(
                campaign.status,
              )}`}
            />
          </div>
          {campaign.concept === null && campaign.summary === null ? (
            <p className="mt-4 text-sm leading-6 text-slate-500">
              Uma campanha pronta para receber os primeiros elementos do mundo.
            </p>
          ) : (
            <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">
              {campaign.concept ?? campaign.summary}
            </p>
          )}
          <dl className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-stone-100 pt-4 text-xs">
            {campaign.systemName === null ? null : (
              <div>
                <dt className="sr-only">Sistema</dt>
                <dd className="font-medium text-slate-600">{campaign.systemName}</dd>
              </div>
            )}
            {campaign.genre === null ? null : (
              <div>
                <dt className="sr-only">Gênero</dt>
                <dd className="font-medium text-slate-600">{campaign.genre}</dd>
              </div>
            )}
            <div className="ml-auto">
              <dt className="sr-only">Última atualização</dt>
              <dd className="text-slate-400">Atualizada {formatDate(campaign.updatedAt)}</dd>
            </div>
          </dl>
          <button
            aria-label={`Abrir campanha ${campaign.name}`}
            className="mt-5 w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-amber-700 hover:text-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
            onClick={() => onOpen(campaign)}
            type="button"
          >
            Abrir campanha
          </button>
        </article>
      ))}
    </div>
  );
}

function statusLabel(status: Campaign['status']): string {
  if (status === 'active') return 'Campanha ativa';
  if (status === 'archived') return 'Campanha arquivada';
  return 'Campanha na lixeira';
}

function statusIndicatorClassName(status: Campaign['status']): string {
  if (status === 'active') return 'bg-emerald-500 ring-emerald-100';
  if (status === 'archived') return 'bg-amber-500 ring-amber-100';
  return 'bg-slate-400 ring-slate-200';
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}
