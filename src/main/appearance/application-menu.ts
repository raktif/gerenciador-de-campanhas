import type { Menu, MenuItemConstructorOptions } from 'electron';
import type { AppearanceTheme } from '../../core/contracts/appearance';

export const appearanceMenuItemId = 'appearance.toggle-dark';

export interface AppearanceMenuPort {
  setTheme(theme: AppearanceTheme): void;
  dispose(): void;
}

interface MenuApi {
  buildFromTemplate(template: MenuItemConstructorOptions[]): Menu;
  setApplicationMenu(menu: Menu | null): void;
}

export function installApplicationMenu(
  menuApi: MenuApi,
  options: {
    applicationName: string;
    platform: NodeJS.Platform;
    onThemeSelected(theme: AppearanceTheme): void;
  },
): AppearanceMenuPort {
  const menu = menuApi.buildFromTemplate(createApplicationMenuTemplate(options));
  menuApi.setApplicationMenu(menu);

  return {
    setTheme: (theme) => {
      const item = menu.getMenuItemById(appearanceMenuItemId);
      if (item === null) throw new Error('Item do menu de apar\u00eancia n\u00e3o foi encontrado.');
      item.checked = theme === 'dark';
    },
    dispose: () => menuApi.setApplicationMenu(null),
  };
}

export function createApplicationMenuTemplate(options: {
  applicationName: string;
  platform: NodeJS.Platform;
  onThemeSelected(theme: AppearanceTheme): void;
}): MenuItemConstructorOptions[] {
  const applicationMenu: MenuItemConstructorOptions[] =
    options.platform === 'darwin'
      ? [
          {
            label: options.applicationName,
            submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }],
          },
        ]
      : [];

  return [
    ...applicationMenu,
    {
      label: 'Editar',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Exibir',
      submenu: [
        {
          id: appearanceMenuItemId,
          label: 'Modo Noturno',
          type: 'checkbox',
          click: (item) => options.onThemeSelected(item.checked ? 'dark' : 'light'),
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Janela',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
  ];
}
