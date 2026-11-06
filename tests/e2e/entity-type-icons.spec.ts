import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

const repositoryRoot = process.cwd();
const requireFromRepository = createRequire(path.join(repositoryRoot, 'package.json'));
const electronExecutable = requireFromRepository('electron') as string;

test('seleciona ícone por teclado, cancela alterações e persiste a escolha', async () => {
  test.setTimeout(120_000);
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-entity-type-icons-e2e-'));
  let application: ElectronApplication | null = null;

  try {
    application = await launch(dataDirectory);
    let window = await application.firstWindow();
    await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
    await window.getByLabel('Nome da campanha').fill('Ícones de Ethéria');
    await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    await window.getByRole('button', { name: 'Abrir campanha Ícones de Ethéria' }).click();
    await window.getByRole('button', { name: 'Gerenciar tipos de entidade' }).click();
    await window.getByRole('button', { name: 'Criar primeiro tipo' }).click();

    await window.getByLabel('Nome plural').fill('Personagens');
    await window.getByLabel('Nome singular').fill('Personagem');
    await window.getByLabel('Identificador (slug)').fill('personagens');
    const none = window.getByRole('radio', { name: 'Nenhum' });
    const person = window.getByRole('radio', { name: 'Pessoa' });
    await expect(none).toBeChecked();
    await none.focus();
    await none.press('ArrowRight');
    await expect(person).toBeChecked();
    await window.getByRole('button', { name: 'Criar tipo de entidade' }).click();

    const card = window.getByRole('article').filter({ hasText: 'Personagens' });
    await expect(
      card.getByTestId('entity-type-icon').locator('svg[data-icon-id="person"]'),
    ).toBeVisible();

    await application.close();
    application = null;
    application = await launch(dataDirectory);
    window = await application.firstWindow();
    await window.getByRole('button', { name: 'Abrir campanha Ícones de Ethéria' }).click();
    await window.getByRole('button', { name: 'Gerenciar tipos de entidade' }).click();
    await window.getByRole('button', { name: 'Editar tipo Personagens' }).click();
    await expect(window.getByRole('radio', { name: 'Pessoa' })).toBeChecked();

    await window.getByRole('radio', { name: 'Grupo' }).check();
    await window.getByRole('button', { name: 'Cancelar' }).click();
    await window.getByRole('button', { name: 'Editar tipo Personagens' }).click();
    await expect(window.getByRole('radio', { name: 'Pessoa' })).toBeChecked();
    await window.getByRole('radio', { name: 'Nenhum' }).check();
    await window.getByRole('button', { name: 'Salvar tipo de entidade' }).click();

    const updatedCard = window.getByRole('article').filter({ hasText: 'Personagens' });
    await expect(updatedCard.getByTestId('entity-type-icon').locator('svg')).toHaveCount(0);
    await expect(updatedCard.getByTestId('entity-type-icon')).toContainText('P');

    await application.close();
    application = null;
    application = await launch(dataDirectory);
    window = await application.firstWindow();
    await window.getByRole('button', { name: 'Abrir campanha Ícones de Ethéria' }).click();
    await window.getByRole('button', { name: 'Gerenciar tipos de entidade' }).click();
    await window.getByRole('button', { name: 'Editar tipo Personagens' }).click();
    await expect(window.getByRole('radio', { name: 'Nenhum' })).toBeChecked();
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
