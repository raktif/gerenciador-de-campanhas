import type { Campaign } from '../../../core/contracts/campaigns';
import { Button } from '../../components/actions';
import { CampaignCoverPreview } from './campaign-cover';

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
          className="group relative overflow-hidden rounded-2xl border semantic-border semantic-surface p-6 semantic-domain-card transition hover:-translate-y-0.5 semantic-hover-accent-border "
          key={campaign.id}
        >
          <div className="semantic-card-accent absolute inset-x-0 top-0 h-1 opacity-80" />
          <CampaignCoverPreview campaign={campaign} className="mb-5 h-36 w-full" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold tracking-[0.16em] semantic-accent-text uppercase">
                {statusLabel(campaign.status)}
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight semantic-text-primary">
                {campaign.name}
              </h2>
            </div>
            <span
              aria-label={statusLabel(campaign.status)}
              className={`mt-1 size-2.5 shrink-0 ring-4 ${statusIndicatorClassName(
                campaign.status,
              )}`}
            />
          </div>
          {campaign.concept === null && campaign.summary === null ? (
            <p className="mt-4 text-sm leading-6 semantic-text-secondary">
              Uma campanha pronta para receber os primeiros elementos do mundo.
            </p>
          ) : (
            <p className="mt-4 line-clamp-3 text-sm leading-6 semantic-text-secondary">
              {campaign.concept ?? campaign.summary}
            </p>
          )}
          <dl className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t semantic-border pt-4 text-xs">
            {campaign.systemName === null ? null : (
              <div>
                <dt className="sr-only">Sistema</dt>
                <dd className="font-medium semantic-text-secondary">{campaign.systemName}</dd>
              </div>
            )}
            {campaign.genre === null ? null : (
              <div>
                <dt className="sr-only">Gênero</dt>
                <dd className="font-medium semantic-text-secondary">{campaign.genre}</dd>
              </div>
            )}
            <div className="ml-auto">
              <dt className="sr-only">Última atualização</dt>
              <dd className="semantic-text-secondary">
                Atualizada {formatDate(campaign.updatedAt)}
              </dd>
            </div>
          </dl>
          <Button
            aria-label={`Abrir campanha ${campaign.name}`}
            className="mt-5"
            fullWidth
            onClick={() => onOpen(campaign)}
          >
            Abrir campanha
          </Button>
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
  if (status === 'active') return 'semantic-success-background semantic-success-ring rounded-full';
  if (status === 'archived') return 'semantic-accent-background semantic-accent-ring rounded-sm';
  return 'semantic-surface-muted semantic-strong-ring rotate-45 rounded-sm';
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}
