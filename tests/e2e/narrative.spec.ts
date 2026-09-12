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

test('gerencia afirmações e notas contextuais e preserva tudo após reiniciar', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-narrative-e2e-'));
  let application: ElectronApplication | null = null;
  try {
    application = await launch(dataDirectory);
    let window = await application.firstWindow();
    await prepareCampaign(window);

    await window.getByRole('button', { name: 'Afirmações', exact: true }).click();
    await window.getByRole('button', { name: 'Nova afirmação' }).click();
    await window.getByLabel('Entidade sujeito *').selectOption({ label: 'Aris' });
    await window.getByLabel('Afirmação textual *').fill('A ponte pode esconder uma passagem.');
    await window.getByLabel('Natureza do conhecimento').selectOption('possibility');
    await window.getByLabel('Origem').selectOption('document');
    await window.getByLabel('Identificador da fonte *').fill('fonte-inválida');
    await window.getByRole('button', { name: 'Criar afirmação' }).click();
    await expect(window.getByRole('alert')).toContainText(
      'Não foi possível concluir a operação. Revise os dados e tente novamente.',
    );
    await expect(window.getByRole('button', { name: 'Criar afirmação' })).toBeEnabled();
    await window.getByLabel('Origem').selectOption('manual');
    await window.getByRole('button', { name: 'Criar afirmação' }).click();
    const assertionList = window.getByTestId('assertion-list');
    await expect(assertionList).toContainText('Possibilidade — não confirmada como fato');
    await expect(assertionList).not.toContainText('Fato');
    await window.getByRole('button', { name: 'Editar afirmação' }).click();
    await window
      .getByLabel('Afirmação textual *')
      .fill('A ponte talvez esconda uma passagem antiga.');
    await window.getByRole('button', { name: 'Salvar afirmação' }).click();
    await expect(assertionList).toContainText('passagem antiga');
    await window.getByRole('button', { name: 'Arquivar afirmação' }).click();
    await window.getByRole('button', { name: 'Confirmar arquivamento da afirmação' }).click();
    await expect(window.getByText('Nenhuma afirmação encontrada')).toBeVisible();
    await window.getByRole('button', { name: 'Arquivadas' }).click();
    await window.getByRole('button', { name: 'Restaurar afirmação' }).click();
    await window.getByRole('button', { name: 'Ativas' }).click();
    await expect(assertionList).toContainText('passagem antiga');
    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();

    await window.getByRole('button', { name: 'Notas', exact: true }).click();
    await window.getByRole('button', { name: 'Nova nota' }).click();
    await window.getByLabel('Título *').fill('Mapa da passagem');
    await window
      .getByLabel('Corpo em Markdown *')
      .fill('# Entrada\n\nA passagem fica sob a ponte.');
    await window.getByLabel('Tipo da nota').selectOption('clue');
    await window.getByRole('button', { name: 'Adicionar vínculo' }).click();
    await window.getByRole('button', { name: 'Adicionar vínculo' }).click();
    const entitySelects = window.getByLabel('Entidade');
    const roles = window.getByLabel('Papel');
    await entitySelects.nth(0).selectOption({ label: 'Aris' });
    await roles.nth(0).fill('descobridora');
    await entitySelects.nth(1).selectOption({ label: 'Ponte Velha' });
    await roles.nth(1).fill('local');
    await window.getByLabel('Origem').selectOption('document');
    await window.getByLabel('Identificador da fonte *').fill('fonte-inválida');
    await window.getByRole('button', { name: 'Criar nota' }).click();
    await expect(window.getByRole('alert')).toContainText(
      'Não foi possível concluir a operação. Revise os dados e tente novamente.',
    );
    await expect(window.getByRole('button', { name: 'Criar nota' })).toBeEnabled();
    await window.getByLabel('Origem').selectOption('manual');
    await window.getByRole('button', { name: 'Criar nota' }).click();
    await expect(window.getByTestId('note-list')).toContainText('Mapa da passagem');
    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();

    await window.getByRole('button', { name: 'Ver entidades' }).click();
    await window.getByRole('button', { name: 'Ver notas de Aris' }).click();
    await expect(window.getByText('Contexto: Aris')).toBeVisible();
    await expect(window.getByTestId('note-list')).toContainText('Mapa da passagem');
    await window.getByRole('button', { name: 'Editar Mapa da passagem' }).click();
    await window.getByLabel('Papel').nth(1).fill('cenário principal');
    await window.getByRole('button', { name: 'Salvar nota' }).click();
    await window.getByRole('button', { name: 'Voltar para entidades' }).click();
    await window.getByRole('button', { name: 'Ver notas de Ponte Velha' }).click();
    await expect(window.getByText('Contexto: Ponte Velha')).toBeVisible();
    await expect(window.getByTestId('note-list')).toContainText('Mapa da passagem');
    await window.getByRole('button', { name: 'Editar Mapa da passagem' }).click();
    await expect(window.getByLabel('Papel').nth(1)).toHaveValue('cenário principal');
    await window.getByRole('button', { name: 'Voltar para notas' }).click();
    await window.getByRole('button', { name: 'Arquivar Mapa da passagem' }).click();
    await window.getByRole('button', { name: 'Confirmar arquivamento da nota' }).click();
    await expect(window.getByText('Nenhuma nota encontrada')).toBeVisible();
    await window.getByRole('button', { name: 'Arquivadas' }).click();
    await expect(window.getByTestId('note-list')).toContainText('A passagem fica sob a ponte.');
    await window.getByRole('button', { name: 'Restaurar Mapa da passagem' }).click();

    await application.close();
    application = null;
    application = await launch(dataDirectory);
    window = await application.firstWindow();
    await window.getByRole('button', { name: 'Abrir campanha Crônicas da Ponte' }).click();
    await window.getByRole('button', { name: 'Notas', exact: true }).click();
    await expect(window.getByTestId('note-list')).toContainText('Mapa da passagem');
    await expect(window.getByTestId('note-list')).toContainText('# Entrada');
    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
    await window.getByRole('button', { name: 'Afirmações', exact: true }).click();
    await expect(window.getByTestId('assertion-list')).toContainText('passagem antiga');
    await expect(window.getByTestId('assertion-list')).toContainText(
      'Possibilidade — não confirmada como fato',
    );
  } finally {
    await application?.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

async function prepareCampaign(window: Page): Promise<void> {
  await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
  await window.getByLabel('Nome da campanha').fill('Crônicas da Ponte');
  await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
  await window.getByRole('button', { name: 'Abrir campanha Crônicas da Ponte' }).click();
  await window.getByRole('button', { name: 'Gerenciar tipos de entidade' }).click();
  await window.getByRole('button', { name: 'Criar primeiro tipo' }).click();
  await window.getByLabel('Nome plural').fill('Personagens');
  await window.getByLabel('Nome singular').fill('Personagem');
  await window.getByLabel('Identificador (slug)').fill('personagens');
  await window.getByRole('button', { name: 'Criar tipo de entidade' }).click();
  await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
  await window.getByRole('button', { name: 'Ver entidades' }).click();
  await createEntity(window, 'Aris');
  await createEntity(window, 'Ponte Velha');
  await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
}

async function createEntity(window: Page, name: string): Promise<void> {
  await window.getByRole('button', { name: 'Nova entidade', exact: true }).click();
  await window.getByLabel('Nome *').fill(name);
  await window.getByRole('button', { name: 'Criar entidade' }).click();
  await expect(window.getByTestId('entity-list')).toContainText(name);
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
