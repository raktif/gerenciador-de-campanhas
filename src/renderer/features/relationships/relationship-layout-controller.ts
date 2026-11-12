import type {
  RelationshipNodePosition,
  RelationshipViewGateway,
  RelationshipViewState,
  RelationshipViewport,
} from '../../../core/contracts/relationship-views';

export type RelationshipLayoutOperation =
  | { kind: 'node'; position: RelationshipNodePosition }
  | { kind: 'viewport'; viewport: RelationshipViewport }
  | {
      kind: 'auto-layout';
      positions: RelationshipNodePosition[];
      viewport: RelationshipViewport;
    }
  | { kind: 'reset' };

export type RelationshipLayoutPersistenceStatus =
  | { phase: 'idle'; message: '' }
  | { phase: 'saving'; message: 'Salvando layout…' }
  | { phase: 'saved'; message: 'Layout salvo.' }
  | { phase: 'error'; message: 'Não foi possível salvar o layout. Tente novamente.' }
  | {
      phase: 'conflict';
      message: 'O layout mudou em outra operação. A versão mais recente foi carregada; confira antes de tentar novamente.';
    };

export const idleRelationshipLayoutStatus: RelationshipLayoutPersistenceStatus = {
  phase: 'idle',
  message: '',
};

interface RelationshipLayoutControllerDependencies {
  campaignId: string;
  gateway: RelationshipViewGateway;
  getState: () => RelationshipViewState | null;
  onState: (state: RelationshipViewState) => void;
  onStatus: (status: RelationshipLayoutPersistenceStatus) => void;
}

export class RelationshipLayoutController {
  private queue: Promise<void> = Promise.resolve();
  private generation = 0;
  private pendingCount = 0;
  private retryOperation: RelationshipLayoutOperation | null = null;

  public constructor(private readonly dependencies: RelationshipLayoutControllerDependencies) {}

  public enqueue(operation: RelationshipLayoutOperation): Promise<boolean> {
    const generation = this.generation;
    this.pendingCount += 1;
    this.dependencies.onStatus({ phase: 'saving', message: 'Salvando layout…' });
    const task = this.queue.then(() => this.execute(operation, generation));
    const trackedTask = task.finally(() => {
      this.pendingCount -= 1;
    });
    this.queue = trackedTask.then(
      () => undefined,
      () => undefined,
    );
    return trackedTask;
  }

  public retry(): Promise<boolean> {
    const operation = this.retryOperation;
    if (operation === null) return Promise.resolve(false);
    this.retryOperation = null;
    return this.enqueue(operation);
  }

  public dispose(): void {
    this.generation += 1;
    this.retryOperation = null;
  }

  private async execute(
    operation: RelationshipLayoutOperation,
    generation: number,
  ): Promise<boolean> {
    if (generation !== this.generation) return false;
    const state = this.dependencies.getState();
    if (state === null) {
      this.setError(operation);
      return false;
    }

    try {
      const response = await this.perform(operation, state);
      if (generation !== this.generation) return false;
      if (response.ok) {
        this.retryOperation = null;
        this.dependencies.onState(response.data);
        this.dependencies.onStatus(
          this.pendingCount > 1
            ? { phase: 'saving', message: 'Salvando layout…' }
            : { phase: 'saved', message: 'Layout salvo.' },
        );
        return true;
      }
      if (response.error.code === 'REVISION_CONFLICT') {
        this.generation += 1;
        const conflictGeneration = this.generation;
        this.retryOperation = operation;
        let latest;
        try {
          latest = await this.dependencies.gateway.get({
            campaignId: this.dependencies.campaignId,
            viewType: 'campaign',
            sourceEntityId: null,
          });
        } catch {
          if (conflictGeneration === this.generation) this.setError(operation);
          return false;
        }
        if (conflictGeneration !== this.generation) return false;
        if (latest.ok) {
          this.dependencies.onState(latest.data);
          this.dependencies.onStatus({
            phase: 'conflict',
            message:
              'O layout mudou em outra operação. A versão mais recente foi carregada; confira antes de tentar novamente.',
          });
        } else this.setError(operation);
        return false;
      }
      this.setError(operation);
      return false;
    } catch {
      if (generation === this.generation) this.setError(operation);
      return false;
    }
  }

  private perform(operation: RelationshipLayoutOperation, state: RelationshipViewState) {
    const base = {
      campaignId: this.dependencies.campaignId,
      relationshipViewId: state.view.id,
      revision: state.view.revision,
    };
    switch (operation.kind) {
      case 'node':
        return this.dependencies.gateway.saveNodePosition({
          ...base,
          position: operation.position,
        });
      case 'viewport':
        return this.dependencies.gateway.saveViewport({ ...base, viewport: operation.viewport });
      case 'auto-layout':
        return this.dependencies.gateway.autoLayout({
          ...base,
          positions: operation.positions.map((position) => ({ ...position, pinned: false })),
          viewport: operation.viewport,
        });
      case 'reset':
        return this.dependencies.gateway.resetLayout(base);
    }
  }

  private setError(operation: RelationshipLayoutOperation): void {
    this.generation += 1;
    this.retryOperation = operation;
    this.dependencies.onStatus({
      phase: 'error',
      message: 'Não foi possível salvar o layout. Tente novamente.',
    });
  }
}
