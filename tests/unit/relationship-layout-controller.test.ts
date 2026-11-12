import { describe, expect, it, vi } from 'vitest';
import type {
  RelationshipNodePosition,
  RelationshipViewGateway,
  RelationshipViewState,
} from '../../src/core/contracts/relationship-views';
import { failure, success, type Result } from '../../src/core/contracts/result';
import {
  RelationshipLayoutController,
  type RelationshipLayoutPersistenceStatus,
} from '../../src/renderer/features/relationships/relationship-layout-controller';

const campaignId = '11111111-1111-4111-8111-111111111111';
const viewId = '22222222-2222-4222-8222-222222222222';
const entityId = '33333333-3333-4333-8333-333333333333';

describe('RelationshipLayoutController', () => {
  it('serializa mutações e usa a revisão devolvida pela operação anterior', async () => {
    const first = deferred<Result<RelationshipViewState>>();
    const saveNodePosition = vi
      .fn<RelationshipViewGateway['saveNodePosition']>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(success(state(3), 'request-2'));
    const context = createContext({ saveNodePosition });

    const firstSave = context.controller.enqueue({ kind: 'node', position: position(10, 20) });
    const secondSave = context.controller.enqueue({ kind: 'node', position: position(30, 40) });
    await Promise.resolve();

    expect(saveNodePosition).toHaveBeenCalledTimes(1);
    first.resolve(success(state(2), 'request-1'));
    await expect(firstSave).resolves.toBe(true);
    await expect(secondSave).resolves.toBe(true);
    expect(saveNodePosition.mock.calls.map(([input]) => input.revision)).toEqual([1, 2]);
    expect(context.status.at(-1)).toEqual({ phase: 'saved', message: 'Layout salvo.' });
  });

  it('recarrega conflito, descarta a fila antiga e só reaplica após retry explícito', async () => {
    const saveNodePosition = vi
      .fn<RelationshipViewGateway['saveNodePosition']>()
      .mockResolvedValueOnce(
        failure({ code: 'REVISION_CONFLICT', message: 'Revisão obsoleta.' }, 'request-1'),
      )
      .mockResolvedValueOnce(success(state(6), 'request-3'));
    const get = vi
      .fn<RelationshipViewGateway['get']>()
      .mockResolvedValue(success(state(5), 'request-2'));
    const context = createContext({ get, saveNodePosition });

    const conflicted = context.controller.enqueue({ kind: 'node', position: position(10, 20) });
    const queued = context.controller.enqueue({ kind: 'node', position: position(30, 40) });

    await expect(conflicted).resolves.toBe(false);
    await expect(queued).resolves.toBe(false);
    expect(saveNodePosition).toHaveBeenCalledTimes(1);
    expect(context.current.view.revision).toBe(5);
    expect(context.status.at(-1)?.phase).toBe('conflict');

    await expect(context.controller.retry()).resolves.toBe(true);
    expect(saveNodePosition).toHaveBeenCalledTimes(2);
    expect(saveNodePosition.mock.calls[1]?.[0]).toMatchObject({
      revision: 5,
      position: { x: 10, y: 20 },
    });
  });

  it('envia o auto-layout completo em lote com pins limpos e revisão corrente', async () => {
    const autoLayout = vi
      .fn<RelationshipViewGateway['autoLayout']>()
      .mockResolvedValue(success(state(2), 'request-auto'));
    const context = createContext({ autoLayout });
    const positions = [
      { ...position(48, 48), pinned: true },
      {
        ...position(352, 48, '44444444-4444-4444-8444-444444444444'),
        pinned: true,
      },
    ];
    const viewport = { x: 24, y: 16, zoom: 0.8 };

    await expect(
      context.controller.enqueue({ kind: 'auto-layout', positions, viewport }),
    ).resolves.toBe(true);

    expect(autoLayout).toHaveBeenCalledOnce();
    expect(autoLayout).toHaveBeenCalledWith({
      campaignId,
      relationshipViewId: viewId,
      revision: 1,
      positions: positions.map((item) => ({ ...item, pinned: false })),
      viewport,
    });
  });
});

function createContext(overrides: Partial<RelationshipViewGateway>): {
  controller: RelationshipLayoutController;
  current: RelationshipViewState;
  status: RelationshipLayoutPersistenceStatus[];
} {
  const status: RelationshipLayoutPersistenceStatus[] = [];
  let current = state(1);
  const gateway: RelationshipViewGateway = {
    get: vi.fn().mockResolvedValue(success(current, 'get')),
    saveNodePosition: vi.fn().mockResolvedValue(success(state(2), 'node')),
    saveViewport: vi.fn().mockResolvedValue(success(state(2), 'viewport')),
    autoLayout: vi.fn().mockResolvedValue(success(state(2), 'auto')),
    resetLayout: vi.fn().mockResolvedValue(success(state(2), 'reset')),
    ...overrides,
  };
  const context = {
    controller: undefined as unknown as RelationshipLayoutController,
    get current() {
      return current;
    },
    status,
  };
  context.controller = new RelationshipLayoutController({
    campaignId,
    gateway,
    getState: () => current,
    onState: (next) => {
      current = next;
    },
    onStatus: (next) => status.push(next),
  });
  return context;
}

function state(revision: number): RelationshipViewState {
  return {
    view: {
      id: viewId,
      campaignId,
      name: 'Mapa principal',
      viewType: 'campaign',
      sourceEntityId: null,
      isDefault: true,
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: '2026-11-11T12:00:00.000Z',
      updatedAt: '2026-11-11T12:00:00.000Z',
      revision,
    },
    nodes: [],
  };
}

function position(x: number, y: number, targetEntityId = entityId): RelationshipNodePosition {
  return { entityId: targetEntityId, x, y, width: 184, height: 64, pinned: false };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
