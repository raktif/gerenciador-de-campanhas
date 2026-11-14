import { describe, expect, it } from 'vitest';
import {
  campaignSignalCampaignInputSchema,
  campaignSignalListResultSchema,
  markContradictionExceptionInputSchema,
  reactivateCampaignSignalInputSchema,
  snoozeCampaignSignalInputSchema,
} from '../../src/core/contracts/campaign-signal-engine';

const campaignId = '00000000-0000-4000-8000-000000000001';
const id = '10000000-0000-4000-8000-000000000001';

describe('contratos de consulta e revisão dos sinais', () => {
  it('exige campanha e bloqueia propriedades ou identificadores inválidos', () => {
    expect(campaignSignalCampaignInputSchema.parse({ campaignId })).toEqual({ campaignId });
    expect(campaignSignalCampaignInputSchema.safeParse({ campaignId, id }).success).toBe(false);
    expect(campaignSignalCampaignInputSchema.safeParse({ campaignId: 'x' }).success).toBe(false);
    expect(
      reactivateCampaignSignalInputSchema.safeParse({ campaignId, id, revision: 1 }).success,
    ).toBe(true);
    expect(
      markContradictionExceptionInputSchema.safeParse({ campaignId, id, revision: 1 }).success,
    ).toBe(true);
    expect(
      reactivateCampaignSignalInputSchema.safeParse({ campaignId, id, revision: 1, extra: true })
        .success,
    ).toBe(false);
    expect(
      snoozeCampaignSignalInputSchema.safeParse({
        campaignId,
        id,
        revision: 1,
        dismissedUntil: '2026-11-15T14:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      snoozeCampaignSignalInputSchema.safeParse({
        campaignId,
        id,
        revision: 1,
        dismissedUntil: 'tomorrow',
      }).success,
    ).toBe(false);
  });

  it('não aceita resultado com ID técnico de evidência fora do contrato de apresentação', () => {
    const result = campaignSignalListResultSchema.safeParse({
      items: [
        {
          signal: {
            id,
            campaignId,
            signalType: 'explicit_need',
            title: 'Necessidade explícita: Gorel',
            summary: 'Entender os cabos',
            priority: 'high',
            status: 'new',
            generatedAt: '2026-11-14T14:00:00.000Z',
            lastDetectedAt: '2026-11-14T14:00:00.000Z',
            dismissedUntil: null,
            ruleVersion: 'explicit-need-v1',
            generatorKind: 'deterministic',
            createdAt: '2026-11-14T14:00:00.000Z',
            updatedAt: '2026-11-14T14:00:00.000Z',
            revision: 1,
          },
          evidence: [
            {
              objectType: 'entity',
              role: 'Necessidade explícita no campo “Necessidade”',
              description: 'Entender os cabos',
              objectName: 'Gorel',
              objectArchived: false,
              objectId: id,
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
