import { useCallback, useEffect, useState } from 'react';
import type { Campaign, CampaignPatch, CreateCampaignInput } from '../../core/contracts/campaigns';
import { CampaignForm } from '../features/campaigns/campaign-form';
import { CampaignList } from '../features/campaigns/campaign-list';
import { EntityManager } from '../features/entities/entity-manager';
import { EntityTypeManager } from '../features/entity-types/entity-type-manager';
import { RelationshipTypeManager } from '../features/relationship-types/relationship-type-manager';

type Screen = 'campaigns' | 'create' | 'edit' | 'entityTypes' | 'entities' | 'relationshipTypes';
type CampaignStatus = Campaign['status'];
type LifecycleAction = 'archive' | 'restore' | 'moveToTrash';

export function CampaignApp(): React.JSX.Element {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [statusFilter, setStatusFilter] = useState<CampaignStatus>('active');
  const [screen, setScreen] = useState<Screen>('campaigns');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const loadCampaigns = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    const result = await window.campaignManager.campaigns.list({
      filters: { statuses: [statusFilter] },
    });
    if (result.ok) {
      setCampaigns(result.data.items);
    } else {
      setLoadError(result.error.message);
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  function beginCreation(): void {
    setFormError(null);
    setAnnouncement(null);
    setScreen('create');
  }

  function selectStatus(status: CampaignStatus): void {
    setAnnouncement(null);
    setCampaigns([]);
    setLoading(true);
    setStatusFilter(status);
  }

  function beginEditing(campaign: Campaign): void {
    setSelectedCampaign(campaign);
    setFormError(null);
    setAnnouncement(null);
    setScreen('edit');
  }

  function returnToCampaigns(): void {
    setSelectedCampaign(null);
    setFormError(null);
    setScreen('campaigns');
  }

  async function createCampaign(input: CreateCampaignInput): Promise<void> {
    setCreating(true);
    setFormError(null);
    const result = await window.campaignManager.campaigns.create(input);
    if (result.ok) {
      setCampaigns((current) => [result.data, ...current]);
      setScreen('campaigns');
      setAnnouncement(`Campanha “${result.data.name}” criada.`);
    } else {
      setFormError(result.error.message);
    }
    setCreating(false);
  }

  async function changeLifecycle(action: LifecycleAction): Promise<void> {
    if (selectedCampaign === null) return;

    setCreating(true);
    setFormError(null);
    const input = { id: selectedCampaign.id, revision: selectedCampaign.revision };
    const result =
      action === 'archive'
        ? await window.campaignManager.campaigns.archive(input)
        : action === 'restore'
          ? await window.campaignManager.campaigns.restore(input)
          : await window.campaignManager.campaigns.moveToTrash(input);

    if (result.ok) {
      setCampaigns((current) => current.filter((campaign) => campaign.id !== result.data.id));
      setSelectedCampaign(null);
      setScreen('campaigns');
      setAnnouncement(lifecycleAnnouncement(action, result.data.name));
    } else {
      setFormError(result.error.message);
    }
    setCreating(false);
  }

  async function updateCampaign(patch: CampaignPatch): Promise<void> {
    if (selectedCampaign === null) return;

    setCreating(true);
    setFormError(null);
    const result = await window.campaignManager.campaigns.update({
      id: selectedCampaign.id,
      revision: selectedCampaign.revision,
      patch,
    });
    if (result.ok) {
      setCampaigns((current) =>
        current.map((campaign) => (campaign.id === result.data.id ? result.data : campaign)),
      );
      setSelectedCampaign(null);
      setScreen('campaigns');
      setAnnouncement(`Campanha “${result.data.name}” atualizada.`);
    } else {
      setFormError(result.error.message);
    }
    setCreating(false);
  }

  return (
    <div className="min-h-screen bg-[#f7f4ed] text-slate-900">
      <div className="grid min-h-screen grid-cols-[15.5rem_1fr]">
        <aside className="flex flex-col border-r border-stone-200 bg-slate-950 px-5 py-7 text-slate-100">
          <div className="flex items-center gap-3 px-2">
            <div
              aria-hidden="true"
              className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-700 text-lg font-black text-white shadow-lg shadow-orange-950/30"
            >
              G
            </div>
            <div>
              <p className="text-sm font-bold tracking-wide">Gerenciador</p>
              <p className="text-xs text-slate-400">Campanhas de RPG</p>
            </div>
          </div>

          <nav aria-label="Navegação principal" className="mt-10">
            <p className="px-3 text-[0.68rem] font-bold tracking-[0.18em] text-slate-500 uppercase">
              Organização
            </p>
            <div
              aria-current="page"
              className="mt-3 flex items-center gap-3 rounded-xl bg-slate-800 px-3 py-3 text-sm font-semibold text-white shadow-inner"
            >
              <span aria-hidden="true" className="size-2 rounded-full bg-amber-400" />
              Campanhas
            </div>
          </nav>

          <div className="mt-auto rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs leading-5 text-slate-400">
            <p className="font-semibold text-slate-200">Privado e local</p>
            <p className="mt-1">Seus dados permanecem neste computador.</p>
          </div>
        </aside>

        <main className="min-w-0 px-8 py-8 lg:px-12 lg:py-10">
          {screen === 'create' ? (
            <CampaignForm
              busy={creating}
              error={formError}
              mode="create"
              onCancel={returnToCampaigns}
              onSubmit={createCampaign}
            />
          ) : screen === 'entityTypes' && selectedCampaign !== null ? (
            <EntityTypeManager campaign={selectedCampaign} onBack={() => setScreen('edit')} />
          ) : screen === 'entities' && selectedCampaign !== null ? (
            <EntityManager campaign={selectedCampaign} onBack={() => setScreen('edit')} />
          ) : screen === 'relationshipTypes' && selectedCampaign !== null ? (
            <RelationshipTypeManager campaign={selectedCampaign} onBack={() => setScreen('edit')} />
          ) : screen === 'edit' && selectedCampaign !== null ? (
            <CampaignForm
              busy={creating}
              campaign={selectedCampaign}
              error={formError}
              key={`${selectedCampaign.id}:${String(selectedCampaign.revision)}`}
              mode="edit"
              onCancel={returnToCampaigns}
              onLifecycle={changeLifecycle}
              onManageEntities={() => setScreen('entities')}
              onManageEntityTypes={() => setScreen('entityTypes')}
              onManageRelationshipTypes={() => setScreen('relationshipTypes')}
              onSubmit={updateCampaign}
            />
          ) : (
            <CampaignsScreen
              announcement={announcement}
              campaigns={campaigns}
              error={loadError}
              loading={loading}
              onCreate={beginCreation}
              onOpen={beginEditing}
              onRetry={() => void loadCampaigns()}
              onStatusChange={selectStatus}
              status={statusFilter}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function CampaignsScreen({
  announcement,
  campaigns,
  error,
  loading,
  onCreate,
  onOpen,
  onRetry,
  onStatusChange,
  status,
}: {
  announcement: string | null;
  campaigns: Campaign[];
  error: string | null;
  loading: boolean;
  onCreate: () => void;
  onOpen: (campaign: Campaign) => void;
  onRetry: () => void;
  onStatusChange: (status: CampaignStatus) => void;
  status: CampaignStatus;
}): React.JSX.Element {
  if (loading) {
    return (
      <section aria-busy="true" aria-label="Carregando campanhas" className="animate-pulse">
        <div className="h-5 w-28 rounded bg-stone-200" />
        <div className="mt-4 h-10 w-80 rounded bg-stone-200" />
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div className="h-52 rounded-2xl bg-stone-200" key={item} />
          ))}
        </div>
      </section>
    );
  }

  if (error !== null) {
    return (
      <section className="grid min-h-[70vh] place-items-center">
        <div className="max-w-lg rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-bold tracking-wider text-red-700 uppercase">
            Não foi possível carregar
          </p>
          <h1 className="mt-3 text-2xl font-semibold">Suas campanhas continuam preservadas</h1>
          <p className="mt-3 leading-7 text-slate-600">{error}</p>
          <button
            className="mt-6 rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
            onClick={onRetry}
            type="button"
          >
            Tentar novamente
          </button>
        </div>
      </section>
    );
  }

  if (campaigns.length === 0) {
    if (status !== 'active') {
      return (
        <section aria-labelledby="campaigns-title">
          <CampaignsHeader
            campaignCount={0}
            onCreate={onCreate}
            onStatusChange={onStatusChange}
            status={status}
          />
          {announcement === null ? null : <Announcement message={announcement} />}
          <div className="mt-10 rounded-2xl border border-dashed border-stone-300 bg-white px-8 py-14 text-center">
            <h2 className="text-xl font-semibold text-slate-900">
              {status === 'archived' ? 'Nenhuma campanha arquivada' : 'A lixeira está vazia'}
            </h2>
            <p className="mt-2 text-slate-600">
              {status === 'archived'
                ? 'Campanhas arquivadas permanecerão preservadas aqui.'
                : 'Campanhas enviadas para a lixeira poderão ser restauradas aqui.'}
            </p>
          </div>
        </section>
      );
    }

    return (
      <section>
        <CampaignStatusTabs onChange={onStatusChange} status={status} />
        {announcement === null ? null : <Announcement message={announcement} />}
        <div className="grid min-h-[70vh] place-items-center">
          <div className="relative max-w-2xl overflow-hidden rounded-3xl border border-stone-200 bg-white px-10 py-12 text-center shadow-[0_24px_80px_-45px_rgba(15,23,42,0.5)]">
            <div
              aria-hidden="true"
              className="absolute -top-24 -right-20 size-64 rounded-full bg-amber-100 blur-2xl"
            />
            <div
              aria-hidden="true"
              className="relative mx-auto grid size-16 place-items-center rounded-2xl bg-slate-950 text-2xl text-amber-400 shadow-xl shadow-slate-900/20"
            >
              ✦
            </div>
            <p className="relative mt-7 text-xs font-bold tracking-[0.2em] text-amber-800 uppercase">
              Seu mundo começa aqui
            </p>
            <h1 className="relative mt-3 text-4xl font-semibold tracking-tight text-slate-950">
              Bem-vindo ao Gerenciador de Campanhas de RPG
            </h1>
            <p className="relative mx-auto mt-5 max-w-xl text-lg leading-8 text-slate-600">
              Organize seu mundo, acompanhe acontecimentos e transforme anotações em uma campanha
              viva.
            </p>
            <button
              className="relative mt-8 rounded-xl bg-amber-700 px-6 py-3.5 font-semibold text-white shadow-lg shadow-amber-900/15 hover:bg-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
              onClick={onCreate}
              type="button"
            >
              Criar primeira campanha
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="campaigns-title">
      <CampaignsHeader
        campaignCount={campaigns.length}
        onCreate={onCreate}
        onStatusChange={onStatusChange}
        status={status}
      />

      {announcement === null ? null : <Announcement message={announcement} />}

      <div className="mt-8">
        <CampaignList campaigns={campaigns} onOpen={onOpen} />
      </div>
    </section>
  );
}

function CampaignsHeader({
  campaignCount,
  onCreate,
  onStatusChange,
  status,
}: {
  campaignCount: number;
  onCreate: () => void;
  onStatusChange: (status: CampaignStatus) => void;
  status: CampaignStatus;
}): React.JSX.Element {
  return (
    <>
      <header className="flex items-end justify-between gap-6 border-b border-stone-200 pb-7">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-amber-800 uppercase">
            Seus mundos
          </p>
          <h1 id="campaigns-title" className="mt-2 text-4xl font-semibold tracking-tight">
            Campanhas
          </h1>
          <p className="mt-3 text-slate-600">{campaignCountLabel(campaignCount, status)}</p>
        </div>
        {status === 'active' ? (
          <button
            className="shrink-0 rounded-xl bg-amber-700 px-5 py-3 font-semibold text-white shadow-sm hover:bg-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
            onClick={onCreate}
            type="button"
          >
            Nova campanha
          </button>
        ) : null}
      </header>
      <CampaignStatusTabs onChange={onStatusChange} status={status} />
    </>
  );
}

function CampaignStatusTabs({
  onChange,
  status,
}: {
  onChange: (status: CampaignStatus) => void;
  status: CampaignStatus;
}): React.JSX.Element {
  const tabs: { label: string; status: CampaignStatus }[] = [
    { label: 'Ativas', status: 'active' },
    { label: 'Arquivadas', status: 'archived' },
    { label: 'Lixeira', status: 'deleted' },
  ];
  return (
    <div aria-label="Status das campanhas" className="mt-6 flex gap-2" role="group">
      {tabs.map((tab) => (
        <button
          aria-pressed={status === tab.status}
          className={`rounded-full px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 ${
            status === tab.status
              ? 'bg-slate-900 text-white'
              : 'border border-stone-300 bg-white text-slate-600 hover:border-amber-700 hover:text-amber-800'
          }`}
          key={tab.status}
          onClick={() => onChange(tab.status)}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function Announcement({ message }: { message: string }): React.JSX.Element {
  return (
    <p
      aria-live="polite"
      className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
      role="status"
    >
      {message}
    </p>
  );
}

function campaignCountLabel(count: number, status: CampaignStatus): string {
  const labels = {
    active: ['campanha ativa', 'campanhas ativas'],
    archived: ['campanha arquivada', 'campanhas arquivadas'],
    deleted: ['campanha na lixeira', 'campanhas na lixeira'],
  } as const;
  return `${String(count)} ${labels[status][count === 1 ? 0 : 1]} neste computador.`;
}

function lifecycleAnnouncement(action: LifecycleAction, name: string): string {
  if (action === 'archive') return `Campanha “${name}” arquivada.`;
  if (action === 'restore') return `Campanha “${name}” restaurada.`;
  return `Campanha “${name}” movida para a lixeira.`;
}
