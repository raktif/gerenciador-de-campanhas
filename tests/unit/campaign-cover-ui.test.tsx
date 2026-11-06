import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Campaign } from '../../src/core/contracts/campaigns';
import {
  CampaignCoverManager,
  CampaignCoverPreview,
  ChoiceDialog,
  ConfirmationDialog,
} from '../../src/renderer/features/campaigns/campaign-cover';

describe('interface de capa da campanha', () => {
  it('exibe placeholder acessível enquanto não há preview público', () => {
    const html = renderToStaticMarkup(<CampaignCoverPreview campaign={campaign} />);

    expect(html).toContain('Campanha Ethéria sem imagem de capa');
    expect(html).toContain('Carregando capa');
    expect(html).not.toMatch(/sourceUrl|relativePath|storedFilename|https?:\/\//u);
  });

  it('oferece os três meios de entrada e comunica limites sem expor paths', () => {
    const html = renderToStaticMarkup(
      <CampaignCoverManager campaign={campaign} defaultOpen onCampaignChange={() => undefined} />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Selecionar arquivo');
    expect(html).toContain('Arraste e solte uma imagem aqui ou cole com Ctrl+V');
    expect(html).toContain('URL da imagem');
    expect(html).toContain('PNG, JPEG ou WebP, até 10 MB');
    expect(html).not.toMatch(/sourceUrl|relativePath|storedFilename|C:\\/u);
  });

  it('explica claramente resize, crop e cancelamento no modal oversize', () => {
    const html = renderToStaticMarkup(
      <ChoiceDialog busy={false} onCancel={() => undefined} onChoose={() => undefined} />,
    );

    expect(html).toContain('Como ajustar a imagem?');
    expect(html).toContain('Preserva a imagem inteira, sem cortes.');
    expect(html).toContain('Preenche o quadro e corta as bordas.');
    expect(html).toContain('Cancelar');
    expect(html).toContain('aria-modal="true"');
  });

  it.each([
    ['replace', 'Substituir a capa?', 'A imagem atual deixará de ser a capa.'],
    ['remove', 'Remover a capa?', 'A campanha voltará a exibir o placeholder.'],
  ] as const)('confirma a ação destrutiva %s', (kind, title, explanation) => {
    const html = renderToStaticMarkup(
      <ConfirmationDialog
        busy={false}
        kind={kind}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );

    expect(html).toContain(title);
    expect(html).toContain(explanation);
    expect(html).toContain('Cancelar');
    expect(html).toContain('Confirmar');
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
  createdAt: '2026-10-28T10:00:00.000Z',
  updatedAt: '2026-10-28T10:00:00.000Z',
  archivedAt: null,
  revision: 1,
};
