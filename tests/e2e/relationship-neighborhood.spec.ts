import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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

test('navega pela vizinhança com profundidade, direção inversa e filtros', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-neighborhood-e2e-'));
  let application: ElectronApplication | null = null;
  try {
    application = await launch(dataDirectory);
    const window = await application.firstWindow();
    await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
    await window.getByLabel('Nome da campanha').fill('Ethéria');
    await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    await window.getByRole('button', { name: 'Abrir campanha Ethéria' }).click();
    await window.getByRole('button', { name: 'Gerenciar tipos de entidade' }).click();
    await window.getByRole('button', { name: 'Criar primeiro tipo' }).click();
    await window.getByLabel('Nome plural').fill('Personagens');
    await window.getByLabel('Nome singular').fill('Personagem');
    await window.getByLabel('Identificador (slug)').fill('personagens');
    await window.getByRole('button', { name: 'Criar tipo de entidade' }).click();
    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
    await window.getByRole('button', { name: 'Ver entidades' }).click();
    for (const name of ['Gorel', 'Kabotya', 'Cabos Antigos']) await createEntity(window, name);
    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
    await window.getByRole('button', { name: 'Tipos de relação' }).click();
    await window.getByRole('button', { name: 'Novo tipo de relação' }).click();
    await window.getByLabel('Nome *').fill('Conhece');
    await window.getByLabel('Slug *').fill('conhece');
    await window.getByLabel('Nome inverso', { exact: true }).fill('É conhecido por');
    await window.getByRole('button', { name: 'Criar tipo' }).click();
    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
    await window.getByRole('button', { name: 'Relações', exact: true }).click();
    await createRelationship(window, 'Gorel', 'Kabotya');
    await createRelationship(window, 'Kabotya', 'Cabos Antigos');

    await window.getByLabel('Entidade central').selectOption({ label: 'Gorel' });
    const list = window.getByTestId('neighborhood-text-list');
    await expect(list).toContainText('Gorel — Conhece → Kabotya');
    await expect(list).not.toContainText('Cabos Antigos');
    await window.getByLabel('Profundidade').selectOption('2');
    await expect(list).toContainText('Kabotya — Conhece → Cabos Antigos');
    await expect(window.getByTestId('neighborhood-graph-edge')).toHaveCount(2);
    await window.getByLabel('Tipo de relação').selectOption({ label: 'Conhece' });
    await expect(list).toContainText('Kabotya — Conhece → Cabos Antigos');
    await window.getByLabel('Estado canônico').selectOption('rejected');
    await expect(list).toContainText('Nenhuma conexão corresponde aos filtros.');
    await window.getByLabel('Estado canônico').selectOption('');
    await window.getByLabel('Visibilidade').selectOption('players');
    await expect(list).toContainText('Nenhuma conexão corresponde aos filtros.');
    await window.getByLabel('Visibilidade').selectOption('');
    await list.getByRole('button', { name: 'Cabos Antigos' }).click();
    await expect(list).toContainText('Cabos Antigos — É conhecido por → Kabotya');
    await window.getByLabel('Natureza').selectOption('rumor');
    await expect(list).toContainText('Nenhuma conexão corresponde aos filtros.');
    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
    await window.getByRole('button', { name: 'Tipos de relação' }).click();
    await window.getByRole('button', { name: 'Arquivar' }).click();
    await window.getByRole('button', { name: 'Confirmar' }).click();
    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
    await window.getByRole('button', { name: 'Relações', exact: true }).click();
    await window.getByLabel('Entidade central').selectOption({ label: 'Cabos Antigos' });
    await window.getByLabel('Profundidade').selectOption('2');
    await expect(window.getByTestId('neighborhood-text-list')).toContainText(
      'Cabos Antigos — É conhecido por → Kabotya',
    );
  } finally {
    await application?.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

async function createEntity(window: Page, name: string): Promise<void> {
  await window.getByRole('button', { name: 'Nova entidade', exact: true }).click();
  await window.getByLabel('Nome *').fill(name);
  await window.getByRole('button', { name: 'Criar entidade' }).click();
  await expect(window.getByRole('status')).toContainText(`Entidade “${name}” criada.`);
}
async function createRelationship(window: Page, source: string, target: string): Promise<void> {
  await window.getByLabel('Tipo *').selectOption({ label: 'Conhece' });
  await window.getByLabel('Origem *').selectOption({ label: source });
  await window.getByLabel('Destino *').selectOption({ label: target });
  await window.getByRole('button', { name: 'Salvar relação' }).click();
  await expect(window.getByRole('status')).toContainText('Relação criada.');
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
