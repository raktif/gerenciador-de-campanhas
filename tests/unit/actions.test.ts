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
    expect(markup).toContain('action-button--primary');
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
    expect(markup).toContain('action-button--danger');
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
    expect(markup).toContain('action-button--secondary');
  });

  it('oferece contraste e foco próprios para navegação em fundo escuro', () => {
    const markup = renderToStaticMarkup(
      createElement(Button, {
        'aria-current': 'page',
        children: 'Detalhes da campanha',
        variant: 'dark-navigation',
      }),
    );

    expect(markup).toContain('action-button--dark-navigation');
    expect(markup).toContain('focus-visible:outline-2');
    expect(markup).not.toContain('action-button--secondary');
  });

  it('mantém links inline sem alvo, padding, borda ou tipografia de botão', () => {
    const markup = renderToStaticMarkup(
      createElement(Button, {
        children: 'Abrir entidade',
        size: 'inline',
        variant: 'link',
      }),
    );

    expect(markup).toContain('min-h-0');
    expect(markup).toContain('p-0');
    expect(markup).toContain('text-[inherit]');
    expect(markup).toContain('leading-[inherit]');
    expect(markup).not.toContain('min-h-11');
    expect(markup).not.toContain('px-4');
    expect(markup).not.toContain('py-2.5');
    expect(markup).not.toContain('font-semibold');
    expect(markup).not.toContain('border-transparent');
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
