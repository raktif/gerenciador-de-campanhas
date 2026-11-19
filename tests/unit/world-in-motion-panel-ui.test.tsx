import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Campaign } from '../../src/core/contracts/campaigns';
import type { CampaignSignalReviewItem } from '../../src/core/contracts/campaign-signal-engine';
import {
  WorldInMotionContent,
  WorldInMotionPanelView,
} from '../../src/renderer/features/world-in-motion/world-in-motion-panel';
import type { WorldInMotionModel } from '../../src/renderer/features/world-in-motion/world-in-motion-data';

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
  createdAt: '2026-11-18T12:00:00.000Z',
  updatedAt: '2026-11-18T12:00:00.000Z',
  archivedAt: null,
  revision: 1,
};

describe('interface do Painel Mundo em Movimento', () => {
  it('apresenta estado de carregamento acessível', () => {
    const markup = renderToStaticMarkup(
      <WorldInMotionPanelView
        campaign={campaign}
        onNavigate={() => undefined}
        onRetry={() => undefined}
        state={{ kind: 'loading' }}
      />,
    );
    expect(markup).toContain('role="status"');
    expect(markup).toContain('Carregando o contexto da campanha');
  });

  it('apresenta erro explícito e uma opção de retry', () => {
    const markup = renderToStaticMarkup(
      <WorldInMotionPanelView
        campaign={campaign}
        onNavigate={() => undefined}
        onRetry={() => undefined}
        state={{ kind: 'error' }}
      />,
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Nenhuma informação parcial será apresentada');
    expect(markup).toContain('Tentar novamente');
  });

  it('explicita categorias sem suporte, não sugere detecção por listas vazias e informa a limitação de proveniência', () => {
    const markup = renderToStaticMarkup(
      <WorldInMotionContent
        state={{ kind: 'ready', ...emptyModel() }}
        onNavigate={() => undefined}
      />,
    );
    expect(markup).toContain('Não há registros ativos nas categorias disponíveis');
    expect(markup).toContain('Consequências pendentes');
    expect(markup).toContain('Não disponível nesta versão');
    expect(markup).toContain('Mistérios sem detector');
    expect(markup).toContain('Mudanças desde a última sessão');
    expect(markup).toContain('Não inferimos mudanças a partir de datas de atualização');
  });

  it('explica a origem do sinal e encaminha para a tela existente sem ação de mutação', () => {
    const markup = renderToStaticMarkup(
      <WorldInMotionContent
        state={{ kind: 'ready', ...emptyModel(), signals: [signalItem] }}
        onNavigate={vi.fn()}
      />,
    );
    expect(markup).toContain('Por que estou vendo isto?');
    expect(markup).toContain('Necessidade no campo “Necessidade”');
    expect(markup).toContain('O item está registrado com estado Novo');
    expect(markup).toContain('Abrir Demandas emergentes');
    expect(markup).not.toContain('Aceitar sugestão');
  });

  it('aplica ao cartão a superfície elevada definida no tema', () => {
    const markup = renderToStaticMarkup(
      <WorldInMotionContent
        state={{ kind: 'ready', ...emptyModel(), signals: [signalItem] }}
        onNavigate={() => undefined}
      />,
    );
    const styles = readFileSync(new URL('../../src/renderer/styles.css', import.meta.url), 'utf8');
    expect(markup).toMatch(/<li class="[^"]*\bsemantic-surface-muted\b/);
    expect(styles).toMatch(
      /\.semantic-surface-muted,\s*\.semantic-skeleton\s*\{\s*background-color:\s*var\(--surface-elevated\);/,
    );
  });
});

function emptyModel(): WorldInMotionModel {
  return { signals: [], threads: [], clocks: [], demands: [] };
}

const signalItem: CampaignSignalReviewItem = {
  signal: {
    id: '10000000-0000-4000-8000-000000000001',
    campaignId: campaign.id,
    signalType: 'explicit_need',
    title: 'Necessidade explícita: Gorel',
    summary: 'Investigar os cabos encontrados.',
    priority: 'high',
    status: 'new',
    generatedAt: '2026-11-18T12:00:00.000Z',
    lastDetectedAt: '2026-11-18T12:00:00.000Z',
    dismissedUntil: null,
    ruleVersion: 'explicit-need-v1',
    generatorKind: 'deterministic',
    createdAt: '2026-11-18T12:00:00.000Z',
    updatedAt: '2026-11-18T12:00:00.000Z',
    revision: 1,
  },
  evidence: [
    {
      objectType: 'entity',
      role: 'Necessidade no campo “Necessidade”',
      description: 'Investigar os cabos encontrados.',
      objectName: 'Gorel',
      objectArchived: false,
    },
  ],
};
