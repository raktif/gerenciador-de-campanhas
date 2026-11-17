import { describe, expect, it } from 'vitest';
import {
  createStoryThreadInputSchema,
  storyThreadStatuses,
  storyThreadTargetTypes,
  storyThreadTypes,
  updateStoryThreadInputSchema,
} from '../../src/core/contracts/story-threads';

const campaignId = '00000000-0000-4000-8000-000000000001';
const sessionId = '10000000-0000-4000-8000-000000000001';
const targetId = '20000000-0000-4000-8000-000000000001';

describe('contratos de Fios Abertos', () => {
  it('mantém exatamente os tipos, estados e categorias de alvo aprovados', () => {
    expect(storyThreadTypes).toEqual([
      'promise',
      'mystery',
      'clue',
      'threat',
      'relationship',
      'unanswered_question',
      'unfinished_goal',
      'ignored_demand',
      'custom',
    ]);
    expect(storyThreadStatuses).toEqual([
      'open',
      'active',
      'dormant',
      'resolved',
      'abandoned',
      'archived',
    ]);
    expect(storyThreadTargetTypes).toEqual([
      'entity',
      'relationship',
      'assertion',
      'note',
      'event',
      'session',
    ]);
  });

  it('aplica defaults, exige sessão para origem de sessão e rejeita categorias/tipos futuros', () => {
    expect(
      createStoryThreadInputSchema.parse({
        campaignId,
        title: '  Promessa  ',
        threadType: 'promise',
      }),
    ).toMatchObject({
      title: 'Promessa',
      originKind: 'manual',
      description: null,
      links: [],
    });
    expect(() =>
      createStoryThreadInputSchema.parse({
        campaignId,
        title: 'Origem sem sessão',
        threadType: 'custom',
        originKind: 'session',
      }),
    ).toThrow();
    expect(() =>
      createStoryThreadInputSchema.parse({
        campaignId,
        title: 'Alvo futuro',
        threadType: 'custom',
        links: [{ targetType: 'clock', targetId }],
      }),
    ).toThrow();
    expect(() =>
      createStoryThreadInputSchema.parse({
        campaignId,
        title: 'Tipo futuro',
        threadType: 'demand',
      }),
    ).toThrow();
  });

  it('rejeita vínculos duplicados, chaves extras e edições vazias', () => {
    expect(() =>
      createStoryThreadInputSchema.parse({
        campaignId,
        title: 'Duplicado',
        threadType: 'custom',
        links: [
          { targetType: 'entity', targetId },
          { targetType: 'entity', targetId },
        ],
      }),
    ).toThrow();
    expect(() =>
      createStoryThreadInputSchema.parse({
        campaignId,
        title: 'Estrito',
        threadType: 'custom',
        status: 'resolved',
      }),
    ).toThrow();
    expect(() =>
      updateStoryThreadInputSchema.parse({
        campaignId,
        id: targetId,
        revision: 1,
      }),
    ).toThrow();
    expect(
      createStoryThreadInputSchema.safeParse({
        campaignId,
        title: 'Origem válida',
        threadType: 'custom',
        originKind: 'session',
        sessionId,
      }).success,
    ).toBe(true);
  });
});
