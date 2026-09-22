import { describe, expect, it } from 'vitest';
import {
  beginCampaignLoad,
  createCampaignStartupFailure,
  initialCampaignLoadState,
  invalidateCampaignLoad,
  resolveCampaignLoad,
} from '../../src/renderer/app/campaign-startup';

describe('createCampaignStartupFailure', () => {
  it('preserva apenas códigos seguros no diagnóstico recuperável', () => {
    const failure = createCampaignStartupFailure({ code: 'DATABASE_UNAVAILABLE' });

    expect(failure).toMatchObject({
      code: 'DATABASE_UNAVAILABLE',
      title: 'Não foi possível carregar suas campanhas',
    });
    expect(failure.diagnostic).toMatchObject({
      operation: 'campaigns.list',
      code: 'DATABASE_UNAVAILABLE',
    });
  });

  it('descarta valores técnicos inseguros e usa um código estável', () => {
    const failure = createCampaignStartupFailure({
      code: 'Error: C:\\Users\\person\\AppData\\secret-token',
    });

    expect(failure.code).toBe('CAMPAIGN_LIST_UNAVAILABLE');
    expect(failure.diagnostic).toMatchObject({ code: 'CAMPAIGN_LIST_UNAVAILABLE' });
    expect(JSON.stringify(failure.diagnostic)).not.toContain('secret-token');
    expect(JSON.stringify(failure.diagnostic)).not.toContain('AppData');
  });

  it('trata uma rejeição sem payload como falha recuperável', () => {
    expect(createCampaignStartupFailure()).toMatchObject({
      code: 'CAMPAIGN_LIST_UNAVAILABLE',
      suggestedAction: expect.stringContaining('Tente novamente'),
    });
  });

  it('modela inicialização, falha, retry e conclusão bem-sucedida', () => {
    const loading = beginCampaignLoad(initialCampaignLoadState);
    const failed = resolveCampaignLoad(loading, loading.request, {
      ok: false,
      error: { code: 'DATABASE_UNAVAILABLE' },
    });
    const retrying = beginCampaignLoad(failed);
    const ready = resolveCampaignLoad(retrying, retrying.request, { ok: true });

    expect(loading.phase).toBe('loading-campaigns');
    expect(failed).toMatchObject({ phase: 'error', failure: { code: 'DATABASE_UNAVAILABLE' } });
    expect(retrying).toMatchObject({ phase: 'loading-campaigns', failure: null });
    expect(ready).toMatchObject({ phase: 'ready', failure: null });
  });

  it('ignora resposta obsoleta após retry ou invalidação de unmount', () => {
    const first = beginCampaignLoad(initialCampaignLoadState);
    const retry = beginCampaignLoad(first);
    const afterObsoleteResponse = resolveCampaignLoad(retry, first.request, { ok: true });
    const invalidated = invalidateCampaignLoad(retry);
    const afterUnmountResponse = resolveCampaignLoad(invalidated, retry.request, { ok: true });

    expect(afterObsoleteResponse).toBe(retry);
    expect(afterUnmountResponse).toBe(invalidated);
  });
});
