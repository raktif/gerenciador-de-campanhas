import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

const repositoryRoot = process.cwd();
const executablePath = createRequire(path.join(repositoryRoot, 'package.json'))(
  'electron',
) as string;

async function setup(): Promise<{
  app: ElectronApplication;
  page: Page;
  root: string;
  campaignId: string;
  factId: string;
  disprovedId: string;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rpg-contradiction-review-'));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath,
    args: [repositoryRoot],
    env: { ...env, APP_DATA_DIR: root, NODE_ENV: 'test' },
  });
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Criar primeira campanha' }).waitFor();
  const records = await page.evaluate(async () => {
    const gateway = window.campaignManager;
    const campaign = await gateway.campaigns.create({ name: 'Revisão contextual' });
    if (!campaign.ok) throw new Error(campaign.error.message);
    const campaignId = campaign.data.id;
    const type = await gateway.entityTypes.create({
      campaignId,
      name: 'Personagens',
      singularName: 'Personagem',
    });
    if (!type.ok) throw new Error(type.error.message);
    const entity = await gateway.entities.create({
      campaignId,
      entityTypeId: type.data.id,
      name: 'Gorel',
    });
    if (!entity.ok) throw new Error(entity.error.message);
    const subjectEntityId = entity.data.entity.id;
    const fact = await gateway.assertions.create({
      campaignId,
      subjectEntityId,
      statement: 'A torre está aberta.',
      canonState: 'accepted',
      knowledgeState: 'fact',
    });
    const disproved = await gateway.assertions.create({
      campaignId,
      subjectEntityId,
      statement: 'A torre está aberta.',
      canonState: 'accepted',
      knowledgeState: 'disproved',
    });
    if (!fact.ok || !disproved.ok) throw new Error('Não foi possível criar o par.');
    const signals = await gateway.campaignSignals.recalculate({ campaignId });
    if (!signals.ok) throw new Error(signals.error.message);
    const otherCampaign = await gateway.campaigns.create({ name: 'Campanha sem par' });
    if (!otherCampaign.ok) throw new Error(otherCampaign.error.message);
    return { campaignId, factId: fact.data.id, disprovedId: disproved.data.id };
  });
  await page.reload();
  await page.getByRole('button', { name: 'Abrir campanha Revisão contextual' }).click();
  await page.getByRole('button', { name: 'Sinais da campanha', exact: true }).click();
  return { app, page, root, ...records };
}

test('proveniência contextual exibe manual sem fonte e sessão/captura reais sem UUID', async () => {
  const { app, page, root, campaignId, factId } = await setup();
  try {
    await page.getByRole('button', { name: 'Revisar', exact: true }).click();
    const cards = page.locator('article');
    await expect(cards).toHaveCount(2);
    for (const card of await cards.all()) {
      await expect(card.locator('dl')).toContainText('Origem');
      await expect(card.locator('dl')).toContainText('Manual');
      await expect(card.locator('dl')).toContainText('Sem fonte vinculada');
      await expect(card.locator('dl')).toContainText('Não se aplica');
    }
    await page.getByRole('button', { name: 'Voltar para sinais' }).click();
    await page.evaluate(
      async ({ campaignId, factId }) => {
        const gateway = window.campaignManager;
        const fact = await gateway.assertions.get({ campaignId, id: factId });
        if (!fact.ok) throw new Error('Afirmação ausente.');
        const session = await gateway.sessions.create({
          campaignId,
          sequenceNumber: 1,
          title: 'Sessão do portão',
        });
        if (!session.ok) throw new Error(session.error.message);
        const fromSession = await gateway.assertions.create({
          campaignId,
          subjectEntityId: fact.data.subjectEntityId,
          statement: 'O portão está selado.',
          canonState: 'accepted',
          knowledgeState: 'fact',
          originKind: 'session',
          sessionId: session.data.id,
        });
        if (!fromSession.ok) throw new Error(fromSession.error.message);
        const captured = await gateway.inbox.capture({
          campaignId,
          sessionId: session.data.id,
          rawText: 'Notas originais da captura do portão',
        });
        if (!captured.ok) throw new Error(captured.error.message);
        const reviewing = await gateway.inbox.beginReview({
          campaignId,
          id: captured.data.id,
          revision: captured.data.revision,
        });
        if (!reviewing.ok) throw new Error(reviewing.error.message);
        const converted = await gateway.inbox.convertToAssertion({
          campaignId,
          id: reviewing.data.id,
          revision: reviewing.data.revision,
          destination: {
            subjectEntityId: fact.data.subjectEntityId,
            objectEntityId: null,
            predicate: null,
            value: null,
            statement: 'O portão está selado.',
            canonState: 'accepted',
            knowledgeState: 'disproved',
            visibility: 'gm',
          },
        });
        if (!converted.ok) throw new Error(converted.error.message);
      },
      { campaignId, factId },
    );
    await page.getByRole('button', { name: 'Recalcular sinais', exact: true }).click();
    const signal = page.locator('article').filter({ hasText: 'O portão está selado.' });
    await signal.getByRole('button', { name: 'Revisar', exact: true }).click();
    await expect(page.locator('article')).toHaveCount(2);
    const capturedCard = page
      .locator('article')
      .filter({ hasText: 'Afirmação marcada como refutada' });
    await expect(capturedCard.locator('dl')).toContainText('Notas originais da captura do portão');
    await expect(capturedCard.locator('dl')).toContainText('Sessão do portão');
    await expect(capturedCard.locator('dl')).toContainText('Origem');
    const sessionCard = page.locator('article').filter({ hasText: 'Afirmação marcada como fato' });
    await expect(sessionCard.locator('dl')).toContainText('Sessão do portão');
    await expect(sessionCard.locator('dl')).toContainText(
      'Sessão — descrição da fonte indisponível',
    );
    await expect(sessionCard.locator('dl')).not.toContainText('Sem fonte vinculada');
    await expect(page.locator('main')).not.toContainText(/[0-9a-f]{8}-[0-9a-f-]{27}/i);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

for (const choice of ['fato', 'refutada'] as const) {
  test(`Revisar mostra par real; Corrigir ${choice} abre edição correta e preserva histórico`, async () => {
    const session = await setup();
    const { app, page, root, campaignId, factId, disprovedId } = session;
    try {
      await page.getByRole('button', { name: 'Revisar', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Revisar possível contradição' }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Afirmação marcada como fato', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Afirmação marcada como refutada', exact: true }),
      ).toBeVisible();
      await expect(page.locator('article')).toHaveCount(2);
      await expect(page.locator('article').first()).toContainText('A torre está aberta.');
      await expect(page.locator('main')).not.toContainText(/[0-9a-f]{8}-[0-9a-f-]{27}/i);
      await page.getByRole('button', { name: 'Voltar para sinais' }).click();
      await page.getByRole('button', { name: 'Corrigir', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Escolher afirmação para corrigir' }),
      ).toBeVisible();
      const choose = page.getByRole('button', {
        name: `Corrigir afirmação marcada como ${choice}`,
        exact: true,
      });
      await choose.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: 'Editar afirmação' })).toBeVisible();
      await expect(page.getByLabel('Afirmação textual *')).toHaveValue('A torre está aberta.');
      // Sair pelo menu e abrir Revisar novamente não reutiliza uma escolha anterior.
      await page.getByRole('button', { name: 'Sinais da campanha', exact: true }).click();
      await page.getByRole('button', { name: 'Revisar', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Revisar possível contradição' }),
      ).toBeVisible();
      await expect(page.locator('article')).toHaveCount(2);
      await page.getByRole('button', { name: 'Voltar para sinais' }).click();
      await page.getByRole('button', { name: 'Corrigir', exact: true }).click();
      await page
        .getByRole('button', { name: `Corrigir afirmação marcada como ${choice}`, exact: true })
        .click();
      await expect(page.getByRole('heading', { name: 'Editar afirmação' })).toBeVisible();
      await page.getByRole('button', { name: 'Voltar ao par de afirmações' }).click();
      await expect(
        page.getByRole('heading', { name: 'Afirmação marcada como fato', exact: true }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: `Corrigir afirmação marcada como ${choice}`, exact: true })
        .click();
      await expect(page.getByRole('heading', { name: 'Editar afirmação' })).toBeVisible();
      // Teclado volta ao mesmo par; avançar restaura o alvo escolhido.
      await page.keyboard.press('Alt+ArrowLeft');
      await expect(
        page.getByRole('heading', { name: 'Escolher afirmação para corrigir' }),
      ).toBeVisible();
      await page.keyboard.press('Alt+ArrowRight');
      await expect(page.getByRole('heading', { name: 'Editar afirmação' })).toBeVisible();
      await page.getByLabel('Afirmação textual *').fill(`Texto corrigido pela pessoa (${choice}).`);
      await page.getByRole('button', { name: 'Salvar afirmação' }).click();
      const assertions = await page.evaluate(
        async ({ campaignId, factId, disprovedId }) => {
          return Promise.all(
            [factId, disprovedId].map((id) =>
              window.campaignManager.assertions.get({ campaignId, id }),
            ),
          );
        },
        { campaignId, factId, disprovedId },
      );
      for (let index = 0; index < assertions.length; index += 1) {
        const result = assertions[index];
        if (!result?.ok) throw new Error('Afirmação ausente.');
        const chosen = choice === 'fato' ? index === 0 : index === 1;
        expect(result.data.statement).toBe(
          chosen ? `Texto corrigido pela pessoa (${choice}).` : 'A torre está aberta.',
        );
        expect(result.data.canonState).toBe('accepted');
        expect(result.data.knowledgeState).toBe(index === 0 ? 'fact' : 'disproved');
        expect(result.data.revision).toBe(chosen ? 2 : 1);
      }
      await expect(
        page.getByText('Não foi possível abrir o par atual.', { exact: false }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Voltar para sinais' }).click();
      await page.getByRole('button', { name: 'Registro de Cânone', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Registro de Cânone', exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId('assertion-list')).toContainText(
        `Texto corrigido pela pessoa (${choice}).`,
      );
    } finally {
      await app.close();
      await rm(root, { recursive: true, force: true });
    }
  });
}

test('falha da consulta contextual tem feedback e saída para sinais, sem inventar par', async () => {
  const { app, page, root } = await setup();
  try {
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('campaign-signals:get-contradiction-review');
    });
    await page.getByRole('button', { name: 'Revisar', exact: true }).click();
    await expect(
      page.getByText('Não foi possível abrir o par atual.', { exact: false }),
    ).toBeVisible();
    await expect(page.locator('article')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Corrigir afirmação marcada como fato' }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Voltar para sinais' }).click();
    await expect(
      page.getByRole('heading', { name: 'Sinais da campanha', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Campanhas', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir campanha Campanha sem par' }).click();
    await page.getByRole('button', { name: 'Sinais da campanha', exact: true }).click();
    await expect(page.getByText('Nenhum sinal registrado')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Afirmação marcada como fato', exact: true }),
    ).toHaveCount(0);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
test('alvo arquivado durante a escolha gera feedback e não abre editor nem altera cânone', async () => {
  const { app, page, root, campaignId, factId } = await setup();
  try {
    await page.getByRole('button', { name: 'Corrigir', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Afirmação marcada como fato', exact: true }),
    ).toBeVisible();
    await page.evaluate(
      async ({ campaignId, factId }) => {
        const assertion = await window.campaignManager.assertions.get({ campaignId, id: factId });
        if (!assertion.ok) throw new Error('Afirmação ausente.');
        const result = await window.campaignManager.assertions.archive({
          campaignId,
          id: factId,
          revision: assertion.data.revision,
        });
        if (!result.ok) throw new Error(result.error.message);
      },
      { campaignId, factId },
    );
    await page
      .getByRole('button', { name: 'Corrigir afirmação marcada como fato', exact: true })
      .click();
    await expect(
      page.getByText('Não foi possível abrir o par atual.', { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Editar afirmação' })).toHaveCount(0);
    await expect(page.locator('article')).toHaveCount(0);
    await page.getByRole('button', { name: 'Voltar para sinais' }).click();
    await expect(
      page.getByRole('heading', { name: 'Sinais da campanha', exact: true }),
    ).toBeVisible();
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
