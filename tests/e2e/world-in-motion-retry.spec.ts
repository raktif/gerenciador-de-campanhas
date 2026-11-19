import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { campaignSignalChannels } from '../../src/core/contracts/ipc-channels';

test('retry por teclado mantém o foco após nova falha e anuncia apenas a recuperação', async () => {
  const root = process.cwd();
  const executablePath = createRequire(path.join(root, 'package.json'))('electron') as string;
  const data = await mkdtemp(path.join(os.tmpdir(), 'world-in-motion-retry-'));
  let app: ElectronApplication | undefined;
  try {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[1] !== undefined && entry[0] !== 'ELECTRON_RUN_AS_NODE',
      ),
    );
    app = await electron.launch({
      executablePath,
      args: [root],
      env: {
        ...env,
        APP_DATA_DIR: data,
        APP_ELECTRON_USER_DATA_DIR: path.join(data, 'electron-profile'),
        NODE_ENV: 'test',
      },
    });
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Criar primeira campanha' }).click();
    await page.getByLabel('Nome da campanha').fill('Campanha de recuperação');
    await page.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir campanha Campanha de recuperação' }).click();

    const releaseFailure = 'world-in-motion-test:release-failure';
    const releaseSuccess = 'world-in-motion-test:release-success';
    await app.evaluate(
      ({ ipcMain }, { channel, releaseFailure, releaseSuccess }) => {
        const failure = {
          ok: false,
          error: { code: 'DATABASE_UNAVAILABLE', message: 'Falha controlada' },
          requestId: 'initial',
        };
        const responses = [
          failure,
          new Promise((resolve) => {
            ipcMain.once(releaseFailure, () => resolve({ ...failure, requestId: 'retry-failed' }));
          }),
          new Promise((resolve) => {
            ipcMain.once(releaseSuccess, () =>
              resolve({ ok: true, data: { items: [] }, requestId: 'retry-succeeded' }),
            );
          }),
        ];
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, () => {
          const response = responses.shift();
          if (response === undefined) throw new Error('Consulta extra inesperada ao painel.');
          return response;
        });
      },
      { channel: campaignSignalChannels.listForWorldInMotion, releaseFailure, releaseSuccess },
    );

    await page.getByRole('button', { name: 'Mundo em Movimento', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Mundo em Movimento', exact: true });
    const heading = panel.getByRole('heading', { name: 'Mundo em Movimento', exact: true });
    const retry = panel.getByRole('button', { name: 'Tentar novamente' });
    const announcement = panel.getByRole('status');
    const alert = panel.getByRole('alert');
    const loadingMessage = 'Carregando o contexto da campanha…';
    await expect(alert).toContainText('Não foi possível carregar o painel');
    await expect(announcement).toBeEmpty();
    await retry.focus();
    await expect(retry).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(retry).toHaveCount(0);
    await expect(heading).toBeFocused();
    await expect(announcement).toHaveText(loadingMessage);
    await expect(alert).toHaveCount(0);

    await app.evaluate(({ ipcMain }, event) => ipcMain.emit(event), releaseFailure);
    await expect(alert).toContainText('Não foi possível carregar o painel');
    await expect(announcement).toBeEmpty();
    await expect(heading).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(retry).toBeFocused();
    await page.keyboard.press('Space');
    await expect(retry).toHaveCount(0);
    await expect(heading).toBeFocused();
    await expect(announcement).toHaveText(loadingMessage);
    await expect(alert).toHaveCount(0);

    await app.evaluate(({ ipcMain }, event) => ipcMain.emit(event), releaseSuccess);
    await expect(announcement).toHaveText('Painel carregado com sucesso após nova tentativa.');
    await expect(panel.getByText('Não há registros ativos', { exact: false })).toBeVisible();
    await expect(heading).toBeFocused();
  } finally {
    await app?.close();
    await rm(data, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
});
