import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import {
  legacyStructuredJsonToRichText,
  structuredJsonToRichText,
} from '../../src/core/domain/field-values';

const root = process.cwd();
const requireFromRepository = createRequire(path.join(root, 'package.json'));
const electronExecutable = requireFromRepository('electron') as string;

test('campos de seleção, progresso e Rich Text funcionam na criação e consulta de Entidades', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'custom-fields-ux-e2e-'));
  let application: ElectronApplication | null = null;
  try {
    application = await launch(dataDirectory);
    const window = await application.firstWindow();
    await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
    await window.getByLabel('Nome da campanha').fill('Campos visuais');
    await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    await window.getByRole('button', { name: 'Abrir campanha Campos visuais' }).click();

    await window.getByRole('button', { name: 'Gerenciar tipos de entidade' }).click();
    await window.getByRole('button', { name: 'Criar primeiro tipo' }).click();
    await window.getByLabel('Nome plural').fill('Personagens');
    await window.getByLabel('Nome singular').fill('Personagem');
    await window.getByRole('button', { name: 'Criar tipo de entidade' }).click();
    await window.getByRole('button', { name: 'Gerenciar campos de Personagens' }).click();

    await createField(window, 'Estado', 'single_select', 'Zebra, Árvore');
    await createField(window, 'Especialidades', 'multi_select', 'Feiticeira, Ladina');
    await createField(window, 'Avanço', 'progress');
    await createField(window, 'Histórico', 'rich_text');
    await window.getByRole('button', { name: 'Editar campo Estado' }).click();
    await expect(window.getByRole('textbox', { name: 'Valores para seleção' })).toHaveValue(
      'Árvore, Zebra',
    );
    await expect(window.getByLabel('Valor padrão (JSON)')).toHaveCount(0);
    await expect(window.getByLabel('Opções (JSON)')).toHaveCount(0);
    await expect(window.getByLabel('Validação (JSON)')).toHaveCount(0);
    await window.getByLabel('Descrição').fill('Estado atual da personagem.');
    await window.getByRole('button', { name: 'Salvar definição de campo' }).click();
    await expect(window.getByRole('status')).toContainText('Campo “Estado” atualizado.');

    await window.getByRole('button', { name: 'Voltar para tipos de entidade' }).click();
    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
    await window.getByRole('button', { name: 'Ver entidades' }).click();
    await window.getByRole('button', { name: 'Nova entidade', exact: true }).click();
    await window.getByLabel('Nome *').fill('Nara');
    await expect(window.getByText('Exemplos de progresso: 2/4 e 75/100.')).toBeVisible();
    const stateSelect = window.getByLabel('Estado', { exact: true });
    await stateSelect.selectOption({ label: 'Árvore' });
    const multiSelect = window.getByLabel('Especialidades', { exact: true });
    await expect(multiSelect.locator('option').allTextContents()).resolves.toEqual([
      'Feiticeira',
      'Ladina',
    ]);
    const stateBounds = await stateSelect.boundingBox();
    const multiSelectBounds = await multiSelect.boundingBox();
    if (stateBounds === null || multiSelectBounds === null)
      throw new Error('Os controles de seleção precisam estar visíveis.');
    expect(
      Math.abs(
        stateBounds.y + stateBounds.height - (multiSelectBounds.y + multiSelectBounds.height),
      ),
    ).toBeLessThan(3);
    await multiSelect.selectOption(['Ladina', 'Feiticeira']);
    await expect(window.getByText(/Este valor legado não tinha total/)).toHaveCount(0);
    await window.getByLabel('Valor atual').fill('2.5');
    await window.getByLabel('Valor final *').fill('4.5');
    const editor = window.getByRole('textbox', { name: 'Histórico' });
    await editor.fill('Texto em destaque');
    await editor.evaluate((element) => {
      const text = element.firstChild;
      if (text === null) throw new Error('Conteúdo de edição ausente.');
      const range = document.createRange();
      range.selectNodeContents(text);
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    await window.getByRole('button', { name: 'Negrito' }).click();
    await expect(editor.locator('strong')).toHaveText('Texto em destaque');
    await editor.press('End');
    await editor.press('ArrowRight');
    await editor.press('Enter');
    await window.getByRole('button', { name: 'Inserir tabela' }).click();
    await editor.locator('td').nth(0).fill('Marco "Sol"');
    await editor.locator('td').nth(1).fill('Descoberta');
    await window.getByRole('button', { name: 'Criar entidade' }).click();
    await expect(window.getByRole('status')).toContainText('Entidade “Nara” criada.');
    await window.getByRole('button', { name: 'Abrir detalhes de Nara' }).first().click();
    await expect(window.getByText('Árvore', { exact: true })).toBeVisible();
    await expect(window.getByText('Feiticeira, Ladina', { exact: true })).toBeVisible();
    await expect(window.getByText('2.5/4.5', { exact: true })).toBeVisible();
    await expect(window.getByText('Texto em destaque', { exact: true })).toBeVisible();
    await expect(window.getByRole('table')).toContainText('Descoberta');
    const savedRichText = new Database(path.join(dataDirectory, 'database', 'app.db'));
    try {
      const savedHtml = savedRichText
        .prepare(
          `SELECT value_text FROM field_values v
           JOIN field_definitions f ON f.id=v.field_definition_id
           JOIN entities e ON e.id=v.entity_id
           WHERE e.name='Nara' AND f.label='Histórico'`,
        )
        .get() as { value_text: string };
      expect(savedHtml.value_text).toContain('Marco "Sol"');
      expect(savedHtml.value_text).not.toContain('Marco &quot;Sol&quot;');
    } finally {
      savedRichText.close();
    }

    await application.close();
    application = null;
    seedLegacyProgress(dataDirectory);
    application = await launch(dataDirectory);
    const restartedWindow = await application.firstWindow();
    await restartedWindow.getByRole('button', { name: 'Abrir campanha Campos visuais' }).click();
    await restartedWindow.getByRole('button', { name: 'Ver entidades' }).click();
    await restartedWindow.getByRole('button', { name: 'Abrir detalhes de Nara' }).first().click();
    await expect(restartedWindow.getByText('-2.5 / valor final não definido')).toBeVisible();
    await expect(restartedWindow.getByRole('table')).toContainText('Histórico migrado');
    await restartedWindow.getByRole('button', { name: 'Editar', exact: true }).click();
    await expect(restartedWindow.getByLabel('Valor atual')).toHaveValue('-2.5');
    await expect(restartedWindow.getByLabel('Valor final *')).toHaveValue('');
    await expect(
      restartedWindow.getByText(
        'Este valor legado não tinha total. Informe o valor final ao atualizar este progresso; os demais campos podem ser salvos sem denominador.',
      ),
    ).toBeVisible();
    await restartedWindow.getByLabel('Nome *').fill('Nara editada');
    await restartedWindow.getByRole('button', { name: 'Salvar entidade' }).click();
    await expect(restartedWindow.getByRole('status')).toContainText(
      'Entidade “Nara editada” atualizada.',
    );
    await restartedWindow
      .getByRole('button', { name: 'Abrir detalhes de Nara editada' })
      .first()
      .click();
    await expect(restartedWindow.getByText('-2.5 / valor final não definido')).toBeVisible();
    await restartedWindow.getByRole('button', { name: 'Editar', exact: true }).click();
    await expect(restartedWindow.getByLabel('Valor atual')).toHaveValue('-2.5');
    await restartedWindow.getByLabel('Valor final *').fill('10');
    await restartedWindow.getByRole('button', { name: 'Salvar entidade' }).click();
    await expect(restartedWindow.getByRole('status')).toContainText(
      'Entidade “Nara editada” atualizada.',
    );
    await restartedWindow
      .getByRole('button', { name: 'Abrir detalhes de Nara editada' })
      .first()
      .click();
    await expect(restartedWindow.getByText('-2.5/10', { exact: true })).toBeVisible();
    await expect(restartedWindow.getByRole('table')).toContainText('Histórico migrado');
    await restartedWindow.getByRole('button', { name: 'Editar', exact: true }).click();
    await restartedWindow.getByLabel('Valor atual').fill('2');
    await restartedWindow.getByRole('button', { name: 'Salvar entidade' }).click();
    await expect(restartedWindow.getByRole('status')).toContainText(
      'Entidade “Nara editada” atualizada.',
    );
    await restartedWindow
      .getByRole('button', { name: 'Abrir detalhes de Nara editada' })
      .first()
      .click();
    await expect(restartedWindow.getByText('2/10', { exact: true })).toBeVisible();
    await expect(restartedWindow.getByRole('table')).toContainText('Histórico migrado');
    await restartedWindow.getByRole('button', { name: 'Editar', exact: true }).click();
    const migratedEditor = restartedWindow.getByRole('textbox', { name: 'Histórico' });
    await expect(migratedEditor.locator('table')).toContainText('Histórico migrado');
    await migratedEditor.press('End');
    await migratedEditor.press('Enter');
    await migratedEditor.pressSequentially('Edição do conteúdo convertido');
    await restartedWindow.getByRole('button', { name: 'Salvar entidade' }).click();
    await expect(restartedWindow.getByRole('status')).toContainText(
      'Entidade “Nara editada” atualizada.',
    );
    await restartedWindow
      .getByRole('button', { name: 'Abrir detalhes de Nara editada' })
      .first()
      .click();
    await expect(restartedWindow.getByRole('table')).toContainText('Histórico migrado');
    await expect(restartedWindow.getByText('Edição do conteúdo convertido')).toBeVisible();
  } finally {
    await application?.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test('a v33 apaga a projeção Structured mesmo após a serialização real do editor', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rich-text-roundtrip-e2e-'));
  let application: ElectronApplication | null = null;
  const sourceJson = '{"quote":"Marco\\r\\n\\"Sol\\"","n":9007199254740993}';
  const legacyHtml = legacyStructuredJsonToRichText(sourceJson);
  const losslessHtml = structuredJsonToRichText(sourceJson);
  try {
    application = await launch(dataDirectory);
    const window = await application.firstWindow();
    await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
    await window.getByLabel('Nome da campanha').fill('Migração Rich Text');
    await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    await window.getByRole('button', { name: 'Abrir campanha Migração Rich Text' }).click();
    await window.getByRole('button', { name: 'Gerenciar tipos de entidade' }).click();
    await window.getByRole('button', { name: 'Criar primeiro tipo' }).click();
    await window.getByLabel('Nome plural').fill('Personagens');
    await window.getByLabel('Nome singular').fill('Personagem');
    await window.getByRole('button', { name: 'Criar tipo de entidade' }).click();
    await window.getByRole('button', { name: 'Gerenciar campos de Personagens' }).click();
    await createField(window, 'Histórico', 'rich_text');
    await window.getByRole('button', { name: 'Voltar para tipos de entidade' }).click();
    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
    await window.getByRole('button', { name: 'Ver entidades' }).click();
    await window.getByRole('button', { name: 'Nova entidade', exact: true }).click();
    await window.getByLabel('Nome *').fill('Nara');
    const editor = window.getByRole('textbox', { name: 'Histórico' });
    await editor.evaluate((element, html) => {
      element.innerHTML = html;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }, legacyHtml);
    await window.getByRole('button', { name: 'Criar entidade' }).click();
    await expect(window.getByRole('status')).toContainText('Entidade “Nara” criada.');

    await application.close();
    application = null;

    const databasePath = path.join(dataDirectory, 'database', 'app.db');
    const database = new Database(databasePath);
    let fieldId: string;
    let valueId: string;
    let serializedHtml: string;
    let migration30AppliedAt: string;
    try {
      const value = database
        .prepare(
          `SELECT f.id AS field_id, v.id AS value_id, v.value_text
           FROM field_values v
           JOIN field_definitions f ON f.id=v.field_definition_id
           WHERE f.label='Histórico'`,
        )
        .get() as { field_id: string; value_id: string; value_text: string } | undefined;
      if (value === undefined) throw new Error('Conteúdo serializado pelo editor não encontrado.');
      fieldId = value.field_id;
      valueId = value.value_id;
      serializedHtml = value.value_text;
      expect(serializedHtml).not.toBe(legacyHtml);
      expect(serializedHtml).toContain('Marco\n"Sol"');
      migration30AppliedAt = (
        database.prepare('SELECT applied_at FROM schema_migrations WHERE version=30').get() as {
          applied_at: string;
        }
      ).applied_at;
    } finally {
      database.close();
    }

    const migrationDatabase = new Database(databasePath);
    try {
      migrationDatabase
        .prepare(`UPDATE field_definitions SET created_at=? WHERE id=?`)
        .run(migration30AppliedAt, fieldId);
      migrationDatabase
        .prepare(`UPDATE field_values SET created_at=? WHERE id=?`)
        .run(migration30AppliedAt, valueId);
      migrationDatabase
        .prepare(
          `INSERT INTO structured_value_migration_snapshots
           (field_value_id,field_definition_id,source_json,prior_rich_text,
            lossless_rich_text,restored_from_snapshot,captured_at)
           VALUES(?,?,?,?,?,1,?)`,
        )
        .run(valueId, fieldId, sourceJson, legacyHtml, losslessHtml, migration30AppliedAt);
      migrationDatabase.prepare('DELETE FROM schema_migrations WHERE version=33').run();
    } finally {
      migrationDatabase.close();
    }

    application = await launch(dataDirectory);
    const migratedWindow = await application.firstWindow();
    const migratedDatabase = new Database(databasePath);
    try {
      expect(
        migratedDatabase.prepare('SELECT id FROM field_values WHERE id=?').get(valueId),
      ).toBeUndefined();
      expect(
        migratedDatabase
          .prepare(
            'SELECT source_json FROM structured_value_migration_snapshots WHERE field_value_id=?',
          )
          .get(valueId),
      ).toBeUndefined();
      expect(
        (
          migratedDatabase
            .prepare('SELECT MAX(version) AS version FROM schema_migrations')
            .get() as { version: number }
        ).version,
      ).toBe(34);
    } finally {
      migratedDatabase.close();
    }
    await migratedWindow.getByRole('button', { name: 'Abrir campanha Migração Rich Text' }).click();
    await migratedWindow.getByRole('button', { name: 'Ver entidades' }).click();
    await migratedWindow.getByRole('button', { name: 'Abrir detalhes de Nara' }).first().click();
    await expect(migratedWindow.getByRole('table')).toHaveCount(0);
  } finally {
    await application?.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

function seedLegacyProgress(dataDirectory: string): void {
  const database = new Database(path.join(dataDirectory, 'database', 'app.db'));
  try {
    const ids = database
      .prepare(
        `SELECT e.id AS entity_id, f.id AS field_id
         FROM entities e
         JOIN entity_types t ON t.id = e.entity_type_id
         JOIN campaigns c ON c.id = e.campaign_id
         JOIN field_definitions f ON f.entity_type_id = t.id
         WHERE c.name = 'Campos visuais' AND e.name = 'Nara' AND f.label = 'Avanço'`,
      )
      .get() as { entity_id: string; field_id: string } | undefined;
    if (ids === undefined) throw new Error('Campo de progresso do teste não encontrado.');
    database
      .prepare(
        `UPDATE field_values
         SET value_text = NULL, value_number = ?, value_boolean = NULL, value_date = NULL,
             value_json = NULL
         WHERE entity_id = ? AND field_definition_id = ?`,
      )
      .run(-2.5, ids.entity_id, ids.field_id);
    const historyField = database
      .prepare(
        `SELECT f.id AS field_id
         FROM entities e
         JOIN entity_types t ON t.id = e.entity_type_id
         JOIN campaigns c ON c.id = e.campaign_id
         JOIN field_definitions f ON f.entity_type_id = t.id
         WHERE c.name = 'Campos visuais' AND e.name = 'Nara' AND f.label = 'Histórico'`,
      )
      .get() as { field_id: string } | undefined;
    if (historyField === undefined) throw new Error('Campo Rich Text do teste não encontrado.');
    database
      .prepare('UPDATE field_values SET value_text=? WHERE entity_id=? AND field_definition_id=?')
      .run(
        '<table><thead><tr><th>Chave ou índice</th><th>Tipo</th><th>Valor</th></tr></thead><tbody><tr><th>&quot;capítulo&quot;</th><td>Texto</td><td><code>&quot;Histórico migrado&quot;</code></td></tr></tbody></table>',
        ids.entity_id,
        historyField.field_id,
      );
  } finally {
    database.close();
  }
}

async function createField(
  window: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  label: string,
  dataType: 'single_select' | 'multi_select' | 'progress' | 'rich_text',
  options?: string,
): Promise<void> {
  const firstFieldButton = window.getByRole('button', { name: 'Criar primeiro campo' });
  if ((await firstFieldButton.count()) > 0) await firstFieldButton.click();
  else await window.getByRole('button', { name: 'Novo campo' }).click();
  await window.getByLabel('Rótulo *').fill(label);
  await window.getByRole('combobox', { name: 'Tipo de dado' }).selectOption(dataType);
  if (options !== undefined)
    await window.getByRole('textbox', { name: 'Valores para seleção' }).fill(options);
  await window.getByRole('button', { name: 'Criar definição de campo' }).click();
  await expect(window.getByRole('status')).toContainText(`Campo “${label}” criado.`);
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
    args: [root],
    env: {
      ...inheritedEnvironment,
      APP_DATA_DIR: dataDirectory,
      APP_ELECTRON_USER_DATA_DIR: path.join(dataDirectory, 'electron-profile'),
      NODE_ENV: 'test',
    },
  });
}
