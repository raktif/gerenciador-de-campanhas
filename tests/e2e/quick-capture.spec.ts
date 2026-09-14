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
const campaignName = 'Vigília da Ponte';
const sessionTitle = 'A noite do sino';
const associatedText = 'O sino tocou três vezes antes da ponte cair.';
const unassociatedText = 'A porta do observatório estava entreaberta.';

test('captura anotações pelo botão e atalho, associa sessão opcional e preserva após reiniciar', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-quick-capture-e2e-'));
  let application: ElectronApplication | null = null;
  try {
    application = await launch(dataDirectory);
    let window = await application.firstWindow();
    await prepareCampaignAndInProgressSession(window);

    await window.getByRole('button', { name: /Captura rápida/ }).click();
    const dialog = window.getByRole('dialog', { name: 'Captura rápida' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Texto *')).toBeFocused();
    await dialog.getByLabel('Texto *').fill(associatedText);
    const sessionSelect = dialog.getByLabel(/Sessão em andamento/);
    await expect(sessionSelect).toBeEnabled();
    await sessionSelect.selectOption({ label: `Sessão 1 — ${sessionTitle}` });
    await dialog.getByRole('button', { name: 'Salvar captura' }).click();
    await expect(window.getByRole('status')).toContainText('Captura salva na Caixa de Entrada.');
    await expect(dialog).toHaveCount(0);

    await window.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Sessão em andamento (opcional)')).toHaveValue('');
    await dialog.getByLabel('Texto *').fill(unassociatedText);
    await dialog.getByRole('button', { name: 'Salvar captura' }).click();
    await expect(window.getByRole('status')).toContainText('Captura salva na Caixa de Entrada.');

    await application.close();
    application = null;
    application = await launch(dataDirectory);
    window = await application.firstWindow();
    await window.getByRole('button', { name: `Abrir campanha ${campaignName}` }).click();
    await expect(window.getByRole('button', { name: /Captura rápida/ })).toBeVisible();
    await application.close();
    application = null;

    expect(readCaptures(dataDirectory)).toEqual([
      { rawText: associatedText, status: 'new', originKind: 'session', sessionTitle },
      { rawText: unassociatedText, status: 'new', originKind: 'manual', sessionTitle: null },
    ]);
  } finally {
    await application?.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

async function prepareCampaignAndInProgressSession(window: Page): Promise<void> {
  await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
  await window.getByLabel('Nome da campanha').fill(campaignName);
  await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
  await window.getByRole('button', { name: `Abrir campanha ${campaignName}` }).click();
  await window.getByRole('button', { name: 'Sessões', exact: true }).click();
  await window.getByRole('button', { name: 'Planejar sessão' }).click();
  await window.getByLabel('Sequência *').fill('1');
  await window.getByLabel('Título *').fill(sessionTitle);
  await window.getByRole('button', { name: 'Planejar sessão', exact: true }).click();
  await window.getByRole('button', { name: 'Voltar para sessões' }).click();
  await window.getByRole('button', { name: `Editar ${sessionTitle}` }).click();
  await window.getByRole('button', { name: 'Iniciar sessão' }).click();
  await window.getByRole('button', { name: 'Confirmar início' }).click();
  await expect(window.getByRole('button', { name: 'Concluir sessão' })).toBeVisible();
}

function readCaptures(dataDirectory: string): {
  rawText: string;
  status: string;
  originKind: string;
  sessionTitle: string | null;
}[] {
  const database = new Database(path.join(dataDirectory, 'database', 'app.db'), { readonly: true });
  try {
    return database
      .prepare(
        `SELECT inbox_items.raw_text AS rawText,
                inbox_items.status AS status,
                inbox_items.origin_kind AS originKind,
                sessions.title AS sessionTitle
         FROM inbox_items
         LEFT JOIN sessions ON sessions.id = inbox_items.session_id
         ORDER BY inbox_items.created_at ASC, inbox_items.id ASC`,
      )
      .all() as {
      rawText: string;
      status: string;
      originKind: string;
      sessionTitle: string | null;
    }[];
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
