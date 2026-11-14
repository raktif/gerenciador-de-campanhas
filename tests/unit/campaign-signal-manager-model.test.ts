import { describe, expect, it } from 'vitest';
import { signalListViewState } from '../../src/renderer/features/signals/signal-manager-model';

describe('estados visuais da lista de sinais', () => {
  it('distingue carregamento, erro sem dados, vazio confirmado e lista existente', () => {
    expect(signalListViewState(true, false, 0)).toBe('loading');
    expect(signalListViewState(false, true, 0)).toBe('error');
    expect(signalListViewState(false, false, 0)).toBe('empty');
    expect(signalListViewState(false, true, 1)).toBe('list');
  });
});
