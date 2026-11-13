import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

const repositoryRoot = process.cwd();
const requireFromRepository = createRequire(path.join(repositoryRoot, 'package.json'));
const electronExecutable = requireFromRepository('electron') as string;

test('seleciona, valida, cancela, limpa e persiste cor de tipo de entidade', async () => {
  test.setTimeout(120_000);
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-entity-type-colors-e2e-'));
  let application: ElectronApplication | null = null;

  try {
    application = await launch(dataDirectory);
    let window = await application.firstWindow();
    await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
    await window.getByLabel('Nome da campanha').fill('Cores de Ethéria');
    await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    await window.getByRole('button', { name: 'Abrir campanha Cores de Ethéria' }).click();
    await window.getByRole('button', { name: 'Gerenciar tipos de entidade' }).click();
    await window.getByRole('button', { name: 'Criar primeiro tipo' }).click();

    await window.getByLabel('Nome plural').fill('Personagens');
    await window.getByLabel('Nome singular').fill('Personagem');

    const palette = window.getByRole('radiogroup', { name: 'Paleta de cores' });
    const noColor = palette.getByLabel('Sem cor');
    await expect(noColor).toBeChecked();
    await noColor.focus();
    await noColor.press('ArrowRight');
    await expect(palette.getByLabel('Carmesim')).toBeChecked();
    await expect(window.getByText('#B91C1C')).toBeVisible();

    const hue = window.getByLabel('Matiz');
    const originalHue = await hue.inputValue();
    await hue.focus();
    await hue.press('ArrowRight');
    await expect(hue).not.toHaveValue(originalHue);
    await expect(palette.getByLabel('Carmesim')).not.toBeChecked();

    await window.getByText('Opções avançadas').click();
    const hexadecimal = window.getByLabel('Cor hexadecimal');
    await hexadecimal.fill('#12');
    await window.getByRole('button', { name: 'Criar tipo de entidade' }).click();
    await expect(
      window.getByRole('heading', { name: 'Defina uma categoria do seu mundo' }),
    ).toBeVisible();
    await expect(hexadecimal).toHaveValue('#12');
    await expect(hexadecimal).toHaveAttribute('aria-invalid', 'true');
    await expect(window.getByRole('alert')).toContainText(
      'Use uma cor hexadecimal no formato #RRGGBB.',
    );

    await hexadecimal.fill('#abcdef');
    await hexadecimal.blur();
    await expect(hexadecimal).toHaveValue('#ABCDEF');
    await expect(window.getByText('#ABCDEF')).toBeVisible();
    await palette.getByLabel('Âmbar').check();
    await window.getByRole('button', { name: 'Criar tipo de entidade' }).click();

    let card = window.getByRole('article').filter({ hasText: 'Personagens' });
    const icon = card.getByTestId('entity-type-icon');
    await expect(icon).toHaveCSS('background-color', 'rgb(180, 83, 9)');
    await expect(icon).toHaveCSS('color', 'rgb(255, 255, 255)');

    await application.close();
    application = null;
    application = await launch(dataDirectory);
    window = await application.firstWindow();
    await openEntityTypes(window);
    card = window.getByRole('article').filter({ hasText: 'Personagens' });
    await expect(card.getByTestId('entity-type-icon')).toHaveCSS(
      'background-color',
      'rgb(180, 83, 9)',
    );

    await window.getByRole('button', { name: 'Editar tipo Personagens' }).click();
    const editPalette = window.getByRole('radiogroup', { name: 'Paleta de cores' });
    await expect(editPalette.getByLabel('Âmbar')).toBeChecked();
    await editPalette.getByLabel('Azul').check();
    await window.getByRole('button', { name: 'Cancelar' }).click();
    card = window.getByRole('article').filter({ hasText: 'Personagens' });
    await expect(card.getByTestId('entity-type-icon')).toHaveCSS(
      'background-color',
      'rgb(180, 83, 9)',
    );

    await window.getByRole('button', { name: 'Editar tipo Personagens' }).click();
    const finalPalette = window.getByRole('radiogroup', { name: 'Paleta de cores' });
    await expect(finalPalette.getByLabel('Âmbar')).toBeChecked();
    await finalPalette.getByLabel('Sem cor').check();
    await window.getByRole('button', { name: 'Salvar tipo de entidade' }).click();

    await application.close();
    application = null;
    application = await launch(dataDirectory);
    window = await application.firstWindow();
    await openEntityTypes(window);
    await window.getByRole('button', { name: 'Editar tipo Personagens' }).click();
    await expect(
      window.getByRole('radiogroup', { name: 'Paleta de cores' }).getByLabel('Sem cor'),
    ).toBeChecked();
  } finally {
    await application?.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

async function openEntityTypes(window: Awaited<ReturnType<ElectronApplication['firstWindow']>>) {
  await window.getByRole('button', { name: 'Abrir campanha Cores de Ethéria' }).click();
  await window.getByRole('button', { name: 'Gerenciar tipos de entidade' }).click();
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
