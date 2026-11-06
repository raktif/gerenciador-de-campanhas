import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

const repositoryRoot = process.cwd();
const requireFromRepository = createRequire(path.join(repositoryRoot, 'package.json'));
const electronExecutable = requireFromRepository('electron') as string;
const characterTypeId = '60000000-0000-4000-8000-000000000020';
const locationTypeId = '60000000-0000-4000-8000-000000000021';
const relationshipTypeId = '70000000-0000-4000-8000-000000000020';

test('autoria ajuda e referências por nomes sem expor UUIDs', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-field-authoring-e2e-'));
  let application: ElectronApplication | null = null;

  try {
    application = await launch(dataDirectory);
    let window = await application.firstWindow();
    await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
    await window.getByLabel('Nome da campanha').fill('Autoria de Campos');
    await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    await expect(
      window.getByRole('heading', { name: 'Autoria de Campos', exact: true }),
    ).toBeVisible();

    await application.close();
    application = null;
    seedReferenceOptions(dataDirectory);
    application = await launch(dataDirectory);
    window = await application.firstWindow();

    await window.getByRole('button', { name: 'Abrir campanha Autoria de Campos' }).click();
    await window.getByRole('button', { name: 'Gerenciar tipos de entidade' }).click();
    await window.getByRole('button', { name: 'Gerenciar campos de Personagens' }).click();
    await window.getByRole('button', { name: 'Criar primeiro campo' }).click();
    await window.getByLabel('Rótulo *').fill('Aliados');
    await window.getByLabel('Texto de ajuda').fill('Escolha aliados relevantes para a história.');
    await window.getByLabel('Exemplo').fill('Mara e Nilo');
    await window
      .getByRole('combobox', { name: 'Tipo de dado' })
      .selectOption('entity_reference_list');

    const relationshipType = window.getByLabel('Tipo de relacionamento');
    const allowedTypes = window.getByRole('group', { name: 'Tipos de entidade permitidos' });
    await expect(relationshipType).toBeEnabled();
    await expect(relationshipType).toContainText('Aliado de');
    await expect(allowedTypes).toContainText('Personagens');
    await expect(allowedTypes).toContainText('Locais');
    await expect(window.getByText(relationshipTypeId)).toHaveCount(0);
    await expect(window.getByText(characterTypeId)).toHaveCount(0);
    await expect(window.getByText(locationTypeId)).toHaveCount(0);

    await relationshipType.selectOption({ label: 'Aliado de' });
    await window.getByLabel('Direção').selectOption('outgoing');
    await allowedTypes.getByRole('checkbox', { name: 'Personagens' }).check();
    await allowedTypes.getByRole('checkbox', { name: 'Locais' }).check();
    await window.getByLabel('Ao excluir').selectOption('unlink');
    await window.getByRole('button', { name: 'Criar definição de campo' }).click();
    await expect(window.getByRole('status')).toContainText('Campo “Aliados” criado.');
    await window.getByRole('button', { name: 'Editar campo Aliados' }).click();
    await expect(window.getByLabel('Texto de ajuda')).toHaveValue(
      'Escolha aliados relevantes para a história.',
    );
    await expect(window.getByLabel('Exemplo')).toHaveValue('Mara e Nilo');
    await expect(window.getByLabel('Tipo de relacionamento').locator('option:checked')).toHaveText(
      'Aliado de',
    );
    const editedAllowedTypes = window.getByRole('group', {
      name: 'Tipos de entidade permitidos',
    });
    await expect(editedAllowedTypes.getByRole('checkbox', { name: 'Personagens' })).toBeChecked();
    await expect(editedAllowedTypes.getByRole('checkbox', { name: 'Locais' })).toBeChecked();
    await expect(window.getByLabel('ID do tipo de relacionamento')).toHaveCount(0);
    await expect(window.getByLabel('IDs dos tipos permitidos (separados por vírgula)')).toHaveCount(
      0,
    );

    await window.getByLabel('Texto de ajuda').fill('Escolha aliados atuais deste personagem.');
    await window.getByRole('button', { name: 'Salvar definição de campo' }).click();
    await expect(window.getByRole('status')).toContainText('Campo “Aliados” atualizado.');
    await window.getByRole('button', { name: 'Editar campo Aliados' }).click();
    await expect(window.getByLabel('Texto de ajuda')).toHaveValue(
      'Escolha aliados atuais deste personagem.',
    );
  } finally {
    await application?.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

function seedReferenceOptions(dataDirectory: string): void {
  const database = new Database(path.join(dataDirectory, 'database', 'app.db'));
  try {
    const campaign = database
      .prepare("SELECT id FROM campaigns WHERE name = 'Autoria de Campos'")
      .get() as { id: string } | undefined;
    if (campaign === undefined) throw new Error('Campanha do teste ausente.');
    const now = new Date().toISOString();
    const insertEntityType = database.prepare(
      `INSERT INTO entity_types (
        id, campaign_id, name, singular_name, slug, sort_order,
        is_system, is_archived, created_at, updated_at, revision
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 1)`,
    );
    insertEntityType.run(
      characterTypeId,
      campaign.id,
      'Personagens',
      'Personagem',
      'personagens',
      0,
      now,
      now,
    );
    insertEntityType.run(locationTypeId, campaign.id, 'Locais', 'Local', 'locais', 1, now, now);
    database
      .prepare(
        `INSERT INTO relationship_types (
          id, campaign_id, name, slug, is_symmetric, sort_order,
          is_archived, created_at, updated_at, revision
        ) VALUES (?, ?, 'Aliado de', 'aliado-de', 0, 0, 0, ?, ?, 1)`,
      )
      .run(relationshipTypeId, campaign.id, now, now);
  } finally {
    database.close();
  }
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
