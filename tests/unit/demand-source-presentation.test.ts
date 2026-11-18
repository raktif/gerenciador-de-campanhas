import { describe, expect, it } from 'vitest';
import { formatDemandSourceSnapshot } from '../../src/renderer/features/demands/demand-manager';

describe('apresentação da fonte de Demandas', () => {
  it('traduz identificadores e rationale técnicos em snapshots antigos e atuais', () => {
    for (const rationale of [
      'Regra explicit-need-v1: campo “Necessidade” com papel Need preenchido.',
      'Necessidade explícita: o campo “Necessidade” está preenchido.',
    ]) {
      expect(
        formatDemandSourceSnapshot(
          JSON.stringify({
            entityName: 'Aris',
            fieldLabel: 'Necessidade',
            need: 'Recuperar a relíquia',
            rationale,
            signal: { rule_version: 'explicit-need-v1' },
            evidence: [
              {
                role: 'Necessidade explícita no campo “Necessidade”',
                description: 'Recuperar a relíquia',
              },
              { role: 'requester', description: 'Aris' },
            ],
          }),
        ),
      ).toEqual({
        sourceLabel: 'Aris — Necessidade',
        originLabel: 'Necessidade explícita',
        rationale:
          'Necessidade explícita: o campo “Necessidade” está preenchido. Nenhuma urgência, risco ou obstáculo foi inferido.',
        evidence: [{ role: 'Solicitante', description: 'Aris' }],
      });
    }
  });
});
