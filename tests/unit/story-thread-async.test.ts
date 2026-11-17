import { describe, expect, it, vi } from 'vitest';
import type { Session, SessionPageRequestInput } from '../../src/core/contracts/sessions';
import { failure, success } from '../../src/core/contracts/result';
import {
  loadAllCampaignSessions,
  retryStoryThreadOperation,
} from '../../src/renderer/features/story-threads/story-thread-async';

const campaignId = '00000000-0000-4000-8000-000000000001';
const timestamp = '2026-11-16T14:00:00.000Z';

describe('consultas assíncronas de Fios Abertos', () => {
  it('carrega todas as páginas de sessões e permite recuperar falha de uma página', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => makeSession(index + 2));
    const lastSession = makeSession(1);
    let failedSecondPage = false;
    const list = vi.fn((input: SessionPageRequestInput) => {
      if (input.cursor !== undefined && !failedSecondPage) {
        failedSecondPage = true;
        return Promise.resolve(
          failure({ code: 'DATABASE_UNAVAILABLE', message: 'Falha de teste.' }, 'request'),
        );
      }
      if (input.cursor !== undefined)
        return Promise.resolve(
          success({ items: [lastSession], nextCursor: null, total: 101 }, 'request'),
        );
      return Promise.resolve(
        success({ items: firstPage, nextCursor: 'page-2', total: 101 }, 'request'),
      );
    });

    await expect(loadAllCampaignSessions(list, campaignId)).rejects.toMatchObject({
      code: 'DATABASE_UNAVAILABLE',
    });
    expect(list).toHaveBeenCalledTimes(2);
    await expect(loadAllCampaignSessions(list, campaignId)).resolves.toHaveLength(101);
    expect(list).toHaveBeenCalledTimes(4);
    expect(list.mock.calls.map(([input]) => input.cursor ?? null)).toEqual([
      null,
      'page-2',
      null,
      'page-2',
    ]);
  });

  it('retry de consulta de fio repete o get, sem cair em create/update', () => {
    const calls: string[] = [];
    retryStoryThreadOperation('story-threads.get', {
      list: () => calls.push('list'),
      targets: () => calls.push('targets'),
      get: () => calls.push(`get:${campaignId}:thread-id`),
      mutate: () => calls.push('mutate'),
      sessions: () => calls.push('sessions'),
    });

    expect(calls).toEqual([`get:${campaignId}:thread-id`]);
    expect(calls).not.toContain('mutate');
  });
});

function makeSession(sequenceNumber: number): Session {
  return {
    id: `10000000-0000-4000-8000-${sequenceNumber.toString().padStart(12, '0')}`,
    campaignId,
    sequenceNumber,
    title: `Sessão ${sequenceNumber.toString()}`,
    playedAt: null,
    status: 'planned',
    summaryMarkdown: null,
    gmNotesMarkdown: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 1,
  };
}
