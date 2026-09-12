import { describe, expect, it } from 'vitest';
import {
  timelineCampaignRequestSchema,
  timelineEntityRequestSchema,
  timelinePageResultSchema,
} from '../../src/core/contracts/timeline';

const campaignId = '00000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';
const eventId = '60000000-0000-4000-8000-000000000001';
const timestamp = '2026-09-11T12:00:00.000Z';

describe('contratos de cronologia', () => {
  it('aplica pagina\u00e7\u00e3o segura e exclui eventos arquivados por padr\u00e3o', () => {
    expect(timelineCampaignRequestSchema.parse({ campaignId })).toEqual({
      campaignId,
      limit: 50,
      filters: { archived: false },
    });
    expect(timelineEntityRequestSchema.parse({ campaignId, entityId, limit: 100 })).toMatchObject({
      campaignId,
      entityId,
      limit: 100,
    });
  });

  it('rejeita campos desconhecidos, limites e resposta sem v\u00ednculos v\u00e1lidos', () => {
    expect(() => timelineCampaignRequestSchema.parse({ campaignId, limit: 101 })).toThrow();
    expect(() =>
      timelineEntityRequestSchema.parse({ campaignId, entityId, extra: true }),
    ).toThrow();
    expect(() =>
      timelinePageResultSchema.parse({
        items: [
          {
            event: { id: eventId, campaignId, createdAt: timestamp },
            sessionSequenceNumber: null,
            links: [],
          },
        ],
        nextCursor: null,
      }),
    ).toThrow();
  });
});
