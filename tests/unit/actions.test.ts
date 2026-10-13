import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  Button,
  ButtonGroup,
  DialogActions,
  FormActions,
  IconButton,
  ToolbarActions,
} from '../../src/renderer/components/actions';

describe('sistema compartilhado de ações', () => {
  it('mantém atributos nativos e usa button como tipo seguro por padrão', () => {
    const markup = renderToStaticMarkup(
      createElement(Button, {
        'aria-expanded': true,
        children: 'Abrir detalhes',
        className: 'mt-4',
        disabled: true,
        id: 'details-trigger',
        variant: 'primary',
      }),
    );

    expect(markup).toContain('type="button"');
    expect(markup).toContain('id="details-trigger"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('bg-amber-700');
    expect(markup).toContain('min-h-11');
    expect(markup).toContain('mt-4');
  });

  it('permite submit explícito e oferece variantes e tamanhos estáticos', () => {
    const markup = renderToStaticMarkup(
      createElement(Button, {
        children: 'Excluir',
        fullWidth: true,
        size: 'large',
        type: 'submit',
        variant: 'danger',
      }),
    );

    expect(markup).toContain('type="submit"');
    expect(markup).toContain('min-h-12');
    expect(markup).toContain('border-red-300');
    expect(markup).toContain('w-full');
  });

  it('torna o estado ocupado perceptível e não interativo sem trocar o rótulo', () => {
    const markup = renderToStaticMarkup(
      createElement(Button, {
        busy: true,
        children: 'Salvar campanha',
        variant: 'primary',
      }),
    );

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('Salvar campanha');
  });

  it('oferece estado pressionado consistente para filtros e seletores', () => {
    const markup = renderToStaticMarkup(
      createElement(Button, {
        'aria-pressed': true,
        children: 'Ativas',
      }),
    );

    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-pressed:bg-slate-900');
    expect(markup).toContain('aria-pressed:text-white');
  });

  it('oferece contraste e foco próprios para navegação em fundo escuro', () => {
    const markup = renderToStaticMarkup(
      createElement(Button, {
        'aria-current': 'page',
        children: 'Detalhes da campanha',
        variant: 'dark-navigation',
      }),
    );

    expect(markup).toContain('text-slate-300');
    expect(markup).toContain('focus-visible:outline-amber-400');
    expect(markup).toContain('aria-[current=page]:bg-slate-800');
    expect(markup).not.toContain('text-slate-600');
  });

  it('nomeia o botão de ícone e mantém seu alvo quadrado', () => {
    const markup = renderToStaticMarkup(
      createElement(IconButton, {
        'aria-label': 'Fechar diálogo',
        children: createElement('span', { 'aria-hidden': true }, '×'),
        size: 'small',
        variant: 'ghost',
      }),
    );

    expect(markup).toContain('aria-label="Fechar diálogo"');
    expect(markup).toContain('type="button"');
    expect(markup).toContain('size-11');
    expect(markup).toContain('aria-hidden="true"');
  });

  it('bloqueia o botão de ícone ocupado e preserva seu nome acessível', () => {
    const markup = renderToStaticMarkup(
      createElement(IconButton, {
        'aria-label': 'Atualizar lista',
        busy: true,
        children: createElement('span', { 'aria-hidden': true }, '↻'),
      }),
    );

    expect(markup).toContain('aria-label="Atualizar lista"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('disabled=""');
  });

  it('expõe grupos semânticos com espaçamento e alinhamento consistentes', () => {
    const markup = renderToStaticMarkup(
      createElement(
        'section',
        null,
        createElement(ButtonGroup, {
          'aria-label': 'Filtros',
          align: 'center',
          children: 'Filtros',
        }),
        createElement(FormActions, { children: 'Formulário', layout: 'between' }),
        createElement(DialogActions, { children: 'Diálogo' }),
        createElement(ToolbarActions, { 'aria-label': 'Edição', children: 'Barra' }),
      ),
    );

    expect(markup).toContain('aria-label="Filtros"');
    expect(markup).toContain('justify-center');
    expect(markup).toContain('aria-label="Ações do formulário"');
    expect(markup).toContain('border-t');
    expect(markup).toContain('justify-between');
    expect(markup).toContain('aria-label="Ações do diálogo"');
    expect(markup).not.toContain('role="toolbar"');
    expect(markup).toContain('role="group"');
    expect(markup).toContain('aria-label="Edição"');
  });
});
