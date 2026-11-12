import type { Relationship } from '../../../core/contracts/relationships';

const canonStateLabels: Record<Relationship['canonState'], string> = {
  accepted: 'Aceito',
  archived: 'Arquivado',
  draft: 'Rascunho',
  rejected: 'Rejeitado',
};

const knowledgeStateLabels: Record<Relationship['knowledgeState'], string> = {
  disproved: 'Refutado',
  fact: 'Fato',
  possibility: 'Possibilidade',
  rumor: 'Rumor',
  secret: 'Segredo',
  suspicion: 'Suspeita',
};

const visibilityLabels: Record<Relationship['visibility'], string> = {
  gm: 'Somente mestre',
  players: 'Jogadores',
  public: 'Público',
};

export function relationshipMetadataSummary(
  relationship: Pick<Relationship, 'canonState' | 'knowledgeState' | 'visibility'>,
): string {
  return [
    canonStateLabels[relationship.canonState],
    knowledgeStateLabels[relationship.knowledgeState],
    visibilityLabels[relationship.visibility],
  ].join(' · ');
}
