import { describe, expect, it, vi } from 'vitest';
import { NavigationHistory } from '../../src/renderer/app/navigation-history';

describe('NavigationHistory', () => {
  it('restores the immediately preceding internal page and its record', () => {
    const history = new NavigationHistory();
    history.read('app', 'entities');
    history.read('view', 'list');
    history.read<string | null>('entity', null);
    history.update('entity', null, 'gorel', 'replace');
    history.update('view', 'list', 'details');
    history.flush();
    history.update('view', 'list', 'edit');
    history.flush();

    history.back();
    expect(history.read('view', '')).toBe('details');
    expect(history.read('entity', '')).toBe('gorel');
    history.back();
    expect(history.read('view', '')).toBe('list');
    expect(history.read('entity', '')).toBeNull();
    history.forward();
    expect(history.read('view', '')).toBe('details');
    history.forward();
    expect(history.read('view', '')).toBe('edit');
  });

  it('groups related setters into one history entry', async () => {
    const commit = vi.fn();
    const history = new NavigationHistory(commit);
    history.read('view', 'list');
    history.update('view', 'list', 'edit');
    history.update('record', null, 'session-1', 'replace');
    await Promise.resolve();
    expect(commit).toHaveBeenCalledTimes(1);
    history.back();
    expect(history.read('view', '')).toBe('list');
    expect(history.canGoBack).toBe(false);
  });

  it('drops forward entries after navigating to another page', () => {
    const history = new NavigationHistory();
    history.read('view', 'list');
    history.update('view', '', 'details');
    history.flush();
    history.update('view', '', 'edit');
    history.flush();
    const discardedId = history.currentId;
    history.back();
    history.update('view', '', 'create');
    history.flush();
    expect(history.canGoForward).toBe(false);
    history.restore(discardedId);
    expect(history.read('view', '')).toBe('create');
  });

  it('does not record data refreshes, filters, or unchanged views as pages', () => {
    const commit = vi.fn();
    const history = new NavigationHistory(commit);
    history.read('view', 'list');
    history.update('view', '', 'list');
    history.update('filter', '', 'archived', 'replace');
    history.flush();
    expect(commit).toHaveBeenCalledWith(0, 'replace');
    expect(history.canGoBack).toBe(false);
    expect(history.read('filter', '')).toBe('archived');
  });

  it('preserves the source page when opening a different module', () => {
    const history = new NavigationHistory();
    history.read('app', 'entities');
    history.read('details', 'gorel');
    history.update('app', '', 'notes', 'replace');
    history.resetPages();
    history.flush();
    expect(history.read('view', 'list')).toBe('list');
    history.back();
    expect(history.read('app', '')).toBe('entities');
    expect(history.read('details', '')).toBe('gorel');
    history.forward();
    expect(history.read('app', '')).toBe('notes');
  });

  it('bounds back/forward and leaves unknown browser entries untouched', () => {
    const history = new NavigationHistory();
    history.back();
    history.forward();
    history.restore(-1);
    expect(history.currentId).toBe(0);
    expect(history.getTraversal()).toBe(0);
  });

  it('removes a completed conversion and returns to its source without a duplicate page', () => {
    const history = new NavigationHistory();
    history.read('app', 'sessions');
    history.read('view', 'list');
    history.update('view', '', 'session-1');
    history.flush();
    history.update('app', '', 'conversion');
    history.flush();
    const conversionId = history.currentId;
    expect(history.discardCurrentAndForward()).toBe(true);
    expect(history.read('view', '')).toBe('session-1');
    expect(history.read('app', '')).toBe('sessions');
    expect(history.canGoForward).toBe(false);
    expect(history.restore(conversionId)).toBe(false);
    history.back();
    expect(history.read('view', '')).toBe('list');
  });

  it('refreshes only the current page without rewriting earlier snapshots', () => {
    const history = new NavigationHistory();
    history.read('record', { revision: 1 });
    history.update('view', 'list', 'edit');
    history.flush();
    history.update('record', { revision: 0 }, { revision: 2 }, 'replace');
    history.flush();
    expect(history.read('record', { revision: 0 }).revision).toBe(2);
    history.back();
    expect(history.read('record', { revision: 0 }).revision).toBe(1);
  });

  it('notifies subscribers after complete snapshots and on traversals', async () => {
    const history = new NavigationHistory();
    const listener = vi.fn();
    const unsubscribe = history.subscribe(listener);
    history.update('view', 'list', 'details');
    expect(listener).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);
    history.back();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    history.forward();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
