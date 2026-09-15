import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

const repositoryRoot = process.cwd();
const electronExecutable = createRequire(path.join(repositoryRoot, 'package.json'))(
  'electron',
) as string;
const campaignName = 'Triagem E2E';

test('captura, abre a Caixa de Entrada, filtra, move descartada e pagina com confirmação acessível', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-inbox-e2e-'));
  let application: ElectronApplication | null = null;
  try {
    application = await launch(dataDirectory);
    let window = await application.firstWindow();
    await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
    await window.getByLabel('Nome da campanha').fill(campaignName);
    await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    await window.getByRole('button', { name: `Abrir campanha ${campaignName}` }).click();
    await window.getByRole('button', { name: /Captura rápida/ }).click();
    const capture = window.getByRole('dialog', { name: 'Captura rápida' });
    await capture.getByLabel('Texto *').fill('Captura para triagem');
    await capture.getByRole('button', { name: 'Salvar captura' }).click();
    await window.getByRole('button', { name: 'Abrir Caixa de Entrada' }).click();
    await expect(window.getByRole('heading', { name: 'Caixa de Entrada' })).toBeVisible();
    const card = window.getByText('Captura para triagem').locator('..').locator('..');
    await card.getByRole('button', { name: 'Descartar' }).click();
    const confirmation = window.getByRole('dialog', { name: /Confirmar descarte/ });
    await expect(confirmation.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    await window.keyboard.press('Tab');
    await expect(confirmation.getByRole('button', { name: 'Confirmar descarte' })).toBeFocused();
    await window.keyboard.press('Escape');
    await expect(confirmation).toHaveCount(0);
    await card.getByRole('button', { name: 'Descartar' }).click();
    await confirmation.getByRole('button', { name: 'Confirmar descarte' }).click();
    await window.getByRole('button', { name: 'Descartadas' }).click();
    await window.getByRole('button', { name: 'Marcar como em revisão' }).click();
    await expect(window.getByRole('button', { name: 'Pendentes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await application.close();
    application = null;
    seedCaptures(dataDirectory);
    application = await launch(dataDirectory);
    window = await application.firstWindow();
    await window.getByRole('button', { name: `Abrir campanha ${campaignName}` }).click();
    await window.getByRole('button', { name: 'Caixa de Entrada' }).click();
    await expect(window.getByTestId('inbox-list').getByRole('listitem')).toHaveCount(50);
    await window.getByRole('button', { name: 'Carregar mais' }).click();
    await expect(window.getByTestId('inbox-list').getByRole('listitem')).toHaveCount(52);
  } finally {
    await application?.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

function seedCaptures(dataDirectory: string): void {
  const database = new Database(path.join(dataDirectory, 'database', 'app.db'));
  try {
    const campaign = database
      .prepare('SELECT id FROM campaigns WHERE name = ?')
      .get(campaignName) as { id: string };
    const insert = database.prepare(
      'INSERT INTO inbox_items (id, campaign_id, raw_text, status, origin_kind, captured_at, created_at, updated_at, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)',
    );
    const now = new Date().toISOString();
    const transaction = database.transaction(() => {
      for (let index = 0; index < 51; index += 1)
        insert.run(
          `90000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          campaign.id,
          `Página ${String(index)}`,
          'new',
          'manual',
          now,
          now,
          now,
        );
    });
    transaction();
  } finally {
    database.close();
  }
}

async function launch(dataDirectory: string): Promise<ElectronApplication> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({
    executablePath: electronExecutable,
    args: [repositoryRoot],
    env: { ...env, APP_DATA_DIR: dataDirectory, NODE_ENV: 'test' },
  });
}
