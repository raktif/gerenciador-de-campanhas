import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ImageLightbox,
  isLightboxDismissKey,
  shouldCloseLightboxFromBackdrop,
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
});
