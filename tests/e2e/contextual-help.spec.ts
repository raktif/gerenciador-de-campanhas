import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

const repositoryRoot = process.cwd();
const requireFromRepository = createRequire(path.join(repositoryRoot, 'package.json'));
const electronExecutable = requireFromRepository('electron') as string;

test('oferece ajuda contextual de Tipo de dado por mouse, teclado, clique e Escape', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-contextual-help-e2e-'));
  let application: ElectronApplication | null = null;

  try {
    application = await launch(dataDirectory);
    let window = await application.firstWindow();
    await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
    await window.getByLabel('Nome da campanha').fill('Ajuda Contextual');
    await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    await expect(
      window.getByRole('heading', { name: 'Ajuda Contextual', exact: true }),
    ).toBeVisible();

    await application.close();
    application = null;
    seedEntityType(dataDirectory);
    application = await launch(dataDirectory);
    window = await application.firstWindow();
    await window.getByRole('button', { name: 'Abrir campanha Ajuda Contextual' }).click();
    await window.getByRole('button', { name: 'Gerenciar tipos de entidade' }).click();
    await expect(window.getByRole('heading', { name: 'Personagens', exact: true })).toBeVisible();
    await window.getByRole('button', { name: 'Gerenciar campos de Personagens' }).click();
    await expect(window.getByRole('heading', { name: 'Definições de campo' })).toBeVisible();
    await window.getByRole('button', { name: 'Criar primeiro campo' }).click();

    const trigger = window.getByRole('button', { name: 'Ajuda sobre Tipo de dado' });
    const tooltip = window.getByRole('tooltip');
    const dataTypeSelect = window.getByRole('combobox', { name: 'Tipo de dado' });
    await expect(dataTypeSelect).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toHaveAttribute('aria-describedby', /^contextual-help-/);

    const triggerBox = await trigger.boundingBox();
    expect(triggerBox?.width).toBeGreaterThanOrEqual(32);
    expect(triggerBox?.height).toBeGreaterThanOrEqual(32);

    await trigger.hover();
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Define o formato');
    await expect(tooltip).toContainText('Exemplo:');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await tooltip.hover();
    await window.waitForTimeout(200);
    await expect(tooltip).toBeVisible();

    await window.getByRole('heading', { name: 'Configure um atributo reutilizável' }).hover();
    await expect(tooltip).toBeHidden();

    await trigger.focus();
    await expect(tooltip).toBeVisible();
    await trigger.press('Escape');
    await expect(tooltip).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await expect(tooltip).toBeVisible();
    await trigger.click();
    await expect(tooltip).toBeHidden();
    await trigger.click();
    await expect(tooltip).toBeVisible();
    await dataTypeSelect.click();
    await expect(tooltip).toBeHidden();

    await trigger.evaluate((element) => {
      element.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, isPrimary: true, pointerType: 'touch' }),
      );
      element.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, isPrimary: true, pointerType: 'touch' }),
      );
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await expect(tooltip).toBeVisible();
  } finally {
    await application?.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

function seedEntityType(dataDirectory: string): void {
  const database = new Database(path.join(dataDirectory, 'database', 'app.db'));
  try {
    const campaign = database
      .prepare("SELECT id FROM campaigns WHERE name = 'Ajuda Contextual'")
      .get() as { id: string } | undefined;
    if (campaign === undefined) throw new Error('Campanha do teste ausente.');
    const now = new Date().toISOString();
    database
      .prepare(
        `INSERT INTO entity_types (
          id, campaign_id, name, singular_name, slug, sort_order,
          is_system, is_archived, created_at, updated_at, revision
        ) VALUES (
          '60000000-0000-4000-8000-000000000010', ?, 'Personagens', 'Personagem',
          'personagens', 0, 0, 0, ?, ?, 1
        )`,
      )
      .run(campaign.id, now, now);
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
    env: {
      ...inheritedEnvironment,
      APP_DATA_DIR: dataDirectory,
      NODE_ENV: 'test',
    },
  });
}
