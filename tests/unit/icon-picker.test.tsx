import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Icon } from '../../src/renderer/components/icon';
import { IconPicker } from '../../src/renderer/components/icon-picker';

describe('Icon', () => {
  it('renderiza somente o SVG estático do identificador conhecido', () => {
    const markup = renderToStaticMarkup(<Icon value="person" />);

    expect(markup).toContain('<svg');
    expect(markup).toContain('data-icon-id="person"');
    expect(markup).toContain('stroke="currentColor"');
    expect(markup).toContain('aria-hidden="true"');
  });

  it('usa fallback seguro sem interpretar um valor legado', () => {
    const legacy = '<script>alert(1)</script>';
    const markup = renderToStaticMarkup(<Icon value={legacy} />);

    expect(markup).toContain('data-icon-fallback="legacy"');
    expect(markup).not.toContain('<svg');
    expect(markup).not.toContain('script');
  });
});

describe('IconPicker', () => {
  it('oferece Nenhum e os 20 ícones em radios nativos rotulados', () => {
    const markup = renderToStaticMarkup(
      <IconPicker id="entity-icon" onChange={() => undefined} value="person" />,
    );

    expect(markup).toContain('<legend');
    expect(markup).toContain('Ícone');
    expect(markup.match(/type="radio"/g)).toHaveLength(21);
    expect(markup).toContain('Nenhum');
    expect(markup).toContain('Pessoa');
    expect(markup).toContain('Rede');
    expect(markup).toContain('min-h-11');
    expect(markup).toContain('has-focus-visible:outline-3');
    expect(markup).toContain('checked=""');
    expect(markup).toContain('✓');
    expect(markup).not.toContain('aria-describedby');
  });

  it('desabilita o grupo e representa legado sem criar opção interativa', () => {
    const markup = renderToStaticMarkup(
      <IconPicker disabled id="entity-icon" onChange={() => undefined} value="símbolo antigo" />,
    );

    expect(markup).toContain('<fieldset');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('aria-describedby="entity-icon-legacy-message"');
    expect(markup).toContain('id="entity-icon-legacy-message"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('não pertence ao catálogo e será preservado');
    expect(markup).toContain('Para substituí-lo, escolha uma opção.');
    expect(markup).not.toContain('símbolo antigo');
    expect(markup.match(/checked=""/g)).toBeNull();
    expect(markup.match(/type="radio"/g)).toHaveLength(21);
  });
});
