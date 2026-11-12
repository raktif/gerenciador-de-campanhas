import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Relationship } from '../../src/core/contracts/relationships';
import { relationshipMetadataSummary } from '../../src/renderer/features/relationships/relationship-metadata-labels';
import { RelationshipTextAccordion } from '../../src/renderer/features/relationships/relationship-text-accordion';

describe('apresentação textual de relações', () => {
  it('renderiza a lista em accordion nativo inicialmente recolhido', () => {
    const markup = renderToStaticMarkup(
      <RelationshipTextAccordion>
        <ul>
          <li>Gorel — Conhece → Kabotya</li>
        </ul>
      </RelationshipTextAccordion>,
    );

    expect(markup).toContain('<details');
    expect(markup).not.toContain('<details open=""');
    expect(markup).toContain('<summary');
    expect(markup).toContain('Lista textual acessível');
    expect(markup).toContain('<ul>');
  });

  it.each<
    [Relationship['canonState'], Relationship['knowledgeState'], Relationship['visibility'], string]
  >([
    ['accepted', 'fact', 'gm', 'Aceito · Fato · Somente mestre'],
    ['archived', 'disproved', 'players', 'Arquivado · Refutado · Jogadores'],
    ['draft', 'possibility', 'public', 'Rascunho · Possibilidade · Público'],
    ['rejected', 'rumor', 'gm', 'Rejeitado · Rumor · Somente mestre'],
    ['accepted', 'secret', 'players', 'Aceito · Segredo · Jogadores'],
    ['archived', 'suspicion', 'public', 'Arquivado · Suspeita · Público'],
  ])('traduz %s, %s e %s para pt-BR', (canonState, knowledgeState, visibility, expected) => {
    expect(relationshipMetadataSummary({ canonState, knowledgeState, visibility })).toBe(expected);
  });
});
