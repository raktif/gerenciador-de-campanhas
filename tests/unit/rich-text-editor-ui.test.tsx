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
    expect(markup).toContain('class="rich-text-editor');
    expect(styles).toMatch(/\.rich-text-editor table\s*\{[^}]*border-collapse:\s*collapse/isu);
    expect(styles).toMatch(
      /\.rich-text-editor th,\s*\.rich-text-editor td\s*\{[^}]*border:\s*1px solid currentColor/isu,
    );
    expect(styles).toMatch(/\.rich-text-editor ul\s*\{[^}]*list-style:\s*disc/isu);
  });
});
