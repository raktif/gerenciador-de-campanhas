import type { SessionGateway, Session } from '../../../core/contracts/sessions';

type SessionList = SessionGateway['list'];

class SessionPageLoadError extends Error {
  public readonly code: string;

  public constructor(error: { code: string; message: string }) {
    super(error.message);
    this.name = 'SessionPageLoadError';
    this.code = error.code;
  }
}

export async function loadAllCampaignSessions(
  list: SessionList,
  campaignId: string,
): Promise<Session[]> {
  const sessions: Session[] = [];
  let cursor: string | undefined;
  do {
    const result = await list({
      campaignId,
      limit: 100,
      filters: {},
      sort: 'sequenceNumber',
      order: 'desc',
      ...(cursor === undefined ? {} : { cursor }),
    });
    if (!result.ok) throw new SessionPageLoadError(result.error);
    sessions.push(...result.data.items);
    cursor = result.data.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return sessions;
}

export type StoryThreadRetryOperation =
  | 'story-threads.list'
  | 'story-threads.targets'
  | 'story-threads.get'
  | 'story-threads.mutate'
  | 'sessions.list';

export function retryStoryThreadOperation(
  operation: StoryThreadRetryOperation,
  handlers: {
    list: () => void;
    targets: () => void;
    get: () => void;
    mutate: () => void;
    sessions: () => void;
  },
): void {
  if (operation === 'story-threads.list') handlers.list();
  else if (operation === 'story-threads.targets') handlers.targets();
  else if (operation === 'story-threads.get') handlers.get();
  else if (operation === 'sessions.list') handlers.sessions();
  else handlers.mutate();
}
