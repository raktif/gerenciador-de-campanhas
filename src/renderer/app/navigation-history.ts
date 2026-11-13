export type NavigationSnapshot = Readonly<Record<string, unknown>>;
export type NavigationMode = 'push' | 'replace';
interface NavigationEntry {
  id: number;
  state: NavigationSnapshot;
}

export class NavigationHistory {
  private entries: NavigationEntry[] = [{ id: 0, state: {} }];
  private position = 0;
  private nextId = 1;
  private pending: { state: NavigationSnapshot; mode: NavigationMode } | null = null;
  private listeners = new Set<() => void>();
  private traversal = 0;
  public isRestoration = false;

  public constructor(
    private readonly onCommit: (id: number, mode: NavigationMode) => void = () => undefined,
  ) {}

  public readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public readonly getTraversal = (): number => this.traversal;
  public readonly getIsRestoration = (): boolean => this.isRestoration;

  public get currentId(): number {
    return this.currentEntry.id;
  }

  private get currentEntry(): NavigationEntry {
    const entry = this.entries[this.position];
    if (entry === undefined) throw new Error('Invalid navigation history position.');
    return entry;
  }

  public get canGoBack(): boolean {
    return this.position > 0;
  }

  public get canGoForward(): boolean {
    return this.position < this.entries.length - 1;
  }

  public get previousState(): NavigationSnapshot | undefined {
    return this.entries[this.position - 1]?.state;
  }

  public read<T>(key: string, initial: T): T {
    const state = this.pending?.state ?? this.currentEntry.state;
    if (Object.hasOwn(state, key)) return state[key] as T;
    this.writeState({ ...state, [key]: initial });
    return initial;
  }

  public update<T>(
    key: string,
    initial: T,
    value: T | ((current: T) => T),
    mode: NavigationMode = 'push',
  ): void {
    const current = this.read(key, initial);
    const next = typeof value === 'function' ? (value as (current: T) => T)(current) : value;
    if (Object.is(current, next)) return;
    this.change((state) => ({ ...state, [key]: next }), mode);
  }

  public resetPages(mode: NavigationMode = 'push'): void {
    this.change((state) => ({ app: state.app }), mode);
  }

  public restore(id: number): boolean {
    this.flush();
    const position = this.entries.findIndex((entry) => entry.id === id);
    if (position < 0) return false;
    if (position === this.position) return true;
    this.position = position;
    this.traversal += 1;
    this.isRestoration = true;
    this.notify();
    return true;
  }

  public discardCurrentAndForward(): boolean {
    this.flush();
    if (!this.canGoBack) return false;
    this.entries = this.entries.slice(0, this.position);
    this.position -= 1;
    this.traversal += 1;
    this.isRestoration = true;
    this.notify();
    return true;
  }

  public back(): void {
    this.flush();
    const entry = this.entries[this.position - 1];
    if (entry !== undefined) this.restore(entry.id);
  }

  public forward(): void {
    this.flush();
    const entry = this.entries[this.position + 1];
    if (entry !== undefined) this.restore(entry.id);
  }

  public flush(): void {
    if (this.pending === null) return;
    const { state, mode } = this.pending;
    this.pending = null;
    if (mode === 'push') {
      this.isRestoration = false;
      this.entries = this.entries.slice(0, this.position + 1);
      this.entries.push({ id: this.nextId++, state });
      this.position += 1;
    } else {
      this.entries[this.position] = { id: this.currentId, state };
    }
    this.onCommit(this.currentId, mode);
    this.notify();
  }

  private change(
    update: (state: NavigationSnapshot) => NavigationSnapshot,
    mode: NavigationMode,
  ): void {
    const state = update(this.pending?.state ?? this.currentEntry.state);
    const alreadyPending = this.pending !== null;
    this.pending = {
      state,
      mode: mode === 'push' || this.pending?.mode === 'push' ? 'push' : 'replace',
    };
    // One user transition can update both the view and its selected record.
    if (!alreadyPending) queueMicrotask(() => this.flush());
  }

  private writeState(state: NavigationSnapshot): void {
    if (this.pending !== null) this.pending.state = state;
    else this.entries[this.position] = { id: this.currentId, state };
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
