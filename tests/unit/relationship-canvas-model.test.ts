import { MarkerType } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import type { Entity } from '../../src/core/contracts/entities';
import type { RelationshipType } from '../../src/core/contracts/relationship-types';
import type { RelationshipViewNode } from '../../src/core/contracts/relationship-views';
import type {
  Relationship,
  RelationshipNeighborhoodResult,
} from '../../src/core/contracts/relationships';
import {
  createRelationshipAutoLayoutModel,
  createRelationshipCanvasModel,
  relationshipCanvasNodeHeight,
  relationshipCanvasNodeWidth,
} from '../../src/renderer/features/relationships/relationship-canvas-model';

const campaignId = '11111111-1111-4111-8111-111111111111';
const centralId = '22222222-2222-4222-8222-222222222222';
const targetId = '33333333-3333-4333-8333-333333333333';
const isolatedId = '44444444-4444-4444-8444-444444444444';
const directedTypeId = '55555555-5555-4555-8555-555555555555';
const symmetricTypeId = '66666666-6666-4666-8666-666666666666';
const viewId = '77777777-7777-4777-8777-777777777777';
const now = '2026-11-11T12:00:00.000Z';

describe('relationship canvas model', () => {
  it('maps the neighborhood, keeps isolated entities, and reuses saved positions', () => {
    const model = createRelationshipCanvasModel(neighborhood(), relationshipTypes(), [
      savedNode(centralId, 320, 180),
    ]);

    expect(model.nodes).toHaveLength(3);
    expect(model.nodes.map((node) => node.id)).toContain(isolatedId);
    expect(model.nodes.find((node) => node.id === centralId)).toMatchObject({
      position: { x: 320, y: 180 },
      width: relationshipCanvasNodeWidth,
      height: relationshipCanvasNodeHeight,
      connectable: false,
    });
    for (const node of model.nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    }
  });

  it('represents directed, symmetric, and self relationships with labels and markers', () => {
    const model = createRelationshipCanvasModel(neighborhood(), relationshipTypes(), []);
    const directed = model.edges.find((edge) => edge.id === relationshipId(1));
    const symmetric = model.edges.find((edge) => edge.id === relationshipId(2));
    const loop = model.edges.find((edge) => edge.id === relationshipId(3));

    expect(directed).toMatchObject({
      type: 'default',
      label: 'Protege',
      focusable: false,
      selectable: false,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#DC143C' },
      style: { stroke: '#DC143C' },
      labelStyle: { color: '#DC143C', fill: '#DC143C' },
    });
    expect(directed?.markerStart).toBeUndefined();
    expect(symmetric).toMatchObject({
      markerStart: { type: MarkerType.ArrowClosed, color: '#808000' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#808000' },
      style: { stroke: '#808000' },
      labelStyle: { color: '#808000', fill: '#808000' },
    });
    expect(loop).toMatchObject({
      type: 'relationshipLoop',
      data: { selfRelationship: true, color: '#DC143C' },
      style: { stroke: '#DC143C' },
      labelStyle: { color: '#DC143C', fill: '#DC143C' },
    });
  });

  it('usa token semântico quando o tipo não possui cor', () => {
    const typesWithoutColor = relationshipTypes().map((type) => ({ ...type, color: null }));
    const model = createRelationshipCanvasModel(neighborhood(), typesWithoutColor, []);

    expect(model.edges[0]).toMatchObject({
      markerEnd: { color: 'var(--accent)' },
      style: { stroke: 'var(--accent)' },
      labelStyle: { color: 'var(--accent)', fill: 'var(--accent)' },
    });
  });

  it('escolhe pontos centrais dos lados que minimizam o caminho da relação', () => {
    const horizontal = createRelationshipCanvasModel(neighborhood(), relationshipTypes(), [
      savedNode(centralId, 0, 0),
      savedNode(targetId, 500, 0),
    ]);
    const vertical = createRelationshipCanvasModel(neighborhood(), relationshipTypes(), [
      savedNode(centralId, 0, 0),
      savedNode(targetId, 0, 500),
    ]);

    expect(horizontal.edges.find((edge) => edge.id === relationshipId(1))).toMatchObject({
      sourceHandle: 'source-right',
      targetHandle: 'target-left',
    });
    expect(vertical.edges.find((edge) => edge.id === relationshipId(1))).toMatchObject({
      sourceHandle: 'source-bottom',
      targetHandle: 'target-top',
    });
  });

  it.each(['amber', 'url(javascript:alert(1))'])(
    'rejeita cor legada ou insegura %s no boundary visual',
    (unsafeColor) => {
      const typesWithUnsafeColor = relationshipTypes().map((type) => ({
        ...type,
        color: unsafeColor,
      }));
      const model = createRelationshipCanvasModel(neighborhood(), typesWithUnsafeColor, []);

      for (const edge of model.edges)
        expect(edge).toMatchObject({
          markerEnd: { color: 'var(--accent)' },
          style: { stroke: 'var(--accent)' },
          labelStyle: { color: 'var(--accent)', fill: 'var(--accent)' },
          data: { color: 'var(--accent)' },
        });
      expect(model.edges.find((edge) => edge.id === relationshipId(2))).toMatchObject({
        markerStart: { color: 'var(--accent)' },
      });
    },
  );

  it('reorganiza todos os nós visíveis, inclusive pinned, e limpa a fixação', () => {
    const before = [savedNode(centralId, 320, 180, true), savedNode(targetId, 900, 700, true)];
    const model = createRelationshipAutoLayoutModel(neighborhood(), relationshipTypes());

    for (const node of model.nodes) {
      expect(node.data.pinned).toBe(false);
      const previous = before.find((saved) => saved.entityId === node.id);
      if (previous !== undefined)
        expect(node.position).not.toEqual({ x: previous.x, y: previous.y });
    }
    expectNodesNotToOverlap(model.nodes);
  });

  it('produz posições determinísticas independentemente da ordem de entrada', () => {
    const original = neighborhood();
    const reordered: RelationshipNeighborhoodResult = {
      ...original,
      nodes: [...original.nodes].reverse(),
      relationships: [...original.relationships].reverse(),
    };

    const first = createRelationshipAutoLayoutModel(original, relationshipTypes());
    const second = createRelationshipAutoLayoutModel(reordered, relationshipTypes());
    const positions = (model: typeof first) =>
      Object.fromEntries(
        model.nodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }]),
      );

    expect(positions(second)).toEqual(positions(first));
  });
});

function neighborhood(): RelationshipNeighborhoodResult {
  return {
    rootEntityId: centralId,
    nodes: [
      {
        entity: entity(centralId, 'Aventureira'),
        depth: 0,
        pathEntityIds: [centralId],
        viaRelationshipId: null,
      },
      {
        entity: entity(targetId, 'Fortaleza'),
        depth: 1,
        pathEntityIds: [centralId, targetId],
        viaRelationshipId: relationshipId(1),
      },
      {
        entity: entity(isolatedId, 'Entidade isolada'),
        depth: 1,
        pathEntityIds: [centralId, isolatedId],
        viaRelationshipId: relationshipId(2),
      },
    ],
    relationships: [
      relationship(1, centralId, targetId, directedTypeId),
      relationship(2, centralId, isolatedId, symmetricTypeId),
      relationship(3, centralId, centralId, directedTypeId),
    ],
    truncated: false,
  };
}

function entity(id: string, name: string): Entity {
  return {
    id,
    campaignId,
    entityTypeId: '88888888-8888-4888-8888-888888888888',
    referenceImageAttachmentId: null,
    name,
    summary: null,
    canonState: 'accepted',
    knowledgeState: 'fact',
    visibility: 'gm',
    originKind: 'manual',
    sourceId: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    revision: 1,
  };
}

function relationship(
  index: number,
  sourceEntityId: string,
  targetEntityId: string,
  relationshipTypeId: string,
): Relationship {
  return {
    id: relationshipId(index),
    campaignId,
    relationshipTypeId,
    sourceEntityId,
    targetEntityId,
    description: null,
    strength: null,
    canonState: 'accepted',
    knowledgeState: 'fact',
    visibility: 'gm',
    originKind: 'manual',
    sourceId: null,
    validFromEventId: null,
    validToEventId: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    revision: 1,
  };
}

function relationshipTypes(): RelationshipType[] {
  return [
    relationshipType(directedTypeId, 'Protege', false, '#DC143C'),
    relationshipType(symmetricTypeId, 'Aliada', true, '#808000'),
  ];
}

function relationshipType(
  id: string,
  name: string,
  isSymmetric: boolean,
  color: string | null,
): RelationshipType {
  return {
    id,
    campaignId,
    packId: null,
    name,
    slug: name.toLocaleLowerCase('pt-BR'),
    inverseName: null,
    description: null,
    semanticRole: null,
    isSymmetric,
    allowedSourceTypeIds: null,
    allowedTargetTypeIds: null,
    icon: null,
    color,
    sortOrder: 0,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
    revision: 1,
  };
}

function savedNode(entityId: string, x: number, y: number, pinned = false): RelationshipViewNode {
  return {
    relationshipViewId: viewId,
    entityId,
    x,
    y,
    width: relationshipCanvasNodeWidth,
    height: relationshipCanvasNodeHeight,
    pinned,
    updatedAt: now,
  };
}

function relationshipId(index: number): string {
  return `99999999-9999-4999-8999-${String(index).padStart(12, '0')}`;
}

function expectNodesNotToOverlap(
  nodes: ReturnType<typeof createRelationshipAutoLayoutModel>['nodes'],
): void {
  nodes.forEach((node, index) => {
    for (const other of nodes.slice(index + 1)) {
      const separated =
        node.position.x + relationshipCanvasNodeWidth <= other.position.x ||
        other.position.x + relationshipCanvasNodeWidth <= node.position.x ||
        node.position.y + relationshipCanvasNodeHeight <= other.position.y ||
        other.position.y + relationshipCanvasNodeHeight <= node.position.y;
      expect(separated).toBe(true);
    }
  });
}
