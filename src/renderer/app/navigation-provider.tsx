import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { NavigationHistory } from './navigation-history';
import type { Result } from '../../core/contracts/result';

const NavigationContext = createContext<NavigationHistory | null>(null);
const historyStateKey = '__campaignManagerNavigation';
const noSubscribe = (): (() => void) => () => undefined;
const initialTraversal = (): number => 0;
const noRestoration = (): boolean => false;

function readHistoryId(state: unknown): number | null {
  if (typeof state !== 'object' || state === null) return null;
  const id = (state as Record<string, unknown>)[historyStateKey];
  return typeof id === 'number' ? id : null;
}

export function NavigationProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [history] = useState(
    () =>
      new NavigationHistory((id, mode) => {
        const state = { [historyStateKey]: id };
        if (mode === 'push') window.history.pushState(state, '', window.location.href);
        else if (readHistoryId(window.history.state) === id)
          window.history.replaceState(state, '', window.location.href);
      }),
  );

  useEffect(() => {
    window.history.replaceState({ [historyStateKey]: history.currentId }, '', window.location.href);
    function onPopState(event: PopStateEvent): void {
      const id = readHistoryId(event.state);
      if (id !== null && !history.restore(id)) window.history.back();
    }
    function move(direction: 'back' | 'forward'): void {
      history.flush();
      if (direction === 'back' && history.canGoBack) window.history.back();
      if (direction === 'forward' && history.canGoForward) window.history.forward();
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
      )
        return;
      event.preventDefault();
      move(event.key === 'ArrowLeft' ? 'back' : 'forward');
    }
    function onAuxClick(event: MouseEvent): void {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      move(event.button === 3 ? 'back' : 'forward');
    }
    window.addEventListener('popstate', onPopState);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('auxclick', onAuxClick);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('auxclick', onAuxClick);
    };
  }, [history]);

  return <NavigationContext.Provider value={history}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationHistory | null {
  return useContext(NavigationContext);
}

export function useNavigationTraversal(): number {
  const history = useNavigation();
  return useSyncExternalStore(
    history?.subscribe ?? noSubscribe,
    history?.getTraversal ?? initialTraversal,
    initialTraversal,
  );
}

export function useNavigationRestoration(): boolean {
  const history = useNavigation();
  return useSyncExternalStore(
    history?.subscribe ?? noSubscribe,
    history?.getIsRestoration ?? noRestoration,
    noRestoration,
  );
}

export function useNavigationState<T>(
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>, Dispatch<SetStateAction<T>>] {
  const history = useNavigation();
  const [fallback, setFallback] = useState(initial);
  const [initialValue] = useState(() => fallback);
  const read = useCallback(
    () => (history === null ? fallback : history.read(key, initialValue)),
    [fallback, history, initialValue, key],
  );
  const value = useSyncExternalStore(history?.subscribe ?? noSubscribe, read, read);
  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      if (history === null) setFallback(next);
      else history.update(key, initialValue, next);
    },
    [history, initialValue, key],
  );
  const replace = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      if (history === null) setFallback(next);
      else history.update(key, initialValue, next, 'replace');
    },
    [history, initialValue, key],
  );
  return [value, set, replace];
}

export function useRestoredRecord<T>(
  id: string | undefined,
  load: (id: string) => Promise<Result<T>>,
  replace: (record: T) => void,
  onError: (error: unknown) => void,
  onBusy: (busy: boolean) => void,
): boolean {
  const traversal = useNavigationTraversal();
  const restoring = useNavigationRestoration();
  const [refreshing, setRefreshing] = useState(restoring && id !== undefined);
  const handlers = useRef({ load, replace, onError, onBusy });
  handlers.current = { load, replace, onError, onBusy };
  useEffect(() => {
    if (!restoring || id === undefined) return;
    let active = true;
    const current = handlers.current;
    setRefreshing(true);
    current.onBusy(true);
    void current
      .load(id)
      .then((result) => {
        if (!active) return;
        if (result.ok) current.replace(result.data);
        else current.onError(result.error);
      })
      .catch((error: unknown) => {
        if (active) current.onError(error);
      })
      .finally(() => {
        if (active) {
          current.onBusy(false);
          setRefreshing(false);
        }
      });
    return () => {
      active = false;
      current.onBusy(false);
      setRefreshing(false);
    };
  }, [id, restoring, traversal]);
  return refreshing;
}
