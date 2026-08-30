import { describe, expect, it } from 'vitest';
import {
  toCampaignPatch,
  toCreateCampaignInput,
} from '../../src/renderer/features/campaigns/campaign-form';
import type { Campaign } from '../../src/core/contracts/campaigns';

describe('formulário de campanha', () => {
  it('remove espaços e omite campos opcionais vazios', () => {
    expect(
      toCreateCampaignInput({
        name: '  Ethéria  ',
        systemName: '  Sistema próprio  ',
        concept: '   ',
        genre: '',
        tone: '  aventura  ',
        summary: '',
        imagePath: '',
      }),
    ).toEqual({
      name: 'Ethéria',
      systemName: 'Sistema próprio',
      tone: 'aventura',
    });
  });

  it('gera somente as alterações feitas durante a edição', () => {
    expect(
      toCampaignPatch(
        {
          name: '  Ethéria revisada  ',
          systemName: '   ',
          concept: 'Uma rede ancestral.',
          genre: '',
          tone: '  esperança  ',
          summary: '',
          imagePath: '',
        },
        campaign,
      ),
    ).toEqual({
      name: 'Ethéria revisada',
      systemName: null,
      tone: 'esperança',
    });
  });

  it('não cria atualização quando nenhum valor mudou', () => {
    expect(
      toCampaignPatch(
        {
          name: campaign.name,
          systemName: campaign.systemName ?? '',
          concept: campaign.concept ?? '',
          genre: campaign.genre ?? '',
          tone: campaign.tone ?? '',
          summary: campaign.summary ?? '',
          imagePath: campaign.imagePath ?? '',
        },
        campaign,
      ),
    ).toBeNull();
  });
});

const campaign: Campaign = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ethéria',
  systemName: 'Sistema próprio',
  concept: 'Uma rede ancestral.',
  genre: null,
  tone: null,
  summary: null,
  imagePath: null,
  status: 'active',
  createdAt: '2026-08-28T12:00:00.000Z',
  updatedAt: '2026-08-28T12:00:00.000Z',
  archivedAt: null,
  revision: 1,
};
