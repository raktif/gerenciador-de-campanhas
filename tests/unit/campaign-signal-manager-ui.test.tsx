import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Campaign } from '../../src/core/contracts/campaigns';
import type { CampaignSignalReviewItem } from '../../src/core/contracts/campaign-signal-engine';
import type { CampaignSignal } from '../../src/core/contracts/campaign-signals';
import { CampaignNavigation } from '../../src/renderer/app/campaign-app';
import { SignalManager, SignalCard } from '../../src/renderer/features/signals/signal-manager';

describe('interface mínima de revisão de sinais', () => {
  it('inclui acesso à tela sem construir o painel futuro Mundo em Movimento', () => {
    const markup = renderToStaticMarkup(
      <CampaignNavigation
        campaign={campaign}
        onExit={() => undefined}
        onNavigate={() => undefined}
        screen="signals"
      />,
    );

    expect(markup).toContain('Sinais da campanha');
    expect(markup).toContain('aria-current="page"');
    expect(markup).not.toContain('Mundo em Movimento');
  });

  it('explica o escopo do motor e oferece recálculo sem expor IDs ou controles futuros', () => {
    const markup = renderToStaticMarkup(
      <SignalManager campaign={campaign} onOpenCanonRegistry={() => undefined} />,
    );

    expect(markup).toContain('Sinais da campanha');
    expect(markup).toContain('Recalcular sinais');
    expect(markup).toContain('pares de afirmações estruturalmente');
    expect(markup).toContain('nem alteram o cânone');
    expect(markup).not.toContain('convert-to-demand');
    expect(markup).not.toContain('campaignId');
    expect(markup).not.toContain('signalId');
  });

  it('exibe proveniência e controles compatíveis com o estado, sem ação de conversão', () => {
    const newSignal = renderToStaticMarkup(
      <SignalCard
        busy={false}
        item={item('new')}
        onAction={() => Promise.resolve()}
        onOpenCanonRegistry={() => undefined}
        onSnoozeUntilChange={() => undefined}
        snoozeUntil=""
      />,
    );
    expect(newSignal).toContain('Manter');
    expect(newSignal).toContain('Descartar');
    expect(newSignal).toContain('Adiar sinal');
    expect(newSignal).toContain('Gorel');
    expect(newSignal).toContain('Necessidade explícita no campo “Necessidade”');
    expect(newSignal).toContain('Última detecção:');
    expect(newSignal).not.toContain('10000000-0000-4000-8000-000000000001');
    expect(newSignal).not.toContain('convert-to-demand');

    const dismissedSignal = renderToStaticMarkup(
      <SignalCard
        busy={false}
        item={item('dismissed')}
        onAction={() => Promise.resolve()}
        onOpenCanonRegistry={() => undefined}
        onSnoozeUntilChange={() => undefined}
        snoozeUntil=""
      />,
    );
    expect(dismissedSignal).toContain('Reativar para revisão');
    expect(dismissedSignal).not.toContain('Manter');
  });

  it('apresenta ações reais do par no Registro de Cânone sem expor UUIDs', () => {
    const source = item('new');
    const contradiction: CampaignSignalReviewItem = {
      ...source,
      signal: {
        ...source.signal,
        signalType: 'potential_contradiction',
        title: 'Possível contradição: Gorel',
        summary:
          'Duas afirmações aceitas têm conteúdo estrutural idêntico, mas naturezas diferentes.',
        ruleVersion: 'potential-contradiction-v1',
      },
      evidence: [
        {
          objectType: 'assertion',
          role: 'Afirmação aceita marcada como fato',
          description: 'Gorel vive em Vau Negro.',
          objectName: 'Gorel',
          objectArchived: false,
        },
        {
          objectType: 'assertion',
          role: 'Afirmação aceita marcada como refutada',
          description: 'Gorel vive em Vau Negro.',
          objectName: 'Gorel',
          objectArchived: false,
        },
      ],
    };
    const markup = renderToStaticMarkup(
      <SignalCard
        busy={false}
        item={contradiction}
        onAction={() => Promise.resolve()}
        onOpenCanonRegistry={() => undefined}
        onSnoozeUntilChange={() => undefined}
        snoozeUntil=""
      />,
    );

    for (const action of ['Revisar', 'Manter', 'Marcar exceção', 'Corrigir', 'Descartar aviso'])
      expect(markup).toContain(action);
    expect(markup).toContain('Prioridade Alta');
    expect(markup).toContain('não uma conclusão sobre qual afirmação está errada');
    expect(markup).not.toContain('20000000-0000-4000-8000-000000000001');

    const staleMarkup = renderToStaticMarkup(
      <SignalCard
        busy={false}
        item={{ ...contradiction, signal: { ...contradiction.signal, status: 'stale' } }}
        onAction={() => Promise.resolve()}
        onOpenCanonRegistry={() => undefined}
        onSnoozeUntilChange={() => undefined}
        snoozeUntil=""
      />,
    );
    expect(staleMarkup).toContain('Este par não corresponde atualmente');
    expect(staleMarkup).not.toContain('Esta necessidade');
  });
});

const campaign: Campaign = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Ethéria',
  systemName: null,
  concept: null,
  genre: null,
  tone: null,
  summary: null,
  coverAttachmentId: null,
  status: 'active',
  createdAt: '2026-11-14T14:00:00.000Z',
  updatedAt: '2026-11-14T14:00:00.000Z',
  archivedAt: null,
  revision: 1,
};

function item(status: CampaignSignal['status']): CampaignSignalReviewItem {
  const timestamp = '2026-11-14T14:00:00.000Z';
  return {
    signal: {
      id: '10000000-0000-4000-8000-000000000001',
      campaignId: campaign.id,
      signalType: 'explicit_need',
      title: 'Necessidade explícita: Gorel',
      summary: 'Entender os cabos',
      priority: 'high',
      status,
      generatedAt: timestamp,
      lastDetectedAt: timestamp,
      dismissedUntil: null,
      ruleVersion: 'explicit-need-v1',
      generatorKind: 'deterministic',
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 1,
    },
    evidence: [
      {
        objectType: 'entity',
        role: 'Necessidade explícita no campo “Necessidade”',
        description: 'Entender os cabos',
        objectName: 'Gorel',
        objectArchived: false,
      },
    ],
  };
}
