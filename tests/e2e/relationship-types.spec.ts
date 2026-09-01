import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

const repositoryRoot = process.cwd();
const requireFromRepository = createRequire(path.join(repositoryRoot, 'package.json'));
const electronExecutable = requireFromRepository('electron') as string;

test('configura, arquiva e persiste tipos de relação', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-relationship-types-e2e-'));
  let application: ElectronApplication | null = null;
  try {
    application = await launch(dataDirectory);
    let window = await application.firstWindow();
    await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
    await window.getByLabel('Nome da campanha').fill('Ethéria');
    await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    await window.getByRole('button', { name: 'Abrir campanha Ethéria' }).click();
    await window.getByRole('button', { name: 'Gerenciar tipos de entidade' }).click();
    await createEntityType(window, 'Personagens', 'Personagem', 'personagens');
    await window.getByRole('button', { name: 'Novo tipo' }).click();
    await window.getByLabel('Nome plural').fill('Locais');
    await window.getByLabel('Nome singular').fill('Local');
    await window.getByLabel('Identificador (slug)').fill('locais');
    await window.getByRole('button', { name: 'Criar tipo de entidade' }).click();
    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();

    await window.getByRole('button', { name: 'Tipos de relação' }).click();
    await expect(window.getByRole('heading', { name: 'Tipos de relação' })).toBeVisible();
    await window.getByRole('button', { name: 'Novo tipo de relação' }).click();
    await window.getByLabel('Nome *').fill('Trabalha em');
    await window.getByLabel('Slug *').fill('trabalha-em');
    await window.getByLabel('Nome inverso', { exact: true }).fill('Emprega');
    await window.getByLabel('Papel semântico').fill('belongs_to');
    await window
      .getByRole('group', { name: 'Tipos permitidos na origem' })
      .getByLabel('Personagens')
      .check();
    await window
      .getByRole('group', { name: 'Tipos permitidos no destino' })
      .getByLabel('Locais')
      .check();
    await window.getByRole('button', { name: 'Criar tipo' }).click();

    await expect(window.getByRole('status')).toContainText('Tipo de relação “Trabalha em” criado.');
    await expect(window.getByTestId('relationship-type-list')).toContainText('Inversa: Emprega');
    await expect(window.getByTestId('relationship-type-list')).toContainText('Origem: Personagens');
    await window.getByRole('button', { name: 'Editar' }).click();
    await window.getByLabel('Relação simétrica').check();
    await window.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(window.getByTestId('relationship-type-list')).toContainText('Simétrica');

    await window.getByRole('button', { name: 'Arquivar' }).click();
    await window.getByRole('button', { name: 'Confirmar' }).click();
    await expect(window.getByText('Nenhum tipo de relação criado')).toBeVisible();
    await window.getByRole('button', { name: 'Arquivados' }).click();
    await window.getByRole('button', { name: 'Restaurar' }).click();
    await window.getByRole('button', { name: 'Confirmar' }).click();
    await window.getByRole('button', { name: 'Ativos' }).click();
    await expect(window.getByRole('heading', { name: 'Trabalha em' })).toBeVisible();

    await application.close();
    application = null;
    application = await launch(dataDirectory);
    window = await application.firstWindow();
    await window.getByRole('button', { name: 'Abrir campanha Ethéria' }).click();
    await window.getByRole('button', { name: 'Tipos de relação' }).click();
    await expect(window.getByTestId('relationship-type-list')).toContainText('Trabalha em');
    await expect(window.getByTestId('relationship-type-list')).toContainText('Simétrica');
  } finally {
    await application?.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

async function createEntityType(
  window: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  plural: string,
  singular: string,
  slug: string,
): Promise<void> {
  await window.getByRole('button', { name: 'Criar primeiro tipo' }).click();
  await window.getByLabel('Nome plural').fill(plural);
  await window.getByLabel('Nome singular').fill(singular);
  await window.getByLabel('Identificador (slug)').fill(slug);
  await window.getByRole('button', { name: 'Criar tipo de entidade' }).click();
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
