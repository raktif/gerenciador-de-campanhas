import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Panel,
  Position,
  ReactFlow,
  getViewportForBounds,
  useNodesState,
  type EdgeProps,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
  type Viewport,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type {
  RelationshipNodePosition,
  RelationshipViewport,
} from '../../../core/contracts/relationship-views';
import { Button, DialogActions, ToolbarActions } from '../../components/actions';
import type { RelationshipLayoutPersistenceStatus } from './relationship-layout-controller';
import {
  relationshipCanvasNodeHeight,
  relationshipCanvasNodeWidth,
  type RelationshipCanvasEdge,
  type RelationshipCanvasModel,
  type RelationshipCanvasNode,
  relationshipHandlesForNodes,
} from './relationship-canvas-model';

const canvasExtent: [[number, number], [number, number]] = [
  [-1_000_000, -1_000_000],
  [1_000_000, 1_000_000],
];
const keyboardMoveKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const nodeTypes = { relationshipNode: RelationshipEntityNode };
const edgeTypes = { relationshipLoop: RelationshipLoopEdge };

export const relationshipCanvasAriaLabels = {
  'node.a11yDescription.default':
    'Pressione Enter ou Espaço para selecionar a entidade. Use as setas para movê-la e Tab para navegar pelo mapa.',
  'node.a11yDescription.keyboardDisabled': 'Use Tab para navegar pelo mapa.',
  'node.a11yDescription.ariaLiveMessage': ({ x, y }: { x: number; y: number }) =>
    `Entidade na posição horizontal ${String(Math.round(x))}, vertical ${String(Math.round(y))}.`,
  'edge.a11yDescription.default':
    'Pressione Enter ou Espaço para selecionar a relação. Use Tab para navegar pelo mapa.',
  'controls.ariaLabel': 'Controles do mapa',
  'controls.zoomIn.ariaLabel': 'Ampliar mapa',
  'controls.zoomOut.ariaLabel': 'Reduzir mapa',
  'controls.fitView.ariaLabel': 'Enquadrar mapa',
  'controls.interactive.ariaLabel': 'Alternar interação com o mapa',
  'minimap.ariaLabel': 'Minimapa da vizinhança',
  'handle.ariaLabel': 'Ponto de conexão da entidade',
} as const;

export interface RelationshipCanvasProps {
  model: RelationshipCanvasModel;
  automaticModel: RelationshipCanvasModel;
  viewport: Viewport;
  persistenceAvailable: boolean;
  persistenceStatus: RelationshipLayoutPersistenceStatus;
  onSaveNodePosition: (position: RelationshipNodePosition) => Promise<boolean>;
  onSaveViewport: (viewport: RelationshipViewport) => Promise<boolean>;
  onAutoLayout: (
    positions: RelationshipNodePosition[],
    viewport: RelationshipViewport,
  ) => Promise<boolean>;
  onResetLayout: () => Promise<boolean>;
  onRetry: () => Promise<boolean>;
}

export function RelationshipCanvas({
  model,
  automaticModel,
  viewport,
  persistenceAvailable,
  persistenceStatus,
  onSaveNodePosition,
  onSaveViewport,
  onAutoLayout,
  onResetLayout,
  onRetry,
}: RelationshipCanvasProps): React.JSX.Element {
  const [nodes, setNodes, onNodesChange] = useNodesState<RelationshipCanvasNode>(model.nodes);
  const positionedEdges = useMemo(() => {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    return model.edges.map((edge) => {
      if (edge.data?.selfRelationship === true)
        return { ...edge, sourceHandle: 'source-right', targetHandle: 'target-top' };
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      return source === undefined || target === undefined
        ? edge
        : { ...edge, ...relationshipHandlesForNodes(source, target) };
    });
  }, [model.edges, nodes]);
  const [instance, setInstance] = useState<ReactFlowInstance<
    RelationshipCanvasNode,
    RelationshipCanvasEdge
  > | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const resetButtonRef = useRef<HTMLButtonElement>(null);
  const cancelResetRef = useRef<HTMLButtonElement>(null);
  const resetDialogRef = useRef<HTMLDivElement>(null);
  const suppressMoveEndRef = useRef(false);

  useEffect(() => {
    setNodes((current) => {
      const selectedById = new Map(current.map((node) => [node.id, node.selected === true]));
      return model.nodes.map((node) => ({ ...node, selected: selectedById.get(node.id) ?? false }));
    });
  }, [model.nodes, setNodes]);

  useEffect(() => {
    if (instance === null) return;
    suppressMoveEndRef.current = true;
    void instance.setViewport(viewport).finally(() => {
      suppressMoveEndRef.current = false;
    });
  }, [instance, viewport.x, viewport.y, viewport.zoom]);

  useEffect(() => {
    if (confirmReset) cancelResetRef.current?.focus();
  }, [confirmReset]);

  const saveNode = useCallback(
    (node: RelationshipCanvasNode) => {
      if (!persistenceAvailable) return;
      void onSaveNodePosition(toPersistedNodePosition(node, true));
    },
    [onSaveNodePosition, persistenceAvailable],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<RelationshipCanvasNode>[]) => {
      onNodesChange(changes);
    },
    [onNodesChange],
  );

  const handleKeyboardMoveEnd = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        !keyboardMoveKeys.has(event.key) ||
        !(event.target instanceof Element) ||
        event.target.closest('.react-flow__node') === null ||
        instance === null ||
        !persistenceAvailable
      )
        return;
      for (const node of instance.getNodes().filter((candidate) => candidate.selected === true))
        saveNode(node);
    },
    [instance, persistenceAvailable, saveNode],
  );

  const handleMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent | null, nextViewport: Viewport) => {
      if (suppressMoveEndRef.current || !persistenceAvailable) return;
      void onSaveViewport(nextViewport);
    },
    [onSaveViewport, persistenceAvailable],
  );

  const fitNodes = useCallback(
    (targetNodes: RelationshipCanvasNode[]) => {
      if (instance === null || targetNodes.length === 0) return;
      void instance.fitView({ nodes: targetNodes, padding: 0.25, maxZoom: 1.5, duration: 180 });
    },
    [instance],
  );

  const organizeAutomatically = useCallback(() => {
    if (instance === null || canvasRef.current === null || !persistenceAvailable) return;
    const bounds = instance.getNodesBounds(automaticModel.nodes);
    const { width, height } = canvasRef.current.getBoundingClientRect();
    const nextViewport = getViewportForBounds(bounds, width, height, 0.1, 4, 0.18);
    const positions = automaticModel.nodes.map((node) => toPersistedNodePosition(node));
    void onAutoLayout(positions, nextViewport);
  }, [automaticModel.nodes, instance, onAutoLayout, persistenceAvailable]);

  const closeResetDialog = useCallback(() => {
    setConfirmReset(false);
    requestAnimationFrame(() => resetButtonRef.current?.focus());
  }, []);

  const confirmLayoutReset = useCallback(async () => {
    setResetting(true);
    await onResetLayout();
    setResetting(false);
    closeResetDialog();
  }, [closeResetDialog, onResetLayout]);

  const busy = persistenceStatus.phase === 'saving';
  const canRetry = persistenceStatus.phase === 'error' || persistenceStatus.phase === 'conflict';

  return (
    <div
      aria-label="Mapa visual da vizinhança"
      className="relationship-canvas-shell"
      data-testid="relationship-canvas"
      role="region"
    >
      <div aria-hidden={confirmReset || undefined} inert={confirmReset || undefined}>
        <p className="sr-only" id="relationship-canvas-instructions">
          Use Tab para navegar pelo mapa. Pressione Enter ou Espaço para selecionar uma entidade ou
          relação. Entidades selecionadas podem ser movidas com as setas.
        </p>
        <div className="relationship-canvas" onKeyUp={handleKeyboardMoveEnd} ref={canvasRef}>
          <ReactFlow
            aria-describedby="relationship-canvas-instructions"
            aria-label="Entidades e relações da vizinhança"
            ariaLabelConfig={relationshipCanvasAriaLabels}
            defaultViewport={viewport}
            deleteKeyCode={null}
            edges={positionedEdges}
            edgesFocusable={false}
            edgesReconnectable={false}
            edgeTypes={edgeTypes}
            elementsSelectable
            maxZoom={4}
            minZoom={0.1}
            nodeExtent={canvasExtent}
            nodes={nodes}
            nodeTypes={nodeTypes}
            nodesConnectable={false}
            nodesDraggable={persistenceAvailable}
            nodesFocusable
            onInit={setInstance}
            onMoveEnd={handleMoveEnd}
            onNodeDragStop={(_event, node) => saveNode(node)}
            onNodesChange={handleNodesChange}
            panOnDrag={persistenceAvailable}
            preventScrolling
            proOptions={{ hideAttribution: true }}
            translateExtent={canvasExtent}
            zoomOnDoubleClick={persistenceAvailable}
            zoomOnPinch={persistenceAvailable}
            zoomOnScroll={persistenceAvailable}
          >
            <Panel className="relationship-canvas-toolbar nopan nowheel" position="top-left">
              <ToolbarActions aria-label="Ferramentas do mapa de relações">
                <Button
                  aria-label="Ampliar mapa"
                  disabled={!persistenceAvailable}
                  onClick={() => void instance?.zoomIn({ duration: 120 })}
                  size="small"
                >
                  Zoom +
                </Button>
                <Button
                  aria-label="Reduzir mapa"
                  disabled={!persistenceAvailable}
                  onClick={() => void instance?.zoomOut({ duration: 120 })}
                  size="small"
                >
                  Zoom −
                </Button>
                <Button
                  disabled={!persistenceAvailable}
                  onClick={() => {
                    const selected = instance?.getNodes().filter((node) => node.selected === true);
                    const root = instance?.getNodes().find((node) => node.data.central);
                    fitNodes(
                      selected !== undefined && selected.length > 0
                        ? selected
                        : root === undefined
                          ? []
                          : [root],
                    );
                  }}
                  size="small"
                >
                  Centralizar raiz/seleção
                </Button>
                <Button
                  disabled={!persistenceAvailable}
                  onClick={() => fitNodes(instance?.getNodes() ?? [])}
                  size="small"
                >
                  Enquadrar tudo
                </Button>
                <Button
                  busy={busy}
                  disabled={!persistenceAvailable}
                  onClick={organizeAutomatically}
                  size="small"
                >
                  Organizar automaticamente
                </Button>
                <Button
                  busy={resetting}
                  disabled={!persistenceAvailable || busy}
                  onClick={() => setConfirmReset(true)}
                  ref={resetButtonRef}
                  size="small"
                  variant="danger"
                >
                  Restaurar layout
                </Button>
              </ToolbarActions>
            </Panel>
          </ReactFlow>
        </div>
        {persistenceStatus.phase === 'idle' ? null : (
          <div className="relationship-canvas-status mt-3 flex flex-wrap items-center gap-3">
            <p
              aria-atomic="true"
              aria-live={persistenceStatus.phase === 'error' ? 'assertive' : 'polite'}
              className={`text-sm ${
                persistenceStatus.phase === 'error'
                  ? 'semantic-danger-text'
                  : persistenceStatus.phase === 'saved'
                    ? 'semantic-success-text'
                    : 'semantic-text-secondary'
              }`}
              role={persistenceStatus.phase === 'error' ? 'alert' : 'status'}
            >
              {persistenceStatus.message}
            </p>
            {canRetry ? (
              <Button onClick={() => void onRetry()} size="small">
                Tentar novamente
              </Button>
            ) : null}
          </div>
        )}
      </div>
      {confirmReset ? (
        <div className="fixed inset-0 z-60 grid place-items-center semantic-overlay p-4">
          <div
            aria-describedby="relationship-layout-reset-description"
            aria-labelledby="relationship-layout-reset-title"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl semantic-surface p-6"
            onKeyDown={(event) =>
              handleResetDialogKeyDown(event, resetDialogRef.current, closeResetDialog)
            }
            ref={resetDialogRef}
            role="alertdialog"
          >
            <h3 className="text-xl font-semibold" id="relationship-layout-reset-title">
              Restaurar o layout do mapa?
            </h3>
            <p className="mt-2 semantic-text-secondary" id="relationship-layout-reset-description">
              As posições e o enquadramento salvos serão removidos. As relações e entidades não
              serão alteradas.
            </p>
            <DialogActions className="mt-5">
              <Button disabled={resetting} onClick={closeResetDialog} ref={cancelResetRef}>
                Cancelar
              </Button>
              <Button busy={resetting} onClick={() => void confirmLayoutReset()} variant="danger">
                Confirmar restauração
              </Button>
            </DialogActions>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RelationshipLayoutUnavailableNotice({
  onRetry,
}: {
  onRetry: () => void;
}): React.JSX.Element {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <p aria-live="polite" className="text-sm semantic-text-secondary" role="status">
        Não foi possível carregar o layout salvo. A persistência está indisponível; o mapa usa uma
        organização automática temporária.
      </p>
      <Button onClick={onRetry} size="small">
        Tentar novamente
      </Button>
    </div>
  );
}

export function toPersistedNodePosition(
  node: RelationshipCanvasNode,
  pinned = node.data.pinned,
): RelationshipNodePosition {
  return {
    entityId: node.id,
    x: node.position.x,
    y: node.position.y,
    width: relationshipCanvasNodeWidth,
    height: relationshipCanvasNodeHeight,
    pinned,
  };
}

export function handleResetDialogKeyDown(
  event: React.KeyboardEvent,
  container: HTMLElement | null,
  onCancel: () => void,
): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    onCancel();
    return;
  }
  if (event.key !== 'Tab' || container === null) return;
  const focusable = [...container.querySelectorAll<HTMLElement>('button:not([disabled])')];
  const first = focusable[0];
  const last = focusable.at(-1);
  if (first === undefined || last === undefined) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function relationshipLoopLabelStyle(
  labelStyle: CSSProperties | undefined,
  labelX: number,
  labelY: number,
): CSSProperties {
  return {
    ...labelStyle,
    transform: `translate(-50%, -50%) translate(${String(labelX)}px,${String(labelY)}px)`,
  };
}

function RelationshipLoopEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  label,
  labelStyle,
  markerStart,
  markerEnd,
  style,
}: EdgeProps<RelationshipCanvasEdge>): React.JSX.Element {
  const topY = Math.min(sourceY, targetY) - 100;
  const edgePath = `M ${String(sourceX)} ${String(sourceY)} C ${String(sourceX + 82)} ${String(topY)}, ${String(targetX - 82)} ${String(topY)}, ${String(targetX)} ${String(targetY)}`;
  const labelX = (sourceX + targetX) / 2;
  const labelY = topY - 6;
  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        {...(markerEnd === undefined ? {} : { markerEnd })}
        {...(markerStart === undefined ? {} : { markerStart })}
        {...(style === undefined ? {} : { style })}
      />
      <EdgeLabelRenderer>
        <span
          className="relationship-canvas-loop-label nodrag nopan"
          style={relationshipLoopLabelStyle(labelStyle, labelX, labelY)}
        >
          {label}
        </span>
      </EdgeLabelRenderer>
    </>
  );
}

function RelationshipEntityNode({ data }: NodeProps<RelationshipCanvasNode>): React.JSX.Element {
  const handleStyle = { opacity: 0, width: 0, height: 0, border: 0 };
  const sides = [
    ['left', Position.Left],
    ['right', Position.Right],
    ['top', Position.Top],
    ['bottom', Position.Bottom],
  ] as const;
  return (
    <>
      {sides.flatMap(([side, position]) => [
        <Handle
          id={`source-${side}`}
          key={`source-${side}`}
          position={position}
          style={handleStyle}
          type="source"
        />,
        <Handle
          id={`target-${side}`}
          key={`target-${side}`}
          position={position}
          style={handleStyle}
          type="target"
        />,
      ])}
      <span>{data.label}</span>
    </>
  );
}
