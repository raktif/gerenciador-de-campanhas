import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ImageLightbox,
  isLightboxDismissKey,
  shouldCloseLightboxFromBackdrop,
  trapLightboxFocus,
} from '../../src/renderer/components/image-lightbox';

describe('lightbox compartilhado de imagens', () => {
  it('renderiza diálogo acessível, limitado à janela e sem origem privada', () => {
    const html = renderToStaticMarkup(
      <ImageLightbox
        alt="Brasão azul e dourado"
        load={() => Promise.reject(new Error('não executado em SSR'))}
        onClose={() => undefined}
      />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Visualização ampliada: Brasão azul e dourado');
    expect(html).toContain('Fechar imagem ampliada');
    expect(html).toContain('max-h-[calc(100vh-2rem)]');
    expect(html).not.toMatch(/relativePath|storedFilename|sourceUrl|file:\/\//u);
  });

  it('fecha apenas pelo fundo real ou Escape', () => {
    const backdrop = new EventTarget();
    expect(shouldCloseLightboxFromBackdrop(backdrop, backdrop)).toBe(true);
    expect(shouldCloseLightboxFromBackdrop(new EventTarget(), backdrop)).toBe(false);
    expect(isLightboxDismissKey('Escape')).toBe(true);
    expect(isLightboxDismissKey('Enter')).toBe(false);
  });

  it('mantém o foco dentro do diálogo nos dois sentidos', () => {
    const focused: string[] = [];
    const first = { focus: () => focused.push('first') } as unknown as HTMLElement;
    const last = { focus: () => focused.push('last') } as unknown as HTMLElement;
    const container = {
      querySelectorAll: () => [first, last],
    } as unknown as Pick<HTMLElement, 'querySelectorAll'>;
    let prevented = 0;

    trapLightboxFocus(
      { key: 'Tab', shiftKey: false, preventDefault: () => prevented++ },
      container,
      last,
    );
    trapLightboxFocus(
      { key: 'Tab', shiftKey: true, preventDefault: () => prevented++ },
      container,
      first,
    );

    expect(prevented).toBe(2);
    expect(focused).toEqual(['first', 'last']);
  });

  it('não interfere em teclas e posições de foco internas', () => {
    const focused: string[] = [];
    const first = { focus: () => focused.push('first') } as unknown as HTMLElement;
    const middle = { focus: () => focused.push('middle') } as unknown as HTMLElement;
    const last = { focus: () => focused.push('last') } as unknown as HTMLElement;
    const container = {
      querySelectorAll: () => [first, middle, last],
    } as unknown as Pick<HTMLElement, 'querySelectorAll'>;
    let prevented = 0;

    trapLightboxFocus(
      { key: 'Enter', shiftKey: false, preventDefault: () => prevented++ },
      container,
      last,
    );
    trapLightboxFocus(
      { key: 'Tab', shiftKey: false, preventDefault: () => prevented++ },
      container,
      middle,
    );

    expect(prevented).toBe(0);
    expect(focused).toEqual([]);
  });
});
