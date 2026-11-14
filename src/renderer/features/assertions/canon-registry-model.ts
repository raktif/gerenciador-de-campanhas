import type {
  Assertion,
  PromoteAssertionPossibilityInput,
} from '../../../core/contracts/assertions';
import type { AssertionPageRequest } from '../../../core/contracts/assertions';

export const canonRegistryCategoryOptions = [
  { value: 'fact', label: 'Fatos' },
  { value: 'rumor', label: 'Rumores' },
  { value: 'suspicion', label: 'Suspeitas' },
  { value: 'secret', label: 'Segredos' },
  { value: 'possibility', label: 'Possibilidades' },
  { value: 'disproved', label: 'Refutados' },
  { value: 'drafts', label: 'Rascunhos' },
] as const;

export type CanonRegistryCategory = (typeof canonRegistryCategoryOptions)[number]['value'];
export type CanonRegistryCategoryFilter = Pick<
  AssertionPageRequest['filters'],
  'canonState' | 'knowledgeState'
>;

export interface CanonRegistrySourceMetadata {
  subjectName: string | null;
  subjectArchived: boolean;
  objectName: string | null;
  objectArchived: boolean;
  sourceDescription: string | null;
  sessionTitle: string | null;
}

export function createLatestRequestGate(): {
  begin: () => number;
  isCurrent: (requestId: number) => boolean;
} {
  let latestRequestId = 0;
  return {
    begin: () => {
      latestRequestId += 1;
      return latestRequestId;
    },
    isCurrent: (requestId) => requestId === latestRequestId,
  };
}

export function shouldShowRegistryEmptyState({
  loading,
  hasError,
  itemCount,
}: {
  loading: boolean;
  hasError: boolean;
  itemCount: number;
}): boolean {
  return !loading && !hasError && itemCount === 0;
}

export function registrySubjectLabel(metadata: CanonRegistrySourceMetadata | undefined): string {
  if (metadata?.subjectName === null || metadata?.subjectName === undefined)
    return 'Assunto indisponível';
  return metadata.subjectArchived ? `${metadata.subjectName} (arquivada)` : metadata.subjectName;
}

export function registryAssertionText(
  assertion: Assertion,
  metadata: CanonRegistrySourceMetadata | undefined,
): string {
  if (assertion.statement !== null) return assertion.statement;
  const subject =
    metadata?.subjectName === null || metadata?.subjectName === undefined
      ? 'Assunto indisponível'
      : metadata.subjectArchived
        ? `${metadata.subjectName} (arquivada)`
        : metadata.subjectName;
  const object =
    assertion.objectEntityId === null
      ? assertion.value === null
        ? ''
        : JSON.stringify(assertion.value)
      : metadata?.objectName === null || metadata?.objectName === undefined
        ? 'Entidade relacionada indisponível'
        : metadata.objectArchived
          ? `${metadata.objectName} (arquivada)`
          : metadata.objectName;
  return `${subject} ${assertion.predicate ?? ''} ${object}`.trim();
}

export function registrySourceLabel(
  assertion: Assertion,
  metadata: CanonRegistrySourceMetadata | undefined,
  originLabel: string,
): string {
  if (assertion.sourceId === null) return 'Sem fonte vinculada';
  if (metadata?.sourceDescription !== null && metadata?.sourceDescription !== undefined)
    return metadata.sourceDescription;
  return `${originLabel} — descrição da fonte indisponível`;
}

export function registrySessionLabel(
  assertion: Assertion,
  metadata: CanonRegistrySourceMetadata | undefined,
): string {
  if (assertion.originKind !== 'session') return 'Não se aplica';
  return metadata?.sessionTitle ?? 'Título da sessão indisponível';
}

export function choosePromotionTarget(
  current: Assertion | null,
  candidate: Assertion,
): Assertion | null {
  return current ?? candidate;
}

export function requiresFreshPromotionConfirmation(errorCode: string): boolean {
  return errorCode === 'REVISION_CONFLICT';
}

const knowledgeStateByCategory: Record<
  Exclude<CanonRegistryCategory, 'drafts'>,
  Assertion['knowledgeState']
> = {
  fact: 'fact',
  rumor: 'rumor',
  suspicion: 'suspicion',
  secret: 'secret',
  possibility: 'possibility',
  disproved: 'disproved',
};

export function canonRegistryCategoryFilter(category: string): CanonRegistryCategoryFilter {
  if (category === '') return {};
  if (category === 'drafts') return { canonState: 'draft' };
  if (!Object.hasOwn(knowledgeStateByCategory, category))
    throw new Error('Categoria de cânone desconhecida.');
  const knowledgeState =
    knowledgeStateByCategory[category as keyof typeof knowledgeStateByCategory];
  return { knowledgeState };
}

export function createPossibilityPromotionRequest(
  assertion: Assertion,
  campaignId: string,
  confirmed: boolean,
): PromoteAssertionPossibilityInput | null {
  if (!confirmed || assertion.knowledgeState !== 'possibility') return null;
  return {
    campaignId,
    id: assertion.id,
    revision: assertion.revision,
    confirmation: 'possibility-to-fact',
  };
}

export async function promotePossibilityWhenConfirmed<T>(
  assertion: Assertion,
  campaignId: string,
  confirmed: boolean,
  promote: (input: PromoteAssertionPossibilityInput) => Promise<T>,
): Promise<T | null> {
  const request = createPossibilityPromotionRequest(assertion, campaignId, confirmed);
  return request === null ? null : promote(request);
}
