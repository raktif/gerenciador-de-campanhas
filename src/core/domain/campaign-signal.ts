import { createHash } from 'node:crypto';

export const explicitNeedRuleVersion = 'explicit-need-v1';

export interface ExplicitNeedInput {
  campaignId: string;
  entityId: string;
  entityName: string;
  fieldDefinitionId: string;
  fieldLabel: string;
  value: string;
}

export interface ExplicitNeedDetection extends ExplicitNeedInput {
  signalId: string;
  signalType: 'explicit_need';
  title: string;
  summary: string;
  priority: 'high';
  ruleVersion: typeof explicitNeedRuleVersion;
  evidenceRole: string;
  evidenceDescription: string;
}

export function detectExplicitNeeds(inputs: readonly ExplicitNeedInput[]): ExplicitNeedDetection[] {
  return inputs
    .filter((input) => input.value.trim().length > 0)
    .map((input) => {
      const value = input.value.trim().replaceAll('\0', '�');
      const evidenceRole = truncateCodePoints(
        `Necessidade explícita no campo “${input.fieldLabel.replaceAll('\0', '�')}”`,
        100,
      );
      const entityName = input.entityName.replaceAll('\0', '�');
      const evidenceDescription = truncateCodePoints(value, 2000);
      return {
        ...input,
        signalId: stableExplicitNeedSignalId(input),
        signalType: 'explicit_need',
        title: `Necessidade explícita: ${entityName}`,
        summary: value,
        priority: 'high',
        ruleVersion: explicitNeedRuleVersion,
        evidenceRole,
        evidenceDescription,
      };
    });
}

function truncateCodePoints(value: string, maximum: number): string {
  const points = Array.from(value);
  if (points.length <= maximum) return value;
  return `${points.slice(0, maximum - 1).join('')}…`;
}

export function stableExplicitNeedSignalId(
  input: Pick<ExplicitNeedInput, 'campaignId' | 'entityId' | 'fieldDefinitionId'>,
): string {
  const hash = createHash('sha256')
    .update(
      JSON.stringify([
        'campaign-signal',
        'explicit_need',
        input.campaignId,
        input.entityId,
        input.fieldDefinitionId,
      ]),
    )
    .digest();
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50;
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
