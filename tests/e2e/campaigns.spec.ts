import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import type { CampaignManagerGateway } from '../../src/core/contracts/gateway';

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
    await expect(window.getByRole('button', { name: 'Salvar alterações' })).toBeVisible();
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
    const archivedNavigation = window.getByRole('navigation', {
      name: 'Navegação da campanha As Crônicas de Ethéria — revisada',
    });
    await expect(
      archivedNavigation.getByRole('button', { name: 'Detalhes da campanha', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    for (const destination of [
      'Caixa de Entrada',
      'Sessões',
      'Cronologia',
      'Gerenciar tipos de entidade',
      'Ver entidades',
      'Tipos de relação',
      'Relações',
      'Afirmações',
      'Notas',
    ]) {
      await expect(
        archivedNavigation.getByRole('button', { name: destination, exact: true }),
      ).toHaveCount(0);
    }
    await expect(archivedNavigation).toContainText(
      'Restaure a campanha para acessar seus registros.',
    );
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

test('mantém navegação interna acessível para os módulos entregues da campanha', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-campaign-navigation-e2e-'));
  let application: ElectronApplication | null = null;

  try {
    application = await launch(dataDirectory);
    const window = await application.firstWindow();
    await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
    await window.getByLabel('Nome da campanha').fill('Navegação de Ethéria');
    await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    await window.getByRole('button', { name: 'Abrir campanha Navegação de Ethéria' }).click();

    const navigation = window.getByRole('navigation', {
      name: 'Navegação da campanha Navegação de Ethéria',
    });
    await expect(navigation).toBeVisible();
    await expect(
      navigation.getByRole('button', { name: 'Detalhes da campanha', exact: true }),
    ).toHaveAttribute('aria-current', 'page');

    const destinations = [
      ['Gerenciar tipos de entidade', 'Tipos de entidade'],
      ['Ver entidades', 'Entidades'],
      ['Tipos de relação', 'Tipos de relação'],
      ['Relações', 'Relações'],
      ['Afirmações', 'Afirmações'],
      ['Notas', 'Notas'],
      ['Sessões', 'Sessões'],
      ['Cronologia', 'Cronologia da campanha'],
      ['Caixa de Entrada', 'Caixa de Entrada'],
    ] as const;

    for (const [destination, heading] of destinations) {
      await navigation.getByRole('button', { name: destination, exact: true }).click();
      const pageHeading = window.getByRole('heading', { name: heading, exact: true });
      await expect(pageHeading).toBeVisible();
      await expect(pageHeading).toBeFocused();
      await expect(
        navigation.getByRole('button', { name: destination, exact: true }),
      ).toHaveAttribute('aria-current', 'page');
    }

    await expect(navigation.getByRole('button', { name: 'Relógios' })).toHaveCount(0);
    await navigation.getByRole('button', { name: 'Campanhas', exact: true }).click();
    await expect(window.getByRole('heading', { name: 'Campanhas', exact: true })).toBeVisible();
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
    await expect(window.getByLabel('Ordem', { exact: true })).toHaveCount(0);
    await window.getByLabel('Nome plural').fill('Personagens');
    await window.getByLabel('Nome singular').fill('Personagem');
    await window.getByLabel('Identificador (slug)').fill('Personagens');
    await window.getByRole('button', { name: 'Criar tipo de entidade' }).click();
    await expect(window.getByRole('alert')).toContainText(
      'O identificador deve usar apenas letras minúsculas sem acentos, números e hífens simples.',
    );
    await expect(window.getByRole('button', { name: 'Criar tipo de entidade' })).toBeEnabled();
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
    await expect(window.getByRole('list', { name: 'Ordenar tipos de entidade' })).toContainText(
      'Protagonista',
    );
    await expect(window.getByRole('list', { name: 'Ordenar tipos de entidade' })).toContainText(
      'Pessoas centrais para a história.',
    );

    await window.getByRole('button', { name: 'Arquivar tipo Personagens' }).click();
    await expect(window.getByRole('alert')).toContainText('Arquivar “Personagens”?');
    await window.getByRole('button', { name: 'Confirmar arquivamento do tipo' }).click();
    await expect(window.getByText('Nenhum tipo de entidade criado')).toBeVisible();
    await window.getByRole('button', { name: 'Arquivados' }).click();
    await expect(window.getByRole('heading', { name: 'Personagens' })).toBeVisible();
    const archivedEntityTypes = window.getByRole('list', {
      name: 'Tipos de entidade arquivados',
    });
    await expect(archivedEntityTypes.getByRole('button', { name: /^Mover / })).toHaveCount(0);
    await expect(archivedEntityTypes).not.toContainText(/Ordem \d/);
    await window.getByRole('button', { name: 'Restaurar tipo Personagens' }).click();
    await window.getByRole('button', { name: 'Confirmar restauração do tipo' }).click();
    await window.getByRole('button', { name: 'Ativos' }).click();
    await expect(window.getByRole('heading', { name: 'Personagens' })).toBeVisible();

    await window.getByRole('button', { name: 'Novo tipo' }).click();
    await expect(window.getByLabel('Ordem', { exact: true })).toHaveCount(0);
    await window.getByLabel('Nome plural').fill('Locais');
    await window.getByLabel('Nome singular').fill('Local');
    await window.getByLabel('Identificador (slug)').fill('locais');
    await window.getByRole('button', { name: 'Criar tipo de entidade' }).click();
    const entityTypeList = window.getByRole('list', { name: 'Ordenar tipos de entidade' });
    await expect(entityTypeList).not.toContainText(/Ordem \d/);
    await expect(entityTypeList.getByRole('heading')).toHaveText(['Personagens', 'Locais']);
    const locaisItem = entityTypeList.getByRole('listitem').filter({ hasText: 'Locais' });
    await locaisItem.focus();
    await locaisItem.press('Alt+ArrowUp');
    await expect(entityTypeList.getByRole('heading')).toHaveText(['Locais', 'Personagens']);
    await expect(window.getByRole('status')).toContainText('Tipo “Locais” reposicionado.');
    const personagensItem = entityTypeList.getByRole('listitem').filter({ hasText: 'Personagens' });
    await personagensItem.dragTo(locaisItem, { targetPosition: { x: 5, y: 1 } });
    await expect(entityTypeList.getByRole('heading')).toHaveText(['Personagens', 'Locais']);
    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
    await window.getByRole('button', { name: 'Gerenciar tipos de entidade' }).click();
    const reopenedEntityTypes = window.getByRole('list', { name: 'Ordenar tipos de entidade' });
    await expect(reopenedEntityTypes.getByRole('heading')).toHaveText(['Personagens', 'Locais']);
    await window.getByRole('button', { name: 'Mover Locais para cima' }).click();
    await expect(reopenedEntityTypes.getByRole('heading')).toHaveText(['Locais', 'Personagens']);

    await window.getByRole('button', { name: 'Gerenciar campos de Personagens' }).click();
    await expect(window.getByRole('heading', { name: 'Definições de campo' })).toBeVisible();
    await expect(window.getByText('Nenhuma definição de campo criada')).toBeVisible();
    await window.getByRole('button', { name: 'Criar primeiro campo' }).click();
    await expect(window.getByLabel('Ordem', { exact: true })).toHaveCount(0);
    const fieldLabel = window.getByLabel('Rótulo *');
    await expect(fieldLabel).toBeFocused();
    await expect(window.getByLabel('Chave', { exact: true })).toHaveCount(0);
    await expect(fieldLabel).toHaveAttribute('aria-describedby', 'field-key-generation-help');
    await expect(
      window.getByText('A chave técnica será gerada automaticamente ao criar o campo.'),
    ).toBeVisible();
    await window.getByRole('button', { name: 'Cancelar' }).click();
    await expect(window.getByRole('button', { name: 'Criar primeiro campo' })).toBeFocused();
    await window.getByRole('button', { name: 'Criar primeiro campo' }).click();
    await expect(fieldLabel).toBeFocused();
    await fieldLabel.fill('Nome');
    await window.getByLabel('Descrição').fill('Nome pelo qual a pessoa é conhecida.');
    await window.getByLabel('Papel semântico').selectOption('name');
    await window.getByLabel('Obrigatório').check();
    await window.getByLabel('Pesquisável').check();
    await window.getByRole('button', { name: 'Criar definição de campo' }).click();
    await expect(window.getByRole('list', { name: 'Ordenar definições de campo' })).toContainText(
      'Nome',
    );
    await expect(window.getByRole('status')).toContainText('Campo “Nome” criado.');
    await expect(window.getByRole('button', { name: 'Novo campo' })).toBeFocused();
    const keyBeforeRename = await readFieldKey(window, 'Nome');
    expect(keyBeforeRename).toBe('protagonista-nome');

    await window.getByRole('button', { name: 'Editar campo Nome' }).click();
    await expect(window.getByLabel('Rótulo *')).toBeFocused();
    await window.getByRole('button', { name: 'Cancelar' }).click();
    await expect(window.getByRole('button', { name: 'Editar campo Nome' })).toBeFocused();
    await window.getByRole('button', { name: 'Editar campo Nome' }).click();
    await expect(window.getByLabel('Rótulo *')).toBeFocused();
    await window.getByLabel('Rótulo *').fill('Nome completo');
    await window.getByLabel('Valor padrão (JSON)').fill('"Desconhecido"');
    await window.getByRole('button', { name: 'Salvar definição de campo' }).click();
    await expect(window.getByRole('list', { name: 'Ordenar definições de campo' })).toContainText(
      'Nome completo',
    );
    await expect(window.getByRole('button', { name: 'Editar campo Nome completo' })).toBeFocused();
    expect(await readFieldKey(window, 'Nome completo')).toBe(keyBeforeRename);
    await window.getByRole('button', { name: 'Arquivar campo Nome completo' }).click();
    await window.getByRole('button', { name: 'Confirmar arquivamento do campo' }).click();
    await expect(window.getByText('Nenhuma definição de campo criada')).toBeVisible();
    await window.getByRole('button', { name: 'Arquivadas' }).click();
    const archivedFields = window.getByRole('list', {
      name: 'Definições de campo arquivadas',
    });
    await expect(archivedFields.getByRole('button', { name: /^Mover / })).toHaveCount(0);
    await expect(archivedFields).not.toContainText(/Ordem \d/);
    await window.getByRole('button', { name: 'Restaurar campo Nome completo' }).click();
    await window.getByRole('button', { name: 'Confirmar restauração do campo' }).click();
    await window.getByRole('button', { name: 'Ativas' }).click();
    await expect(window.getByRole('list', { name: 'Ordenar definições de campo' })).toContainText(
      'Nome completo',
    );

    await window.getByRole('button', { name: 'Novo campo' }).click();
    await expect(window.getByLabel('Ordem', { exact: true })).toHaveCount(0);
    await window.getByLabel('Rótulo *').fill('Apelido');
    await window.getByRole('button', { name: 'Criar definição de campo' }).click();
    const fieldList = window.getByRole('list', { name: 'Ordenar definições de campo' });
    await expect(fieldList).not.toContainText(/Ordem \d/);
    await expect(fieldList.getByRole('heading')).toHaveText(['Nome completo', 'Apelido']);
    await window.getByRole('button', { name: 'Mover Apelido para cima' }).click();
    await expect(fieldList.getByRole('heading')).toHaveText(['Apelido', 'Nome completo']);
    await expect(window.getByRole('status')).toContainText('Campo “Apelido” reposicionado.');

    await application.close();
    application = null;
    application = await launch(dataDirectory);
    window = await application.firstWindow();
    await window.getByRole('button', { name: 'Abrir campanha Cidade das Pontes' }).click();
    await window.getByRole('button', { name: 'Gerenciar tipos de entidade' }).click();
    await expect(window.getByRole('heading', { name: 'Personagens' })).toBeVisible();
    const persistedEntityTypes = window.getByRole('list', { name: 'Ordenar tipos de entidade' });
    await expect(persistedEntityTypes.getByRole('heading')).toHaveText(['Locais', 'Personagens']);
    await expect(persistedEntityTypes).toContainText('Protagonista');
    await expect(persistedEntityTypes).toContainText(
      'Pessoas centrais para a história.',
    );
    await window.getByRole('button', { name: 'Gerenciar campos de Personagens' }).click();
    const persistedFields = window.getByRole('list', { name: 'Ordenar definições de campo' });
    await expect(persistedFields.getByRole('heading')).toHaveText(['Apelido', 'Nome completo']);
    await expect(persistedFields).toContainText('Obrigatório');
    await expect(persistedFields).toContainText('Pesquisável');
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

async function readFieldKey(
  window: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  label: string,
): Promise<string> {
  return window.evaluate(async (requestedLabel) => {
    const gateway = (globalThis as unknown as { campaignManager: CampaignManagerGateway })
      .campaignManager;
    const campaigns = await gateway.campaigns.list({});
    if (!campaigns.ok) throw new Error('Não foi possível consultar a campanha do teste.');
    const campaign = campaigns.data.items[0];
    if (campaign === undefined) throw new Error('Campanha do teste ausente.');
    const entityTypes = await gateway.entityTypes.list({ campaignId: campaign.id });
    if (!entityTypes.ok) throw new Error('Não foi possível consultar os grupos do teste.');
    const entityType = entityTypes.data.items[0];
    if (entityType === undefined) throw new Error('Grupo do teste ausente.');
    const fields = await gateway.fieldDefinitions.list({
      campaignId: campaign.id,
      entityTypeId: entityType.id,
    });
    if (!fields.ok) throw new Error('Não foi possível consultar os campos do teste.');
    const field = fields.data.items.find((item) => item.label === requestedLabel);
    if (field === undefined) throw new Error(`Campo ausente: ${requestedLabel}`);
    return field.key;
  }, label);
}
