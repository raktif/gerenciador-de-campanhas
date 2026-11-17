import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import type { CampaignManagerGateway } from '../../src/core/contracts/gateway';
const root = process.cwd();
const executablePath = createRequire(path.join(root, 'package.json'))('electron') as string;
test('3B.3 revisão, links N, filha/pai, resolução confirmada e Need protegido persistem após reinício', async () => {
  const data = await mkdtemp(path.join(os.tmpdir(), 'demands-e2e-'));
  let app: ElectronApplication | null = null;
  const launch = () =>
    electron.launch({
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
    app = await launch();
    let page = await app.firstWindow();
    await page.getByRole('button', { name: 'Criar primeira campanha' }).click();
    await page.getByLabel('Nome da campanha').fill('Demandas de teste');
    await page.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    const ids = await page.evaluate(async () => {
      const g = (globalThis as unknown as { campaignManager: CampaignManagerGateway })
        .campaignManager;
      const campaigns = await g.campaigns.list({});
      if (!campaigns.ok) throw new Error('campaigns');
      const campaign = campaigns.data.items.find((c) => c.name === 'Demandas de teste');
      if (!campaign) throw new Error('campaign');
      const campaignId = campaign.id;
      const t = await g.entityTypes.create({ campaignId, name: 'Pessoas', singularName: 'Pessoa' });
      if (!t.ok) throw new Error('type');
      // The protected Need must remain available when it is beyond the first
      // field-definition page, without preventing unrelated entity edits.
      for (let index = 0; index < 101; index += 1) {
        const extra = await g.fieldDefinitions.create({
          campaignId,
          entityTypeId: t.data.id,
          label: `Campo ${String(index)}`,
          dataType: 'short_text',
        });
        if (!extra.ok) throw new Error('extra field');
      }
      const field = await g.fieldDefinitions.create({
        campaignId,
        entityTypeId: t.data.id,
        label: 'Necessidade',
        dataType: 'long_text',
        semanticRole: 'need',
      });
      if (!field.ok) throw new Error('field');
      const a = await g.entities.create({
        campaignId,
        entityTypeId: t.data.id,
        name: 'Gorel',
        fieldValues: [{ fieldDefinitionId: field.data.id, value: 'Investigar os cabos' }],
      });
      const b = await g.entities.create({ campaignId, entityTypeId: t.data.id, name: 'Skel' });
      if (!a.ok || !b.ok) throw new Error('entity');
      const s = await g.sessions.create({
        campaignId,
        title: 'Sessão da descoberta',
        sequenceNumber: 1,
      });
      if (!s.ok) throw new Error('session');
      const c = await g.clocks.create({
        campaignId,
        idempotencyKey: crypto.randomUUID(),
        name: 'Pressão da mina',
        clockType: 'threat',
        segmentsTotal: 4,
        entityId: a.data.entity.id,
        consequence: 'Interdição possível',
      });
      if (!c.ok) throw new Error('clock');
      await g.campaignSignals.recalculate({ campaignId });
      return {
        campaignId,
        entityId: a.data.entity.id,
        otherEntityId: b.data.entity.id,
        fieldId: field.data.id,
        typeId: t.data.id,
        sessionId: s.data.id,
        clockId: c.data.id,
      };
    });
    await page.getByRole('button', { name: 'Abrir campanha Demandas de teste' }).click();
    await page.getByRole('button', { name: 'Demandas emergentes', exact: true }).click();
    await page.getByRole('button', { name: 'Revisar para aceitar' }).click();
    await expect(page.getByLabel('Necessidade obrigatória')).toHaveValue('Investigar os cabos');
    await expect(page.getByRole('button', { name: 'Aceitar Demanda' })).toBeDisabled();
    await page.getByLabel('Urgência (escolha manual)').selectOption('high');
    await page.getByLabel('Resumo', { exact: true }).fill('Resumo revisado');
    await page.getByLabel('Alvo', { exact: true }).selectOption(ids.otherEntityId);
    await page.getByRole('button', { name: 'Adicionar vínculo' }).click();
    await page.getByLabel('Tipo de vínculo').selectOption('clock');
    await page.getByLabel('Alvo', { exact: true }).selectOption(ids.clockId);
    await page.getByRole('button', { name: 'Adicionar vínculo' }).click();
    await page.getByLabel('Tipo de vínculo').selectOption('session');
    await page.getByLabel('Alvo', { exact: true }).selectOption(ids.sessionId);
    await page.getByRole('button', { name: 'Adicionar vínculo' }).click();
    await page.getByRole('button', { name: 'Aceitar Demanda' }).click();
    await expect(
      page.getByRole('heading', { name: 'Necessidade de Gorel', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Sessão — Sessão da descoberta · Relacionada')).toBeVisible();
    const protectedSource = await page.evaluate(async (ids) => {
      const g = (globalThis as unknown as { campaignManager: CampaignManagerGateway })
        .campaignManager;
      const current = await g.entities.get({ campaignId: ids.campaignId, id: ids.entityId });
      if (!current.ok) throw new Error('get');
      return g.entities.update({
        campaignId: ids.campaignId,
        id: ids.entityId,
        revision: current.data.entity.revision,
        fieldValues: [{ fieldDefinitionId: ids.fieldId, value: 'Não pode mudar' }],
      });
    }, ids);
    expect(protectedSource).toMatchObject({ ok: false, error: { code: 'DEMAND_NEED_LOCKED' } });
    await page.getByRole('button', { name: 'Criar subdemanda', exact: true }).click();
    await expect(page.getByText('Relógio — Pressão da mina · Relacionada')).toBeVisible();
    await expect(page.getByText('Sessão — Sessão da descoberta · Relacionada')).toBeVisible();
    await page.getByLabel('Título obrigatório').fill('Proteger trabalhadores');
    await page.getByLabel('Necessidade obrigatória').fill('Proteger trabalhadores');
    await page.getByLabel('Urgência (escolha manual)').selectOption('medium');
    await page.getByRole('button', { name: 'Criar filha e arquivar pai' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Proteger trabalhadores', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Ver Demanda pai (inclusive arquivada)' }).click();
    await page.getByRole('button', { name: 'Restaurar estado anterior' }).click();
    await expect(page.getByRole('button', { name: 'Resolver e criar Evento' })).toBeDisabled();
    await page.getByRole('button', { name: 'Proteger trabalhadores — Disponível' }).click();
    await page.getByRole('button', { name: 'Ignorar Demanda aceita' }).click();
    await page.getByRole('button', { name: 'Ver Demanda pai (inclusive arquivada)' }).click();
    await page.getByRole('button', { name: 'Resolver e criar Evento' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Editar Demanda', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Resolver e criar Evento' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Editar Demanda', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Ver Evento gerado' }).click();
    await page
      .getByRole('button', { name: 'Promover explicitamente Evento a Aceito / Fato' })
      .click();
    await expect(
      page.getByText('Evento Aceito / Fato. Conteúdo e vínculos congelados.'),
    ).toBeVisible();
    const stored = await page.evaluate(async (campaignId) => {
      const g = (globalThis as unknown as { campaignManager: CampaignManagerGateway })
        .campaignManager;
      const list = await g.demands.list({ campaignId });
      if (!list.ok) throw new Error('demand list');
      const root = list.data.items.find((d) => d.parentId === null);
      if (!root) throw new Error('root');
      const details = await g.demands.get({ campaignId, id: root.id });
      if (!details.ok) throw new Error('details');
      return details.data;
    }, ids.campaignId);
    await app.evaluate(({ ipcMain }, data) => {
      const state = { inputs: [] as unknown[], mutations: 0, release: null as (() => void) | null };
      Object.assign(globalThis, { __demandRetry: state });
      ipcMain.removeHandler('demands:get');
      ipcMain.handle('demands:get', (_event, input: unknown) => {
        state.inputs.push(input);
        if (state.inputs.length === 1)
          return {
            ok: false,
            error: { code: 'DATABASE_UNAVAILABLE', message: 'Falha controlada' },
            requestId: 'failure',
          };
        if (state.inputs.length === 3)
          return new Promise((resolve) => {
            state.release = () => resolve({ ok: true, data, requestId: 'delayed' });
          });
        return { ok: true, data, requestId: 'success' };
      });
      for (const channel of ['demands:accept', 'demands:update', 'demands:transition']) {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, () => {
          state.mutations += 1;
          return {
            ok: false,
            error: { code: 'INTERNAL_ERROR', message: 'No mutation' },
            requestId: 'unexpected',
          };
        });
      }
    }, stored);
    await page.getByRole('button', { name: 'Voltar à lista', exact: true }).click();
    await page
      .getByRole('button', { name: 'Necessidade de Gorel — Resolvida', exact: true })
      .click();
    await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Necessidade de Gorel', exact: true }),
    ).toBeVisible();
    const retries = await app.evaluate(() => {
      const s = (
        globalThis as unknown as { __demandRetry: { inputs: unknown[]; mutations: number } }
      ).__demandRetry;
      return { inputs: s.inputs, mutations: s.mutations };
    });
    expect(retries.inputs).toEqual([
      { campaignId: ids.campaignId, id: stored.demand.id },
      { campaignId: ids.campaignId, id: stored.demand.id },
    ]);
    expect(retries.mutations).toBe(0);
    await page.getByRole('button', { name: 'Recarregar detalhe (descartar edição)' }).click();
    await page.getByRole('button', { name: 'Notas', exact: true }).click();
    await app.evaluate(() => {
      const s = (globalThis as unknown as { __demandRetry: { release: (() => void) | null } })
        .__demandRetry;
      s.release?.();
    });
    await expect(page.getByRole('heading', { name: 'Notas', exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Necessidade de Gorel', exact: true }),
    ).toHaveCount(0);
    const verified = await page.evaluate(async (campaignId) => {
      const g = (globalThis as unknown as { campaignManager: CampaignManagerGateway })
        .campaignManager;
      const events = await g.events.list({ campaignId });
      if (!events.ok) throw new Error('events');
      const first = events.data.items[0];
      if (!first) throw new Error('first event');
      const event = await g.events.get({ campaignId, id: first.id });
      if (!event.ok) throw new Error('event');
      return {
        count: events.data.items.length,
        links: event.data.links.length,
        canon: event.data.event.canonState,
      };
    }, ids.campaignId);
    expect(verified).toEqual({ count: 1, links: 2, canon: 'accepted' });
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.getByRole('button', { name: 'Abrir campanha Demandas de teste' }).click();
    await page.getByRole('button', { name: 'Demandas emergentes', exact: true }).click();
    await page
      .getByRole('button', { name: 'Necessidade de Gorel — Resolvida', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Por que estou vendo isto? — proveniência preservada' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Ver Evento gerado' }).click();
    await expect(
      page.getByText('Evento Aceito / Fato. Conteúdo e vínculos congelados.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Ver entidades', exact: true }).click();
    await page
      .getByRole('button', { name: 'Abrir detalhes de Gorel', exact: true })
      .first()
      .click();
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    await expect(page.getByLabel('Necessidade', { exact: true })).toBeDisabled();
    await expect(page.getByText(/Campo usado por Demanda: a necessidade original/)).toBeVisible();
    await page.getByLabel('Nome *', { exact: true }).fill('Gorel atualizado');
    await page.getByRole('button', { name: 'Salvar entidade', exact: true }).click();
    await expect(
      page.getByText('Entidade “Gorel atualizado” atualizada.', { exact: true }),
    ).toBeVisible();
    expect(await page.locator('body').innerText()).not.toMatch(
      /[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/u,
    );
  } finally {
    if (app) await app.close();
    await rm(data, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
});
