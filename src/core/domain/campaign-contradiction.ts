import { createHash } from 'node:crypto';

export const potentialContradictionRuleVersion = 'potential-contradiction-v1';

export interface ContradictionAssertionInput {
  campaignId: string;
  id: string;
  subjectEntityId: string;
  subjectName: string;
  predicate: string | null;
  objectEntityId: string | null;
  objectName: string | null;
  statement: string | null;
  value: unknown;
  canonState: string;
  knowledgeState: string;
  archivedAt: string | null;
}

export interface PotentialContradictionDetection {
  campaignId: string;
  signalId: string;
  signalType: 'potential_contradiction';
  title: string;
  summary: string;
  priority: 'high';
  ruleVersion: typeof potentialContradictionRuleVersion;
  assertions: readonly [
    { id: string; role: string; description: string; subjectName: string },
    { id: string; role: string; description: string; subjectName: string },
  ];
}

export function detectPotentialContradictions(
  assertions: readonly ContradictionAssertionInput[],
): PotentialContradictionDetection[] {
  const eligible = assertions.filter(
    (assertion) =>
      assertion.canonState === 'accepted' &&
      assertion.archivedAt === null &&
      (assertion.knowledgeState === 'fact' || assertion.knowledgeState === 'disproved'),
  );
  const byContent = new Map<string, ContradictionAssertionInput[]>();
  for (const assertion of eligible) {
    const key = structuralContentKey(assertion);
    const group = byContent.get(key);
    if (group === undefined) byContent.set(key, [assertion]);
    else group.push(assertion);
  }

  const detections: PotentialContradictionDetection[] = [];
  for (const group of byContent.values()) {
    const facts = group.filter((assertion) => assertion.knowledgeState === 'fact');
    const disproved = group.filter((assertion) => assertion.knowledgeState === 'disproved');
    for (const fact of facts) {
      for (const rejected of disproved) {
        if (fact.campaignId !== rejected.campaignId) continue;
        const [first, second] =
          fact.id.localeCompare(rejected.id) <= 0 ? [fact, rejected] : [rejected, fact];
        const summary =
          'Duas afirmações aceitas sobre o mesmo assunto têm conteúdo estrutural idêntico, ' +
          'mas naturezas diferentes (fato e refutado). Este aviso não identifica qual está errada.';
        detections.push({
          campaignId: fact.campaignId,
          signalId: stableContradictionSignalId(fact.campaignId, first.id, second.id),
          signalType: 'potential_contradiction',
          title: `Possível contradição: ${fact.subjectName}`,
          summary,
          priority: 'high',
          ruleVersion: potentialContradictionRuleVersion,
          assertions: [
            {
              id: first.id,
              role: `Afirmação aceita marcada como ${first.knowledgeState === 'fact' ? 'fato' : 'refutada'}`,
              description: assertionDescription(first),
              subjectName: first.subjectName,
            },
            {
              id: second.id,
              role: `Afirmação aceita marcada como ${second.knowledgeState === 'fact' ? 'fato' : 'refutada'}`,
              description: assertionDescription(second),
              subjectName: second.subjectName,
            },
          ],
        });
      }
    }
  }
  return detections.sort((left, right) => left.signalId.localeCompare(right.signalId));
}

function structuralContentKey(assertion: ContradictionAssertionInput): string {
  return JSON.stringify([
    assertion.campaignId,
    assertion.subjectEntityId,
    assertion.predicate,
    assertion.objectEntityId,
    canonicalJson(assertion.value),
    assertion.statement,
  ]);
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalJson(record[key])]),
    );
  }
  return value;
}

function assertionDescription(assertion: ContradictionAssertionInput): string {
  const parts: string[] = [];
  if (assertion.statement !== null) parts.push(assertion.statement);
  if (assertion.predicate !== null) parts.push(`Predicado: ${assertion.predicate}`);
  if (assertion.objectEntityId !== null)
    parts.push(`Objeto: ${assertion.objectName ?? 'entidade indisponível'}`);
  if (assertion.value !== null) parts.push(`Valor: ${JSON.stringify(assertion.value)}`);
  return parts.join('\n');
}

function stableContradictionSignalId(
  campaignId: string,
  firstAssertionId: string,
  secondAssertionId: string,
): string {
  const hash = createHash('sha256')
    .update(
      JSON.stringify([
        'campaign-signal',
        'potential_contradiction',
        campaignId,
        firstAssertionId,
        secondAssertionId,
      ]),
    )
    .digest();
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50;
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
