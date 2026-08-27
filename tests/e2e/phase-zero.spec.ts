import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

const repositoryRoot = process.cwd();
const requireFromRepository = createRequire(path.join(repositoryRoot, 'package.json'));
const electronExecutable = requireFromRepository('electron') as string;

test('abre, persiste, fecha e recupera o valor após reinicialização', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-campaign-manager-e2e-'));
  let application: ElectronApplication | null = null;

  try {
    application = await launch(dataDirectory);
    let window = await application.firstWindow();
    await expect(
      window.getByRole('heading', { name: 'Gerenciador de Campanhas de RPG' }),
    ).toBeVisible();
    await expect(window.getByTestId('app-status')).toHaveText('ready');
    await expect(window.getByTestId('db-status')).toHaveText('connected');
    await window.getByRole('button', { name: 'Gravar teste' }).click();
    await expect(window.getByTestId('feedback')).toContainText('Valor persistido:');
    const persistedFeedback = await window.getByTestId('feedback').textContent();
    const persistedValue = persistedFeedback?.match(/phase-zero-[a-f0-9-]+/)?.[0];
    expect(persistedValue).toBeDefined();
    if (persistedValue === undefined) throw new Error('Valor persistido não foi exibido.');
    await application.close();
    application = null;

    application = await launch(dataDirectory);
    window = await application.firstWindow();
    await window.getByRole('button', { name: 'Ler teste' }).click();
    await expect(window.getByTestId('feedback')).toContainText(
      `Valor recuperado: ${persistedValue}`,
    );
  } finally {
    await application?.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

async function launch(dataDirectory: string): Promise<ElectronApplication> {
  const inheritedEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  delete inheritedEnvironment.ELECTRON_RUN_AS_NODE;
  return electron.launch({
    executablePath: electronExecutable,
    args: [repositoryRoot],
    env: {
      ...inheritedEnvironment,
      APP_DATA_DIR: dataDirectory,
      NODE_ENV: 'test',
    },
  });
}
