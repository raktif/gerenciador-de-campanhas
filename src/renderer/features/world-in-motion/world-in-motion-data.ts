import type { CampaignManagerGateway } from '../../../core/contracts/gateway';
import type { CampaignSignalReviewItem } from '../../../core/contracts/campaign-signal-engine';
import type { Clock } from '../../../core/contracts/clocks';
import type { Demand } from '../../../core/contracts/demands';
import type { StoryThread } from '../../../core/contracts/story-threads';
import type { Result } from '../../../core/contracts/result';

interface DashboardGateway {
  campaignSignals: Pick<CampaignManagerGateway['campaignSignals'], 'listForWorldInMotion'>;
  clocks: Pick<CampaignManagerGateway['clocks'], 'list'>;
  demands: Pick<CampaignManagerGateway['demands'], 'list'>;
  storyThreads: Pick<CampaignManagerGateway['storyThreads'], 'list'>;
}
interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface WorldInMotionData {
  signals: CampaignSignalReviewItem[];
  threads: StoryThread[];
  clocks: Clock[];
  demands: Demand[];
}

export interface WorldInMotionModel {
  signals: CampaignSignalReviewItem[];
  threads: StoryThread[];
  clocks: Clock[];
  demands: Demand[];
}

export async function loadWorldInMotionData(
  campaignId: string,
  gateway: DashboardGateway,
): Promise<WorldInMotionData> {
  const [signalResult, threads, clocks, demands] = await Promise.all([
    gateway.campaignSignals.listForWorldInMotion({ campaignId }),
    loadPages((cursor) =>
      gateway.storyThreads.list({
        campaignId,
        limit: 100,
        ...(cursor === undefined ? {} : { cursor }),
      }),
    ),
    loadPages((cursor) =>
      gateway.clocks.list({
        campaignId,
        limit: 100,
        ...(cursor === undefined ? {} : { cursor }),
      }),
    ),
    loadPages((cursor) =>
      gateway.demands.list({
        campaignId,
        limit: 100,
        ...(cursor === undefined ? {} : { cursor }),
      }),
    ),
  ]);
  if (!signalResult.ok) throw new DashboardLoadError(signalResult.error);
  assertCampaignScope(
    campaignId,
    signalResult.data.items.map(({ signal }) => signal),
  );
  assertCampaignScope(campaignId, threads);
  assertCampaignScope(campaignId, clocks);
  assertCampaignScope(campaignId, demands);
  return { signals: signalResult.data.items, threads, clocks, demands };
}

export function buildWorldInMotionModel(data: WorldInMotionData): WorldInMotionModel {
  return {
    signals: data.signals.filter(
      ({ signal }) => signal.status === 'new' || signal.status === 'viewed',
    ),
    threads: data.threads.filter(
      ({ status }) => status === 'open' || status === 'active' || status === 'dormant',
    ),
    clocks: data.clocks.filter(({ status }) => status === 'active'),
    demands: data.demands.filter(({ status }) => status === 'available' || status === 'active'),
  };
}

async function loadPages<T extends { campaignId: string }>(
  load: (cursor: string | undefined) => Promise<Result<Page<T>>>,
): Promise<T[]> {
  const items: T[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let firstPage = true;
  while (firstPage || cursor !== null) {
    firstPage = false;
    const result = await load(cursor ?? undefined);
    if (!result.ok) throw new DashboardLoadError(result.error);
    items.push(...result.data.items);
    const nextCursor = result.data.nextCursor;
    if (nextCursor === null) return items;
    if (seenCursors.has(nextCursor))
      throw new DashboardLoadError({
        code: 'PAGINATION_CURSOR_LOOP',
        message: 'A paginação do painel não avançou.',
      });
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
  return items;
}

function assertCampaignScope(campaignId: string, records: { campaignId: string }[]): void {
  if (records.some((record) => record.campaignId !== campaignId))
    throw new DashboardLoadError({
      code: 'CAMPAIGN_SCOPE_MISMATCH',
      message: 'Um registro retornado não pertence à campanha atual.',
    });
}

class DashboardLoadError extends Error {
  public readonly code: string;

  public constructor(error: { code: string; message: string }) {
    super(error.message);
    this.name = 'DashboardLoadError';
    this.code = error.code;
  }
}
