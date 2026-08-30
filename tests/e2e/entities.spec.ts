import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

const repositoryRoot = process.cwd();
const requireFromRepository = createRequire(path.join(repositoryRoot, 'package.json'));
const electronExecutable = requireFromRepository('electron') as string;

test('cadastra entidade com metadados, edita, arquiva e persiste após reiniciar', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-entities-e2e-'));
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
    await expect(window.getByRole('heading', { name: 'Personagens' })).toBeVisible();

    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
    await window.getByRole('button', { name: 'Ver entidades' }).click();
    await expect(window.getByRole('heading', { name: 'Entidades' })).toBeVisible();
    await expect(window.getByText('Nenhuma entidade cadastrada')).toBeVisible();

    await window.getByRole('button', { name: 'Nova entidade', exact: true }).click();
    await window.getByLabel('Nome *').fill('Gorel');
    await window.getByLabel('Resumo').fill('Chefe dos mineradores de Kabotya');
    await window.getByLabel('Estado canônico').selectOption('draft');
    await window.getByLabel('Natureza do conhecimento').selectOption('rumor');
    await window.getByLabel('Visibilidade').selectOption('players');
    await window.getByLabel('Origem').selectOption('document');
    await window.getByLabel('Identificador da fonte').fill('caderno-01');
    await window.getByRole('button', { name: 'Criar entidade' }).click();

    await expect(window.getByRole('status')).toContainText('Entidade “Gorel” criada.');
    await expect(window.getByTestId('entity-list')).toContainText('Gorel');
    await expect(window.getByTestId('entity-list')).toContainText(
      'Chefe dos mineradores de Kabotya',
    );
    await expect(window.getByTestId('entity-list')).toContainText('Rascunho');
    await expect(window.getByTestId('entity-list')).toContainText('Rumor');
    await expect(window.getByTestId('entity-list')).toContainText('Jogadores');

    await window.getByRole('button', { name: 'Editar Gorel' }).click();
    await expect(window.getByLabel('Nome *')).toHaveValue('Gorel');
    await expect(window.getByLabel('Estado canônico')).toHaveValue('draft');
    await expect(window.getByLabel('Natureza do conhecimento')).toHaveValue('rumor');
    await expect(window.getByLabel('Visibilidade')).toHaveValue('players');
    await expect(window.getByLabel('Origem')).toHaveValue('document');
    await expect(window.getByLabel('Identificador da fonte')).toHaveValue('caderno-01');
    await window.getByLabel('Resumo').fill('Chefe respeitado dos mineradores');
    await window.getByRole('button', { name: 'Salvar entidade' }).click();
    await expect(window.getByRole('status')).toContainText('Entidade “Gorel” atualizada.');

    await window.getByRole('button', { name: 'Arquivar Gorel' }).click();
    await window.getByRole('button', { name: 'Confirmar arquivamento' }).click();
    await expect(window.getByText('Nenhuma entidade cadastrada')).toBeVisible();
    await window.getByRole('button', { name: 'Arquivadas' }).click();
    await expect(window.getByTestId('entity-list')).toContainText('Gorel');
    await window.getByRole('button', { name: 'Restaurar Gorel' }).click();
    await window.getByRole('button', { name: 'Confirmar restauração' }).click();
    await window.getByRole('button', { name: 'Ativas' }).click();
    await expect(window.getByTestId('entity-list')).toContainText('Gorel');

    await application.close();
    application = null;
    application = await launch(dataDirectory);
    const restartedWindow = await application.firstWindow();
    await restartedWindow.getByRole('button', { name: 'Abrir campanha Vale das Pontes' }).click();
    await restartedWindow.getByRole('button', { name: 'Ver entidades' }).click();
    await expect(restartedWindow.getByTestId('entity-list')).toContainText('Gorel');
    await expect(restartedWindow.getByTestId('entity-list')).toContainText(
      'Chefe respeitado dos mineradores',
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
