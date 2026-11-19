import { describe, expect, it } from 'vitest';
import { createCausalLinkInputSchema, getCausalChainInputSchema } from '../../src/core/contracts/causality';

describe('contratos de causalidade', () => {
  it('aceita os nove tipos causais e aplica limites padrão da travessia', () => {
    const input = getCausalChainInputSchema.parse({ campaignId: crypto.randomUUID(), objectType: 'event', objectId: crypto.randomUUID() });
    expect(input).toMatchObject({ direction: 'outgoing', maxDepth: 8, maxNodes: 100 });
    for (const causalType of ['causes', 'contributes_to', 'enables', 'blocks', 'worsens', 'improves', 'transforms', 'resolves', 'reveals'] as const)
      expect(createCausalLinkInputSchema.safeParse({ campaignId: crypto.randomUUID(), sourceType: 'event', sourceId: crypto.randomUUID(), targetType: 'entity', targetId: crypto.randomUUID(), causalType }).success).toBe(true);
    for (const objectType of ['entity', 'relationship', 'assertion', 'note', 'event', 'session', 'clock', 'demand', 'story_thread'] as const)
      expect(createCausalLinkInputSchema.safeParse({ campaignId: crypto.randomUUID(), sourceType: objectType, sourceId: crypto.randomUUID(), targetType: 'entity', targetId: crypto.randomUUID(), causalType: 'causes' }).success).toBe(true);
  });
  it('rejeita auto referência e limites fora do contrato', () => {
    const id = crypto.randomUUID();
    expect(createCausalLinkInputSchema.safeParse({ campaignId: crypto.randomUUID(), sourceType: 'event', sourceId: id, targetType: 'event', targetId: id, causalType: 'causes' }).success).toBe(false);
    expect(getCausalChainInputSchema.safeParse({ campaignId: crypto.randomUUID(), objectType: 'event', objectId: crypto.randomUUID(), maxDepth: 21 }).success).toBe(false);
  });
});
