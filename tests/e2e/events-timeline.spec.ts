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

test('registra eventos acessíveis e isola cronologias entre campanhas', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-events-timeline-e2e-'));
  let application: ElectronApplication | null = null;
  try {
    application = await launch(dataDirectory);
    let window = await application.firstWindow();
    await prepareCampaign(window, 'Crônicas da Ponte', ['Aris', 'Brena']);

    await window.getByRole('button', { name: 'Sessões', exact: true }).click();
    await createSession(window, 1, 'A primeira vigília');
    await createSession(window, 2, 'O retorno à ponte');
    await window.getByRole('button', { name: 'Gerenciar eventos' }).click();
    await createEventThroughForm(window);
    await createEventsThroughGateway(window, 'Crônicas da Ponte');
    await window.getByRole('button', { name: 'Voltar para sessões' }).click();
    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
    await window.getByRole('button', { name: 'Voltar para campanhas' }).click();

    await window.getByRole('button', { name: 'Nova campanha' }).click();
    await prepareCampaign(window, 'Crônicas Estrangeiras', ['Intrusa']);
    await createEventsThroughGateway(window, 'Crônicas Estrangeiras');
    await window.getByRole('button', { name: 'Voltar para campanhas' }).click();

    await application.close();
    application = null;
    application = await launch(dataDirectory);
    window = await application.firstWindow();
    await window.getByRole('button', { name: 'Abrir campanha Crônicas da Ponte' }).click();

    await window.getByRole('button', { name: 'Cronologia', exact: true }).click();
    const campaignTimeline = window.getByTestId('timeline-list');
    await expect(campaignTimeline).toContainText('O eco da primeira vigília');
    await expect(campaignTimeline).toContainText('A ponte responde ao retorno');
    await expect(campaignTimeline).toContainText('Rumor fora das sessões');
    await expect(campaignTimeline).toContainText('O farol acende');
    await expect(campaignTimeline).toContainText('Testemunha');
    await expect(campaignTimeline).toContainText('Testemunha · Participante');
    await expect(campaignTimeline).not.toContainText(/\(ordem \d+\)/);
    await expect(campaignTimeline).not.toContainText('Evento estrangeiro');
    const campaignTimelineText = await campaignTimeline.innerText();
    expect(campaignTimelineText.indexOf('O farol acende')).toBeLessThan(
      campaignTimelineText.indexOf('O eco da primeira vigília'),
    );
    expect(campaignTimelineText.indexOf('O eco da primeira vigília')).toBeLessThan(
      campaignTimelineText.indexOf('A ponte responde ao retorno'),
    );
    expect(campaignTimelineText.indexOf('A ponte responde ao retorno')).toBeLessThan(
      campaignTimelineText.indexOf('Rumor fora das sessões'),
    );

    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
    await window.getByRole('button', { name: 'Ver entidades' }).click();
    await window.getByRole('button', { name: 'Ver cronologia de Aris' }).click();
    const entityTimeline = window.getByTestId('timeline-list');
    await expect(entityTimeline).toContainText('O eco da primeira vigília');
    await expect(entityTimeline).toContainText('A ponte responde ao retorno');
    await expect(entityTimeline).toContainText('O farol acende');
    await expect(entityTimeline).not.toContainText('Rumor fora das sessões');
    await expect(entityTimeline).not.toContainText('Evento estrangeiro');
    await expect(entityTimeline).toContainText('Papel nesta entidade: Testemunha');
    await expect(entityTimeline).toContainText('Papel nesta entidade: Participante');
  } finally {
    await application?.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

async function prepareCampaign(
  window: Page,
  campaignName: string,
  entityNames: string[],
): Promise<void> {
  if (campaignName === 'Crônicas da Ponte')
    await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
  await window.getByLabel('Nome da campanha').fill(campaignName);
  await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
  await window.getByRole('button', { name: `Abrir campanha ${campaignName}` }).click();
  await window.getByRole('button', { name: 'Gerenciar tipos de entidade' }).click();
  await window.getByRole('button', { name: 'Criar primeiro tipo' }).click();
  await window.getByLabel('Nome plural').fill('Personagens');
  await window.getByLabel('Nome singular').fill('Personagem');
  await window.getByLabel('Identificador (slug)').fill('personagens');
  await window.getByRole('button', { name: 'Criar tipo de entidade' }).click();
  await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
  await window.getByRole('button', { name: 'Ver entidades' }).click();
  for (const entityName of entityNames) await createEntity(window, entityName);
  await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
}

async function createEntity(window: Page, name: string): Promise<void> {
  await window.getByRole('button', { name: 'Nova entidade', exact: true }).click();
  await window.getByLabel('Nome *').fill(name);
  await window.getByRole('button', { name: 'Criar entidade' }).click();
  await expect(window.getByRole('status')).toContainText(`Entidade “${name}” criada.`);
}

async function createSession(window: Page, sequence: number, title: string): Promise<void> {
  await window.getByRole('button', { name: 'Planejar sessão' }).click();
  await window.getByLabel('Sequência *').fill(String(sequence));
  await window.getByLabel('Título *').fill(title);
  await window.getByRole('button', { name: 'Planejar sessão', exact: true }).click();
  await expect(window.getByRole('button', { name: 'Adicionar participante' })).toBeVisible();
  await window.getByRole('button', { name: 'Voltar para sessões' }).click();
}

async function createEventThroughForm(window: Page): Promise<void> {
  const createButton = window.getByRole('button', { name: 'Registrar evento', exact: true });
  await expect(createButton).toBeEnabled();
  await createButton.click();
  await expect(
    window.getByRole('heading', { name: 'Registrar evento', exact: true }),
  ).toBeVisible();
  await window.getByLabel('Título do evento', { exact: true }).fill('O farol acende');
  await window
    .getByLabel('Sessão associada ao evento', { exact: true })
    .selectOption({ label: 'Sessão 1: A primeira vigília' });
  await window.getByLabel('Ordem narrativa', { exact: true }).fill('1');
  const links = window.getByRole('group', { name: 'Vínculos com entidades', exact: true });
  await links.getByRole('button', { name: 'Adicionar vínculo', exact: true }).click();
  await links.getByLabel('Entidade vinculada', { exact: true }).selectOption({ label: 'Aris' });
  await links
    .getByLabel('Papel da entidade vinculada', { exact: true })
    .selectOption({ label: 'Participante' });
  await expect(links.getByText('Ordem', { exact: true })).toHaveCount(0);
  await links.getByRole('button', { name: 'Adicionar vínculo', exact: true }).click();
  await links.getByLabel('Entidade vinculada', { exact: true }).nth(1).selectOption({ label: 'Brena' });
  await links
    .getByLabel('Papel da entidade vinculada', { exact: true })
    .nth(1)
    .selectOption({ label: 'Testemunha' });
  await links.getByRole('button', { name: 'Mover Brena para cima' }).click();
  await window.getByRole('button', { name: 'Registrar evento', exact: true }).click();
  await expect(window.getByRole('status')).toContainText('Evento registrado.');
  await expect(window.getByTestId('event-list')).toContainText('O farol acende');
}

async function createEventsThroughGateway(window: Page, campaignName: string): Promise<void> {
  await window.evaluate(async (selectedCampaignName) => {
    const manager = globalThis as unknown as { campaignManager: CampaignManagerGateway };
    const campaigns = await manager.campaignManager.campaigns.list({
      filters: { statuses: ['active'] },
    });
    if (!campaigns.ok) throw new Error(campaigns.error.message);
    const campaign = campaigns.data.items.find((item) => item.name === selectedCampaignName);
    if (campaign === undefined) throw new Error('Campanha de teste ausente.');
    const entities = await manager.campaignManager.entities.list({
      campaignId: campaign.id,
      filters: { archived: false },
    });
    if (!entities.ok) throw new Error(entities.error.message);
    if (selectedCampaignName === 'Crônicas Estrangeiras') {
      const intrusa = entities.data.items.find((item) => item.name === 'Intrusa');
      if (intrusa === undefined) throw new Error('Entidade estrangeira ausente.');
      const result = await manager.campaignManager.events.create({
        campaignId: campaign.id,
        sessionId: null,
        title: 'Evento estrangeiro',
        eventOrder: 0,
        links: [{ entityId: intrusa.id, role: 'related' }],
      });
      if (!result.ok) throw new Error(result.error.message);
      return;
    }
    const sessions = await manager.campaignManager.sessions.list({ campaignId: campaign.id });
    if (!sessions.ok) throw new Error(sessions.error.message);
    const firstSession = sessions.data.items.find((item) => item.sequenceNumber === 1);
    const secondSession = sessions.data.items.find((item) => item.sequenceNumber === 2);
    const aris = entities.data.items.find((item) => item.name === 'Aris');
    const brena = entities.data.items.find((item) => item.name === 'Brena');
    if (
      firstSession === undefined ||
      secondSession === undefined ||
      aris === undefined ||
      brena === undefined
    )
      throw new Error('Referências de eventos ausentes.');
    const inputs = [
      {
        sessionId: firstSession.id,
        title: 'O eco da primeira vigília',
        eventOrder: 2,
        links: [{ entityId: aris.id, role: 'witness' as const }],
      },
      {
        sessionId: secondSession.id,
        title: 'A ponte responde ao retorno',
        eventOrder: 0,
        links: [{ entityId: aris.id, role: 'participant' as const }],
      },
      {
        sessionId: null,
        title: 'Rumor fora das sessões',
        eventOrder: 0,
        links: [{ entityId: brena.id, role: 'related' as const }],
      },
    ];
    for (const input of inputs) {
      const result = await manager.campaignManager.events.create({
        campaignId: campaign.id,
        ...input,
      });
      if (!result.ok) throw new Error(result.error.message);
    }
  }, campaignName);
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
