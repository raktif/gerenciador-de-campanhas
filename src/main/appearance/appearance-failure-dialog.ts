import type { BrowserWindow, Dialog, MessageBoxOptions } from 'electron';

export const appearanceChangeFailureDialog: Readonly<MessageBoxOptions> = {
  type: 'warning',
  title: 'Não foi possível alterar a aparência',
  message: 'Não foi possível alterar a aparência.',
  detail: 'A configuração anterior foi mantida.',
  buttons: ['OK'],
  defaultId: 0,
  cancelId: 0,
  noLink: true,
};

export async function showAppearanceChangeFailure(
  dialog: Pick<Dialog, 'showMessageBox'>,
  window: BrowserWindow,
): Promise<void> {
  await dialog.showMessageBox(window, appearanceChangeFailureDialog);
}
