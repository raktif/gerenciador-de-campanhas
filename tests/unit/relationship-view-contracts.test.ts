import { describe, expect, it } from 'vitest';
import {
  applyRelationshipAutoLayoutInputSchema,
  getRelationshipViewInputSchema,
  relationshipViewSchema,
  relationshipViewStateSchema,
  relationshipViewportSchema,
  resetRelationshipLayoutInputSchema,
  saveRelationshipNodePositionInputSchema,
  saveRelationshipViewportInputSchema,
} from '../../src/core/contracts/relationship-views';

const campaignId = '00000000-0000-4000-8000-000000000001';
const viewId = '00000000-0000-4000-8000-000000000002';
const entityId = '00000000-0000-4000-8000-000000000003';
const secondEntityId = '00000000-0000-4000-8000-000000000004';
const foreignViewId = '00000000-0000-4000-8000-000000000005';
const timestamp = '2026-11-11T12:00:00.000Z';
const viewport = { x: 10, y: -20, zoom: 1.25 };
const position = { entityId, x: 100, y: 200, width: 180, height: 64, pinned: false };

describe('contratos de visualização de Relações', () => {
  it('aceita uma visualização e seu estado persistido', () => {
    const view = relationshipViewSchema.parse({
      id: viewId,
      campaignId,
      name: 'Mapa principal',
      viewType: 'campaign',
      sourceEntityId: null,
      isDefault: true,
      viewport,
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 1,
    });

    expect(
      relationshipViewStateSchema.parse({
        view,
        nodes: [
          {
            relationshipViewId: viewId,
            ...position,
            updatedAt: timestamp,
          },
        ],
      }),
    ).toMatchObject({ view: { id: viewId }, nodes: [{ entityId }] });
  });

  it('rejeita nós de outra visualização e entidades duplicadas no estado agregado', () => {
    const view = relationshipViewSchema.parse({
      id: viewId,
      campaignId,
      name: 'Mapa principal',
      viewType: 'campaign',
      sourceEntityId: null,
      isDefault: true,
      viewport,
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 1,
    });
    const node = {
      relationshipViewId: viewId,
      ...position,
      updatedAt: timestamp,
    };

    expect(() =>
      relationshipViewStateSchema.parse({
        view,
        nodes: [{ ...node, relationshipViewId: foreignViewId }],
      }),
    ).toThrow(/mesma visualização/u);
    expect(() =>
      relationshipViewStateSchema.parse({
        view,
        nodes: [node, { ...node, x: 300 }],
      }),
    ).toThrow(/repetir entidades/u);
  });

  it('exige origem apenas para visualizações de vizinhança', () => {
    expect(() =>
      getRelationshipViewInputSchema.parse({
        campaignId,
        viewType: 'campaign',
        sourceEntityId: entityId,
      }),
    ).toThrow();
    expect(() =>
      getRelationshipViewInputSchema.parse({
        campaignId,
        viewType: 'neighborhood',
        sourceEntityId: null,
      }),
    ).toThrow();
    expect(
      getRelationshipViewInputSchema.parse({
        campaignId,
        viewType: 'neighborhood',
        sourceEntityId: entityId,
      }),
    ).toEqual({ campaignId, viewType: 'neighborhood', sourceEntityId: entityId });
  });

  it('rejeita propriedades desconhecidas e valores não finitos ou fora dos limites', () => {
    expect(() => relationshipViewportSchema.parse({ ...viewport, extra: true })).toThrow();
    expect(() => relationshipViewportSchema.parse({ x: Number.NaN, y: 0, zoom: 1 })).toThrow();
    expect(() => relationshipViewportSchema.parse({ x: 0, y: 0, zoom: 4.01 })).toThrow();
    expect(() =>
      saveRelationshipNodePositionInputSchema.parse({
        campaignId,
        relationshipViewId: viewId,
        revision: 1,
        position: { ...position, width: 4097 },
      }),
    ).toThrow();
    expect(() =>
      resetRelationshipLayoutInputSchema.parse({
        campaignId,
        relationshipViewId: viewId,
        revision: 1,
        unexpected: true,
      }),
    ).toThrow();
  });

  it('valida mutações estritas e impede entidades repetidas no auto-layout', () => {
    expect(
      saveRelationshipNodePositionInputSchema.parse({
        campaignId,
        relationshipViewId: viewId,
        revision: 1,
        position,
      }),
    ).toMatchObject({ position: { entityId } });
    expect(
      saveRelationshipViewportInputSchema.parse({
        campaignId,
        relationshipViewId: viewId,
        revision: 2,
        viewport,
      }),
    ).toMatchObject({ revision: 2, viewport });
    expect(() =>
      applyRelationshipAutoLayoutInputSchema.parse({
        campaignId,
        relationshipViewId: viewId,
        revision: 3,
        positions: [position, { ...position, x: 300 }],
        viewport,
      }),
    ).toThrow(/repetir entidades/u);
    expect(
      applyRelationshipAutoLayoutInputSchema.parse({
        campaignId,
        relationshipViewId: viewId,
        revision: 3,
        positions: [position, { ...position, entityId: secondEntityId, x: 300 }],
        viewport,
      }).positions,
    ).toHaveLength(2);
  });
});
