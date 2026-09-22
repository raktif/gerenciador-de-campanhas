import { createRequire } from 'node:module';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

const repositoryRoot = process.cwd();
const requireFromRepository = createRequire(path.join(repositoryRoot, 'package.json'));
const electronExecutable = requireFromRepository('electron') as string;

test('carrega a tela inicial sem reload manual em banco vazio e com campanha persistida', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-campaign-startup-e2e-'));
  let application: ElectronApplication | null = null;

  try {
    application = await launch(dataDirectory);
    let window = await application.firstWindow();
    await expect(
      window.getByRole('heading', { name: 'Bem-vindo ao Gerenciador de Campanhas de RPG' }),
    ).toBeVisible();

    await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
    await window.getByLabel('Nome da campanha').fill('Inicialização sem recarregar');
    await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    await expect(
      window.getByRole('heading', { name: 'Inicialização sem recarregar', exact: true }),
    ).toBeVisible();

    await application.close();
    application = null;
    preparePendingMigration(dataDirectory);
    application = await launch(dataDirectory);
    window = await application.firstWindow();
    await expect(
      window.getByRole('heading', { name: 'Inicialização sem recarregar', exact: true }),
    ).toBeVisible();
    expect(
      (await readdir(path.join(dataDirectory, 'backups', 'automatic'))).some((name) =>
        name.endsWith('-pre-migration.db'),
      ),
    ).toBe(true);

    await test.step('reinicia após encerramento inesperado', async () => {
      const process = application?.process();
      if (process === undefined) throw new Error('A aplicação Electron não está em execução.');
      if (!process.kill('SIGKILL')) throw new Error('Não foi possível encerrar o processo Electron.');
      await application?.close();
      application = null;

      application = await launch(dataDirectory);
      window = await application.firstWindow();
      await expect(
        window.getByRole('heading', { name: 'Inicialização sem recarregar', exact: true }),
      ).toBeVisible();
    });
  } finally {
    await closeApplication(application);
    await removeDataDirectory(dataDirectory);
  }
});

test('recupera falha de carregamento com retry, ajuda acessível e diagnóstico seguro', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-campaign-startup-recovery-e2e-'));
  let application: ElectronApplication | null = null;

  try {
    application = await launch(dataDirectory, { failInitialCampaignList: true });
    const window = await application.firstWindow();
    const errorTitle = window.getByRole('heading', {
      name: 'Não foi possível carregar suas campanhas',
    });
    await expect(errorTitle).toBeVisible();
    await expect(errorTitle).toBeFocused();
    await expect(window.getByText('Código: DATABASE_UNAVAILABLE')).toBeVisible();

    const help = window.getByRole('button', { name: 'Abrir Ajuda' });
    await help.focus();
    await help.press('Enter');
    await expect(help).toHaveAttribute('aria-expanded', 'true');
    await expect(
      window.getByRole('heading', { name: 'Recuperação da inicialização' }),
    ).toBeVisible();
    await help.press('Escape');
    await expect(help).toHaveAttribute('aria-expanded', 'false');
    await expect(help).toBeFocused();

    await window.getByRole('button', { name: 'Copiar diagnóstico' }).click();
    await expect(window.getByRole('status')).toContainText('Diagnóstico copiado.');
    await window.getByRole('button', { name: 'Tentar novamente' }).click();
    await expect(
      window.getByRole('heading', { name: 'Bem-vindo ao Gerenciador de Campanhas de RPG' }),
    ).toBeVisible();
  } finally {
    await closeApplication(application);
    await removeDataDirectory(dataDirectory);
  }
});

async function launch(
  dataDirectory: string,
  options: { failInitialCampaignList?: boolean } = {},
): Promise<ElectronApplication> {
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
      ...(options.failInitialCampaignList
        ? { CAMPAIGN_MANAGER_TEST_FAIL_INITIAL_CAMPAIGN_LIST: '1' }
        : {}),
    },
  });
}

function preparePendingMigration(dataDirectory: string): void {
  const database = new Database(path.join(dataDirectory, 'database', 'app.db'));
  try {
    database.exec('DROP TRIGGER notes_inbox_source_update_guard;');
    database.exec('DROP TRIGGER events_inbox_source_update_guard;');
    database.prepare('DELETE FROM schema_migrations WHERE version = 15').run();
  } finally {
    database.close();
  }
}

async function removeDataDirectory(dataDirectory: string): Promise<void> {
  await rm(dataDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
}

async function closeApplication(application: ElectronApplication | null): Promise<void> {
  if (application === null) return;
  await application.close();
}
