import { describe, expect, it, vi } from 'vitest';
import type { CampaignSignalReviewItem } from '../../src/core/contracts/campaign-signal-engine';
import type { Clock } from '../../src/core/contracts/clocks';
import type { Demand } from '../../src/core/contracts/demands';
import type { StoryThread } from '../../src/core/contracts/story-threads';
import {
  buildWorldInMotionModel,
  loadWorldInMotionData,
} from '../../src/renderer/features/world-in-motion/world-in-motion-data';
import type { Result } from '../../src/core/contracts/result';

const campaignId = '00000000-0000-4000-8000-000000000001';
const otherCampaignId = '00000000-0000-4000-8000-000000000002';
type DashboardGateway = Parameters<typeof loadWorldInMotionData>[1];

describe('dados do painel Mundo em Movimento', () => {
  it('carrega todas as páginas das listas pelo campaignId e preserva apenas estados ativos no modelo', async () => {
    const calls = { threads: 0, clocks: 0, demands: 0 };
    const signalList = vi.fn(() =>
      Promise.resolve(success({ items: [signal('new'), signal('dismissed')] })),
    );
    const gateway = {
      campaignSignals: {
        listForWorldInMotion: signalList,
      },
      storyThreads: {
        list: vi.fn((input: { cursor?: string | undefined }) =>
          Promise.resolve().then(() => {
            calls.threads += 1;
            return success({
              items:
                input.cursor === undefined
                  ? [thread('open'), thread('resolved')]
                  : [thread('dormant')],
              nextCursor: input.cursor === undefined ? 'thread-page-2' : null,
              total: 3,
            });
          }),
        ),
      },
      clocks: {
        list: vi.fn((input: { cursor?: string | undefined }) =>
          Promise.resolve().then(() => {
            calls.clocks += 1;
            return success({
              items: input.cursor === undefined ? [clock('active')] : [clock('completed')],
              nextCursor: input.cursor === undefined ? 'clock-page-2' : null,
              total: 2,
            });
          }),
        ),
      },
      demands: {
        list: vi.fn((input: { cursor?: string | undefined }) =>
          Promise.resolve().then(() => {
            calls.demands += 1;
            return success({
              items:
                input.cursor === undefined
                  ? [demand('available')]
                  : [demand('active'), demand('resolved')],
              nextCursor: input.cursor === undefined ? 'demand-page-2' : null,
              total: 3,
            });
          }),
        ),
      },
    } satisfies DashboardGateway;

    const data = await loadWorldInMotionData(campaignId, gateway);
    const model = buildWorldInMotionModel(data);

    expect(signalList).toHaveBeenCalledWith({ campaignId });
    expect(calls).toEqual({ threads: 2, clocks: 2, demands: 2 });
    expect(model.signals.map(({ signal: item }) => item.status)).toEqual(['new']);
    expect(model.threads.map(({ status }) => status)).toEqual(['open', 'dormant']);
    expect(model.clocks.map(({ status }) => status)).toEqual(['active']);
    expect(model.demands.map(({ status }) => status)).toEqual(['available', 'active']);
  });

  it('falha sem apresentar dados de outra campanha', async () => {
    const gateway = emptyGateway();
    const storyThreadList = vi.fn(() =>
      Promise.resolve(
        success({ items: [thread('open', otherCampaignId)], nextCursor: null, total: 1 }),
      ),
    );
    gateway.storyThreads.list = storyThreadList;

    await expect(loadWorldInMotionData(campaignId, gateway)).rejects.toMatchObject({
      code: 'CAMPAIGN_SCOPE_MISMATCH',
    });
  });

  it('expõe erro de qualquer fonte em vez de tratar falha como uma lista vazia', async () => {
    const gateway = emptyGateway();
    const clockList = vi.fn(() =>
      Promise.resolve({
        ok: false as const,
        requestId: 'request',
        error: { code: 'CLOCKS_UNAVAILABLE', message: 'Falha de leitura.' },
      }),
    );
    gateway.clocks.list = clockList;

    await expect(loadWorldInMotionData(campaignId, gateway)).rejects.toMatchObject({
      code: 'CLOCKS_UNAVAILABLE',
    });
  });

  it('interrompe paginação circular', async () => {
    const gateway = emptyGateway();
    const demandList = vi.fn((input: { cursor?: string | undefined }) =>
      Promise.resolve(
        success({
          items: [],
          nextCursor: input.cursor === undefined ? 'same-cursor' : 'same-cursor',
          total: 0,
        }),
      ),
    );
    gateway.demands.list = demandList;

    await expect(loadWorldInMotionData(campaignId, gateway)).rejects.toMatchObject({
      code: 'PAGINATION_CURSOR_LOOP',
    });
  });
});

function emptyGateway(): DashboardGateway {
  return {
    campaignSignals: {
      listForWorldInMotion: vi.fn(() => Promise.resolve(success({ items: [] }))),
    },
    storyThreads: {
      list: vi.fn(() => Promise.resolve(success({ items: [], nextCursor: null, total: 0 }))),
    },
    clocks: {
      list: vi.fn(() => Promise.resolve(success({ items: [], nextCursor: null, total: 0 }))),
    },
    demands: {
      list: vi.fn(() => Promise.resolve(success({ items: [], nextCursor: null, total: 0 }))),
    },
  };
}

function success<T>(data: T): Result<T> {
  return { ok: true, requestId: 'request', data };
}

function signal(status: 'new' | 'dismissed'): CampaignSignalReviewItem {
  return {
    signal: {
      id:
        status === 'new'
          ? '10000000-0000-4000-8000-000000000001'
          : '10000000-0000-4000-8000-000000000002',
      campaignId,
      signalType: 'explicit_need',
      title: 'Necessidade registrada',
      summary: 'Verificar a necessidade informada.',
      priority: 'medium',
      status,
      generatedAt: '2026-11-18T12:00:00.000Z',
      lastDetectedAt: '2026-11-18T12:00:00.000Z',
      dismissedUntil: null,
      ruleVersion: 'explicit-need-v1',
      generatorKind: 'deterministic',
      createdAt: '2026-11-18T12:00:00.000Z',
      updatedAt: '2026-11-18T12:00:00.000Z',
      revision: 1,
    },
    evidence: [],
  };
}

function thread(status: 'open' | 'resolved' | 'dormant', idCampaign = campaignId): StoryThread {
  return {
    id: `20000000-0000-4000-8000-00000000000${status === 'open' ? '1' : status === 'resolved' ? '2' : '3'}`,
    campaignId: idCampaign,
    title: 'Fio de teste',
    description: null,
    threadType: 'promise',
    status,
    statusBeforeArchive: null,
    originKind: 'manual',
    originSessionId: null,
    originSessionTitle: null,
    originReason: null,
    createdAt: '2026-11-18T12:00:00.000Z',
    updatedAt: '2026-11-18T12:00:00.000Z',
    revision: 1,
  };
}

function clock(status: 'active' | 'completed'): Clock {
  return {
    id: `30000000-0000-4000-8000-00000000000${status === 'active' ? '1' : '2'}`,
    campaignId,
    name: 'Relógio de teste',
    description: null,
    consequence: 'Texto cadastrado',
    clockType: 'progress',
    segmentsTotal: 4,
    segmentsFilled: status === 'completed' ? 4 : 1,
    status,
    entityId: '40000000-0000-4000-8000-000000000001',
    entityName: 'Entidade',
    entityArchivedAt: null,
    canonState: 'draft',
    knowledgeState: 'possibility',
    visibility: 'gm',
    originKind: 'manual',
    sourceId: null,
    sessionId: null,
    generatedEventId: null,
    createdAt: '2026-11-18T12:00:00.000Z',
    updatedAt: '2026-11-18T12:00:00.000Z',
    revision: 1,
  };
}

function demand(status: 'available' | 'active' | 'resolved'): Demand {
  return {
    id: `50000000-0000-4000-8000-00000000000${status === 'available' ? '1' : status === 'active' ? '2' : '3'}`,
    campaignId,
    title: 'Demanda de teste',
    need: 'Necessidade registrada',
    summary: '',
    obstacle: '',
    risks: '',
    urgency: 'low',
    requesterEntityId: '40000000-0000-4000-8000-000000000001',
    status,
    statusBeforeArchive: null,
    parentId: null,
    lineageSignalId: '60000000-0000-4000-8000-000000000001',
    acceptedSignalId: null,
    sourceEntityId: '40000000-0000-4000-8000-000000000001',
    sourceFieldDefinitionId: '70000000-0000-4000-8000-000000000001',
    sourceFieldValueId: '80000000-0000-4000-8000-000000000001',
    sourceId: '90000000-0000-4000-8000-000000000001',
    sourceSnapshot: '{}',
    generatedEventId: null,
    canonState: 'draft',
    knowledgeState: 'possibility',
    visibility: 'gm',
    originKind: 'generator',
    createdAt: '2026-11-18T12:00:00.000Z',
    updatedAt: '2026-11-18T12:00:00.000Z',
    revision: 1,
  };
}
