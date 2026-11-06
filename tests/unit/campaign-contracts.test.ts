import { describe, expect, it } from 'vitest';
import {
  campaignSchema,
  campaignLifecycleInputSchema,
  campaignPageRequestSchema,
  createCampaignInputSchema,
  updateCampaignInputSchema,
} from '../../src/core/contracts/campaigns';
import { defaultPageLimit, maximumPageLimit } from '../../src/core/contracts/pagination';

describe('Contratos de campanhas', () => {
  it('aceita criação somente com nome e remove espaços externos', () => {
    expect(createCampaignInputSchema.parse({ name: '  Ethéria  ' })).toEqual({
      name: 'Ethéria',
    });
  });

  it('rejeita nome vazio e propriedades desconhecidas', () => {
    expect(createCampaignInputSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(createCampaignInputSchema.safeParse({ name: 'Ethéria', unexpected: true }).success).toBe(
      false,
    );
    expect(
      createCampaignInputSchema.safeParse({ name: 'Ethéria', imagePath: 'C:\\capa.png' }).success,
    ).toBe(false);
  });

  it('expõe somente a referência opaca da capa no registro público', () => {
    const campaign = {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Ethéria',
      systemName: null,
      concept: null,
      genre: null,
      tone: null,
      summary: null,
      coverAttachmentId: '00000000-0000-4000-8000-000000000002',
      status: 'active',
      createdAt: '2026-10-26T12:00:00.000Z',
      updatedAt: '2026-10-26T12:00:00.000Z',
      archivedAt: null,
      revision: 1,
    };

    expect(campaignSchema.parse(campaign)).toEqual(campaign);
    expect(campaignSchema.safeParse({ ...campaign, imagePath: 'legado.png' }).success).toBe(false);
  });

  it('aplica paginação padrão e limita páginas a cem itens', () => {
    expect(campaignPageRequestSchema.parse({})).toEqual({
      limit: defaultPageLimit,
      filters: { statuses: ['active'] },
      sort: 'updatedAt',
      order: 'desc',
    });
    expect(campaignPageRequestSchema.safeParse({ limit: maximumPageLimit + 1 }).success).toBe(
      false,
    );
  });

  it('exige revisão positiva e ao menos uma alteração', () => {
    const base = {
      id: '00000000-0000-4000-8000-000000000001',
      revision: 1,
    };

    expect(updateCampaignInputSchema.safeParse({ ...base, patch: {} }).success).toBe(false);
    expect(updateCampaignInputSchema.parse({ ...base, patch: { summary: null } })).toEqual({
      ...base,
      patch: { summary: null },
    });
    expect(
      updateCampaignInputSchema.safeParse({ ...base, patch: { status: 'archived' } }).success,
    ).toBe(false);
    expect(campaignLifecycleInputSchema.parse(base)).toEqual(base);
  });
});
