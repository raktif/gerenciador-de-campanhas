export type SignalListViewState = 'loading' | 'error' | 'empty' | 'list';

export function signalListViewState(
  loading: boolean,
  hasError: boolean,
  itemCount: number,
): SignalListViewState {
  if (loading) return 'loading';
  if (itemCount === 0) return hasError ? 'error' : 'empty';
  return 'list';
}
