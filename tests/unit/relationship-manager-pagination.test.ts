import { describe, expect, it, vi } from 'vitest';
import { collectPages } from '../../src/renderer/features/relationships/relationship-manager';

describe('collectPages', () => {
  it('percorre todos os cursores sem limitar a coleção à primeira página', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        data: { items: Array.from({ length: 100 }, (_, index) => index), nextCursor: 'page-2' },
        requestId: 'request-1',
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { items: Array.from({ length: 50 }, (_, index) => index + 100), nextCursor: null },
        requestId: 'request-2',
      });

    const items = await collectPages<number>(fetchPage);

    expect(items).toHaveLength(150);
    expect(fetchPage).toHaveBeenNthCalledWith(1, undefined);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 'page-2');
  });
});
