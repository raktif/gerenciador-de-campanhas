import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import type { CampaignManagerGateway } from '../../src/core/contracts/gateway';

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

    await window.getByRole('button', { name: 'Tipos de relação' }).click();
    await window.getByRole('button', { name: 'Novo tipo de relação' }).click();
    await window.getByRole('textbox', { name: 'Nome *', exact: true }).fill('Aliado de');
    await window.getByLabel('Slug').fill('aliado-de');
    await window.getByRole('button', { name: 'Criar tipo' }).click();
    await expect(window.getByTestId('relationship-type-list')).toContainText('Aliado de');
    const relationshipTypeId = await window.evaluate(async () => {
      const campaignManager = (globalThis as unknown as TestGatewayWindow).campaignManager;
      const campaigns = await campaignManager.campaigns.list({});
      if (!campaigns.ok) throw new Error('Não foi possível localizar a campanha de teste.');
      const campaignId = campaigns.data.items[0]?.id;
      if (campaignId === undefined) throw new Error('Campanha de teste ausente.');
      const relationshipTypes = await campaignManager.relationshipTypes.list({
        campaignId,
        filters: { isArchived: false },
      });
      if (!relationshipTypes.ok) throw new Error('Não foi possível localizar o tipo de relação.');
      const relationshipType = relationshipTypes.data.items.find(
        (item) => item.slug === 'aliado-de',
      );
      if (relationshipType === undefined) throw new Error('Tipo de relação de teste ausente.');
      return relationshipType.id;
    });

    await window.getByRole('button', { name: 'Gerenciar tipos de entidade' }).click();

    await window.getByRole('button', { name: 'Gerenciar campos de Personagens' }).click();
    await window.getByRole('button', { name: 'Criar primeiro campo' }).click();
    await window.getByLabel('Rótulo *').fill('Título');
    await window.getByRole('button', { name: 'Criar definição de campo' }).click();
    await expect(window.getByTestId('field-definition-list')).toContainText('Título');
    await window.getByRole('button', { name: 'Novo campo' }).click();
    await window.getByLabel('Rótulo *').fill('Aliados');
    await window.getByLabel('Tipo de dado').selectOption('entity_reference_list');
    await window.getByLabel('ID do tipo de relacionamento').fill(relationshipTypeId);
    await window.getByLabel('Direção').selectOption('outgoing');
    await window.getByLabel('Ao excluir').selectOption('unlink');
    await window.getByRole('button', { name: 'Criar definição de campo' }).click();
    await expect(window.getByTestId('field-definition-list')).toContainText('Aliados');
    await window.getByRole('button', { name: 'Voltar para tipos de entidade' }).click();

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
    await window.getByLabel('Título').fill('Capataz de Kabotya');
    await window.getByRole('button', { name: 'Criar entidade' }).click();

    await expect(window.getByRole('status')).toContainText('Entidade “Gorel” criada.');
    await expect(window.getByTestId('entity-list')).toContainText('Gorel');
    await expect(window.getByTestId('entity-list')).toContainText(
      'Chefe dos mineradores de Kabotya',
    );
    await expect(window.getByTestId('entity-list')).toContainText('Rascunho');
    await expect(window.getByTestId('entity-list')).toContainText('Rumor');
    await expect(window.getByTestId('entity-list')).toContainText('Jogadores');

    await window.getByRole('button', { name: 'Nova entidade', exact: true }).click();
    await window.getByLabel('Nome *').fill('Mara');
    await window.getByRole('button', { name: 'Criar entidade' }).click();
    await expect(window.getByTestId('entity-list')).toContainText('Mara');
    await window.getByRole('button', { name: 'Nova entidade', exact: true }).click();
    await window.getByLabel('Nome *').fill('Nilo');
    await window.getByRole('button', { name: 'Criar entidade' }).click();
    await expect(window.getByTestId('entity-list')).toContainText('Nilo');
    await window.getByRole('button', { name: 'Relações' }).click();
    await window.getByLabel('Tipo *').selectOption({ label: 'Aliado de' });
    await window.getByLabel('Origem *').selectOption({ label: 'Gorel' });
    await window.getByLabel('Destino *').selectOption({ label: 'Mara' });
    await window.getByRole('button', { name: 'Salvar relação', exact: true }).click();
    await expect(window.getByTestId('relationship-list')).toContainText('Gorel');
    await window.getByRole('button', { name: 'Ver entidades' }).click();

    await window.getByRole('button', { name: 'Abrir detalhes de Gorel' }).first().click();
    await window.getByRole('button', { name: 'Ver relações' }).focus();
    await window.keyboard.press('Enter');
    await expect(window.getByLabel('Entidade central').locator('option:checked')).toHaveText(
      'Gorel',
    );
    await expect(window.getByLabel('Profundidade')).toHaveValue('1');
    await expect(window.getByTestId('neighborhood-text-list')).toContainText('Gorel');
    await expect(window.getByTestId('neighborhood-text-list')).toContainText('Mara');
    await window.getByRole('button', { name: 'Voltar para detalhes de Gorel' }).focus();
    await window.keyboard.press('Enter');
    await expect(window.getByRole('heading', { name: 'Gorel', exact: true })).toBeVisible();
    await expect(window.getByRole('button', { name: 'Ver relações' })).toBeFocused();
    await window.getByRole('button', { name: 'Voltar para entidades' }).click();

    await window.getByRole('button', { name: 'Relações' }).click();
    await window.getByLabel('Entidade central').selectOption({ label: 'Gorel' });
    await window.getByLabel('Tipo *').selectOption({ label: 'Aliado de' });
    await window.getByLabel('Origem *').selectOption({ label: 'Mara' });
    await window.getByLabel('Destino *').selectOption({ label: 'Gorel' });
    await window.getByRole('button', { name: 'Salvar relação', exact: true }).click();
    await expect(window.getByLabel('Entidade central').locator('option:checked')).toHaveText(
      'Gorel',
    );
    await expect(window.getByLabel('Profundidade')).toHaveValue('1');
    await expect(window.getByTestId('neighborhood-text-list')).toContainText('Gorel');
    await window.getByRole('button', { name: 'Ver entidades' }).click();

    await window.getByRole('button', { name: 'Abrir detalhes de Nilo' }).first().click();
    await window.getByRole('button', { name: 'Ver relações' }).click();
    await expect(window.getByLabel('Entidade central').locator('option:checked')).toHaveText(
      'Nilo',
    );
    await expect(window.getByRole('status')).toContainText(
      'Nenhuma conexão corresponde aos filtros.',
    );
    await window.getByRole('button', { name: 'Ver entidades' }).click();

    await window.getByRole('button', { name: 'Abrir detalhes de Gorel' }).first().click();
    await expect(window.getByRole('heading', { name: 'Gorel', exact: true })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Gorel', exact: true })).toBeFocused();
    await expect(window.getByText('Descrição', { exact: true })).toBeVisible();
    await expect(window.getByText('Informações narrativas', { exact: true })).toBeVisible();
    await expect(window.getByText('Campos preenchidos', { exact: true })).toBeVisible();
    await expect(window.getByText('Capataz de Kabotya', { exact: true })).toBeVisible();
    await expect(window.getByText('Mara', { exact: true })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Relações', exact: true })).toBeVisible();
    await expect(window.getByRole('list', { name: 'Relações da entidade' })).toContainText(
      'Aliado de: Mara',
    );
    await window.getByRole('button', { name: 'Editar', exact: true }).click();
    await expect(window.getByLabel('Nome *')).toHaveValue('Gorel');
    await expect(window.getByLabel('Estado canônico')).toHaveValue('draft');
    await expect(window.getByLabel('Natureza do conhecimento')).toHaveValue('rumor');
    await expect(window.getByLabel('Visibilidade')).toHaveValue('players');
    await expect(window.getByLabel('Origem')).toHaveValue('document');
    await window.getByLabel('Resumo').fill('Chefe respeitado dos mineradores');
    await window.getByRole('button', { name: 'Cancelar', exact: true }).click();
    const discardDialog = window.getByRole('dialog', { name: 'Descartar alterações?' });
    await expect(discardDialog).toContainText('Você possui alterações que ainda não foram salvas.');
    await expect(discardDialog.getByRole('button', { name: 'Continuar editando' })).toBeFocused();
    await window.keyboard.press('Shift+Tab');
    await expect(discardDialog.getByRole('button', { name: 'Descartar alterações' })).toBeFocused();
    await window.keyboard.press('Tab');
    await expect(discardDialog.getByRole('button', { name: 'Continuar editando' })).toBeFocused();
    await window.keyboard.press('Escape');
    await expect(discardDialog).toHaveCount(0);
    await expect(window.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
    await window.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await discardDialog.getByRole('button', { name: 'Continuar editando' }).click();
    await expect(window.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
    await window.getByRole('button', { name: 'Salvar entidade' }).click();
    await expect(window.getByRole('status')).toContainText('Entidade “Gorel” atualizada.');

    await window.getByRole('button', { name: 'Abrir detalhes de Gorel' }).first().click();
    await window.getByRole('button', { name: 'Editar', exact: true }).click();
    await window.getByLabel('Resumo').fill('Alteração descartada');
    await window.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await window
      .getByRole('dialog', { name: 'Descartar alterações?' })
      .getByRole('button', { name: 'Descartar alterações' })
      .click();
    await expect(window.getByTestId('entity-list')).toContainText(
      'Chefe respeitado dos mineradores',
    );
    await expect(window.getByTestId('entity-list')).not.toContainText('Alteração descartada');
    await expect(
      window.getByRole('button', { name: 'Abrir detalhes de Gorel' }).first(),
    ).toBeFocused();

    await window.getByRole('button', { name: 'Abrir detalhes de Gorel' }).nth(1).click();
    await expect(window.getByRole('heading', { name: 'Gorel', exact: true })).toBeFocused();
    await window.getByRole('button', { name: 'Voltar para entidades' }).click();
    await expect(
      window.getByRole('button', { name: 'Abrir detalhes de Gorel' }).nth(1),
    ).toBeFocused();

    await window.getByRole('button', { name: 'Abrir detalhes de Gorel' }).first().click();
    await window.getByRole('button', { name: 'Editar', exact: true }).click();
    await window.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(
      window.getByRole('button', { name: 'Abrir detalhes de Gorel' }).first(),
    ).toBeFocused();

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

interface TestGatewayWindow {
  campaignManager: CampaignManagerGateway;
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
