import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

const repositoryRoot = process.cwd();
const requireFromRepository = createRequire(path.join(repositoryRoot, 'package.json'));
const electronExecutable = requireFromRepository('electron') as string;

test('adiciona, exibe nos detalhes e cartão, e remove imagem de referência', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-entity-reference-e2e-'));
  let application: ElectronApplication | null = null;
  try {
    application = await launch(dataDirectory);
    const window = await application.firstWindow();

    await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
    await window.getByLabel('Nome da campanha').fill('Vale das Pontes');
    await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    await window.getByRole('button', { name: 'Abrir campanha Vale das Pontes' }).click();
    await window.getByRole('button', { name: 'Gerenciar tipos de entidade' }).click();
    await window.getByRole('button', { name: 'Criar primeiro tipo' }).click();
    await window.getByLabel('Nome plural').fill('Personagens');
    await window.getByLabel('Nome singular').fill('Personagem');
    await window.getByLabel('Identificador (slug)').fill('personagens');
    await window.getByRole('button', { name: 'Criar tipo de entidade' }).click();
    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
    await window.getByRole('button', { name: 'Ver entidades' }).click();
    await window.getByRole('button', { name: 'Nova entidade', exact: true }).click();
    await window.getByLabel('Nome *').fill('Gorel');
    await window.getByRole('button', { name: 'Criar entidade' }).click();
    await window.getByRole('button', { name: 'Abrir detalhes de Gorel' }).first().click();

    await expect(window.getByText('Gorel sem imagem de referência')).toBeAttached();
    const manage = window.getByRole('button', { name: 'Gerenciar imagem' });
    await expect(manage).toBeEnabled();
    await manage.click();
    const dropZone = window.getByRole('button', {
      name: 'Solte uma imagem ou pressione Enter para selecionar',
    });
    await dropZone.evaluate((element) => {
      const bytes = Uint8Array.from(
        atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWMwCS3/D8IMMAYAQugH/UeuTggAAAAASUVORK5CYII=',
        ),
        (character) => character.charCodeAt(0),
      );
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], 'gorel.png', { type: 'image/png' }));
      element.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
    });
    await expect(
      window.getByRole('status').filter({ hasText: 'Imagem de referência atualizada' }),
    ).toBeVisible();
    await expect(window.getByAltText('Imagem de referência de Gorel')).toBeVisible();
    await window.getByRole('button', { name: 'Fechar' }).click();
    await window.getByRole('button', { name: 'Voltar para entidades' }).click();
    await expect(
      window.getByTestId('entity-list').getByAltText('Imagem de referência de Gorel'),
    ).toBeVisible();

    await window.getByRole('button', { name: 'Abrir detalhes de Gorel' }).first().click();
    await window.getByRole('button', { name: 'Gerenciar imagem' }).click();
    await window.getByRole('button', { name: 'Remover imagem' }).click();
    const confirmation = window.getByRole('dialog', { name: 'Remover a imagem de referência?' });
    await confirmation.getByRole('button', { name: 'Confirmar' }).click();
    await expect(
      window.getByRole('status').filter({ hasText: 'Imagem de referência removida' }),
    ).toBeVisible();
    await window.getByRole('button', { name: 'Fechar' }).click();
    await expect(window.getByText('Gorel sem imagem de referência')).toBeAttached();
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
    env: { ...inheritedEnvironment, APP_DATA_DIR: dataDirectory, NODE_ENV: 'test' },
  });
}
