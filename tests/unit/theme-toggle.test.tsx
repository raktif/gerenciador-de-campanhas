import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '../../src/renderer/theme/theme-provider';
import { ThemeToggle } from '../../src/renderer/theme/theme-toggle';

describe('ThemeToggle', () => {
  it('expõe switch acessível com sol e lua decorativos e alvo mínimo de 44px', () => {
    const markup = renderToStaticMarkup(
      <ThemeProvider initialLoadFailed={false} initialSetting={{ theme: 'dark', revision: 2 }}>
        <ThemeToggle />
      </ThemeProvider>,
    );

    expect(markup).toContain('role="switch"');
    expect(markup).toContain('aria-label="Modo noturno"');
    expect(markup).toContain('aria-checked="true"');
    expect(markup).toContain('size-11');
    expect(markup).toContain('focus-visible:outline-2');
    expect(markup.match(/aria-hidden="true"/g)).toHaveLength(3);
    expect(markup).toContain('☀');
    expect(markup).toContain('☾');
  });

  it('apresenta erro útil quando a preferência inicial não pode ser carregada', () => {
    const markup = renderToStaticMarkup(
      <ThemeProvider initialLoadFailed initialSetting={{ theme: 'light', revision: 0 }}>
        <ThemeToggle />
      </ThemeProvider>,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Não foi possível carregar a aparência salva.');
  });
});
