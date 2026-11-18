import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import type { CampaignManagerGateway } from '../../src/core/contracts/gateway';

const root = process.cwd();
const requireFromRepository = createRequire(path.join(root, 'package.json'));
const electronExecutable = requireFromRepository('electron') as string;

test('cria, avança explicitamente, conclui parcialmente e consulta relógios após reinício', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'clocks-e2e-'));
  let application: ElectronApplication | null = null;
  const launch = async (): Promise<ElectronApplication> =>
    electron.launch({
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

  try {
    application = await launch();
    const window = await application.firstWindow();
    await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
    await window.getByLabel('Nome da campanha').fill('Campanha de relógios');
    await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    const entity = await createTestEntity(window, 'Campanha de relógios');
    const sourceSessionId = await window.evaluate(async () => {
      const gateway = (globalThis as { campaignManager?: CampaignManagerGateway }).campaignManager;
      if (gateway === undefined) throw new Error('Gateway indisponível.');
      const campaigns = await gateway.campaigns.list({});
      if (!campaigns.ok) throw new Error('Falha ao consultar campanha.');
      const campaign = campaigns.data.items.find((item) => item.name === 'Campanha de relógios');
      if (campaign === undefined) throw new Error('Campanha ausente.');
      const session = await gateway.sessions.create({
        campaignId: campaign.id,
        sequenceNumber: 1,
        title: 'Sessão de origem',
      });
      if (!session.ok) throw new Error('Falha ao criar sessão de origem.');
      return session.data.id;
    });
    await window.getByRole('button', { name: 'Abrir campanha Campanha de relógios' }).click();
    await window.getByRole('button', { name: 'Relógios', exact: true }).click();
    await expect(window.getByText('Ainda não há relógios')).toBeVisible();
    await window.getByRole('button', { name: 'Novo relógio' }).click();
    await window.getByLabel('Nome', { exact: true }).fill('Objetivo da expedição');
    await window.getByLabel('Entidade vinculada').selectOption(entity.id);
    await window.getByLabel('Consequência').fill('A expedição alcançará seu destino.');
    await window.getByLabel('Origem', { exact: true }).selectOption('session');
    await window.getByLabel('Sessão de origem *').selectOption(sourceSessionId);
    await window.getByLabel('Tipo').selectOption('countdown');
    await window.getByLabel('Total de divisões').selectOption('4');
    await window.getByLabel('Divisões preenchidas').selectOption('3');
    await window.getByRole('button', { name: 'Criar relógio' }).click();
    await expect(window.getByText('Contagem regressiva · Ativo')).toBeVisible();
    await expect(window.getByText('Progresso: 3 de 4 divisões')).toBeVisible();
    const savedClockSource = await window.evaluate(async () => {
      const gateway = (globalThis as { campaignManager?: CampaignManagerGateway }).campaignManager;
      if (gateway === undefined) throw new Error('Gateway indisponível.');
      const campaigns = await gateway.campaigns.list({});
      if (!campaigns.ok) throw new Error('Falha ao consultar campanha.');
      const campaign = campaigns.data.items.find((item) => item.name === 'Campanha de relógios');
      if (campaign === undefined) throw new Error('Campanha ausente.');
      const clocks = await gateway.clocks.list({ campaignId: campaign.id });
      if (!clocks.ok) throw new Error('Falha ao consultar relógios.');
      const clock = clocks.data.items.find((item) => item.name === 'Objetivo da expedição');
      if (clock === undefined) throw new Error('Relógio ausente.');
      return { originKind: clock.originKind, sessionId: clock.sessionId, sourceId: clock.sourceId };
    });
    expect(savedClockSource).toMatchObject({
      originKind: 'session',
      sessionId: sourceSessionId,
    });

    await window.getByRole('button', { name: 'Editar' }).click();
    await expect(window.getByLabel('Sessão de origem *')).toHaveValue(sourceSessionId);
    await window.getByLabel('Divisões preenchidas').selectOption('4');
    await window.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(window.getByRole('dialog')).toBeVisible();
    await window.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(window.getByRole('dialog')).toHaveCount(0);
    await expect(window.getByLabel('Divisões preenchidas')).toHaveValue('4');
    await window.getByRole('button', { name: 'Salvar alterações' }).click();
    await window.getByRole('button', { name: 'Concluir e gerar Evento' }).click();
    await expect(window.getByText('Contagem regressiva · Concluído')).toBeVisible();
    await expect(window.getByText('Progresso: 4 de 4 divisões')).toBeVisible();
    await expect(window.getByRole('button', { name: 'Editar' })).toHaveCount(0);
    await expect(window.getByRole('button', { name: 'Concluir relógio' })).toHaveCount(0);
    const generatedEvents = await window.evaluate(async (entityId) => {
      const gateway = (globalThis as { campaignManager?: CampaignManagerGateway }).campaignManager;
      if (gateway === undefined) throw new Error('Gateway indisponível.');
      const campaigns = await gateway.campaigns.list({});
      if (!campaigns.ok) throw new Error('Falha ao consultar campanha.');
      const campaign = campaigns.data.items.find((item) => item.name === 'Campanha de relógios');
      if (campaign === undefined) throw new Error('Campanha ausente.');
      const result = await gateway.events.list({
        campaignId: campaign.id,
        filters: { entityId, canonState: 'draft' },
      });
      if (!result.ok) throw new Error('Falha ao consultar Evento gerado.');
      return result.data.items;
    }, entity.id);
    expect(generatedEvents).toHaveLength(1);
    expect(generatedEvents[0]).toMatchObject({
      title: 'Objetivo da expedição',
      descriptionMarkdown: 'A expedição alcançará seu destino.',
      canonState: 'draft',
      knowledgeState: 'possibility',
      visibility: 'gm',
      originKind: 'manual',
      sessionId: null,
    });

    await window.getByRole('button', { name: 'Voltar à lista' }).click();
    await window.getByRole('button', { name: 'Novo relógio' }).click();
    await window.getByLabel('Nome', { exact: true }).fill('Acontecimento opcional');
    await window.getByLabel('Entidade vinculada').selectOption(entity.id);
    await window.getByLabel('Consequência').fill('Nada muda no momento.');
    await window.getByLabel('Total de divisões').selectOption('8');
    await window.getByRole('button', { name: 'Criar relógio' }).click();
    await expect(window.getByText('Progresso: 0 de 8 divisões')).toBeVisible();
    await window.getByRole('button', { name: 'Concluir relógio' }).click();
    await expect(window.getByRole('dialog')).toBeVisible();
    await window.getByRole('button', { name: 'Concluir sem Evento' }).click();
    await expect(window.getByText('Relógio concluído com o progresso atual.')).toBeVisible();
    await expect(window.getByText('Progresso: 0 de 8 divisões')).toBeVisible();

    await window.getByRole('button', { name: 'Voltar à lista' }).click();
    await window.getByRole('button', { name: 'Novo relógio' }).click();
    await window.getByLabel('Nome', { exact: true }).fill('Criado com total preenchido');
    await window.getByLabel('Entidade vinculada').selectOption(entity.id);
    await window.getByLabel('Consequência').fill('O objetivo já está concluído.');
    await window.getByLabel('Total de divisões').selectOption('4');
    await window.getByLabel('Divisões preenchidas').selectOption('4');
    await window.getByRole('button', { name: 'Criar relógio' }).click();
    await expect(window.getByRole('dialog')).toBeVisible();
    await window.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(window.getByLabel('Divisões preenchidas')).toHaveValue('4');
    await window.getByRole('button', { name: 'Criar relógio' }).click();
    await window.getByRole('dialog').getByRole('button', { name: 'Concluir sem Evento' }).click();
    await expect(window.getByText('Progresso: 4 de 4 divisões')).toBeVisible();
    await expect(window.getByText('Progresso · Concluído')).toBeVisible();
    const eventCountAfterNoEventChoice = await window.evaluate(async (entityId) => {
      const gateway = (globalThis as { campaignManager?: CampaignManagerGateway }).campaignManager;
      if (gateway === undefined) throw new Error('Gateway indisponível.');
      const campaigns = await gateway.campaigns.list({});
      if (!campaigns.ok) throw new Error('Falha ao consultar campanha.');
      const campaign = campaigns.data.items.find((item) => item.name === 'Campanha de relógios');
      if (campaign === undefined) throw new Error('Campanha ausente.');
      const result = await gateway.events.list({
        campaignId: campaign.id,
        filters: { entityId, canonState: 'draft' },
      });
      if (!result.ok) throw new Error('Falha ao consultar Eventos.');
      return result.data.items.length;
    }, entity.id);
    expect(eventCountAfterNoEventChoice).toBe(1);

    await window.getByRole('button', { name: 'Voltar à lista' }).click();
    await window.getByRole('button', { name: 'Novo relógio' }).click();
    await window.getByLabel('Nome', { exact: true }).fill('Relógio de entidade arquivada');
    await window.getByLabel('Entidade vinculada').selectOption(entity.id);
    await window.getByLabel('Consequência').fill('A entidade será arquivada.');
    await window.getByRole('button', { name: 'Criar relógio' }).click();
    await expect(
      window.getByRole('heading', { name: 'Relógio de entidade arquivada' }),
    ).toBeVisible();
    await window.getByRole('button', { name: 'Voltar à lista' }).click();
    await window.getByRole('button', { name: /Relógio de entidade arquivada/ }).click();
    await window.getByRole('button', { name: 'Concluir relógio' }).click();
    await expect(window.getByRole('dialog')).toContainText('Deseja gerar um Evento');
    await window.evaluate(async (entityId) => {
      const gateway = (globalThis as { campaignManager?: CampaignManagerGateway }).campaignManager;
      if (gateway === undefined) throw new Error('Gateway indisponível.');
      const campaigns = await gateway.campaigns.list({});
      if (!campaigns.ok) throw new Error('Falha ao consultar campanha.');
      const campaign = campaigns.data.items.find((item) => item.name === 'Campanha de relógios');
      if (campaign === undefined) throw new Error('Campanha ausente.');
      const entityResult = await gateway.entities.get({ campaignId: campaign.id, id: entityId });
      if (!entityResult.ok) throw new Error('Falha ao consultar entidade.');
      const archived = await gateway.entities.archive({
        campaignId: campaign.id,
        id: entityId,
        revision: entityResult.data.entity.revision,
      });
      if (!archived.ok) throw new Error('Falha ao arquivar entidade.');
    }, entity.id);
    await window
      .getByRole('dialog')
      .getByRole('button', { name: 'Concluir e gerar Evento' })
      .click();
    await expect(window.getByText('A entidade vinculada está arquivada')).toBeVisible();
    await window.getByRole('button', { name: 'Atualizar relógio e entidade' }).click();
    await expect(
      window.getByText('Entidade arquivada — encerre o relógio manualmente', { exact: false }),
    ).toBeVisible();
    await window.getByRole('button', { name: 'Concluir relógio' }).click();
    await expect(window.getByRole('dialog')).toContainText('não é possível gerar Evento');
    await expect(window.getByRole('button', { name: 'Concluir e gerar Evento' })).toHaveCount(0);
    await window.getByRole('button', { name: 'Concluir sem Evento' }).click();
    await expect(window.getByText('Relógio concluído com o progresso atual.')).toBeVisible();

    await window.getByRole('button', { name: 'Voltar à lista' }).click();
    await window.getByRole('button', { name: 'Atualizar lista' }).click();
    await expect(
      window.getByText('Entidade arquivada — encerre o relógio manualmente').first(),
    ).toBeVisible();
    await window.getByRole('button', { name: 'Sessões', exact: true }).click();
    await expect(window.getByRole('heading', { name: 'Sessões' })).toBeVisible();
    await application.evaluate(({ ipcMain }) => {
      const state: { release: (() => void) | null } = { release: null };
      Object.assign(globalThis, { __clockListRaceState: state });
      ipcMain.removeHandler('clocks:list');
      ipcMain.handle(
        'clocks:list',
        () =>
          new Promise((resolve) => {
            state.release = () =>
              resolve({
                ok: true,
                data: { items: [], nextCursor: null, total: 0 },
                requestId: 'clock-race-test',
              });
          }),
      );
    });
    await window.getByRole('button', { name: 'Relógios', exact: true }).click();
    await expect(window.getByText('Carregando relógios…')).toBeVisible();
    await window.getByRole('button', { name: 'Sessões', exact: true }).click();
    await expect(window.getByRole('heading', { name: 'Sessões' })).toBeVisible();
    await application.evaluate(() => {
      const state = (
        globalThis as typeof globalThis & {
          __clockListRaceState: { release: (() => void) | null };
        }
      ).__clockListRaceState;
      state.release?.();
    });
    await expect(window.getByRole('heading', { name: 'Relógios' })).toHaveCount(0);

    const visibleText = await window.locator('body').innerText();
    expect(visibleText).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    );
    await application.close();
    application = await launch();
    const reopened = await application.firstWindow();
    await reopened.getByRole('button', { name: 'Abrir campanha Campanha de relógios' }).click();
    await reopened.getByRole('button', { name: 'Relógios', exact: true }).click();
    await expect(reopened.getByRole('button', { name: /Objetivo da expedição/ })).toBeVisible();
    await expect(reopened.getByRole('button', { name: /Acontecimento opcional/ })).toBeVisible();
    await reopened.getByRole('button', { name: /Objetivo da expedição/ }).click();
    await expect(reopened.getByText('Progresso: 4 de 4 divisões')).toBeVisible();
    await expect(reopened.getByText('Contagem regressiva · Concluído')).toBeVisible();
  } finally {
    if (application !== null) await application.close();
    await rm(dataDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
});

test('repete o GET do relógio após falha transitória sem invocar mutações', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'clocks-retry-e2e-'));
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
    await window.getByLabel('Nome da campanha').fill('Campanha de retry');
    await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    const entity = await createTestEntity(window, 'Campanha de retry');
    await window.getByRole('button', { name: 'Abrir campanha Campanha de retry' }).click();
    await window.getByRole('button', { name: 'Relógios', exact: true }).click();
    await window.getByRole('button', { name: 'Novo relógio' }).click();
    await window.getByLabel('Nome', { exact: true }).fill('Relógio para retry');
    await window.getByLabel('Entidade vinculada').selectOption(entity.id);
    await window.getByLabel('Consequência').fill('Carregar os mesmos dados novamente.');
    await window.getByRole('button', { name: 'Criar relógio' }).click();
    await expect(window.getByRole('heading', { name: 'Relógio para retry' })).toBeVisible();
    await window.getByRole('button', { name: 'Voltar à lista' }).click();
    await expect(window.getByRole('button', { name: /Relógio para retry/ })).toBeVisible();

    await application.evaluate(({ ipcMain }) => {
      const state: {
        getCalls: { campaignId: string; id: string }[];
        mutationCalls: number;
      } = { getCalls: [], mutationCalls: 0 };
      Object.assign(globalThis, { __clockRetryState: state });
      ipcMain.removeHandler('clocks:get');
      ipcMain.handle('clocks:get', (_event, input: { campaignId: string; id: string }) => {
        state.getCalls.push(input);
        if (state.getCalls.length === 1)
          return {
            ok: false,
            error: { code: 'DATABASE_UNAVAILABLE', message: 'Falha transitória de teste.' },
            requestId: 'clock-retry-failure',
          };
        return {
          ok: true,
          data: {
            id: input.id,
            campaignId: input.campaignId,
            name: 'Relógio recuperado',
            description: null,
            consequence: 'Consequência para o relógio de retry.',
            clockType: 'progress',
            segmentsTotal: 4,
            segmentsFilled: 1,
            status: 'active',
            entityId: '20000000-0000-4000-8000-000000000001',
            entityName: 'Entidade vinculada',
            entityArchivedAt: null,
            canonState: 'accepted',
            knowledgeState: 'fact',
            visibility: 'gm',
            originKind: 'manual',
            sourceId: null,
            generatedEventId: null,
            createdAt: '2026-11-16T14:00:00.000Z',
            updatedAt: '2026-11-16T14:00:00.000Z',
            revision: 1,
          },
          requestId: 'clock-retry-success',
        };
      });
      for (const channel of ['clocks:create', 'clocks:update', 'clocks:complete']) {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, () => {
          state.mutationCalls += 1;
          return {
            ok: false,
            error: { code: 'UNEXPECTED_MUTATION', message: 'Não esperado neste teste.' },
            requestId: 'clock-retry-mutation',
          };
        });
      }
    });

    await window.getByRole('button', { name: /Relógio para retry/ }).click();
    await expect(window.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
    await window.getByRole('button', { name: 'Tentar novamente' }).click();
    const retryState = await application.evaluate(() => {
      return (
        globalThis as typeof globalThis & {
          __clockRetryState: {
            getCalls: { campaignId: string; id: string }[];
            mutationCalls: number;
          };
        }
      ).__clockRetryState;
    });
    expect(retryState.getCalls).toHaveLength(2);
    await expect(window.getByRole('heading', { name: 'Relógio recuperado' })).toBeVisible();
    await expect(window.getByText('Progresso: 1 de 4 divisões')).toBeVisible();
    const state = await application.evaluate(() => {
      return (
        globalThis as typeof globalThis & {
          __clockRetryState: {
            getCalls: { campaignId: string; id: string }[];
            mutationCalls: number;
          };
        }
      ).__clockRetryState;
    });
    expect(state.getCalls).toHaveLength(2);
    expect(state.getCalls[1]).toEqual(state.getCalls[0]);
    expect(state.mutationCalls).toBe(0);

    await window.getByRole('button', { name: 'Voltar à lista' }).click();
    await expect(window.getByRole('heading', { name: 'Relógios' })).toBeVisible();
  } finally {
    if (application !== null) await application.close();
    await rm(dataDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
});

test('mantém retry de listagem associado à falha certa enquanto as cargas paralelas terminam fora de ordem', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'clocks-list-retry-race-e2e-'));
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
    await window.getByLabel('Nome da campanha').fill('Campanha de retry paralelo');
    await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    await window.getByRole('button', { name: 'Abrir campanha Campanha de retry paralelo' }).click();
    await application.evaluate(({ ipcMain }) => {
      const state: {
        clockListCalls: number;
        entityListCalls: number;
        mutationCalls: number;
        releaseClockList: (() => void) | null;
        releaseEntityList: (() => void) | null;
      } = {
        clockListCalls: 0,
        entityListCalls: 0,
        mutationCalls: 0,
        releaseClockList: null,
        releaseEntityList: null,
      };
      Object.assign(globalThis, { __clockParallelRetryState: state });
      ipcMain.removeHandler('clocks:list');
      ipcMain.handle('clocks:list', () => {
        state.clockListCalls += 1;
        if (state.clockListCalls === 1)
          return {
            ok: false,
            error: { code: 'DATABASE_UNAVAILABLE', message: 'Falha controlada na lista.' },
            requestId: 'clock-list-failure-initial',
          };
        if (state.clockListCalls === 2)
          return new Promise((resolve) => {
            state.releaseClockList = () =>
              resolve({
                ok: false,
                error: { code: 'DATABASE_UNAVAILABLE', message: 'Falha controlada na lista.' },
                requestId: 'clock-list-failure-retry',
              });
          });
        return {
          ok: true,
          data: { items: [], nextCursor: null, total: 0 },
          requestId: 'clock-list-recovered',
        };
      });
      ipcMain.removeHandler('entities:list');
      ipcMain.handle('entities:list', () => {
        state.entityListCalls += 1;
        if (state.entityListCalls === 1)
          return new Promise((resolve) => {
            state.releaseEntityList = () =>
              resolve({
                ok: false,
                error: { code: 'DATABASE_UNAVAILABLE', message: 'Falha controlada nas entidades.' },
                requestId: 'entity-list-failure',
              });
          });
        return {
          ok: true,
          data: { items: [], nextCursor: null, total: 0 },
          requestId: 'entity-list-recovered',
        };
      });
      for (const channel of ['clocks:create', 'clocks:update', 'clocks:complete']) {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, () => {
          state.mutationCalls += 1;
          return {
            ok: false,
            error: { code: 'UNEXPECTED_MUTATION', message: 'Retry não pode mutar.' },
            requestId: 'clock-retry-mutation',
          };
        });
      }
    });

    await window.getByRole('button', { name: 'Relógios', exact: true }).click();
    await expect(window.getByText('Ainda não há relógios')).toHaveCount(0);
    await expect(window.getByRole('alert')).toHaveCount(1);
    const clockListError = window.getByRole('alert').first();
    await clockListError.getByRole('button', { name: 'Tentar novamente' }).click();
    await expect(window.getByText('Carregando relógios…')).toBeVisible();
    const callsWhileEntitiesPending = await application.evaluate(() => {
      return (
        globalThis as typeof globalThis & {
          __clockParallelRetryState: {
            clockListCalls: number;
            entityListCalls: number;
            mutationCalls: number;
          };
        }
      ).__clockParallelRetryState;
    });
    expect(callsWhileEntitiesPending).toMatchObject({
      clockListCalls: 2,
      entityListCalls: 1,
      mutationCalls: 0,
    });

    await application.evaluate(() => {
      const state = (
        globalThis as typeof globalThis & {
          __clockParallelRetryState: { releaseEntityList: (() => void) | null };
        }
      ).__clockParallelRetryState;
      state.releaseEntityList?.();
    });
    await expect(window.getByRole('alert')).toHaveCount(1);
    await application.evaluate(() => {
      const state = (
        globalThis as typeof globalThis & {
          __clockParallelRetryState: { releaseClockList: (() => void) | null };
        }
      ).__clockParallelRetryState;
      state.releaseClockList?.();
    });
    await expect(window.getByRole('alert')).toHaveCount(2);

    await window
      .getByRole('alert')
      .first()
      .getByRole('button', { name: 'Tentar novamente' })
      .click();
    await expect(window.getByRole('alert')).toHaveCount(1);
    await window
      .getByRole('alert')
      .first()
      .getByRole('button', { name: 'Tentar novamente' })
      .click();
    await expect(window.getByRole('alert')).toHaveCount(0);
    const finalState = await application.evaluate(() => {
      return (
        globalThis as typeof globalThis & {
          __clockParallelRetryState: {
            clockListCalls: number;
            entityListCalls: number;
            mutationCalls: number;
          };
        }
      ).__clockParallelRetryState;
    });
    expect(finalState).toEqual({ clockListCalls: 3, entityListCalls: 2, mutationCalls: 0 });
  } finally {
    if (application !== null) await application.close();
    await rm(dataDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
});

async function createTestEntity(
  window: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  campaignName: string,
): Promise<{ id: string }> {
  return window.evaluate(async (name) => {
    const gateway = (globalThis as { campaignManager?: CampaignManagerGateway }).campaignManager;
    if (gateway === undefined) throw new Error('Gateway indisponível.');
    const campaigns = await gateway.campaigns.list({});
    if (!campaigns.ok) throw new Error('Falha ao consultar campanhas.');
    const campaign = campaigns.data.items.find((item) => item.name === name);
    if (campaign === undefined) throw new Error('Campanha ausente.');
    const type = await gateway.entityTypes.create({
      campaignId: campaign.id,
      name: 'Objetivos',
      singularName: 'Objetivo',
    });
    if (!type.ok) throw new Error('Falha ao criar tipo de entidade.');
    const entity = await gateway.entities.create({
      campaignId: campaign.id,
      entityTypeId: type.data.id,
      name: 'Entidade vinculada',
    });
    if (!entity.ok) throw new Error('Falha ao criar entidade.');
    return { id: entity.data.entity.id };
  }, campaignName);
}
