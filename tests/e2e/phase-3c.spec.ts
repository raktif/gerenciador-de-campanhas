import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { CampaignManagerGateway } from '../../src/core/contracts/gateway';

const root = process.cwd();
const electronExecutable = createRequire(path.join(root, 'package.json'))('electron') as string;

test('integra encerramento incremental, preparacao explicita e mapa causal', async () => {
  const data = await mkdtemp(path.join(os.tmpdir(), 'rpg-phase-3c-e2e-')); let application: ElectronApplication | null = null;
  try {
    const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined && entry[0] !== 'ELECTRON_RUN_AS_NODE'));
    application = await electron.launch({ executablePath: electronExecutable, args: [root], env: { ...inheritedEnvironment, APP_DATA_DIR: data, APP_ELECTRON_USER_DATA_DIR: path.join(data, 'electron-profile'), NODE_ENV: 'test' } });
    const page = await application.firstWindow(); await createCampaign(page);
    const ids = await page.evaluate(async () => {
      const gateway = (globalThis as unknown as { campaignManager: CampaignManagerGateway }).campaignManager;
      const campaigns = await gateway.campaigns.list({ filters: { statuses: ['active'] } }); if (!campaigns.ok) throw new Error('Campanha ausente.'); const campaign = campaigns.data.items[0]; if (campaign === undefined) throw new Error('Campanha ausente.');
      const entities = await gateway.entities.list({ campaignId: campaign.id, limit: 10, filters: { archived: false } }); if (!entities.ok) throw new Error('Entidades ausentes.'); const first = entities.data.items[0]; const second = entities.data.items[1]; if (first === undefined || second === undefined) throw new Error('Entidades ausentes.');
      const session = await gateway.sessions.create({ campaignId: campaign.id, sequenceNumber: 1, title: 'Sessao de integracao', playedAt: null, summaryMarkdown: null, gmNotesMarkdown: null }); if (!session.ok) throw new Error('Sessao ausente.');
      const thread = await gateway.storyThreads.create({ campaignId: campaign.id, title: 'Fio da proxima sessao', description: null, threadType: 'mystery', links: [] }); if (!thread.ok) throw new Error('Fio ausente.');
      return { firstId: first.id, secondId: second.id };
    });
    await page.getByRole('button', { name: /Sess.*es/, exact: true }).click(); await page.getByRole('button', { name: /Editar Sess.*o de integra.*o/ }).click();
    await expect(page.getByRole('heading', { name: /Encerramento da sess.*o/ })).toBeVisible();
    const eventsStep = page.getByRole('group', { name: /A.*es da etapa Eventos/ }); await eventsStep.getByRole('button', { name: 'Confirmar' }).click(); await expect(eventsStep).toContainText('Confirmada');
    const preparation = page.getByText(/Elementos relevantes para a pr.*xima sess.*o/).locator('..'); await expect(preparation).toContainText(/Fio da pr.*xima sess.*o/); await preparation.getByRole('checkbox', { name: /Selecionar Fio da pr.*xima sess.*o/ }).check();
    await page.getByRole('button', { name: 'Mapa causal', exact: true }).click();
    const causalForm = page.getByRole('form', { name: /Adicionar.*v.nculo causal/ }); await expect(causalForm).toBeVisible(); const causalSelects = causalForm.getByRole('combobox'); await expect(causalSelects).toHaveCount(3);
    await causalSelects.nth(0).selectOption('entity'); await causalForm.getByRole('textbox', { name: 'Identificador da causa', exact: true }).fill(ids.firstId); await causalSelects.nth(1).selectOption('entity'); await causalForm.getByRole('textbox', { name: 'Identificador do efeito', exact: true }).fill(ids.secondId); await causalSelects.nth(2).selectOption('causes');
    await causalForm.getByRole('button', { name: /Criar v.nculo/ }).click(); await expect(page.getByText(/V.nculo causal criado\./)).toBeVisible(); await page.getByLabel('Tipo do registro').selectOption('entity'); await page.getByLabel('Identificador do registro').fill(ids.firstId); await page.getByRole('button', { name: 'Ver mapa' }).click(); await expect(page.getByRole('heading', { name: 'Cadeia causal' })).toBeVisible(); await expect(page.getByText('Primeiro')).toBeVisible();
  } finally { await application?.close(); await rm(data, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); }
});

async function createCampaign(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Criar primeira campanha' }).click(); await page.getByLabel('Nome da campanha').fill('Campanha 3C'); await page.getByRole('button', { name: 'Criar campanha', exact: true }).click(); await page.getByRole('button', { name: 'Abrir campanha Campanha 3C' }).click(); await page.getByRole('button', { name: 'Gerenciar tipos de entidade' }).click(); await page.getByRole('button', { name: 'Criar primeiro tipo' }).click(); await page.getByLabel('Nome plural').fill('Pessoas'); await page.getByLabel('Nome singular').fill('Pessoa'); await page.getByRole('button', { name: 'Criar tipo de entidade' }).click(); await page.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click(); await page.getByRole('button', { name: 'Ver entidades' }).click(); await page.getByRole('button', { name: 'Nova entidade', exact: true }).click(); await page.getByLabel('Nome *').fill('Primeiro'); await page.getByRole('button', { name: 'Criar entidade' }).click(); await page.getByRole('button', { name: 'Nova entidade', exact: true }).click(); await page.getByLabel('Nome *').fill('Segundo'); await page.getByRole('button', { name: 'Criar entidade' }).click(); await page.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
}
