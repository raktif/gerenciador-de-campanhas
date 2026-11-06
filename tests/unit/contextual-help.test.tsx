import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ContextualHelp } from '../../src/renderer/components/contextual-help';
import {
  contextualHelpCatalog,
  fieldDefinitionHelpContent,
} from '../../src/renderer/content/contextual-help';

describe('ContextualHelp', () => {
  it('expõe gatilho acessível e conteúdo estruturado em um popover nativo', () => {
    const markup = renderToStaticMarkup(
      <ContextualHelp
        content={{
          description: 'Descrição simples.',
          purpose: 'Explicar a finalidade.',
          example: 'Um exemplo prático.',
          consequence: 'Uma consequência relevante.',
        }}
        label="Tipo de dado"
      />,
    );

    expect(markup).toContain('aria-label="Ajuda sobre Tipo de dado"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-controls="contextual-help-');
    expect(markup).toContain('aria-describedby="contextual-help-');
    expect(markup).toContain('popoverTarget="contextual-help-');
    expect(markup).toContain('size-8');
    expect(markup).toContain('popover="auto"');
    expect(markup).toContain('role="tooltip"');
    expect(markup).toContain('Descrição simples.');
    expect(markup).toContain('Finalidade:');
    expect(markup).toContain('Exemplo:');
    expect(markup).toContain('Consequência:');
  });

  it('mantém o catálogo tipado com conteúdo completo para Tipo de dado', () => {
    const help = contextualHelpCatalog['fieldDefinition.dataType'];

    expect(help.description).toContain('formato');
    expect(help.purpose).toContain('controle');
    expect(help.example).toContain('Texto longo');
    expect(help.consequence).toContain('valores existentes');
  });

  it('adapta ajuda persistida sem duplicar conteúdo nem expor artigo interno', () => {
    expect(
      fieldDefinitionHelpContent({
        helpText: 'Explique a função narrativa.',
        exampleText: 'Capitã da guarda.',
      }),
    ).toEqual({
      description: 'Explique a função narrativa.',
      example: 'Capitã da guarda.',
    });
    expect(fieldDefinitionHelpContent({ helpText: null, exampleText: 'Somente exemplo.' })).toEqual(
      {
        example: 'Somente exemplo.',
      },
    );
    expect(fieldDefinitionHelpContent({ helpText: null, exampleText: null })).toBeNull();
  });
});
