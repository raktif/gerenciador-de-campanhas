import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NarrativeMetadataFields } from '../../src/renderer/features/narrative/narrative-metadata-fields';

describe('ajuda contextual dos metadados narrativos', () => {
  it('oferece ajuda acessível para os estados narrativos compartilhados', () => {
    const markup = renderToStaticMarkup(
      <NarrativeMetadataFields
        disabled={false}
        onChange={() => undefined}
        values={{
          canonState: 'accepted',
          knowledgeState: 'fact',
          visibility: 'gm',
          originKind: 'manual',
          sourceId: null,
        }}
      />,
    );

    for (const label of [
      'Estado canônico',
      'Natureza do conhecimento',
      'Visibilidade',
      'Origem',
    ]) {
      expect(markup).toContain(`Ajuda sobre ${label}`);
    }
    expect(markup).toContain('Distingue fatos confirmados de rumores');
    expect(markup).toContain('Escolha a visibilidade com cuidado');
  });

  it('inclui ajuda para selecionar a sessão de origem sem exibir identificadores técnicos', () => {
    const markup = renderToStaticMarkup(
      <NarrativeMetadataFields
        disabled={false}
        onChange={() => undefined}
        sessionSource={{
          available: true,
          onChange: () => undefined,
          options: [
            {
              id: '10000000-0000-4000-8000-000000000001',
              label: 'Sessão 12 — A Mina de Kabotya',
            },
          ],
          value: '10000000-0000-4000-8000-000000000001',
        }}
        values={{
          canonState: 'accepted',
          knowledgeState: 'fact',
          visibility: 'gm',
          originKind: 'session',
          sourceId: '10000000-0000-4000-8000-000000000001',
        }}
      />,
    );

    expect(markup).toContain('Ajuda sobre Sessão de origem');
    expect(markup).toContain('Vincula o registro ao acontecimento de jogo');
    expect(markup).toContain('Sessão 12 — A Mina de Kabotya');
    expect(markup).not.toContain('UUID da fonte');
  });
});
