import { useCallback, useEffect, useRef, useState } from 'react';
import type { Campaign, CampaignPatch, CreateCampaignInput } from '../../core/contracts/campaigns';
import type { Entity } from '../../core/contracts/entities';
import {
  beginCampaignLoad,
  createCampaignStartupFailure,
  initialCampaignLoadState,
  invalidateCampaignLoad,
  resolveCampaignLoad,
  type CampaignLoadPhase,
  type CampaignLoadState,
  type CampaignStartupFailure,
} from './campaign-startup';
import { AssertionManager, type NarrativeContext } from '../features/assertions/assertion-manager';
import { CampaignForm } from '../features/campaigns/campaign-form';
import { CampaignList } from '../features/campaigns/campaign-list';
import { EntityManager } from '../features/entities/entity-manager';
import { EntityTypeManager } from '../features/entity-types/entity-type-manager';
import { QuickCapture } from '../features/inbox/quick-capture';
import { NoteManager } from '../features/notes/note-manager';
import { RelationshipTypeManager } from '../features/relationship-types/relationship-type-manager';
import { RelationshipManager } from '../features/relationships/relationship-manager';
import { SessionManager } from '../features/sessions/session-manager';
import { TimelineManager } from '../features/timeline/timeline-manager';
import { InboxManager } from '../features/inbox/inbox-manager';
import { presentUserFacingError, type UserFacingError } from '../../core/errors/user-facing-error';
import { UserFacingErrorNotice } from '../components/user-facing-error-notice';

type Screen =
  | 'campaigns'
  | 'create'
  | 'edit'
  | 'entityTypes'
  | 'entities'
  | 'relationshipTypes'
  | 'relationships'
  | 'assertions'
  | 'notes'
  | 'sessions'
  | 'timeline'
  | 'inbox';
type CampaignScreen = Exclude<Screen, 'campaigns' | 'create'>;
type CampaignStatus = Campaign['status'];
type LifecycleAction = 'archive' | 'restore' | 'moveToTrash';

export function CampaignApp(): React.JSX.Element {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [statusFilter, setStatusFilter] = useState<CampaignStatus>('active');
  const [screen, setScreen] = useState<Screen>('campaigns');
  const [campaignLoadState, setCampaignLoadState] =
    useState<CampaignLoadState>(initialCampaignLoadState);
  const [formFailure, setFormFailure] = useState<UserFacingError | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [narrativeContext, setNarrativeContext] = useState<NarrativeContext | undefined>();
  const [timelineEntity, setTimelineEntity] = useState<Entity | undefined>();
  const [relationshipEntity, setRelationshipEntity] = useState<Entity | undefined>();
  const [relationshipReturnEntity, setRelationshipReturnEntity] = useState<Entity | undefined>();
  const contentRef = useRef<HTMLElement>(null);
  const campaignLoadStateRef = useRef<CampaignLoadState>(initialCampaignLoadState);

  useEffect(
    () => () => {
      campaignLoadStateRef.current = invalidateCampaignLoad(campaignLoadStateRef.current);
    },
    [],
  );

  useEffect(() => {
    if (selectedCampaign === null) return;
    const frame = requestAnimationFrame(() => {
      const heading = contentRef.current?.querySelector<HTMLHeadingElement>('h1');
      if (heading === null || heading === undefined) return;
      heading.tabIndex = -1;
      heading.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [screen, selectedCampaign]);

  function openContext(entity: Entity, target: 'assertions' | 'notes'): void {
    setNarrativeContext({ entityId: entity.id, entityName: entity.name });
    setTimelineEntity(undefined);
    setScreen(target);
  }

  function returnFromNarrative(): void {
    setScreen(narrativeContext === undefined ? 'edit' : 'entities');
    setNarrativeContext(undefined);
  }

  function openEntityTimeline(entity: Entity): void {
    setNarrativeContext(undefined);
    setTimelineEntity(entity);
    setScreen('timeline');
  }

  function openEntityRelationships(entity: Entity): void {
    setNarrativeContext(undefined);
    setTimelineEntity(undefined);
    setRelationshipReturnEntity(undefined);
    setRelationshipEntity(entity);
    setScreen('relationships');
  }

  function returnFromRelationships(): void {
    if (relationshipEntity !== undefined) setRelationshipReturnEntity(relationshipEntity);
    setScreen(relationshipEntity === undefined ? 'edit' : 'entities');
    setRelationshipEntity(undefined);
  }

  function returnFromTimeline(): void {
    setScreen(timelineEntity === undefined ? 'edit' : 'entities');
    setTimelineEntity(undefined);
  }

  const loadCampaigns = useCallback(async (): Promise<void> => {
    const loading = beginCampaignLoad(campaignLoadStateRef.current);
    campaignLoadStateRef.current = loading;
    setCampaignLoadState(loading);

    try {
      const result = await window.campaignManager.campaigns.list({
        filters: { statuses: [statusFilter] },
      });
      if (loading.request !== campaignLoadStateRef.current.request) return;

      if (result.ok) {
        setCampaigns(result.data.items);
        const ready = resolveCampaignLoad(campaignLoadStateRef.current, loading.request, {
          ok: true,
        });
        campaignLoadStateRef.current = ready;
        setCampaignLoadState(ready);
      } else {
        const failed = resolveCampaignLoad(campaignLoadStateRef.current, loading.request, {
          ok: false,
          error: result.error,
        });
        campaignLoadStateRef.current = failed;
        setCampaignLoadState(failed);
      }
    } catch {
      if (loading.request !== campaignLoadStateRef.current.request) return;
      const failed = resolveCampaignLoad(campaignLoadStateRef.current, loading.request, {
        ok: false,
      });
      campaignLoadStateRef.current = failed;
      setCampaignLoadState(failed);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  function beginCreation(): void {
    setFormFailure(null);
    setAnnouncement(null);
    setScreen('create');
  }

  function selectStatus(status: CampaignStatus): void {
    setAnnouncement(null);
    setCampaigns([]);
    const pending = invalidateCampaignLoad(campaignLoadStateRef.current);
    campaignLoadStateRef.current = pending;
    setCampaignLoadState(pending);
    setStatusFilter(status);
  }

  function beginEditing(campaign: Campaign): void {
    setSelectedCampaign(campaign);
    setFormFailure(null);
    setAnnouncement(null);
    setScreen('edit');
  }

  function returnToCampaigns(): void {
    setSelectedCampaign(null);
    setFormFailure(null);
    setNarrativeContext(undefined);
    setTimelineEntity(undefined);
    setRelationshipEntity(undefined);
    setRelationshipReturnEntity(undefined);
    setScreen('campaigns');
  }

  function navigateWithinCampaign(target: CampaignScreen): void {
    setNarrativeContext(undefined);
    setTimelineEntity(undefined);
    setRelationshipEntity(undefined);
    setRelationshipReturnEntity(undefined);
    setScreen(target);
  }

  async function createCampaign(input: CreateCampaignInput): Promise<void> {
    setCreating(true);
    setFormFailure(null);
    const result = await window.campaignManager.campaigns.create(input);
    if (result.ok) {
      setCampaigns((current) => [result.data, ...current]);
      setScreen('campaigns');
      setAnnouncement(`Campanha “${result.data.name}” criada.`);
    } else {
      const failure = presentUserFacingError(result.error, 'campaigns.mutate');
      setFormFailure(failure);
    }
    setCreating(false);
  }

  async function changeLifecycle(action: LifecycleAction): Promise<void> {
    if (selectedCampaign === null) return;

    setCreating(true);
    setFormFailure(null);
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
      const failure = presentUserFacingError(result.error, 'campaigns.mutate');
      setFormFailure(failure);
    }
    setCreating(false);
  }

  async function updateCampaign(patch: CampaignPatch): Promise<void> {
    if (selectedCampaign === null) return;

    setCreating(true);
    setFormFailure(null);
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
      const failure = presentUserFacingError(result.error, 'campaigns.mutate');
      setFormFailure(failure);
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

          {selectedCampaign === null ? (
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
          ) : (
            <CampaignNavigation
              campaign={selectedCampaign}
              onExit={returnToCampaigns}
              onNavigate={navigateWithinCampaign}
              screen={screen}
            />
          )}

          <div className="mt-auto rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs leading-5 text-slate-400">
            <p className="font-semibold text-slate-200">Privado e local</p>
            <p className="mt-1">Seus dados permanecem neste computador.</p>
          </div>
        </aside>

        <main className="min-w-0 px-8 py-8 lg:px-12 lg:py-10" ref={contentRef}>
          {screen === 'create' ? (
            <>
              <CampaignForm
                busy={creating}
                error={null}
                mode="create"
                onCancel={returnToCampaigns}
                onSubmit={createCampaign}
              />
              {formFailure === null ? null : (
                <div className="mt-5">
                  <UserFacingErrorNotice error={formFailure} operation="campaigns.mutate" />
                </div>
              )}
            </>
          ) : screen === 'entityTypes' && selectedCampaign !== null ? (
            <EntityTypeManager campaign={selectedCampaign} onBack={() => setScreen('edit')} />
          ) : screen === 'entities' && selectedCampaign !== null ? (
            <EntityManager
              campaign={selectedCampaign}
              onBack={() => setScreen('edit')}
              onOpenAssertions={(entity) => openContext(entity, 'assertions')}
              onOpenNotes={(entity) => openContext(entity, 'notes')}
              onOpenTimeline={openEntityTimeline}
              onOpenRelationships={openEntityRelationships}
              {...(relationshipReturnEntity === undefined
                ? {}
                : { initialDetailEntity: relationshipReturnEntity, focusRelationshipButton: true })}
            />
          ) : screen === 'relationshipTypes' && selectedCampaign !== null ? (
            <RelationshipTypeManager campaign={selectedCampaign} onBack={() => setScreen('edit')} />
          ) : screen === 'relationships' && selectedCampaign !== null ? (
            <RelationshipManager
              campaign={selectedCampaign}
              {...(relationshipEntity === undefined ? {} : { centralEntity: relationshipEntity })}
              onBack={returnFromRelationships}
            />
          ) : screen === 'assertions' && selectedCampaign !== null ? (
            <AssertionManager
              campaign={selectedCampaign}
              {...(narrativeContext === undefined ? {} : { context: narrativeContext })}
              onBack={returnFromNarrative}
            />
          ) : screen === 'notes' && selectedCampaign !== null ? (
            <NoteManager
              campaign={selectedCampaign}
              {...(narrativeContext === undefined ? {} : { context: narrativeContext })}
              onBack={returnFromNarrative}
            />
          ) : screen === 'sessions' && selectedCampaign !== null ? (
            <SessionManager campaign={selectedCampaign} onBack={() => setScreen('edit')} />
          ) : screen === 'timeline' && selectedCampaign !== null ? (
            <TimelineManager
              campaign={selectedCampaign}
              {...(timelineEntity === undefined ? {} : { entity: timelineEntity })}
              onBack={returnFromTimeline}
            />
          ) : screen === 'inbox' && selectedCampaign !== null ? (
            <InboxManager
              campaign={selectedCampaign}
              onBack={() => setScreen('edit')}
              onManageEntities={() => setScreen('entities')}
              onManageEntityTypes={() => setScreen('entityTypes')}
              onManageRelationshipTypes={() => setScreen('relationshipTypes')}
            />
          ) : screen === 'edit' && selectedCampaign !== null ? (
            <>
              <CampaignForm
                busy={creating}
                campaign={selectedCampaign}
                error={null}
                key={`${selectedCampaign.id}:${String(selectedCampaign.revision)}`}
                mode="edit"
                onCancel={returnToCampaigns}
                onLifecycle={changeLifecycle}
                onSubmit={updateCampaign}
              />
              {formFailure === null ? null : (
                <div className="mt-5">
                  <UserFacingErrorNotice error={formFailure} operation="campaigns.mutate" />
                </div>
              )}
            </>
          ) : (
            <CampaignsScreen
              announcement={announcement}
              campaigns={campaigns}
              failure={campaignLoadState.failure}
              onCreate={beginCreation}
              onOpen={beginEditing}
              onRetry={() => void loadCampaigns()}
              onStatusChange={selectStatus}
              phase={campaignLoadState.phase}
              status={statusFilter}
            />
          )}
        </main>
        {selectedCampaign === null ? null : (
          <QuickCapture campaign={selectedCampaign} onOpenInbox={() => setScreen('inbox')} />
        )}
      </div>
    </div>
  );
}

function CampaignNavigation({
  campaign,
  onExit,
  onNavigate,
  screen,
}: {
  campaign: Campaign;
  onExit: () => void;
  onNavigate: (target: CampaignScreen) => void;
  screen: Screen;
}): React.JSX.Element {
  return (
    <nav aria-label={`Navegação da campanha ${campaign.name}`} className="mt-8">
      <button className={navigationItemClass(false)} onClick={onExit} type="button">
        <span aria-hidden="true">←</span>
        Campanhas
      </button>

      <div className="mt-6 border-y border-slate-800 px-3 py-4">
        <p className="text-[0.68rem] font-bold tracking-[0.18em] text-slate-500 uppercase">
          Campanha atual
        </p>
        <p className="mt-2 truncate text-sm font-semibold text-slate-100" title={campaign.name}>
          {campaign.name}
        </p>
      </div>

      <CampaignNavigationGroup label="Campanha">
        <CampaignNavigationItem
          active={screen === 'edit'}
          label="Detalhes da campanha"
          onClick={() => onNavigate('edit')}
        />
        {campaign.status === 'active' ? (
          <>
            <CampaignNavigationItem
              active={screen === 'inbox'}
              label="Caixa de Entrada"
              onClick={() => onNavigate('inbox')}
            />
            <CampaignNavigationItem
              active={screen === 'sessions'}
              label="Sessões"
              onClick={() => onNavigate('sessions')}
            />
            <CampaignNavigationItem
              active={screen === 'timeline'}
              label="Cronologia"
              onClick={() => onNavigate('timeline')}
            />
          </>
        ) : null}
      </CampaignNavigationGroup>

      {campaign.status === 'active' ? (
        <CampaignNavigationGroup label="Mundo">
          <CampaignNavigationItem
            active={screen === 'entityTypes'}
            label="Gerenciar tipos de entidade"
            onClick={() => onNavigate('entityTypes')}
          />
          <CampaignNavigationItem
            active={screen === 'entities'}
            label="Ver entidades"
            onClick={() => onNavigate('entities')}
          />
          <CampaignNavigationItem
            active={screen === 'relationshipTypes'}
            label="Tipos de relação"
            onClick={() => onNavigate('relationshipTypes')}
          />
          <CampaignNavigationItem
            active={screen === 'relationships'}
            label="Relações"
            onClick={() => onNavigate('relationships')}
          />
          <CampaignNavigationItem
            active={screen === 'assertions'}
            label="Afirmações"
            onClick={() => onNavigate('assertions')}
          />
          <CampaignNavigationItem
            active={screen === 'notes'}
            label="Notas"
            onClick={() => onNavigate('notes')}
          />
        </CampaignNavigationGroup>
      ) : (
        <p className="mt-6 px-3 text-xs leading-5 text-slate-400">
          Restaure a campanha para acessar seus registros.
        </p>
      )}
    </nav>
  );
}

function CampaignNavigationGroup({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}): React.JSX.Element {
  return (
    <section className="mt-6" aria-label={label}>
      <p className="px-3 text-[0.68rem] font-bold tracking-[0.18em] text-slate-500 uppercase">
        {label}
      </p>
      <div className="mt-2 grid gap-1">{children}</div>
    </section>
  );
}

function CampaignNavigationItem({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      aria-current={active ? 'page' : undefined}
      className={navigationItemClass(active)}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function navigationItemClass(active: boolean): string {
  return `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
    active
      ? 'bg-slate-800 text-white shadow-inner'
      : 'text-slate-300 hover:bg-slate-900 hover:text-white'
  }`;
}

function CampaignsScreen({
  announcement,
  campaigns,
  failure,
  onCreate,
  onOpen,
  onRetry,
  onStatusChange,
  phase,
  status,
}: {
  announcement: string | null;
  campaigns: Campaign[];
  failure: CampaignStartupFailure | null;
  onCreate: () => void;
  onOpen: (campaign: Campaign) => void;
  onRetry: () => void;
  onStatusChange: (status: CampaignStatus) => void;
  phase: CampaignLoadPhase;
  status: CampaignStatus;
}): React.JSX.Element {
  if (phase === 'initializing' || phase === 'loading-campaigns') {
    const message = phase === 'initializing' ? 'Inicializando…' : 'Carregando campanhas…';
    return (
      <section aria-busy="true" aria-label={message} className="animate-pulse" role="status">
        <p className="sr-only">{message}</p>
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

  if (phase === 'error')
    return (
      <StartupFailureScreen failure={failure ?? createCampaignStartupFailure()} onRetry={onRetry} />
    );

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

function StartupFailureScreen({
  failure,
  onRetry,
}: {
  failure: CampaignStartupFailure;
  onRetry: () => void;
}): React.JSX.Element {
  const [helpOpen, setHelpOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const helpTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => headingRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [failure.code]);

  async function copyDiagnostic(): Promise<void> {
    try {
      const result = await window.campaignManager.diagnostics.copyStartupDiagnostic(
        failure.diagnostic,
      );
      setCopyFeedback(
        result.ok
          ? 'Diagnóstico copiado.'
          : 'Não foi possível copiar o diagnóstico neste dispositivo.',
      );
    } catch {
      setCopyFeedback('Não foi possível copiar o diagnóstico neste dispositivo.');
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
    if (event.key !== 'Escape' || !helpOpen) return;
    event.preventDefault();
    setHelpOpen(false);
    requestAnimationFrame(() => helpTriggerRef.current?.focus());
  }

  return (
    <section
      aria-labelledby="startup-error-title"
      className="grid min-h-[70vh] place-items-center"
      onKeyDown={handleKeyDown}
    >
      <div className="max-w-lg rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-bold tracking-wider text-red-700 uppercase">
          Erro de inicialização
        </p>
        <h1
          aria-describedby="startup-error-description startup-error-suggested-action"
          className="mt-3 text-2xl font-semibold"
          id="startup-error-title"
          ref={headingRef}
          tabIndex={-1}
        >
          {failure.title}
        </h1>
        <p className="mt-3 leading-7 text-slate-600" id="startup-error-description">
          {failure.message}
        </p>
        <p className="mt-2 text-sm text-slate-600" id="startup-error-suggested-action">
          {failure.suggestedAction}
        </p>
        <details className="mt-4 text-left text-xs text-slate-600">
          <summary className="cursor-pointer text-center font-semibold tracking-wide text-slate-500">
            Ver detalhes técnicos
          </summary>
          <p className="mt-2">Código: {failure.code}</p>
        </details>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
            onClick={onRetry}
            type="button"
          >
            Tentar novamente
          </button>
          <button
            aria-controls="startup-recovery-help"
            aria-expanded={helpOpen}
            className="rounded-xl border border-stone-300 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
            onClick={() => setHelpOpen((current) => !current)}
            ref={helpTriggerRef}
            type="button"
          >
            Abrir Ajuda
          </button>
          <button
            className="rounded-xl border border-stone-300 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
            onClick={() => void copyDiagnostic()}
            type="button"
          >
            Copiar diagnóstico
          </button>
        </div>
        {copyFeedback === null ? null : (
          <p className="mt-4 text-sm text-slate-600" role="status">
            {copyFeedback}
          </p>
        )}
        {helpOpen ? (
          <aside
            className="mt-6 rounded-xl border border-stone-200 bg-stone-50 p-4 text-left text-sm leading-6 text-slate-700"
            id="startup-recovery-help"
          >
            <h2 className="font-semibold text-slate-900">Recuperação da inicialização</h2>
            <p className="mt-2">
              Tente carregar novamente. Se a falha persistir, copie o diagnóstico e consulte a
              documentação de solução de problemas quando a Ajuda completa estiver disponível.
            </p>
          </aside>
        ) : null}
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
