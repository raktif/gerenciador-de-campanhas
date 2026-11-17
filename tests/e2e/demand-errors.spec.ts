import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  _electron as electron,
  expect,
  test as base,
  type ElectronApplication,
} from '@playwright/test';
import type { CampaignManagerGateway } from '../../src/core/contracts/gateway';
import type { CopyStartupDiagnosticInput } from '../../src/core/contracts/diagnostics';

const root = process.cwd();
const executablePath = createRequire(path.join(root, 'package.json'))('electron') as string;
interface ControlledReads {
  copies: CopyStartupDiagnosticInput[];
  calls: Record<string, unknown[]>;
  mutations: number;
}
const test = base.extend<{ app: ElectronApplication }>({
  // Electron owns its isolated app; no browser fixture is needed.
  // eslint-disable-next-line no-empty-pattern
  app: async ({}, use) => {
    const data = await mkdtemp(path.join(os.tmpdir(), 'demand-errors-e2e-'));
    const app = await electron.launch({
      executablePath,
      args: [root],
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            (entry): entry is [string, string] =>
              entry[1] !== undefined && entry[0] !== 'ELECTRON_RUN_AS_NODE',
          ),
        ),
        APP_DATA_DIR: data,
        APP_ELECTRON_USER_DATA_DIR: path.join(data, 'electron-profile'),
        NODE_ENV: 'test',
      },
    });
    try {
      const page = await app.firstWindow();
      await page.getByRole('button', { name: 'Criar primeira campanha' }).click();
      await page.getByLabel('Nome da campanha').fill('Erros de Demandas');
      await page.getByRole('button', { name: 'Criar campanha', exact: true }).click();
      await page.getByRole('button', { name: 'Abrir campanha Erros de Demandas' }).click();
      await expect(
        page.getByRole('button', { name: 'Demandas emergentes', exact: true }),
      ).toBeVisible();
      await use(app);
    } finally {
      await app.close();
      await rm(data, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
    }
  },
});

async function controlReads(
  app: ElectronApplication,
  responses: Record<string, unknown>,
  failOnce: string[],
): Promise<void> {
  await app.evaluate(
    ({ ipcMain }, { responses, failOnce }) => {
      const state: ControlledReads = { copies: [], calls: {}, mutations: 0 };
      (globalThis as unknown as { __demandErrors: ControlledReads }).__demandErrors = state;
      for (const [channel, data] of Object.entries(responses)) {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, (_event, input: unknown) => {
          const calls = (state.calls[channel] ??= []);
          calls.push(input);
          if (failOnce.includes(channel) && calls.length === 1)
            return {
              ok: false,
              error: { code: 'DATABASE_UNAVAILABLE', message: 'Falha controlada de leitura' },
              requestId: 'read-error',
            };
          return { ok: true, data, requestId: 'read-success' };
        });
      }
      ipcMain.removeHandler('diagnostics:copy-startup');
      ipcMain.handle('diagnostics:copy-startup', (_event, input: CopyStartupDiagnosticInput) => {
        state.copies.push(input);
        return { ok: true, data: { copied: true }, requestId: 'copied' };
      });
      for (const channel of [
        'demands:accept',
        'demands:update',
        'demands:transform',
        'demands:transition',
        'campaign-signals:recalculate',
        'campaign-signals:review',
        'campaign-signals:dismiss',
        'campaign-signals:snooze',
        'campaign-signals:reactivate',
        'events:update',
        'events:archive',
        'events:restore',
      ]) {
        if (channel in responses) continue;
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, () => {
          state.mutations += 1;
          return {
            ok: false,
            error: { code: 'INTERNAL_ERROR', message: 'Mutação inesperada' },
            requestId: 'unexpected-mutation',
          };
        });
      }
    },
    { responses, failOnce },
  );
}

async function seedProvenance(
  app: ElectronApplication,
  mode: 'signal' | 'dismissed' | 'demand' | 'event',
) {
  const page = await app.firstWindow();
  return page.evaluate(async (mode) => {
    const g = (globalThis as unknown as { campaignManager: CampaignManagerGateway })
      .campaignManager;
    const campaigns = await g.campaigns.list({});
    if (!campaigns.ok || !campaigns.data.items[0]) throw new Error('campaign');
    const campaignId = campaigns.data.items[0].id;
    const type = await g.entityTypes.create({
      campaignId,
      name: 'Fontes',
      singularName: 'Fonte',
    });
    if (!type.ok) throw new Error('type');
    const field = await g.fieldDefinitions.create({
      campaignId,
      entityTypeId: type.data.id,
      label: 'Need original',
      dataType: 'long_text',
      semanticRole: 'need',
    });
    if (!field.ok) throw new Error('field');
    const entity = await g.entities.create({
      campaignId,
      entityTypeId: type.data.id,
      name: 'Fonte',
      fieldValues: [{ fieldDefinitionId: field.data.id, value: 'Preservar a ponte' }],
    });
    if (!entity.ok) throw new Error('entity');
    const recalc = await g.campaignSignals.recalculate({ campaignId });
    const item =
      recalc.ok && recalc.data.items.find((item) => item.signal.signalType === 'explicit_need');
    if (!recalc.ok || !item) throw new Error('signal');
    const signal = item.signal;
    if (mode === 'dismissed') {
      const dismissed = await g.campaignSignals.dismiss({
        campaignId,
        id: signal.id,
        revision: signal.revision,
      });
      if (!dismissed.ok) throw new Error('dismiss');
      return {
        campaignId,
        entity: entity.data,
        signal: dismissed.data,
        recalc: recalc.data,
        demand: null,
        event: null,
      };
    }
    if (mode === 'signal')
      return {
        campaignId,
        entity: entity.data,
        signal,
        recalc: recalc.data,
        demand: null,
        event: null,
      };
    const suggestion = await g.demands.suggestion({ campaignId, signalId: signal.id });
    if (!suggestion.ok) throw new Error('suggestion');
    const accepted = await g.demands.accept({
      campaignId,
      signalId: signal.id,
      signalRevision: suggestion.data.signalRevision,
      content: {
        title: suggestion.data.title,
        need: suggestion.data.need,
        summary: '',
        obstacle: '',
        risks: '',
        urgency: 'medium',
        requesterEntityId: entity.data.entity.id,
        links: [],
      },
    });
    if (!accepted.ok) throw new Error('accept');
    if (mode === 'demand')
      return {
        campaignId,
        entity: entity.data,
        signal,
        recalc: recalc.data,
        demand: accepted.data,
        event: null,
      };
    const resolved = await g.demands.transition({
      campaignId,
      id: accepted.data.demand.id,
      revision: accepted.data.demand.revision,
      action: 'resolve',
      confirmed: true,
    });
    if (!resolved.ok || !resolved.data.demand.generatedEventId) throw new Error('resolve');
    const event = await g.events.get({
      campaignId,
      id: resolved.data.demand.generatedEventId,
    });
    if (!event.ok) throw new Error('event');
    return {
      campaignId,
      entity: entity.data,
      signal,
      recalc: recalc.data,
      demand: resolved.data,
      event: event.data,
    };
  }, mode);
}

for (const action of ['recalculate', 'dismiss', 'snooze', 'reactivate'] as const) {
  test(`QA transversal signals.${action}: diagnóstico e retry no canal original`, async ({
    app,
  }) => {
    const seed = await seedProvenance(app, action === 'reactivate' ? 'dismissed' : 'signal');
    const channel = `campaign-signals:${action}`;
    await controlReads(app, { [channel]: action === 'recalculate' ? seed.recalc : seed.signal }, [
      channel,
    ]);
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Demandas emergentes', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Necessidade explícita: Fonte', exact: true }),
    ).toBeVisible();
    if (action === 'snooze') await page.getByLabel('Adiar até').fill('2099-12-01T10:00');
    const buttons = {
      recalculate: 'Recalcular sinais',
      dismiss: 'Ignorar sugestão',
      snooze: 'Adiar sugestão',
      reactivate: 'Reativar para revisão',
    };
    await page.getByRole('button', { name: buttons[action], exact: true }).click();
    const alert = page.getByRole('alert');
    await alert.getByRole('button', { name: 'Copiar diagnóstico' }).click();
    await expect(alert.getByText('Diagnóstico copiado.')).toBeVisible();
    expect((await readState(app)).copies).toEqual([
      {
        version: 1,
        screen: 'signals',
        operation: 'signals.mutate',
        code: 'DATABASE_UNAVAILABLE',
      },
    ]);
    await alert.getByRole('button', { name: 'Tentar novamente' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    const state = await readState(app);
    expect(state.mutations).toBe(0);
    const input = {
      campaignId: seed.campaignId,
      ...(action === 'recalculate' ? {} : { id: seed.signal.id, revision: seed.signal.revision }),
      ...(action === 'snooze'
        ? { dismissedUntil: new Date('2099-12-01T10:00').toISOString() }
        : {}),
    };
    expect(state.calls).toEqual({ [channel]: [input, input] });
  });
}

for (const resource of ['entities', 'events'] as const) {
  test(`QA transversal ${resource}.get: diagnóstico e retry somente do detalhe solicitado`, async ({
    app,
  }) => {
    const seed = await seedProvenance(app, resource === 'events' ? 'event' : 'demand');
    const channel = `${resource}:get`;
    await controlReads(app, { [channel]: resource === 'events' ? seed.event : seed.entity }, [
      channel,
    ]);
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Demandas emergentes', exact: true }).click();
    await page
      .getByRole('button', {
        name: `Necessidade de Fonte — ${resource === 'events' ? 'Resolvida' : 'Disponível'}`,
        exact: true,
      })
      .click();
    await page
      .getByRole('button', {
        name: resource === 'events' ? 'Ver Evento gerado' : 'Ver entidade e campo Need de origem',
        exact: true,
      })
      .click();
    const alert = page.getByRole('alert');
    await alert.getByRole('button', { name: 'Copiar diagnóstico' }).click();
    await expect(alert.getByText('Diagnóstico copiado.')).toBeVisible();
    expect((await readState(app)).copies).toEqual([
      {
        version: 1,
        screen: resource,
        operation: `${resource}.get`,
        code: 'DATABASE_UNAVAILABLE',
      },
    ]);
    await alert.getByRole('button', { name: 'Tentar novamente' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(
      page.getByText(
        resource === 'events'
          ? 'Evento Rascunho / Possibilidade. Conteúdo e vínculos congelados.'
          : 'Fonte: Preservar a ponte',
        { exact: true },
      ),
    ).toBeVisible();
    const state = await readState(app);
    expect(state.mutations).toBe(0);
    const input = {
      campaignId: seed.campaignId,
      id: resource === 'events' ? seed.event?.event.id : seed.entity.entity.id,
    };
    expect(state.calls).toEqual({ [channel]: [input, input] });
  });
}
for (const action of ['update', 'archive', 'restore'] as const) {
  test(`QA transversal events.${action}: diagnóstico e retry preservam ação e payload`, async ({
    app,
  }) => {
    const seed = await seedProvenance(app, 'event');
    let event = seed.event;
    if (!event) throw new Error('event');
    if (action === 'restore') {
      const archived = await (
        await app.firstWindow()
      ).evaluate(async (event) => {
        const g = (globalThis as unknown as { campaignManager: CampaignManagerGateway })
          .campaignManager;
        return g.events.archive({
          campaignId: event.event.campaignId,
          id: event.event.id,
          revision: event.event.revision,
        });
      }, event);
      if (!archived.ok) throw new Error('archive');
      event = archived.data;
    }
    const channel = `events:${action}`;
    await controlReads(app, { [channel]: event }, [channel]);
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Demandas emergentes', exact: true }).click();
    await page
      .getByRole('button', { name: 'Necessidade de Fonte — Resolvida', exact: true })
      .click();
    await page.getByRole('button', { name: 'Ver Evento gerado', exact: true }).click();
    const buttons = {
      update: 'Promover explicitamente Evento a Aceito / Fato',
      archive: 'Arquivar Evento',
      restore: 'Restaurar Evento',
    };
    await page.getByRole('button', { name: buttons[action], exact: true }).click();
    const alert = page.getByRole('alert');
    await alert.getByRole('button', { name: 'Copiar diagnóstico' }).click();
    await expect(alert.getByText('Diagnóstico copiado.')).toBeVisible();
    expect((await readState(app)).copies).toEqual([
      {
        version: 1,
        screen: 'events',
        operation: 'events.mutate',
        code: 'DATABASE_UNAVAILABLE',
      },
    ]);
    await alert.getByRole('button', { name: 'Tentar novamente' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    const state = await readState(app);
    expect(state.mutations).toBe(0);
    const input = {
      campaignId: seed.campaignId,
      id: event.event.id,
      revision: event.event.revision,
      ...(action === 'update' ? { patch: { canonState: 'accepted', knowledgeState: 'fact' } } : {}),
    };
    expect(state.calls).toEqual({ [channel]: [input, input] });
  });
}

test('QA transversal demands.targets: erro de alvo copia diagnóstico correto sem mutação', async ({
  app,
}) => {
  await seedProvenance(app, 'demand');
  await controlReads(app, { 'demands:targets': { items: [], nextCursor: null } }, [
    'demands:targets',
  ]);
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Demandas emergentes', exact: true }).click();
  await page
    .getByRole('button', { name: 'Necessidade de Fonte — Disponível', exact: true })
    .click();
  await page.getByRole('button', { name: 'Editar Demanda', exact: true }).click();
  const alert = page.getByRole('alert');
  await alert.getByRole('button', { name: 'Copiar diagnóstico' }).click();
  await expect(alert.getByText('Diagnóstico copiado.')).toBeVisible();
  expect((await readState(app)).copies).toEqual([
    {
      version: 1,
      screen: 'demands',
      operation: 'demands.targets',
      code: 'DATABASE_UNAVAILABLE',
    },
  ]);
  await alert.getByRole('button', { name: 'Tentar carregar alvos novamente' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const state = await readState(app);
  expect(state.mutations).toBe(0);
  const calls = state.calls['demands:targets'];
  expect(calls).toHaveLength(4);
  expect(calls?.every((call) => JSON.stringify(call) === JSON.stringify(calls[0]))).toBe(true);
});

async function readState(app: ElectronApplication): Promise<ControlledReads> {
  return app.evaluate(
    () => (globalThis as unknown as { __demandErrors: ControlledReads }).__demandErrors,
  );
}
const emptyDemands = 'Nenhuma Demanda aceita neste filtro.';
const emptySignals = /Nenhuma necessidade explícita disponível/;

for (const failing of [
  ['demands:list'],
  ['campaign-signals:list'],
  ['demands:list', 'campaign-signals:list'],
]) {
  test(`erro independente de ${failing.join(' + ')} não declara vazio e retry preserva operação`, async ({
    app,
  }) => {
    const page = await app.firstWindow();
    await controlReads(
      app,
      { 'demands:list': { items: [], nextCursor: null }, 'campaign-signals:list': { items: [] } },
      failing,
    );
    await page.getByRole('button', { name: 'Demandas emergentes', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(failing.length);
    await expect(page.getByText(emptyDemands)).toHaveCount(
      failing.includes('demands:list') ? 0 : 1,
    );
    await expect(page.getByText(emptySignals)).toHaveCount(
      failing.includes('campaign-signals:list') ? 0 : 1,
    );
    for (const alert of await page.getByRole('alert').all()) {
      await alert.getByRole('button', { name: 'Copiar diagnóstico' }).click();
      await expect(alert.getByText('Diagnóstico copiado.')).toBeVisible();
    }
    const before = await readState(app);
    expect(before.copies.map((copy) => copy.operation).sort()).toEqual(
      failing
        .map((channel) => (channel === 'demands:list' ? 'demands.list' : 'signals.list'))
        .sort(),
    );
    expect(before.copies).toEqual(
      expect.arrayContaining(
        failing.map((channel) => ({
          version: 1,
          screen: channel === 'demands:list' ? 'demands' : 'signals',
          operation: channel === 'demands:list' ? 'demands.list' : 'signals.list',
          code: 'DATABASE_UNAVAILABLE',
        })),
      ),
    );
    for (let remaining = failing.length; remaining > 0; remaining -= 1) {
      await page
        .getByRole('alert')
        .first()
        .getByRole('button', { name: 'Tentar novamente' })
        .click();
      await expect(page.getByRole('alert')).toHaveCount(remaining - 1);
    }
    await expect(page.getByText(emptyDemands)).toBeVisible();
    await expect(page.getByText(emptySignals)).toBeVisible();
    const after = await readState(app);
    expect(after.mutations).toBe(0);
    for (const channel of ['demands:list', 'campaign-signals:list']) {
      const calls = after.calls[channel];
      expect(calls).toHaveLength(failing.includes(channel) ? 2 : 1);
      if (failing.includes(channel)) expect(calls?.[1]).toEqual(calls?.[0]);
    }
  });
}

test('sucesso vazio inicial mostra os dois vazios sem aviso de erro', async ({ app }) => {
  const page = await app.firstWindow();
  await controlReads(
    app,
    { 'demands:list': { items: [], nextCursor: null }, 'campaign-signals:list': { items: [] } },
    [],
  );
  await page.getByRole('button', { name: 'Demandas emergentes', exact: true }).click();
  await expect(page.getByText(emptyDemands)).toBeVisible();
  await expect(page.getByText(emptySignals)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect((await readState(app)).mutations).toBe(0);
});

for (const read of ['get', 'suggestion'] as const) {
  test(`falha demands.${read} copia diagnóstico real e retry repete só a leitura`, async ({
    app,
  }) => {
    const page = await app.firstWindow();
    const seed = await page.evaluate(async (read) => {
      const g = (globalThis as unknown as { campaignManager: CampaignManagerGateway })
        .campaignManager;
      const campaigns = await g.campaigns.list({});
      if (!campaigns.ok || !campaigns.data.items[0]) throw new Error('campaign');
      const campaignId = campaigns.data.items[0].id;
      const type = await g.entityTypes.create({
        campaignId,
        name: 'Pessoas',
        singularName: 'Pessoa',
      });
      if (!type.ok) throw new Error('type');
      const field = await g.fieldDefinitions.create({
        campaignId,
        entityTypeId: type.data.id,
        label: 'Necessidade',
        dataType: 'long_text',
        semanticRole: 'need',
      });
      if (!field.ok) throw new Error('field');
      const entity = await g.entities.create({
        campaignId,
        entityTypeId: type.data.id,
        name: 'Gorel',
        fieldValues: [{ fieldDefinitionId: field.data.id, value: 'Investigar cabos' }],
      });
      if (!entity.ok) throw new Error('entity');
      const signals = await g.campaignSignals.recalculate({ campaignId });
      const signal =
        signals.ok && signals.data.items.find((item) => item.signal.signalType === 'explicit_need');
      if (!signal) throw new Error('signal');
      const suggestion = await g.demands.suggestion({ campaignId, signalId: signal.signal.id });
      if (!suggestion.ok) throw new Error('suggestion');
      if (read === 'suggestion') return suggestion.data;
      const accepted = await g.demands.accept({
        campaignId,
        signalId: signal.signal.id,
        signalRevision: suggestion.data.signalRevision,
        content: {
          title: suggestion.data.title,
          need: suggestion.data.need,
          summary: '',
          obstacle: '',
          risks: '',
          urgency: 'medium',
          requesterEntityId: entity.data.entity.id,
          links: [],
        },
      });
      if (!accepted.ok) throw new Error('accept');
      return accepted.data;
    }, read);
    await controlReads(app, { [`demands:${read}`]: seed }, [`demands:${read}`]);
    await page.getByRole('button', { name: 'Demandas emergentes', exact: true }).click();
    await page
      .getByRole('button', {
        name: read === 'get' ? 'Necessidade de Gorel — Disponível' : 'Revisar para aceitar',
        exact: true,
      })
      .click();
    const alert = page.getByRole('alert');
    await alert.getByRole('button', { name: 'Copiar diagnóstico' }).click();
    await expect(alert.getByText('Diagnóstico copiado.')).toBeVisible();
    expect((await readState(app)).copies).toEqual([
      {
        version: 1,
        screen: 'demands',
        operation: `demands.${read}`,
        code: 'DATABASE_UNAVAILABLE',
      },
    ]);
    await alert.getByRole('button', { name: 'Tentar novamente' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(
      page.getByRole('heading', {
        name: read === 'get' ? 'Necessidade de Gorel' : 'Revisar sugestão',
        exact: true,
      }),
    ).toBeVisible();
    const state = await readState(app);
    expect(state.mutations).toBe(0);
    const calls = state.calls[`demands:${read}`];
    expect(calls).toHaveLength(2);
    expect(calls?.[1]).toEqual(calls?.[0]);
  });
}
