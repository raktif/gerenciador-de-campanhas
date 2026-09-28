import { useEffect, useState } from 'react';
import type { Session } from '../../../core/contracts/sessions';
import type { SessionSourceOption } from './narrative-metadata-fields';

export function useSessionSourceOptions(campaignId: string): {
  options: readonly SessionSourceOption[];
  error: string | undefined;
  loading: boolean;
  available: boolean;
  retry: () => void;
} {
  const [options, setOptions] = useState<SessionSourceOption[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    void load(campaignId)
      .then((items) => {
        if (active) setOptions(items);
      })
      .catch(() => {
        if (active) setError('Não foi possível carregar as sessões da campanha.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt, campaignId]);

  return {
    options,
    error,
    loading,
    available: !loading && error === undefined && options.length > 0,
    retry: () => setAttempt((current) => current + 1),
  };
}

async function load(campaignId: string): Promise<SessionSourceOption[]> {
  const sessions: Session[] = [];
  let cursor: string | undefined;
  do {
    const result = await window.campaignManager.sessions.list({
      campaignId,
      limit: 100,
      filters: {},
      sort: 'sequenceNumber',
      order: 'desc',
      ...(cursor === undefined ? {} : { cursor }),
    });
    if (!result.ok) throw new Error(result.error.message);
    sessions.push(...result.data.items);
    cursor = result.data.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return sessions.map((session) => ({
    id: session.id,
    label: `Sessão ${String(session.sequenceNumber)} — ${session.title}`,
  }));
}
