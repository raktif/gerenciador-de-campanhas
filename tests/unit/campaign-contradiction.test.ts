import { describe, expect, it } from 'vitest';
import {
  detectPotentialContradictions,
  potentialContradictionRuleVersion,
  type ContradictionAssertionInput,
} from '../../src/core/domain/campaign-contradiction';

const campaignId = '00000000-0000-4000-8000-000000000001';
const subjectEntityId = '10000000-0000-4000-8000-000000000001';

function assertion(
  id: string,
  knowledgeState: 'fact' | 'disproved',
  patch: Partial<ContradictionAssertionInput> = {},
): ContradictionAssertionInput {
  return {
    campaignId,
    id,
    subjectEntityId,
    subjectName: 'Gorel',
    predicate: 'vive_em',
    objectEntityId: null,
    objectName: null,
    statement: 'Gorel vive em Vau Negro.',
    value: { detalhes: ['uma', 2], valido: true },
    canonState: 'accepted',
    knowledgeState,
    archivedAt: null,
    ...patch,
  };
}

describe('detecção determinística conservadora de possível contradição', () => {
  it('detecta somente mesmo conteúdo estrutural aceito como fato e refutado', () => {
    const detected = detectPotentialContradictions([
      assertion('20000000-0000-4000-8000-000000000001', 'fact'),
      assertion('20000000-0000-4000-8000-000000000002', 'disproved'),
    ]);

    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({
      signalType: 'potential_contradiction',
      priority: 'high',
      ruleVersion: potentialContradictionRuleVersion,
      assertions: [
        { role: 'Afirmação aceita marcada como fato' },
        { role: 'Afirmação aceita marcada como refutada' },
      ],
    });
    expect(detected[0]?.signalId).toBe(
      detectPotentialContradictions([
        assertion('20000000-0000-4000-8000-000000000002', 'disproved'),
        assertion('20000000-0000-4000-8000-000000000001', 'fact'),
      ])[0]?.signalId,
    );
    expect(detected[0]?.summary).toContain('não identifica qual está errada');
  });

  it('compara todos os componentes e nulls estritamente sem inferir equivalência textual', () => {
    const fact = assertion('20000000-0000-4000-8000-000000000001', 'fact');
    const disprovedId = '20000000-0000-4000-8000-000000000002';
    const changes: Partial<ContradictionAssertionInput>[] = [
      { subjectEntityId: '10000000-0000-4000-8000-000000000002' },
      { predicate: 'VIVE_EM' },
      { objectEntityId: '10000000-0000-4000-8000-000000000003' },
      { statement: 'Gorel mora em Vau Negro.' },
      { value: { detalhes: ['uma', 2], valido: false } },
      { value: { detalhes: ['uma', 2, 3], valido: true } },
      { predicate: null },
      { statement: null },
      { objectEntityId: null, value: null },
    ];
    for (const patch of changes)
      expect(
        detectPotentialContradictions([fact, assertion(disprovedId, 'disproved', patch)]),
      ).toHaveLength(0);

    expect(
      detectPotentialContradictions([
        fact,
        assertion(disprovedId, 'disproved', {
          value: { valido: true, detalhes: ['uma', 2] },
        }),
      ]),
    ).toHaveLength(1);
  });

  it('não mistura campanhas, arquivadas, estados canônicos ou naturezas diferentes', () => {
    const baseFact = assertion('20000000-0000-4000-8000-000000000001', 'fact');
    const disprovedId = '20000000-0000-4000-8000-000000000002';
    const ineligible = [
      { campaignId: '00000000-0000-4000-8000-000000000002' },
      { archivedAt: '2026-11-14T14:00:00.000Z' },
      { canonState: 'draft' },
      { knowledgeState: 'rumor' },
    ] satisfies Partial<ContradictionAssertionInput>[];
    for (const patch of ineligible)
      expect(
        detectPotentialContradictions([baseFact, assertion(disprovedId, 'disproved', patch)]),
      ).toHaveLength(0);
  });

  it('emite todos os pares quando há múltiplas afirmações, com identidade por par', () => {
    const detections = detectPotentialContradictions([
      assertion('20000000-0000-4000-8000-000000000001', 'fact'),
      assertion('20000000-0000-4000-8000-000000000002', 'fact'),
      assertion('20000000-0000-4000-8000-000000000003', 'disproved'),
      assertion('20000000-0000-4000-8000-000000000004', 'disproved'),
    ]);
    expect(detections).toHaveLength(4);
    expect(new Set(detections.map(({ signalId }) => signalId)).size).toBe(4);
  });
});
