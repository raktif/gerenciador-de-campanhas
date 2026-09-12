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
    await window.getByLabel('Entidade participante').selectOption({ label: 'Aris' });
    await window.getByRole('button', { name: 'Salvar participantes' }).click();
    await window.getByLabel('Intenção').fill('Encontrar a chave da passagem');
    await window.getByLabel('Entidade relacionada (opcional)').selectOption({ label: 'Aris' });
    await window.getByRole('button', { name: 'Registrar intenção' }).click();
    await expect(window.getByLabel('Lista de intenções')).toContainText(
      'Encontrar a chave da passagem',
    );

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
    await expect(window.getByLabel('Entidade participante')).toHaveValue(/.+/);
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
  await window.getByLabel('Identificador (slug)').fill('personagens');
  await window.getByRole('button', { name: 'Criar tipo de entidade' }).click();
  await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
  await window.getByRole('button', { name: 'Ver entidades' }).click();
  await window.getByRole('button', { name: 'Nova entidade', exact: true }).click();
  await window.getByLabel('Nome *').fill('Aris');
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
