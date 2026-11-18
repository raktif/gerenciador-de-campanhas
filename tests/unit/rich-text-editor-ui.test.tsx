import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RichTextEditor } from '../../src/renderer/components/rich-text';

describe('editor Rich Text', () => {
  it('apresenta ação de tabela e aplica estilos de tabela/lista dentro da área editável', async () => {
    const markup = renderToStaticMarkup(
      <RichTextEditor
        disabled={false}
        id="rich-text-test"
        label="Texto"
        onChange={() => undefined}
        value="<table><tbody><tr><td>Conteúdo</td></tr></tbody></table>"
      />,
    );
    const styles = await readFile('src/renderer/styles.css', 'utf8');
    expect(markup).toContain('Inserir tabela');
    expect(markup).toContain('Adicionar linha abaixo');
    expect(markup).toContain('Adicionar coluna à direita');
    expect(markup).toContain('Inserir imagem');
    expect(markup).toContain('title="Negrito"');
    expect(markup).toContain('title="Desfazer"');
    expect(markup).toContain('title="Refazer"');
    expect(markup).toContain('Tamanho da fonte');
    expect(markup).toContain('Palavras:');
    expect(markup).toContain('Caracteres:');
    expect(markup).toContain('Lista numerada');
    expect(markup).toContain('Título 2');
    expect(markup).not.toContain('Inserir link');
    expect(markup).not.toContain('Remover link');
    expect(markup).toContain('Centralizar');
    expect(markup).toContain('Tachado');
    expect(markup).toContain('Sobrescrito');
    expect(markup).toContain('Cor de destaque');
    expect(markup).toContain('Preto');
    expect(markup).toContain('Azul');
    expect(markup).not.toContain('aria-label="Citação"');
    expect(markup).toContain('class="rich-text-editor');
    expect(styles).toMatch(/\.rich-text-editor table\s*\{[^}]*border-collapse:\s*collapse/isu);
    expect(styles).toMatch(
      /\.rich-text-editor th,\s*\.rich-text-editor td\s*\{[^}]*border:\s*1px solid currentColor/isu,
    );
    expect(styles).toMatch(/\.rich-text-editor ul\s*\{[^}]*list-style:\s*disc/isu);
    expect(styles).toMatch(/\.rich-text-content h2,\s*\.rich-text-editor h2\s*\{/isu);
  });
});
