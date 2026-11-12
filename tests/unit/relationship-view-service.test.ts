import { describe, expect, it } from 'vitest';
import type {
  ApplyRelationshipAutoLayoutInput,
  RelationshipView,
  RelationshipViewState,
} from '../../src/core/contracts/relationship-views';
import { RelationshipViewService } from '../../src/main/services/relationship-view-service';

const ids = {
  campaign: '00000000-0000-4000-8000-000000000001',
  view: '00000000-0000-4000-8000-000000000002',
  entity: '00000000-0000-4000-8000-000000000003',
  foreignEntity: '00000000-0000-4000-8000-000000000004',
};
const now = '2026-11-11T12:00:00.000Z';

describe('RelationshipViewService', () => {
  it('cria a view padrão uma vez e reutiliza o estado existente', () => {
    const repository = new FakeRepository();
    const service = createService(repository);

    const created = service.get({
      campaignId: ids.campaign,
      viewType: 'campaign',
      sourceEntityId: null,
    });
    const existing = service.get({
      campaignId: ids.campaign,
      viewType: 'campaign',
      sourceEntityId: null,
    });

    expect(created).toEqual(existing);
    expect(repository.insertions).toBe(1);
    expect(created.view).toMatchObject({
      id: ids.view,
      campaignId: ids.campaign,
      name: 'Mapa principal',
      isDefault: true,
      revision: 1,
    });
  });

  it('valida campanha e entidade antes de persistir uma posição', () => {
    const repository = new FakeRepository();
    const service = createService(repository);
    service.get({ campaignId: ids.campaign, viewType: 'campaign', sourceEntityId: null });

    expect(() =>
      service.saveNodePosition({
        campaignId: ids.campaign,
        relationshipViewId: ids.view,
        revision: 1,
        position: {
          entityId: ids.foreignEntity,
          x: 10,
          y: 20,
          width: 180,
          height: 64,
          pinned: false,
        },
      }),
    ).toThrow(/não foi encontrada nesta campanha/u);
    expect(repository.positionSaves).toBe(0);
  });

  it('valida todas as entidades antes de aplicar o lote de auto-layout', () => {
    const repository = new FakeRepository();
    const service = createService(repository);
    service.get({ campaignId: ids.campaign, viewType: 'campaign', sourceEntityId: null });
    const input: ApplyRelationshipAutoLayoutInput = {
      campaignId: ids.campaign,
      relationshipViewId: ids.view,
      revision: 1,
      positions: [
        { entityId: ids.entity, x: 0, y: 0, width: 180, height: 64, pinned: false },
        {
          entityId: ids.foreignEntity,
          x: 200,
          y: 0,
          width: 180,
          height: 64,
          pinned: false,
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    };

    expect(() => service.autoLayout(input)).toThrow(/não foi encontrada nesta campanha/u);
    expect(repository.autoLayouts).toBe(0);
  });
});

class FakeRepository {
  public state: RelationshipViewState | null = null;
  public insertions = 0;
  public positionSaves = 0;
  public autoLayouts = 0;

  public findDefault(): RelationshipViewState | null {
    return this.state;
  }
  public findById(): RelationshipViewState | null {
    return this.state;
  }
  public insertDefault(view: RelationshipView): RelationshipViewState {
    this.insertions += 1;
    this.state = { view, nodes: [] };
    return this.state;
  }
  public saveNodePosition(): RelationshipViewState {
    this.positionSaves += 1;
    return requiredState(this.state);
  }
  public saveViewport(): RelationshipViewState {
    return requiredState(this.state);
  }
  public applyAutoLayout(): RelationshipViewState {
    this.autoLayouts += 1;
    return requiredState(this.state);
  }
  public resetLayout(): RelationshipViewState {
    return requiredState(this.state);
  }
}

function createService(repository: FakeRepository): RelationshipViewService {
  return new RelationshipViewService({
    repository,
    campaigns: { findById: (id) => (id === ids.campaign ? ({ id } as never) : null) },
    entities: {
      findById: (campaignId, id) =>
        campaignId === ids.campaign && id === ids.entity ? ({ id } as never) : null,
    },
    createId: () => ids.view,
    now: () => new Date(now),
  });
}

function requiredState(state: RelationshipViewState | null): RelationshipViewState {
  if (state === null) throw new Error('Estado de teste ausente.');
  return state;
}
