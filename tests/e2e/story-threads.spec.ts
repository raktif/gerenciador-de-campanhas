import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import type { CampaignManagerGateway } from '../../src/core/contracts/gateway';

const root = process.cwd();
const requireFromRepository = createRequire(path.join(root, 'package.json'));
const electronExecutable = requireFromRepository('electron') as string;

test('cria, resolve, reabre e arquiva um fio sem perder seu estado de retorno', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'story-threads-e2e-'));
  let application: ElectronApplication | null = null;
  try {
    application = await electron.launch({
      executablePath: electronExecutable,
      args: [root],
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            (entry): entry is [string, string] => entry[1] !== undefined,
          ),
        ),
        APP_DATA_DIR: dataDirectory,
        APP_ELECTRON_USER_DATA_DIR: path.join(dataDirectory, 'electron-profile'),
        NODE_ENV: 'test',
      },
    });
    const window = await application.firstWindow();
    await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
    await window.getByLabel('Nome da campanha').fill('Campanha de fios');
    await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    await window.getByRole('button', { name: 'Abrir campanha Campanha de fios' }).click();
    await window.getByRole('button', { name: 'Sessões', exact: true }).click();
    await window.getByRole('button', { name: 'Planejar sessão' }).click();
    await window.getByLabel('Sequência *').fill('1');
    await window.getByLabel('Título *').fill('Retorno do farol');
    await window.getByRole('button', { name: 'Planejar sessão', exact: true }).click();
    await window.evaluate(async () => {
      const gateway = (window as unknown as { campaignManager: CampaignManagerGateway })
        .campaignManager;
      const campaignPage = await gateway.campaigns.list({ limit: 10 });
      if (!campaignPage.ok) throw new Error('Falha ao localizar a campanha de teste.');
      const campaign = campaignPage.data.items.find((item) => item.name === 'Campanha de fios');
      if (campaign === undefined) throw new Error('Campanha de teste ausente.');
      for (let sequenceNumber = 2; sequenceNumber <= 101; sequenceNumber += 1) {
        const result = await gateway.sessions.create({
          campaignId: campaign.id,
          sequenceNumber,
          title: `Sessão extra ${sequenceNumber.toString()}`,
        });
        if (!result.ok) throw new Error('Falha ao preparar sessões de teste.');
      }
    });
    await window.getByRole('button', { name: 'Fios Abertos' }).click();
    await expect(window.getByRole('heading', { name: 'Fios Abertos' })).toBeVisible();
    await window.getByRole('button', { name: 'Criar fio', exact: true }).click();
    await window.getByLabel('Título').fill('A promessa do farol');
    await window.getByLabel('Tipo do fio', { exact: true }).selectOption('promise');
    await window.getByLabel('Origem do fio').selectOption('session');
    await window
      .getByLabel('Sessão de origem')
      .selectOption({ label: 'Sessão 1: Retorno do farol' });
    const links = window.getByRole('group', { name: 'Vínculos com registros existentes' });
    await links.getByRole('combobox').nth(0).selectOption('session');
    await links.getByRole('combobox').nth(1).selectOption({ label: 'Retorno do farol' });
    await window.getByRole('button', { name: 'Vincular' }).click();
    await expect(window.getByText('Sessão — Retorno do farol')).toBeVisible();
    await window.getByRole('button', { name: 'Criar fio', exact: true }).click();
    await expect(window.getByRole('heading', { name: 'A promessa do farol' })).toBeVisible();
    await expect(window.getByText('Origem: Sessão — Retorno do farol')).toBeVisible();
    await expect(window.getByText('Promessa · Aberto')).toBeVisible();
    await window
      .getByLabel('Sessão relacionada (opcional)')
      .selectOption({ label: 'Sessão 1: Retorno do farol' });

    await window.getByRole('button', { name: 'Resolver', exact: true }).click();
    await expect(window.getByText('Promessa · Resolvido')).toBeVisible();
    await expect(window.getByText(/Sessão: Retorno do farol/).last()).toBeVisible();
    await window.getByRole('button', { name: 'Reabrir como aberto' }).click();
    await expect(window.getByText('Promessa · Aberto')).toBeVisible();
    await window.getByRole('button', { name: 'Arquivar', exact: true }).click();
    await expect(window.getByText('Promessa · Arquivado')).toBeVisible();
    await window
      .getByRole('button', {
        name: 'Desarquivar e restaurar estado anterior',
      })
      .click();
    await expect(window.getByText('Promessa · Aberto')).toBeVisible();
    await expect(window.getByText('Aberto → Arquivado')).toBeVisible();
    await expect(window.getByText('Arquivado → Aberto')).toBeVisible();

    const visibleText = await window.locator('body').innerText();
    expect(visibleText).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    );
  } finally {
    if (application !== null) await application.close();
    await rm(dataDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
});

test('retry de get consulta o mesmo fio e nunca tenta criar ou editar', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'story-threads-get-retry-'));
  let application: ElectronApplication | null = null;
  try {
    application = await electron.launch({
      executablePath: electronExecutable,
      args: [root],
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            (entry): entry is [string, string] => entry[1] !== undefined,
          ),
        ),
        APP_DATA_DIR: dataDirectory,
        APP_ELECTRON_USER_DATA_DIR: path.join(dataDirectory, 'electron-profile'),
        NODE_ENV: 'test',
      },
    });
    const window = await application.firstWindow();
    await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
    await window.getByLabel('Nome da campanha').fill('Campanha retry');
    await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    await window.getByRole('button', { name: 'Abrir campanha Campanha retry' }).click();
    await window.getByRole('button', { name: 'Fios Abertos' }).click();
    await window.getByRole('button', { name: 'Criar fio', exact: true }).click();
    await window.getByLabel('Título').fill('Fio para retry');
    await window.getByRole('button', { name: 'Criar fio', exact: true }).click();
    await expect(window.getByRole('heading', { name: 'Fio para retry' })).toBeVisible();
    await window.getByRole('button', { name: 'Voltar', exact: true }).click();

    await application.evaluate(({ ipcMain }) => {
      const state = { gets: [] as unknown[], mutations: 0 };
      Object.assign(globalThis, { __storyThreadRetryState: state });
      ipcMain.removeHandler('threads:get');
      ipcMain.handle('threads:get', (_event, input: unknown) => {
        state.gets.push(input);
        return {
          ok: false,
          error: { code: 'DATABASE_UNAVAILABLE', message: 'Falha controlada de teste.' },
          requestId: 'retry-test',
        };
      });
      for (const channel of ['threads:create', 'threads:update']) {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, () => {
          state.mutations += 1;
          return {
            ok: false,
            error: { code: 'TEST_UNEXPECTED_MUTATION', message: 'Mutação inesperada.' },
            requestId: 'retry-test',
          };
        });
      }
    });
    await window.getByRole('button', { name: /Fio para retry/ }).click();
    await expect(window.getByRole('alert')).toBeVisible();
    await window.getByRole('button', { name: 'Tentar novamente' }).click();
    await expect(window.getByRole('alert')).toBeVisible();

    const retryState = await application.evaluate(() => {
      return (
        globalThis as typeof globalThis & {
          __storyThreadRetryState: { gets: unknown[]; mutations: number };
        }
      ).__storyThreadRetryState;
    });
    expect(retryState.gets).toHaveLength(2);
    expect(retryState.gets[0]).toEqual(retryState.gets[1]);
    expect(retryState.mutations).toBe(0);
  } finally {
    if (application !== null) await application.close();
    await rm(dataDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
});
