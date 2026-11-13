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
    await createEntityType(window, 'Personagens', 'Personagem');
    await window.getByRole('button', { name: 'Novo tipo' }).click();
    await window.getByLabel('Nome plural').fill('Locais');
    await window.getByLabel('Nome singular').fill('Local');
    await window.getByRole('button', { name: 'Criar tipo de entidade' }).click();
    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();

    await window.getByRole('button', { name: 'Tipos de relação' }).click();
    await expect(window.getByRole('heading', { name: 'Tipos de relação' })).toBeVisible();
    await window.getByRole('button', { name: 'Novo tipo de relação' }).click();
    await expect(window.getByLabel('Ordem', { exact: true })).toHaveCount(0);
    await window.getByLabel('Nome *').fill('Trabalha em');
    await expect(window.getByLabel('Slug')).toHaveCount(0);
    await window.getByLabel('Nome inverso', { exact: true }).fill('Emprega');
    await window.getByLabel('Papel semântico').fill('belongs_to');
    await window.getByRole('radio', { name: 'Pessoa' }).check();
    await window
      .getByRole('group', { name: 'Tipos permitidos na origem' })
      .getByLabel('Personagens')
      .check();
    await window
      .getByRole('group', { name: 'Tipos permitidos no destino' })
      .getByLabel('Locais')
      .check();
    await window.getByText('Opções avançadas').click();
    const hexadecimal = window.getByLabel('Cor hexadecimal');
    await hexadecimal.fill('#12');
    await window.getByRole('button', { name: 'Criar tipo' }).click();
    await expect(hexadecimal).toHaveAttribute('aria-invalid', 'true');
    await expect(window.getByRole('alert')).toContainText(
      'Use uma cor hexadecimal no formato #RRGGBB.',
    );
    await window
      .getByRole('radiogroup', { name: 'Paleta de cores' })
      .getByLabel('Turquesa')
      .check();
    await window.getByRole('button', { name: 'Criar tipo' }).click();

    await expect(window.getByRole('status')).toContainText('Tipo de relação “Trabalha em” criado.');
    const relationshipTypeList = window.getByRole('list', { name: 'Ordenar tipos de relação' });
    const typeIcon = relationshipTypeList.getByTestId('relationship-type-icon').first();
    await expect(typeIcon.locator('[data-icon-id="person"]')).toBeVisible();
    await expect(typeIcon).toHaveCSS('background-color', 'rgb(15, 118, 110)');
    await expect(relationshipTypeList).toContainText('Inversa: Emprega');
    await expect(relationshipTypeList).toContainText('Origem: Personagens');
    await expect(relationshipTypeList).not.toContainText(/Ordem \d/);
    await window.getByRole('button', { name: 'Editar' }).click();
    let palette = window.getByRole('radiogroup', { name: 'Paleta de cores' });
    await expect(palette.getByLabel('Turquesa')).toBeChecked();
    await palette.getByLabel('Azul').check();
    await window.getByRole('button', { name: 'Cancelar' }).click();
    await window.getByRole('button', { name: 'Editar' }).click();
    palette = window.getByRole('radiogroup', { name: 'Paleta de cores' });
    await expect(palette.getByLabel('Turquesa')).toBeChecked();
    await palette.getByLabel('Sem cor').check();
    await window.getByRole('button', { name: 'Salvar alterações' }).click();
    await window.getByRole('button', { name: 'Editar' }).click();
    await expect(
      window.getByRole('radiogroup', { name: 'Paleta de cores' }).getByLabel('Sem cor'),
    ).toBeChecked();
    await window.getByLabel('Relação simétrica').check();
    await window.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(relationshipTypeList).toContainText('Simétrica');

    await window.getByRole('button', { name: 'Arquivar' }).click();
    await window.getByRole('button', { name: 'Confirmar' }).click();
    await expect(window.getByText('Nenhum tipo de relação criado')).toBeVisible();
    await window.getByRole('button', { name: 'Arquivados' }).click();
    const archivedRelationshipTypes = window.getByRole('list', {
      name: 'Tipos de relação arquivados',
    });
    await expect(archivedRelationshipTypes.getByRole('button', { name: /^Mover / })).toHaveCount(0);
    await expect(archivedRelationshipTypes).not.toContainText(/Ordem \d/);
    await window.getByRole('button', { name: 'Restaurar' }).click();
    await window.getByRole('button', { name: 'Confirmar' }).click();
    await window.getByRole('button', { name: 'Ativos' }).click();
    await expect(window.getByRole('heading', { name: 'Trabalha em' })).toBeVisible();

    await window.getByRole('button', { name: 'Novo tipo de relação' }).click();
    await expect(window.getByLabel('Ordem', { exact: true })).toHaveCount(0);
    const relationshipTypeName = window.getByLabel('Nome *');
    await relationshipTypeName.fill('Trabalha em');
    await window.getByRole('button', { name: 'Criar tipo' }).click();
    await expect(window.getByRole('alert')).toContainText(
      'Já existe um tipo de relação com esse nome. Escolha um nome diferente.',
    );
    await relationshipTypeName.fill('Conhece');
    await window.getByRole('button', { name: 'Criar tipo' }).click();
    await expect(relationshipTypeList.getByRole('heading')).toHaveText(['Trabalha em', 'Conhece']);
    const conheceCard = relationshipTypeList.getByRole('listitem').filter({ hasText: 'Conhece' });
    await conheceCard.getByRole('button', { name: 'Editar' }).click();
    await window.getByLabel('Nome *').fill('Trabalha em');
    await window.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(window.getByRole('alert')).toContainText(
      'Já existe um tipo de relação com esse nome. Escolha um nome diferente.',
    );
    await window.getByRole('button', { name: 'Cancelar' }).click();
    await expect(window.getByRole('alert')).toHaveCount(0);
    await window.getByRole('button', { name: 'Mover Conhece para cima' }).click();
    await expect(relationshipTypeList.getByRole('heading')).toHaveText(['Conhece', 'Trabalha em']);
    await expect(window.getByRole('status')).toContainText(
      'Tipo de relação “Conhece” reposicionado.',
    );

    await application.close();
    application = null;
    application = await launch(dataDirectory);
    window = await application.firstWindow();
    await window.getByRole('button', { name: 'Abrir campanha Ethéria' }).click();
    await window.getByRole('button', { name: 'Tipos de relação' }).click();
    const persistedTypes = window.getByRole('list', { name: 'Ordenar tipos de relação' });
    await expect(persistedTypes.getByRole('heading')).toHaveText(['Conhece', 'Trabalha em']);
    await expect(persistedTypes).toContainText('Simétrica');
    const persistedRelationship = persistedTypes
      .getByRole('listitem')
      .filter({ hasText: 'Trabalha em' });
    await persistedRelationship.getByRole('button', { name: 'Editar' }).click();
    await expect(
      window.getByRole('radiogroup', { name: 'Paleta de cores' }).getByLabel('Sem cor'),
    ).toBeChecked();
  } finally {
    await application?.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

async function createEntityType(
  window: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  plural: string,
  singular: string,
): Promise<void> {
  await window.getByRole('button', { name: 'Criar primeiro tipo' }).click();
  await window.getByLabel('Nome plural').fill(plural);
  await window.getByLabel('Nome singular').fill(singular);
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
