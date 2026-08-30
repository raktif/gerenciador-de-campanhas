import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

const repositoryRoot = process.cwd();
const requireFromRepository = createRequire(path.join(repositoryRoot, 'package.json'));
const electronExecutable = requireFromRepository('electron') as string;

test('cria, edita e gerencia o ciclo de vida após reiniciar', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-campaign-manager-e2e-'));
  let application: ElectronApplication | null = null;

  try {
    application = await launch(dataDirectory);
    let window = await application.firstWindow();
    await expect(
      window.getByRole('heading', { name: 'Bem-vindo ao Gerenciador de Campanhas de RPG' }),
    ).toBeVisible();

    await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
    await window.getByLabel('Nome da campanha').fill('As Crônicas de Ethéria');
    await window.getByLabel('Sistema').fill('Sistema próprio');
    await window.getByLabel('Conceito').fill('Um mundo conectado por antigas redes bélicas.');
    await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();

    await expect(window.getByRole('heading', { name: 'Campanhas', exact: true })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'As Crônicas de Ethéria' })).toBeVisible();
    await expect(window.getByRole('status')).toContainText(
      'Campanha “As Crônicas de Ethéria” criada.',
    );

    await window.getByRole('button', { name: 'Abrir campanha As Crônicas de Ethéria' }).click();
    await expect(window.getByText('Detalhes da campanha')).toBeVisible();
    await expect(window.getByLabel('Sistema')).toHaveValue('Sistema próprio');
    await window.getByLabel('Nome da campanha').fill('As Crônicas de Ethéria — revisada');
    await window.getByLabel('Sistema').fill('');
    await window.getByLabel('Tom').fill('Esperançoso e misterioso');
    await window.getByRole('button', { name: 'Salvar alterações' }).click();

    await expect(
      window.getByRole('heading', { name: 'As Crônicas de Ethéria — revisada' }),
    ).toBeVisible();
    await expect(window.getByRole('status')).toContainText(
      'Campanha “As Crônicas de Ethéria — revisada” atualizada.',
    );
    await application.close();
    application = null;

    application = await launch(dataDirectory);
    window = await application.firstWindow();
    await expect(
      window.getByRole('heading', { name: 'As Crônicas de Ethéria — revisada' }),
    ).toBeVisible();
    await window
      .getByRole('button', { name: 'Abrir campanha As Crônicas de Ethéria — revisada' })
      .click();
    await expect(window.getByLabel('Sistema')).toHaveValue('');
    await expect(window.getByLabel('Tom')).toHaveValue('Esperançoso e misterioso');

    await window.getByRole('button', { name: 'Arquivar' }).click();
    await expect(window.getByRole('alert')).toContainText('Arquivar esta campanha?');
    await window.getByRole('button', { name: 'Confirmar arquivamento' }).click();
    await expect(window.getByRole('status')).toContainText(
      'Campanha “As Crônicas de Ethéria — revisada” arquivada.',
    );

    await window.getByRole('button', { name: 'Arquivadas' }).click();
    await expect(
      window.getByRole('heading', { name: 'As Crônicas de Ethéria — revisada' }),
    ).toBeVisible();
    await window
      .getByRole('button', { name: 'Abrir campanha As Crônicas de Ethéria — revisada' })
      .click();
    await expect(window.getByText('Status: Arquivada')).toBeVisible();
    await window.getByRole('button', { name: 'Restaurar' }).click();
    await window.getByRole('button', { name: 'Confirmar restauração' }).click();

    await window.getByRole('button', { name: 'Ativas' }).click();
    await window
      .getByRole('button', { name: 'Abrir campanha As Crônicas de Ethéria — revisada' })
      .click();
    await window.getByRole('button', { name: 'Mover para lixeira' }).click();
    await expect(window.getByRole('alert')).toContainText('Mover esta campanha para a lixeira?');
    await window.getByRole('button', { name: 'Confirmar envio à lixeira' }).click();

    await window.getByRole('button', { name: 'Lixeira' }).click();
    await window
      .getByRole('button', { name: 'Abrir campanha As Crônicas de Ethéria — revisada' })
      .click();
    await expect(window.getByText('Status: Na lixeira')).toBeVisible();
    await window.getByRole('button', { name: 'Restaurar' }).click();
    await window.getByRole('button', { name: 'Confirmar restauração' }).click();

    await window.getByRole('button', { name: 'Ativas' }).click();
    await expect(
      window.getByRole('heading', { name: 'As Crônicas de Ethéria — revisada' }),
    ).toBeVisible();
  } finally {
    await application?.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test('configura tipos de entidade isolados na campanha e os recupera após reiniciar', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-entity-types-e2e-'));
  let application: ElectronApplication | null = null;

  try {
    application = await launch(dataDirectory);
    let window = await application.firstWindow();
    await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
    await window.getByLabel('Nome da campanha').fill('Cidade das Pontes');
    await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    await window.getByRole('button', { name: 'Abrir campanha Cidade das Pontes' }).click();
    await window.getByRole('button', { name: 'Gerenciar tipos de entidade' }).click();

    await expect(window.getByRole('heading', { name: 'Tipos de entidade' })).toBeVisible();
    await expect(window.getByText('Nenhum tipo de entidade criado')).toBeVisible();
    await window.getByRole('button', { name: 'Criar primeiro tipo' }).click();
    await window.getByLabel('Nome plural').fill('Personagens');
    await window.getByLabel('Nome singular').fill('Personagem');
    await window.getByLabel('Identificador (slug)').fill('personagens');
    await window.getByLabel('Descrição').fill('Pessoas que movem a história.');
    await window.getByLabel('Ícone ou símbolo').fill('P');
    await window.getByLabel('Cor').fill('#92400e');
    await window.getByRole('button', { name: 'Criar tipo de entidade' }).click();

    await expect(window.getByRole('heading', { name: 'Personagens' })).toBeVisible();
    await expect(window.getByRole('status')).toContainText('Tipo “Personagens” criado.');
    await window.getByRole('button', { name: 'Editar tipo Personagens' }).click();
    await window.getByLabel('Nome singular').fill('Protagonista');
    await window.getByLabel('Descrição').fill('Pessoas centrais para a história.');
    await window.getByRole('button', { name: 'Salvar tipo de entidade' }).click();
    await expect(window.getByTestId('entity-type-list')).toContainText('Protagonista');
    await expect(window.getByTestId('entity-type-list')).toContainText(
      'Pessoas centrais para a história.',
    );

    await window.getByRole('button', { name: 'Arquivar tipo Personagens' }).click();
    await expect(window.getByRole('alert')).toContainText('Arquivar “Personagens”?');
    await window.getByRole('button', { name: 'Confirmar arquivamento do tipo' }).click();
    await expect(window.getByText('Nenhum tipo de entidade criado')).toBeVisible();
    await window.getByRole('button', { name: 'Arquivados' }).click();
    await expect(window.getByRole('heading', { name: 'Personagens' })).toBeVisible();
    await window.getByRole('button', { name: 'Restaurar tipo Personagens' }).click();
    await window.getByRole('button', { name: 'Confirmar restauração do tipo' }).click();
    await window.getByRole('button', { name: 'Ativos' }).click();
    await expect(window.getByRole('heading', { name: 'Personagens' })).toBeVisible();

    await window.getByRole('button', { name: 'Gerenciar campos de Personagens' }).click();
    await expect(window.getByRole('heading', { name: 'Definições de campo' })).toBeVisible();
    await expect(window.getByText('Nenhuma definição de campo criada')).toBeVisible();
    await window.getByRole('button', { name: 'Criar primeiro campo' }).click();
    await window.getByLabel('Rótulo *').fill('Nome');
    await window.getByLabel('Chave *').fill('nome');
    await window.getByLabel('Descrição').fill('Nome pelo qual a pessoa é conhecida.');
    await window.getByLabel('Papel semântico').selectOption('name');
    await window.getByLabel('Obrigatório').check();
    await window.getByLabel('Pesquisável').check();
    await window.getByRole('button', { name: 'Criar definição de campo' }).click();
    await expect(window.getByTestId('field-definition-list')).toContainText('Nome');
    await expect(window.getByRole('status')).toContainText('Campo “Nome” criado.');

    await window.getByRole('button', { name: 'Editar campo Nome' }).click();
    await window.getByLabel('Rótulo *').fill('Nome completo');
    await window.getByLabel('Valor padrão (JSON)').fill('"Desconhecido"');
    await window.getByRole('button', { name: 'Salvar definição de campo' }).click();
    await expect(window.getByTestId('field-definition-list')).toContainText('Nome completo');
    await window.getByRole('button', { name: 'Arquivar campo Nome completo' }).click();
    await window.getByRole('button', { name: 'Confirmar arquivamento do campo' }).click();
    await expect(window.getByText('Nenhuma definição de campo criada')).toBeVisible();
    await window.getByRole('button', { name: 'Arquivadas' }).click();
    await window.getByRole('button', { name: 'Restaurar campo Nome completo' }).click();
    await window.getByRole('button', { name: 'Confirmar restauração do campo' }).click();
    await window.getByRole('button', { name: 'Ativas' }).click();
    await expect(window.getByTestId('field-definition-list')).toContainText('Nome completo');

    await application.close();
    application = null;
    application = await launch(dataDirectory);
    window = await application.firstWindow();
    await window.getByRole('button', { name: 'Abrir campanha Cidade das Pontes' }).click();
    await window.getByRole('button', { name: 'Gerenciar tipos de entidade' }).click();
    await expect(window.getByRole('heading', { name: 'Personagens' })).toBeVisible();
    await expect(window.getByTestId('entity-type-list')).toContainText('Protagonista');
    await expect(window.getByTestId('entity-type-list')).toContainText(
      'Pessoas centrais para a história.',
    );
    await window.getByRole('button', { name: 'Gerenciar campos de Personagens' }).click();
    await expect(window.getByTestId('field-definition-list')).toContainText('Nome completo');
    await expect(window.getByTestId('field-definition-list')).toContainText('Obrigatório');
    await expect(window.getByTestId('field-definition-list')).toContainText('Pesquisável');
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
