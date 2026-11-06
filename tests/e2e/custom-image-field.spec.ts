import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

const repositoryRoot = process.cwd();
const requireFromRepository = createRequire(path.join(repositoryRoot, 'package.json'));
const electronExecutable = requireFromRepository('electron') as string;

test('configura campo image e oferece galeria acessivel nos detalhes', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-image-field-e2e-'));
  let application: ElectronApplication | null = null;
  try {
    application = await launch(dataDirectory);
    const window = await application.firstWindow();

    await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
    await window.getByLabel('Nome da campanha').fill('Galeria');
    await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    await window.getByRole('button', { name: 'Abrir campanha Galeria' }).click();
    await window.getByRole('button', { name: 'Gerenciar tipos de entidade' }).click();
    await window.getByRole('button', { name: 'Criar primeiro tipo' }).click();
    await window.getByLabel('Nome plural').fill('Personagens');
    await window.getByLabel('Nome singular').fill('Personagem');
    await window.getByLabel('Identificador (slug)').fill('personagens');
    await window.getByRole('button', { name: 'Criar tipo de entidade' }).click();
    await window.getByRole('button', { name: 'Gerenciar campos de Personagens' }).click();
    await window.getByRole('button', { name: 'Criar primeiro campo' }).click();
    await window.getByLabel('Rótulo *').fill('Brasão');
    await window.getByRole('combobox', { name: 'Tipo de dado' }).selectOption('image');
    await expect(window.getByRole('checkbox', { name: 'Obrigatório' })).toBeDisabled();
    await expect(window.getByRole('checkbox', { name: 'Pesquisável' })).toBeDisabled();
    await expect(window.getByRole('checkbox', { name: 'Secreto por padrão' })).toBeDisabled();
    await expect(window.getByLabel('Valor padrão (JSON)')).toBeDisabled();
    await expect(window.getByLabel('Opções (JSON)')).toBeDisabled();
    await expect(window.getByLabel('Validação (JSON)')).toBeDisabled();
    await window.getByRole('button', { name: 'Criar definição de campo' }).click();
    await expect(window.getByRole('list', { name: 'Ordenar definições de campo' })).toContainText(
      'Imagem',
    );
    await window.getByRole('button', { name: 'Voltar para tipos de entidade' }).click();
    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
    await window.getByRole('button', { name: 'Ver entidades' }).click();
    await window.getByRole('button', { name: 'Nova entidade', exact: true }).click();
    await window.getByLabel('Nome *').fill('Gorel');
    await expect(
      window.getByText('Brasão: imagens são gerenciadas nos detalhes da entidade após salvar.'),
    ).toBeVisible();
    await window.getByRole('button', { name: 'Criar entidade' }).click();
    await window.getByRole('button', { name: 'Abrir detalhes de Gorel' }).first().click();

    await expect(window.getByRole('heading', { name: 'Campos de imagem' })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Brasão' })).toBeVisible();
    const imageFieldRegion = window.getByRole('region', { name: 'Brasão' });
    await expect(imageFieldRegion.getByText('Nenhuma imagem adicionada.')).toBeVisible();
    const add = window.getByRole('button', { name: 'Adicionar imagem' });
    await add.click();
    const dialog = window.getByRole('dialog', { name: 'Adicionar imagem a Brasão' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Texto alternativo *')).toBeFocused();
    await expect(dialog.getByLabel('Legenda')).toBeVisible();
    await expect(dialog.getByLabel('Texto alternativo')).toBeVisible();
    await expect(dialog.getByLabel('URL da imagem')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Selecionar arquivo' })).toBeDisabled();
    await dialog.getByLabel('Texto alternativo *').fill('Brasão azul e dourado');
    await dialog.getByLabel('Solte uma imagem neste campo').evaluate((dropTarget) => {
      const bytes = Uint8Array.from(
        atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        ),
        (character) => character.charCodeAt(0),
      );
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], 'brasao.png', { type: 'image/png' }));
      dropTarget.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
    });
    await expect(window.getByRole('heading', { name: 'Imagem 1 de Brasão' })).toBeVisible();
    await window.getByRole('button', { name: 'Fechar' }).click();
    const amplify = window.getByRole('button', { name: 'Ampliar imagem 1 de Brasão' });
    await amplify.click();
    let lightbox = window.getByRole('dialog', {
      name: 'Visualização ampliada: Brasão azul e dourado',
    });
    await expect(lightbox.getByRole('button', { name: 'Fechar imagem ampliada' })).toBeFocused();
    await lightbox.getByRole('button', { name: 'Fechar imagem ampliada' }).click();
    await expect(amplify).toBeFocused();
    await amplify.click();
    await window.keyboard.press('Escape');
    await expect(lightbox).toHaveCount(0);
    await expect(amplify).toBeFocused();
    await amplify.click();
    lightbox = window.getByRole('dialog', {
      name: 'Visualização ampliada: Brasão azul e dourado',
    });
    await lightbox.getByRole('img', { name: 'Brasão azul e dourado' }).click();
    await expect(lightbox).toHaveCount(0);
    await amplify.click();
    await window.getByTestId('image-lightbox-backdrop').click({ position: { x: 2, y: 2 } });
    await expect(lightbox).toHaveCount(0);
    await add.click();
    await dialog.getByLabel('Texto alternativo *').fill('Segundo brasão');
    await dialog.getByLabel('Solte uma imagem neste campo').evaluate((dropTarget) => {
      const bytes = Uint8Array.from(
        atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        ),
        (character) => character.charCodeAt(0),
      );
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], 'segundo.png', { type: 'image/png' }));
      dropTarget.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
    });
    await expect(window.getByRole('heading', { name: 'Imagem 2 de Brasão' })).toBeVisible();
    await window.getByRole('button', { name: 'Fechar' }).click();
    await window.getByLabel('Legenda da imagem 1 de Brasão').fill('Rascunho ainda não salvo');
    await window.getByRole('button', { name: 'Mover imagem 1 abaixo' }).click();
    await expect(window.getByLabel('Legenda da imagem 2 de Brasão')).toHaveValue(
      'Rascunho ainda não salvo',
    );
    const remove = window.getByRole('button', { name: 'Remover imagem 2' });
    await remove.click();
    const removal = window.getByRole('dialog', { name: 'Remover imagem de Brasão?' });
    await expect(removal.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    await window.keyboard.press('Escape');
    await expect(removal).toHaveCount(0);
    await expect(remove).toBeFocused();
    await remove.click();
    await removal.getByRole('button', { name: 'Confirmar remoção' }).click();
    await expect(window.getByRole('heading', { name: 'Imagem 1 de Brasão' })).toBeVisible();
    await expect(add).toBeFocused();
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
    env: { ...inheritedEnvironment, APP_DATA_DIR: dataDirectory, NODE_ENV: 'test' },
  });
}
