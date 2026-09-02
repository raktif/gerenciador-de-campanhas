import { describe, expect, it } from 'vitest';
import {
  relationshipNeighborhoodInputSchema,
  relationshipPageRequestSchema,
} from '../../src/core/contracts/relationships';

const campaignId = '00000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';

describe('contratos de relações e vizinhança', () => {
  it('aplica profundidade e limites seguros por padrão', () => {
    expect(relationshipNeighborhoodInputSchema.parse({ campaignId, entityId })).toEqual({
      campaignId,
      entityId,
      depth: 1,
      maxEntities: 100,
      maxRelationships: 200,
      filters: {
        relationshipTypeIds: [],
        canonStates: [],
        knowledgeStates: [],
        visibilities: [],
      },
    });
  });

  it('rejeita profundidade acima de 3 e aceita filtros narrativos na lista', () => {
    expect(() =>
      relationshipNeighborhoodInputSchema.parse({ campaignId, entityId, depth: 4 }),
    ).toThrow();
    expect(
      relationshipPageRequestSchema.parse({
        campaignId,
        filters: {
          archived: false,
          canonState: 'accepted',
          knowledgeState: 'rumor',
          visibility: 'gm',
        },
      }),
    ).toMatchObject({
      filters: { canonState: 'accepted', knowledgeState: 'rumor', visibility: 'gm' },
    });
  });
});
