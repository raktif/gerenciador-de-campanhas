import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

const repositoryRoot = process.cwd();
const requireFromRepository = createRequire(path.join(repositoryRoot, 'package.json'));
const electronExecutable = requireFromRepository('electron') as string;
const characterTypeId = '60000000-0000-4000-8000-000000000030';
const relationshipTypeId = '70000000-0000-4000-8000-000000000030';

test('exibe ajuda customizada no formulário e nos detalhes da entidade', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-entity-help-e2e-'));
  let application: ElectronApplication | null = null;

  try {
    application = await launch(dataDirectory);
    let window = await application.firstWindow();
    await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
    await window.getByLabel('Nome da campanha').fill('Ajuda em Entidades');
    await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    await expect(
      window.getByRole('heading', { name: 'Ajuda em Entidades', exact: true }),
    ).toBeVisible();

    await application.close();
    application = null;
    seedPrerequisites(dataDirectory);
    application = await launch(dataDirectory);
    window = await application.firstWindow();

    await window.getByRole('button', { name: 'Abrir campanha Ajuda em Entidades' }).click();
    await window.getByRole('button', { name: 'Gerenciar tipos de entidade' }).click();
    await window.getByRole('button', { name: 'Gerenciar campos de Personagens' }).click();
    await window.getByRole('button', { name: 'Criar primeiro campo' }).click();
    await window.getByLabel('Rótulo *').fill('Título');
    await window.getByLabel('Texto de ajuda').fill('Informe o título usado pelo personagem.');
    await window.getByLabel('Exemplo').fill('Capitã da guarda');
    await window.getByRole('button', { name: 'Criar definição de campo' }).click();
    await expect(window.getByRole('list', { name: 'Ordenar definições de campo' })).toContainText(
      'Título',
    );

    await window.getByRole('button', { name: 'Novo campo' }).click();
    await window.getByLabel('Rótulo *').fill('Aliados');
    await window.getByLabel('Texto de ajuda').fill('Escolha os aliados atuais do personagem.');
    await window.getByLabel('Exemplo').fill('Mara');
    await window
      .getByRole('combobox', { name: 'Tipo de dado' })
      .selectOption('entity_reference_list');
    const relationshipType = window.getByRole('combobox', { name: 'Tipo de relacionamento' });
    await expect(relationshipType).toBeEnabled();
    await relationshipType.selectOption({ label: 'Aliado de' });
    await window.getByRole('combobox', { name: 'Direção' }).selectOption('outgoing');
    await window.getByRole('checkbox', { name: 'Personagens' }).check();
    await window.getByRole('combobox', { name: 'Ao excluir' }).selectOption('unlink');
    await window.getByRole('button', { name: 'Criar definição de campo' }).click();
    await expect(window.getByRole('list', { name: 'Ordenar definições de campo' })).toContainText(
      'Aliados',
    );

    await window.getByRole('button', { name: 'Voltar para tipos de entidade' }).click();
    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
    await window.getByRole('button', { name: 'Ver entidades' }).click();
    await window.getByRole('button', { name: 'Nova entidade', exact: true }).click();
    const knowledgeHelp = window.getByRole('button', {
      name: 'Ajuda sobre Natureza do conhecimento',
    });
    await expect(knowledgeHelp).toHaveAttribute('aria-describedby', /^contextual-help-/);
    await knowledgeHelp.focus();
    await expect(window.getByRole('tooltip')).toContainText(
      'Distingue fatos confirmados de rumores, suspeitas, segredos e possibilidades.',
    );
    await expect(window.getByRole('tooltip')).toContainText(
      'Possibilidade e depois ser confirmado como Fato.',
    );
    await knowledgeHelp.press('Escape');
    await expect(knowledgeHelp).toBeFocused();
    await window.getByRole('textbox', { name: 'Nome *' }).fill('Mara');
    await window.getByRole('button', { name: 'Criar entidade' }).click();
    await expect(window.getByRole('status')).toContainText('Entidade “Mara” criada.');

    await window.getByRole('button', { name: 'Nova entidade', exact: true }).click();
    await window.getByRole('textbox', { name: 'Nome *' }).fill('Gorel');
    const titleHelp = window.getByRole('button', { name: 'Ajuda sobre Título' });
    const alliesHelp = window.getByRole('button', { name: 'Ajuda sobre Aliados' });
    await expect(titleHelp).toBeVisible();
    await expect(alliesHelp).toBeVisible();
    await titleHelp.focus();
    await expect(window.getByRole('tooltip')).toContainText(
      'Informe o título usado pelo personagem.',
    );
    await expect(window.getByRole('tooltip')).toContainText('Exemplo: Capitã da guarda');
    await titleHelp.press('Escape');
    await expect(titleHelp).toBeFocused();
    await alliesHelp.click();
    await expect(window.getByRole('tooltip')).toContainText(
      'Escolha os aliados atuais do personagem.',
    );
    await expect(window.getByRole('tooltip')).toContainText('Exemplo: Mara');
    await alliesHelp.press('Escape');
    await window.getByRole('textbox', { name: 'Título' }).fill('Capataz');
    await window.getByRole('checkbox', { name: 'Mara' }).check();
    await window.getByRole('button', { name: 'Criar entidade' }).click();
    await expect(window.getByRole('status')).toContainText('Entidade “Gorel” criada.');

    await window
      .getByRole('group', { name: 'Ações de Gorel' })
      .getByRole('button', { name: 'Abrir detalhes de Gorel' })
      .click();
    const detailsTitleHelp = window.getByRole('button', { name: 'Ajuda sobre Título' });
    const detailsAlliesHelp = window.getByRole('button', { name: 'Ajuda sobre Aliados' });
    await expect(detailsTitleHelp).toBeVisible();
    await expect(detailsAlliesHelp).toBeVisible();
    await detailsTitleHelp.click();
    await expect(window.getByRole('tooltip')).toContainText(
      'Informe o título usado pelo personagem.',
    );
    await expect(window.getByRole('tooltip')).toContainText('Exemplo: Capitã da guarda');
    await detailsTitleHelp.press('Escape');
    await detailsAlliesHelp.click();
    await expect(window.getByRole('tooltip')).toContainText(
      'Escolha os aliados atuais do personagem.',
    );
    await expect(window.getByRole('tooltip')).toContainText('Exemplo: Mara');
    await detailsAlliesHelp.press('Escape');
  } finally {
    await application?.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

function seedPrerequisites(dataDirectory: string): void {
  const database = new Database(path.join(dataDirectory, 'database', 'app.db'));
  try {
    const campaign = database
      .prepare("SELECT id FROM campaigns WHERE name = 'Ajuda em Entidades'")
      .get() as { id: string } | undefined;
    if (campaign === undefined) throw new Error('Campanha do teste ausente.');
    const now = new Date().toISOString();
    database
      .prepare(
        `INSERT INTO entity_types (
          id, campaign_id, name, singular_name, slug, sort_order,
          is_system, is_archived, created_at, updated_at, revision
        ) VALUES (?, ?, 'Personagens', 'Personagem', 'personagens', 0, 0, 0, ?, ?, 1)`,
      )
      .run(characterTypeId, campaign.id, now, now);
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
