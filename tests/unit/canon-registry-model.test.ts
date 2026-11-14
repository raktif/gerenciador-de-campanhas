import { describe, expect, it, vi } from 'vitest';
import { assertionSchema } from '../../src/core/contracts/assertions';
import {
  choosePromotionTarget,
  canonRegistryCategoryFilter,
  canonRegistryCategoryOptions,
  createLatestRequestGate,
  createPossibilityPromotionRequest,
  promotePossibilityWhenConfirmed,
  registryAssertionText,
  registrySessionLabel,
  registrySourceLabel,
  registrySubjectLabel,
  requiresFreshPromotionConfirmation,
  shouldShowRegistryEmptyState,
} from '../../src/renderer/features/assertions/canon-registry-model';

const campaignId = '00000000-0000-4000-8000-000000000001';
const assertion = assertionSchema.parse({
  id: '50000000-0000-4000-8000-000000000001',
  campaignId,
  subjectEntityId: '30000000-0000-4000-8000-000000000001',
  predicate: null,
  objectEntityId: null,
  statement: 'Uma possibilidade.',
  value: null,
  canonState: 'accepted',
  knowledgeState: 'possibility',
  visibility: 'gm',
  originKind: 'manual',
  sourceId: null,
  createdAt: '2026-09-02T12:00:00.000Z',
  updatedAt: '2026-09-02T12:00:00.000Z',
  archivedAt: null,
  revision: 3,
});

describe('modelo do Registro de Cânone', () => {
  it('mapeia as seis naturezas e rascunhos aos estados existentes', () => {
    expect(canonRegistryCategoryOptions.map(({ label }) => label)).toEqual([
      'Fatos',
      'Rumores',
      'Suspeitas',
      'Segredos',
      'Possibilidades',
      'Refutados',
      'Rascunhos',
    ]);
    expect(canonRegistryCategoryFilter('fact')).toEqual({ knowledgeState: 'fact' });
    expect(canonRegistryCategoryFilter('rumor')).toEqual({ knowledgeState: 'rumor' });
    expect(canonRegistryCategoryFilter('suspicion')).toEqual({ knowledgeState: 'suspicion' });
    expect(canonRegistryCategoryFilter('secret')).toEqual({ knowledgeState: 'secret' });
    expect(canonRegistryCategoryFilter('possibility')).toEqual({ knowledgeState: 'possibility' });
    expect(canonRegistryCategoryFilter('disproved')).toEqual({ knowledgeState: 'disproved' });
    expect(canonRegistryCategoryFilter('drafts')).toEqual({ canonState: 'draft' });
    expect(canonRegistryCategoryFilter('')).toEqual({});
    expect(() => canonRegistryCategoryFilter('something-else')).toThrow();
  });

  it('não gera requisição quando a confirmação é cancelada', () => {
    expect(createPossibilityPromotionRequest(assertion, campaignId, false)).toBeNull();
    expect(createPossibilityPromotionRequest(assertion, campaignId, true)).toEqual({
      campaignId,
      id: assertion.id,
      revision: 3,
      confirmation: 'possibility-to-fact',
    });
    expect(
      createPossibilityPromotionRequest(
        { ...assertion, knowledgeState: 'rumor' },
        campaignId,
        true,
      ),
    ).toBeNull();
  });

  it('não executa mutação após cancelamento e só envia com confirmação explícita', async () => {
    const promote = vi.fn(() => Promise.resolve('promovida'));
    await expect(
      promotePossibilityWhenConfirmed(assertion, campaignId, false, promote),
    ).resolves.toBeNull();
    expect(promote).not.toHaveBeenCalled();

    await expect(
      promotePossibilityWhenConfirmed(assertion, campaignId, true, promote),
    ).resolves.toBe('promovida');
    expect(promote).toHaveBeenCalledWith({
      campaignId,
      id: assertion.id,
      revision: 3,
      confirmation: 'possibility-to-fact',
    });
  });

  it('mantém o alvo selecionado, com declaração e assunto inequívocos, até cancelar', () => {
    const second = assertionSchema.parse({
      ...assertion,
      id: '50000000-0000-4000-8000-000000000002',
      subjectEntityId: '30000000-0000-4000-8000-000000000002',
      statement: 'Uma segunda possibilidade.',
    });
    expect(choosePromotionTarget(null, assertion)).toBe(assertion);
    expect(choosePromotionTarget(assertion, second)).toBe(assertion);
    expect(choosePromotionTarget(null, second)).toBe(second);
  });

  it('produz rótulos legíveis sem UUIDs para assunto arquivado e proveniência', () => {
    const sourcedSessionAssertion = {
      ...assertion,
      sourceId: '60000000-0000-4000-8000-000000000001',
      originKind: 'session' as const,
    };
    const metadata = {
      subjectName: 'A Sentinela',
      subjectArchived: true,
      objectName: 'Ponte Velha',
      objectArchived: true,
      sourceDescription: 'Relato registrado',
      sessionTitle: 'Sessão de observação',
    };
    expect(registrySubjectLabel(metadata)).toBe('A Sentinela (arquivada)');
    expect(registrySubjectLabel(undefined)).toBe('Assunto indisponível');
    expect(
      registryAssertionText(
        {
          ...assertion,
          statement: null,
          predicate: 'vigia',
          objectEntityId: '30000000-0000-4000-8000-000000000003',
        },
        metadata,
      ),
    ).toBe('A Sentinela (arquivada) vigia Ponte Velha (arquivada)');
    expect(
      registryAssertionText(
        {
          ...assertion,
          statement: null,
          predicate: 'vigia',
          objectEntityId: '30000000-0000-4000-8000-000000000003',
        },
        undefined,
      ),
    ).toBe('Assunto indisponível vigia Entidade relacionada indisponível');
    expect(registrySourceLabel(sourcedSessionAssertion, metadata, 'Sessão')).toBe(
      'Relato registrado',
    );
    expect(registrySourceLabel(sourcedSessionAssertion, undefined, 'Sessão')).toBe(
      'Sessão — descrição da fonte indisponível',
    );
    expect(registrySessionLabel(sourcedSessionAssertion, metadata)).toBe('Sessão de observação');
    expect(registrySessionLabel(sourcedSessionAssertion, undefined)).toBe(
      'Título da sessão indisponível',
    );
    const labels = [
      registrySubjectLabel(metadata),
      registrySourceLabel(sourcedSessionAssertion, metadata, 'Sessão'),
      registrySourceLabel(sourcedSessionAssertion, undefined, 'Sessão'),
      registrySessionLabel(sourcedSessionAssertion, metadata),
      registrySessionLabel(sourcedSessionAssertion, undefined),
    ];
    expect(labels.join(' ')).not.toContain(sourcedSessionAssertion.sourceId);
    expect(labels.join(' ')).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/);
  });

  it('não confunde erro de carregamento com lista vazia e permite estado recuperável', () => {
    expect(shouldShowRegistryEmptyState({ loading: false, hasError: true, itemCount: 0 })).toBe(
      false,
    );
    expect(shouldShowRegistryEmptyState({ loading: false, hasError: false, itemCount: 0 })).toBe(
      true,
    );
    expect(shouldShowRegistryEmptyState({ loading: true, hasError: false, itemCount: 0 })).toBe(
      false,
    );
    expect(shouldShowRegistryEmptyState({ loading: false, hasError: false, itemCount: 1 })).toBe(
      false,
    );
  });

  it('ignora respostas de carregamento obsoletas resolvidas fora de ordem', async () => {
    const gate = createLatestRequestGate();
    const state = { category: '', items: [] as string[] };
    const deferred = <T>(): {
      promise: Promise<T>;
      resolve: (value: T) => void;
    } => {
      let resolve: (value: T) => void = () => {
        throw new Error('Promise ainda não inicializada.');
      };
      const promise = new Promise<T>((complete) => {
        resolve = complete;
      });
      return { promise, resolve };
    };
    const firstRequest = gate.begin();
    const firstResponse = deferred<{ category: string; items: string[] }>();
    const secondRequest = gate.begin();
    const secondResponse = deferred<{ category: string; items: string[] }>();

    const applyResponse = async (
      requestId: number,
      response: Promise<{ category: string; items: string[] }>,
    ): Promise<void> => {
      const result = await response;
      if (!gate.isCurrent(requestId)) return;
      state.category = result.category;
      state.items = result.items;
    };
    const firstLoad = applyResponse(firstRequest, firstResponse.promise);
    const secondLoad = applyResponse(secondRequest, secondResponse.promise);
    secondResponse.resolve({ category: 'fact', items: ['atual'] });
    await secondLoad;
    firstResponse.resolve({ category: 'possibility', items: ['antiga'] });
    await firstLoad;
    expect(state).toEqual({ category: 'fact', items: ['atual'] });
  });

  it('exige nova confirmação depois de conflito de revisão', () => {
    expect(requiresFreshPromotionConfirmation('REVISION_CONFLICT')).toBe(true);
    expect(requiresFreshPromotionConfirmation('INVALID_ASSERTION_STATE')).toBe(false);
  });
});
