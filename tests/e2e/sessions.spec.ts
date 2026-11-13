import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { CampaignManagerGateway } from '../../src/core/contracts/gateway';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

const repositoryRoot = process.cwd();
const requireFromRepository = createRequire(path.join(repositoryRoot, 'package.json'));
const electronExecutable = requireFromRepository('electron') as string;

test('planeja, executa e preserva uma sessão com participantes e intenções', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-sessions-e2e-'));
  let application: ElectronApplication | null = null;
  try {
    application = await launch(dataDirectory);
    let window = await application.firstWindow();
    await prepareCampaign(window);

    await window.getByRole('button', { name: 'Tipos de relação' }).click();
    await window.getByRole('button', { name: 'Novo tipo de relação' }).click();
    await window.getByLabel('Nome *').fill('Aliança');
    await window.getByRole('button', { name: 'Criar tipo' }).click();
    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();

    await window.getByRole('button', { name: 'Sessões', exact: true }).click();
    await window.getByRole('button', { name: 'Planejar sessão' }).click();
    await window.getByLabel('Sequência *').fill('1');
    await window.getByLabel('Título *').fill('A ponte desperta');
    await window.getByLabel('Data da sessão').fill('2026-09-09');
    await window.getByLabel('Resumo manual (Markdown)').fill('A ponte respondeu ao grupo.');
    await window
      .getByLabel('Notas do mestre (Markdown)')
      .fill('Revelar a passagem apenas à noite.');
    await window.getByRole('button', { name: 'Planejar sessão', exact: true }).click();

    await window.getByRole('button', { name: 'Adicionar participante' }).click();
    await expect(window.getByText('Ordem', { exact: true })).toHaveCount(0);
    await window.getByLabel('Entidade participante').selectOption({ label: 'Aris' });
    await expect(window.getByRole('button', { name: /Mover .* para/ })).toHaveCount(0);
    await window.getByRole('button', { name: 'Adicionar participante' }).click();
    await window.getByLabel('Entidade participante').nth(1).selectOption({ label: 'Brena' });
    const participantList = window.getByRole('list', { name: 'Ordenar participantes' });
    const removeButton = participantList.getByRole('button', { name: 'Remover' }).nth(1);
    const saveParticipantsButton = window.getByRole('button', { name: 'Salvar participantes' });
    const removeBounds = await removeButton.boundingBox();
    const participantFieldBounds = await window
      .getByLabel('Entidade participante')
      .nth(1)
      .boundingBox();
    expect(removeBounds).not.toBeNull();
    expect(participantFieldBounds).not.toBeNull();
    expect(removeBounds?.height ?? 100).toBeLessThan(participantFieldBounds?.height ?? 0);
    await expect(removeButton).toHaveCSS(
      'background-color',
      await saveParticipantsButton.evaluate((button) => getComputedStyle(button).backgroundColor),
    );
    const brenaParticipant = participantList.getByRole('listitem').nth(1);
    await brenaParticipant.focus();
    await brenaParticipant.press('Alt+ArrowUp');
    await window.getByRole('button', { name: 'Salvar participantes' }).click();
    await window.getByLabel('Intenção', { exact: true }).fill('Encontrar a chave da passagem');
    await window.getByLabel('Entidade relacionada (opcional)').selectOption({ label: 'Aris' });
    await window.getByRole('button', { name: 'Registrar intenção' }).click();
    await expect(window.getByLabel('Lista de intenções')).toContainText(
      'Encontrar a chave da passagem',
    );
    const intentions = window.getByLabel('Lista de intenções');
    await intentions.getByRole('button', { name: 'Transformar' }).click();
    const transformationDialog = window.getByRole('dialog', {
      name: 'Deseja transformar a Intenção em que?',
    });
    await transformationDialog.getByLabel('Nota', { exact: true }).check();
    await transformationDialog.getByRole('button', { name: 'Continuar' }).click();
    await expect(window.getByLabel('Título *')).toHaveValue('Encontrar a chave da passagem');
    const noteLinks = window.getByRole('group', { name: 'Vínculos com entidades' });
    await expect(noteLinks.getByLabel('Entidade')).toHaveValue(/.+/);
    await expect(noteLinks.getByLabel('Entidade').locator('option:checked')).toHaveText('Aris');
    await window.getByRole('button', { name: 'Voltar para notas' }).click();
    await window.getByRole('button', { name: 'Sessões', exact: true }).click();
    await window.getByRole('button', { name: 'Editar A ponte desperta' }).click();
    await expect(window.getByLabel('Lista de intenções')).toContainText('Aberta · Aris');
    await window
      .getByLabel('Lista de intenções')
      .getByRole('button', { name: 'Transformar' })
      .click();
    await window.getByRole('dialog').getByLabel('Nota', { exact: true }).check();
    await window.getByRole('dialog').getByRole('button', { name: 'Continuar' }).click();
    await window.getByLabel('Corpo em Markdown *').fill('A chave está sob a ponte.');
    await window.getByRole('button', { name: 'Criar nota' }).click();
    await expect(window.getByRole('heading', { name: 'Sessão 1' })).toBeVisible();
    await expect(window.getByLabel('Lista de intenções')).toContainText('Transformada · Aris');
    const transformedNote = window
      .getByLabel('Lista de intenções')
      .getByRole('listitem')
      .filter({ hasText: 'Encontrar a chave da passagem' });
    await expect(transformedNote.getByRole('button', { name: 'Editar intenção' })).toHaveCount(0);
    await window.keyboard.press('Alt+ArrowLeft');
    await expect(window.getByRole('heading', { name: 'Sessões', exact: true })).toBeVisible();
    await window.keyboard.press('Alt+ArrowRight');
    await expect(window.getByRole('heading', { name: 'Sessão 1', exact: true })).toBeVisible();
    await window.keyboard.press('Alt+ArrowRight');
    await expect(window.getByRole('heading', { name: 'Sessão 1', exact: true })).toBeVisible();
    const sourceHistoryState = await window.evaluate(() => {
      const state: unknown = globalThis.history.state;
      return state;
    });
    await window.evaluate(async () => {
      await new Promise<void>((resolve) => {
        globalThis.addEventListener('popstate', () => resolve(), { once: true });
        globalThis.history.forward();
      });
    });
    await expect
      .poll(() =>
        window.evaluate(() => {
          const state: unknown = globalThis.history.state;
          return state;
        }),
      )
      .toEqual(sourceHistoryState);
    await expect(window.getByRole('heading', { name: 'Sessão 1', exact: true })).toBeVisible();

    await window.getByLabel('Intenção', { exact: true }).fill('A ponte foi aberta ao amanhecer');
    await window.getByLabel('Entidade relacionada (opcional)').selectOption({ label: 'Brena' });
    await window.getByRole('button', { name: 'Registrar intenção' }).click();
    const eventIntention = window
      .getByLabel('Lista de intenções')
      .getByRole('listitem')
      .filter({ hasText: 'A ponte foi aberta ao amanhecer' });
    await eventIntention.getByRole('button', { name: 'Transformar' }).click();
    await window.getByRole('dialog').getByLabel('Evento', { exact: true }).check();
    await window.getByRole('dialog').getByRole('button', { name: 'Continuar' }).click();
    await expect(window.getByRole('heading', { name: 'Registrar evento' })).toBeVisible();
    await expect(window.getByLabel('Título do evento')).toHaveValue(
      'A ponte foi aberta ao amanhecer',
    );
    await expect(
      window.getByLabel('Sessão associada ao evento').locator('option:checked'),
    ).toHaveText('Sessão 1: A ponte desperta');
    await window.getByRole('button', { name: 'Registrar evento' }).click();
    await expect(window.getByRole('heading', { name: 'Sessão 1' })).toBeVisible();
    await expect(window.getByLabel('Lista de intenções')).toContainText('Transformada · Brena');

    await window.getByLabel('Intenção', { exact: true }).fill('Forjar uma aliança');
    await window.getByLabel('Entidade relacionada (opcional)').selectOption({ label: 'Aris' });
    await window.getByRole('button', { name: 'Registrar intenção' }).click();
    const relationshipIntention = window
      .getByLabel('Lista de intenções')
      .getByRole('listitem')
      .filter({ hasText: 'Forjar uma aliança' });
    await relationshipIntention.getByRole('button', { name: 'Transformar' }).click();
    await window.getByRole('dialog').getByLabel('Relação', { exact: true }).check();
    await window.getByRole('dialog').getByRole('button', { name: 'Continuar' }).click();
    await expect(window.getByLabel('Descrição', { exact: true })).toHaveValue('Forjar uma aliança');
    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
    await expect(window.getByRole('heading', { name: 'Sessão 1' })).toBeVisible();
    await expect(window.getByLabel('Lista de intenções')).toContainText('Aberta · Aris');
    await window.getByRole('button', { name: 'Voltar para sessões' }).click();
    const openSessionButton = window.getByRole('button', { name: 'Editar A ponte desperta' });
    await expect(openSessionButton).toBeEnabled();
    await openSessionButton.click();
    await expect(window.getByRole('heading', { name: 'Sessão 1' })).toBeVisible();

    await window.evaluate(async () => {
      const manager = globalThis as unknown as { campaignManager: CampaignManagerGateway };
      const campaigns = await manager.campaignManager.campaigns.list({
        filters: { statuses: ['active'] },
      });
      if (!campaigns.ok) throw new Error(campaigns.error.message);
      const campaign = campaigns.data.items[0];
      if (campaign === undefined) throw new Error('Campanha de teste ausente.');
      const sessions = await manager.campaignManager.sessions.list({ campaignId: campaign.id });
      if (!sessions.ok) throw new Error(sessions.error.message);
      const session = sessions.data.items[0];
      if (session === undefined) throw new Error('Sessão de teste ausente.');
      for (let index = 1; index <= 50; index += 1) {
        const result = await manager.campaignManager.sessionIntentions.create({
          campaignId: campaign.id,
          sessionId: session.id,
          text: index === 50 ? 'Intenção página dois' : `Intenção extra ${String(index)}`,
        });
        if (!result.ok) throw new Error(result.error.message);
      }
    });
    await window.getByRole('button', { name: 'Voltar para sessões' }).click();
    await window.getByRole('button', { name: 'Editar A ponte desperta' }).click();
    await window.getByRole('button', { name: 'Carregar mais intenções' }).click();
    await expect(window.getByLabel('Lista de intenções')).toContainText('Intenção página dois');

    await window.getByRole('button', { name: 'Iniciar sessão' }).click();
    await window.getByRole('button', { name: 'Confirmar início' }).click();
    await window.getByRole('button', { name: 'Concluir sessão' }).click();
    await window.getByRole('button', { name: 'Confirmar conclusão' }).click();
    await expect(window.getByText('Status final: Concluída')).toBeVisible();
    await expect(window.getByRole('button', { name: 'Iniciar sessão' })).toHaveCount(0);

    await application.close();
    application = null;
    application = await launch(dataDirectory);
    window = await application.firstWindow();
    await window.getByRole('button', { name: 'Abrir campanha Crônicas da Ponte' }).click();
    await window.getByRole('button', { name: 'Sessões', exact: true }).click();
    await expect(window.getByTestId('session-list')).toContainText('A ponte desperta');
    await expect(window.getByTestId('session-list')).toContainText('Concluída');
    await expect(window.getByTestId('session-list')).toContainText('09/09/2026');
    await window.getByRole('button', { name: 'Editar A ponte desperta' }).click();
    await expect(window.getByLabel('Resumo manual (Markdown)')).toHaveValue(
      'A ponte respondeu ao grupo.',
    );
    await expect(window.getByLabel('Notas do mestre (Markdown)')).toHaveValue(
      'Revelar a passagem apenas à noite.',
    );
    await expect(window.getByLabel('Entidade participante').first()).toHaveValue(/.+/);
    await expect
      .poll(() =>
        window
          .getByLabel('Entidade participante')
          .evaluateAll((selects) =>
            selects.map(
              (select) => (select as HTMLSelectElement).selectedOptions[0]?.textContent ?? '',
            ),
          ),
      )
      .toEqual(['Brena', 'Aris']);
    await expect(window.getByLabel('Lista de intenções')).toContainText(
      'Encontrar a chave da passagem',
    );
    await expect(window.getByText('Status final: Concluída')).toBeVisible();
  } finally {
    await application?.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

async function prepareCampaign(window: Page): Promise<void> {
  await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
  await window.getByLabel('Nome da campanha').fill('Crônicas da Ponte');
  await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
  await window.getByRole('button', { name: 'Abrir campanha Crônicas da Ponte' }).click();
  await window.getByRole('button', { name: 'Gerenciar tipos de entidade' }).click();
  await window.getByRole('button', { name: 'Criar primeiro tipo' }).click();
  await window.getByLabel('Nome plural').fill('Personagens');
  await window.getByLabel('Nome singular').fill('Personagem');
  await window.getByRole('button', { name: 'Criar tipo de entidade' }).click();
  await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
  await window.getByRole('button', { name: 'Ver entidades' }).click();
  await window.getByRole('button', { name: 'Nova entidade', exact: true }).click();
  await window.getByLabel('Nome *').fill('Aris');
  await window.getByRole('button', { name: 'Criar entidade' }).click();
  await window.getByRole('button', { name: 'Nova entidade', exact: true }).click();
  await window.getByLabel('Nome *').fill('Brena');
  await window.getByRole('button', { name: 'Criar entidade' }).click();
  await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
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
