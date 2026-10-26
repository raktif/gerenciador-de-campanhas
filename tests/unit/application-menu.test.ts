import type { Menu, MenuItemConstructorOptions } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import {
  appearanceMenuItemId,
  createApplicationMenuTemplate,
  installApplicationMenu,
} from '../../src/main/appearance/application-menu';

describe('menu nativo de aparência', () => {
  it('oferece Exibir > Modo Noturno como checkbox e traduz o estado selecionado', () => {
    const selected: string[] = [];
    const template = createApplicationMenuTemplate({
      applicationName: 'Gerenciador',
      platform: 'win32',
      onThemeSelected: (theme) => selected.push(theme),
    });
    const item = findTemplateItem(template, appearanceMenuItemId);

    expect(item).toMatchObject({ label: 'Modo Noturno', type: 'checkbox' });
    clickCheckbox(item, true);
    clickCheckbox(item, false);
    expect(selected).toEqual(['dark', 'light']);
  });

  it('inclui o menu da aplicação no macOS e preserva papéis nativos essenciais', () => {
    const template = createApplicationMenuTemplate({
      applicationName: 'Gerenciador',
      platform: 'darwin',
      onThemeSelected: vi.fn(),
    });

    expect(template[0]?.label).toBe('Gerenciador');
    expect(template.map(({ label }) => label)).toEqual([
      'Gerenciador',
      'Editar',
      'Exibir',
      'Janela',
    ]);
  });

  it('sincroniza o checkbox instalado e remove o menu ao descartar', () => {
    const nativeItem = { checked: false };
    const nativeMenu = {
      getMenuItemById: (id: string) => (id === appearanceMenuItemId ? nativeItem : null),
    } as unknown as Menu;
    const setApplicationMenu = vi.fn();
    const menu = installApplicationMenu(
      {
        buildFromTemplate: vi.fn(() => nativeMenu),
        setApplicationMenu,
      },
      {
        applicationName: 'Gerenciador',
        platform: 'win32',
        onThemeSelected: vi.fn(),
      },
    );

    menu.setTheme('dark');
    expect(nativeItem.checked).toBe(true);
    menu.setTheme('light');
    expect(nativeItem.checked).toBe(false);
    menu.dispose();
    expect(setApplicationMenu).toHaveBeenNthCalledWith(1, nativeMenu);
    expect(setApplicationMenu).toHaveBeenNthCalledWith(2, null);
  });
});

function findTemplateItem(
  template: MenuItemConstructorOptions[],
  id: string,
): MenuItemConstructorOptions {
  for (const item of template) {
    if (item.id === id) return item;
    if (Array.isArray(item.submenu)) {
      const nested = findTemplateItem(item.submenu, id);
      if (nested.id === id) return nested;
    }
  }
  return {};
}

function clickCheckbox(item: MenuItemConstructorOptions, checked: boolean): void {
  if (item.click === undefined)
    throw new Error('A\u00e7\u00e3o do item de menu n\u00e3o encontrada.');
  Reflect.apply(item.click, undefined, [{ checked }]);
}
