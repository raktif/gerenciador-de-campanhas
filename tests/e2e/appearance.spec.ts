import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

const repositoryRoot = process.cwd();
const requireFromRepository = createRequire(path.join(repositoryRoot, 'package.json'));
const electronExecutable = requireFromRepository('electron') as string;

test('sincroniza toggle, menu, campanha e persistência entre reinicializações', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-appearance-e2e-'));
  let application: ElectronApplication | null = null;

  try {
    const launchedApplication = await launch(dataDirectory);
    application = launchedApplication;
    let window = await launchedApplication.firstWindow();
    const toggle = window.getByRole('switch', { name: 'Modo noturno' });

    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expectDocumentTheme(window, 'light');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toBeFocused();
    await expectDocumentTheme(window, 'dark');
    await expect.poll(() => menuThemeChecked(launchedApplication)).toBe(true);

    await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
    await window.getByLabel('Nome da campanha').fill('Campanha Noturna');
    await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    await window.getByRole('button', { name: 'Abrir campanha Campanha Noturna' }).click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expectDocumentTheme(window, 'dark');

    await selectMenuTheme(launchedApplication, false);
    await expect.poll(() => readPersistedTheme(dataDirectory)).toBe('light');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expectDocumentTheme(window, 'light');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await launchedApplication.close();
    application = null;
    const relaunchedApplication = await launch(dataDirectory);
    application = relaunchedApplication;
    window = await relaunchedApplication.firstWindow();

    await expect(window.getByRole('switch', { name: 'Modo noturno' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expectDocumentTheme(window, 'dark');
    await expect.poll(() => menuThemeChecked(relaunchedApplication)).toBe(true);
  } finally {
    await application?.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test('reverte falha do toggle, mantém foco e apresenta orientação útil', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-appearance-failure-e2e-'));
  let application: ElectronApplication | null = null;

  try {
    application = await launch(dataDirectory);
    const window = await application.firstWindow();
    const toggle = window.getByRole('switch', { name: 'Modo noturno' });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    seedConcurrentAppearanceChange(dataDirectory);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(toggle).toBeFocused();
    await expectDocumentTheme(window, 'light');
    await expect(window.getByRole('alert')).toContainText(
      'Não foi possível alterar a aparência. A configuração anterior foi mantida.',
    );
  } finally {
    await application?.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

async function expectDocumentTheme(window: Page, theme: 'light' | 'dark'): Promise<void> {
  await expect
    .poll(() =>
      window.evaluate(() => ({
        dataTheme: document.documentElement.dataset.theme,
        colorScheme: document.documentElement.style.colorScheme,
      })),
    )
    .toEqual({ dataTheme: theme, colorScheme: theme });
}

async function menuThemeChecked(application: ElectronApplication): Promise<boolean> {
  return application.evaluate(({ Menu }) => {
    return Menu.getApplicationMenu()?.getMenuItemById('appearance.toggle-dark')?.checked ?? false;
  });
}

async function selectMenuTheme(application: ElectronApplication, checked: boolean): Promise<void> {
  await application.evaluate(({ Menu }, targetChecked) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById('appearance.toggle-dark');
    if (item?.click === undefined) throw new Error('Item de aparência não encontrado.');
    Reflect.apply(item.click, undefined, [{ checked: targetChecked }, undefined, {}]);
  }, checked);
}

function seedConcurrentAppearanceChange(dataDirectory: string): void {
  const database = new Database(path.join(dataDirectory, 'database', 'app.db'));
  const timestamp = new Date().toISOString();
  try {
    database
      .prepare(
        `INSERT INTO app_settings (key, value_json, created_at, updated_at, revision)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run('appearance.theme', '"dark"', timestamp, timestamp, 1);
  } finally {
    database.close();
  }
}

function readPersistedTheme(dataDirectory: string): string | null {
  const database = new Database(path.join(dataDirectory, 'database', 'app.db'), { readonly: true });
  try {
    const row = database
      .prepare('SELECT value_json AS valueJson FROM app_settings WHERE key = ?')
      .get('appearance.theme') as { valueJson: string } | undefined;
    return row === undefined ? null : (JSON.parse(row.valueJson) as string);
  } finally {
    database.close();
  }
}

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
    env: { ...inheritedEnvironment, APP_DATA_DIR: dataDirectory, NODE_ENV: 'test' },
  });
}
