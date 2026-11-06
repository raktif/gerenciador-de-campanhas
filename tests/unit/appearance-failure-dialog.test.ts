import type { BrowserWindow } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import {
  appearanceChangeFailureDialog,
  showAppearanceChangeFailure,
} from '../../src/main/appearance/appearance-failure-dialog';

describe('aviso de falha da aparência', () => {
  it('informa em PT-BR que o tema anterior foi mantido sem detalhes técnicos', async () => {
    const showMessageBox = vi.fn().mockResolvedValue({ response: 0, checkboxChecked: false });
    const window = {} as BrowserWindow;

    await showAppearanceChangeFailure({ showMessageBox }, window);

    expect(showMessageBox).toHaveBeenCalledWith(window, appearanceChangeFailureDialog);
    expect(appearanceChangeFailureDialog).toMatchObject({
      type: 'warning',
      title: 'Não foi possível alterar a aparência',
      message: 'Não foi possível alterar a aparência.',
      detail: 'A configuração anterior foi mantida.',
      buttons: ['OK'],
      noLink: true,
    });
    expect(JSON.stringify(appearanceChangeFailureDialog)).not.toMatch(
      /stack|path|secret|token|\\|\/[A-Za-z]/i,
    );
  });
});
