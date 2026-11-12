import { Graph, layout } from '@dagrejs/dagre';
import { MarkerType, Position, type Edge, type Node } from '@xyflow/react';
import type { RelationshipType } from '../../../core/contracts/relationship-types';
import type { RelationshipViewNode } from '../../../core/contracts/relationship-views';
import type { RelationshipNeighborhoodResult } from '../../../core/contracts/relationships';

export const relationshipCanvasNodeWidth = 184;
export const relationshipCanvasNodeHeight = 64;
const safeRelationshipColorPattern = /^#[0-9A-Fa-f]{6}$/;

export type RelationshipCanvasNode = Node<
  {
    label: string;
    fullLabel: string;
    central: boolean;
    pinned: boolean;
  },
  'default'
>;

export type RelationshipCanvasEdge = Edge<
  { selfRelationship: boolean; color: string },
  'default' | 'relationshipLoop'
>;

export interface RelationshipCanvasModel {
  nodes: RelationshipCanvasNode[];
  edges: RelationshipCanvasEdge[];
}

export function createRelationshipCanvasModel(
  result: RelationshipNeighborhoodResult,
  types: RelationshipType[],
  savedNodes: RelationshipViewNode[],
): RelationshipCanvasModel {
  return createModel(result, types, savedNodes);
}

export function createRelationshipAutoLayoutModel(
  result: RelationshipNeighborhoodResult,
  types: RelationshipType[],
): RelationshipCanvasModel {
  return createModel(result, types, []);
}

function createModel(
  result: RelationshipNeighborhoodResult,
  types: RelationshipType[],
  savedNodes: RelationshipViewNode[],
): RelationshipCanvasModel {
  const graph = new Graph({ multigraph: true })
    .setGraph({ rankdir: 'LR', ranksep: 120, nodesep: 56, marginx: 48, marginy: 48 })
    .setDefaultEdgeLabel(() => ({}));
  const resultNodeIds = new Set(result.nodes.map((node) => node.entity.id));
  const typeById = new Map(types.map((type) => [type.id, type]));
  const savedNodeByEntityId = new Map(savedNodes.map((node) => [node.entityId, node]));

  for (const node of [...result.nodes].sort((left, right) =>
    left.entity.id.localeCompare(right.entity.id),
  ))
    graph.setNode(node.entity.id, {
      width: relationshipCanvasNodeWidth,
      height: relationshipCanvasNodeHeight,
    });
  for (const relationship of [...result.relationships].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    if (
      resultNodeIds.has(relationship.sourceEntityId) &&
      resultNodeIds.has(relationship.targetEntityId)
    )
      graph.setEdge(relationship.sourceEntityId, relationship.targetEntityId, {}, relationship.id);
  }
  layout(graph);

  const nodes = result.nodes.map<RelationshipCanvasNode>((node) => {
    const automaticPosition = graph.node(node.entity.id) as { x: number; y: number };
    const savedNode = savedNodeByEntityId.get(node.entity.id);
    const savedPosition = savedNode === undefined ? undefined : { x: savedNode.x, y: savedNode.y };
    const position =
      savedPosition ??
      ({
        x: automaticPosition.x - relationshipCanvasNodeWidth / 2,
        y: automaticPosition.y - relationshipCanvasNodeHeight / 2,
      } satisfies { x: number; y: number });
    const central = node.depth === 0;
    return {
      id: node.entity.id,
      type: 'default',
      position,
      width: relationshipCanvasNodeWidth,
      height: relationshipCanvasNodeHeight,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      connectable: false,
      deletable: false,
      selectable: true,
      focusable: true,
      ariaLabel: `${central ? 'Entidade central' : 'Entidade'}: ${node.entity.name}`,
      className: central ? 'relationship-canvas-node is-central' : 'relationship-canvas-node',
      data: {
        label: truncateRelationshipCanvasLabel(node.entity.name),
        fullLabel: node.entity.name,
        central,
        pinned: savedNode?.pinned ?? false,
      },
    };
  });

  const edges = result.relationships.flatMap<RelationshipCanvasEdge>((relationship, index) => {
    if (
      !resultNodeIds.has(relationship.sourceEntityId) ||
      !resultNodeIds.has(relationship.targetEntityId)
    )
      return [];
    const type = typeById.get(relationship.relationshipTypeId);
    const symmetric = type?.isSymmetric === true;
    const selfRelationship = relationship.sourceEntityId === relationship.targetEntityId;
    const color = resolveRelationshipEdgeColor(type?.color);
    const marker = { type: MarkerType.ArrowClosed, color, width: 18, height: 18 };
    const sourceName = result.nodes.find((node) => node.entity.id === relationship.sourceEntityId)
      ?.entity.name;
    const targetName = result.nodes.find((node) => node.entity.id === relationship.targetEntityId)
      ?.entity.name;
    const typeName = type?.name ?? 'Relação';
    return [
      {
        id: relationship.id,
        source: relationship.sourceEntityId,
        target: relationship.targetEntityId,
        type: selfRelationship ? 'relationshipLoop' : 'default',
        label: typeName,
        ariaLabel: `${sourceName ?? 'Entidade'} — ${typeName} ${symmetric ? '—' : '→'} ${targetName ?? 'Entidade'}`,
        focusable: false,
        selectable: false,
        deletable: false,
        reconnectable: false,
        domAttributes: {
          'data-testid': 'neighborhood-graph-edge',
        } as NonNullable<RelationshipCanvasEdge['domAttributes']>,
        ...(symmetric ? { markerStart: marker } : {}),
        markerEnd: marker,
        style: { stroke: color, strokeWidth: 2 },
        labelStyle: { color, fill: color, fontWeight: 600 },
        labelBgStyle: { fill: 'var(--surface)' },
        labelBgPadding: [6, 4],
        labelBgBorderRadius: 4,
        ...(!selfRelationship ? { pathOptions: { curvature: 0.22 + (index % 3) * 0.05 } } : {}),
        data: { selfRelationship, color },
      },
    ];
  });

  return { nodes, edges };
}

export function truncateRelationshipCanvasLabel(label: string): string {
  return label.length > 24 ? `${label.slice(0, 23)}…` : label;
}

export function resolveRelationshipEdgeColor(color: string | null | undefined): string {
  return color !== null && color !== undefined && safeRelationshipColorPattern.test(color)
    ? color
    : 'var(--accent)';
}
