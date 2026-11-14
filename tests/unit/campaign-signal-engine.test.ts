import { describe, expect, it } from 'vitest';
import {
  explicitNeedRuleVersion,
  type ExplicitNeedInput,
} from '../../src/core/domain/campaign-signal';
import { detectExplicitNeeds } from '../../src/main/services/campaign-signal-engine';

const need: ExplicitNeedInput = {
  campaignId: '00000000-0000-4000-8000-000000000001',
  entityId: '10000000-0000-4000-8000-000000000001',
  entityName: 'Gorel',
  fieldDefinitionId: '20000000-0000-4000-8000-000000000001',
  fieldLabel: 'Necessidade',
  value: '  Entender os cabos da torre  ',
};

describe('motor determinístico de sinais', () => {
  it('detecta somente texto de necessidade preenchido e atribui prioridade Alta', () => {
    const detections = detectExplicitNeeds([
      need,
      { ...need, fieldDefinitionId: 'other', value: ' \t ' },
    ]);
    expect(detections).toHaveLength(1);
    expect(detections[0]).toMatchObject({
      ...need,
      signalType: 'explicit_need',
      title: 'Necessidade explícita: Gorel',
      summary: 'Entender os cabos da torre',
      priority: 'high',
      ruleVersion: explicitNeedRuleVersion,
      evidenceRole: 'Necessidade explícita no campo “Necessidade”',
      evidenceDescription: 'Entender os cabos da torre',
    });
    expect(detections[0]?.signalId).toMatch(
      /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){2}[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });

  it('mantém identidade para alteração do texto e separa campanhas, entidades e campos', () => {
    const original = detectExplicitNeeds([need])[0];
    const updated = detectExplicitNeeds([{ ...need, value: 'Entender a origem dos cabos' }])[0];
    const otherCampaign = detectExplicitNeeds([
      { ...need, campaignId: '00000000-0000-4000-8000-000000000002' },
    ])[0];
    const otherField = detectExplicitNeeds([
      { ...need, fieldDefinitionId: '20000000-0000-4000-8000-000000000002' },
    ])[0];

    expect(original?.signalId).toBe(updated?.signalId);
    expect(new Set([original?.signalId, otherCampaign?.signalId, otherField?.signalId]).size).toBe(
      3,
    );
    expect(updated?.summary).toBe('Entender a origem dos cabos');
  });

  it('respeita os limites da evidência sem truncar o resumo do sinal', () => {
    const longValue = `${'a'.repeat(2_100)}\0`;
    const detection = detectExplicitNeeds([
      { ...need, fieldLabel: 'N'.repeat(120), value: longValue },
    ])[0];
    expect(detection?.summary).toBe(`${'a'.repeat(2_100)}�`);
    expect(Array.from(detection?.evidenceRole ?? '').length).toBeLessThanOrEqual(100);
    expect(Array.from(detection?.evidenceDescription ?? '').length).toBe(2_000);
    expect(detection?.evidenceDescription).not.toContain('\0');
  });
});
