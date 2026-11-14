import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

const repositoryRoot = process.cwd();
const electronExecutable = createRequire(path.join(repositoryRoot, 'package.json'))(
  'electron',
) as string;
const campaignName = 'Registro de Cânone E2E';
const timestamp = '2026-11-14T12:00:00.000Z';

test('distingue falha de listagem de lista vazia e permite tentar novamente', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-canon-registry-retry-e2e-'));
  let application: ElectronApplication | null = null;
  try {
    application = await launch(dataDirectory, {
      E2E_ASSERTION_REGISTRY_LIST_FAIL_ONCE: '1',
    });
    const window = await application.firstWindow();
    await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
    await window.getByLabel('Nome da campanha').fill(campaignName);
    await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    await window.getByRole('button', { name: `Abrir campanha ${campaignName}` }).click();
    await window.getByRole('button', { name: 'Registro de Cânone' }).click();

    const error = window.getByRole('alert').filter({
      hasText: 'Não foi possível acessar os dados da campanha',
    });
    await expect(error).toBeVisible();
    await expect(window.getByText('Nenhuma afirmação encontrada')).toHaveCount(0);
    await error.getByRole('button', { name: 'Tentar novamente' }).click();
    await expect(window.getByText('Nenhuma afirmação encontrada')).toBeVisible();
    await expect(error).toHaveCount(0);
  } finally {
    await application?.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test('filtra afirmações, mostra proveniência e só promove após confirmar', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-canon-registry-e2e-'));
  let application: ElectronApplication | null = null;
  let trace: CanonRegistryTrace | null = null;
  try {
    application = await launch(dataDirectory);
    let window = await application.firstWindow();
    await window.getByRole('button', { name: 'Criar primeira campanha' }).click();
    await window.getByLabel('Nome da campanha').fill(campaignName);
    await window.getByRole('button', { name: 'Criar campanha', exact: true }).click();
    await window.getByRole('button', { name: `Abrir campanha ${campaignName}` }).click();
    await window.getByRole('button', { name: 'Gerenciar tipos de entidade' }).click();
    await window.getByRole('button', { name: 'Criar primeiro tipo' }).click();
    await window.getByLabel('Nome plural').fill('Personagens');
    await window.getByLabel('Nome singular').fill('Personagem');
    await window.getByRole('button', { name: 'Criar tipo de entidade' }).click();
    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
    await window.getByRole('button', { name: 'Ver entidades' }).click();
    await window.getByRole('button', { name: 'Nova entidade', exact: true }).click();
    await window.getByLabel('Nome *').fill('A Sentinela');
    await window.getByRole('button', { name: 'Criar entidade' }).click();
    await window.getByRole('button', { name: 'Nova entidade', exact: true }).click();
    await window.getByLabel('Nome *').fill('Sentinela arquivada');
    await window.getByRole('button', { name: 'Criar entidade' }).click();
    await window.getByRole('button', { name: 'Voltar para detalhes da campanha' }).click();
    await application.close();
    application = null;

    const records = seedPossibilities(dataDirectory);
    application = await launch(dataDirectory, {
      E2E_ASSERTION_REGISTRY_FACT_LIST_DELAY_MS: '700',
      E2E_ASSERTION_REGISTRY_PAGE_LIST_DELAY_MS: '2600',
      E2E_ASSERTION_PROMOTION_DELAY_MS: '350',
      E2E_ASSERTION_REGISTRY_TRACE: '1',
    });
    trace = attachCanonRegistryTrace(application);
    window = await application.firstWindow();
    await window.getByRole('button', { name: `Abrir campanha ${campaignName}` }).click();
    await window.getByRole('button', { name: 'Registro de Cânone' }).click();
    await expect(
      window.getByRole('heading', { name: 'Registro de Cânone', exact: true }),
    ).toBeVisible();
    await window.getByLabel('Categoria').selectOption('possibility');
    const registry = window.getByTestId('assertion-list');
    await expect(registry).toContainText('A passagem pode estar aberta.');
    await expect(registry).toContainText('A Sentinela');
    await expect(registry).toContainText('Sentinela arquivada (arquivada)');
    await expect(registry).toContainText('A ponte pode estar guardada.');
    await expect(registry).not.toContainText(/[0-9a-f]{8}-[0-9a-f-]{27}/i);
    const archivedPossibility = registry
      .locator('article')
      .filter({ hasText: 'A prisão pode estar esquecida.' });
    await expect(archivedPossibility).toContainText('Sentinela arquivada (arquivada)');
    await archivedPossibility
      .getByRole('button', { name: 'Promover possibilidade a fato' })
      .click();
    const archivedConfirmation = window.getByRole('alert').filter({
      hasText: 'Promover esta possibilidade a fato?',
    });
    await expect(archivedConfirmation).toContainText('Sentinela arquivada (arquivada)');
    await archivedConfirmation.getByRole('button', { name: 'Confirmar promoção a fato' }).click();
    await expect(
      window.getByRole('alert').filter({ hasText: 'A possibilidade não pode ser promovida' }),
    ).toContainText('Restaure a entidade vinculada');
    await trace.waitFor(({ event }) => event === 'promotion-start');
    expect(readAssertion(dataDirectory, records.archivedAssertionId).knowledgeState).toBe(
      'possibility',
    );

    const firstPossibility = registry
      .locator('article')
      .filter({ hasText: 'A passagem pode estar aberta.' });
    await expect(
      firstPossibility
        .locator('dt')
        .filter({ hasText: /^Fonte$/ })
        .locator('..')
        .locator('dd'),
    ).toContainText('Relato registrado');
    await expect(
      firstPossibility
        .locator('dt')
        .filter({ hasText: /^Sessão$/ })
        .locator('..')
        .locator('dd'),
    ).toContainText('Sessão de observação');

    const promotionConfirmation = window.getByRole('alert').filter({
      hasText: 'Promover esta possibilidade a fato?',
    });
    await firstPossibility.getByRole('button', { name: 'Promover possibilidade a fato' }).click();
    await firstPossibility.getByRole('button', { name: 'Editar afirmação' }).click();
    await expect(window.getByRole('button', { name: 'Salvar afirmação' })).toBeVisible();
    await window.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(promotionConfirmation).toHaveCount(0);

    await firstPossibility.getByRole('button', { name: 'Promover possibilidade a fato' }).click();
    await window.getByRole('button', { name: 'Nova afirmação' }).click();
    await expect(window.getByRole('button', { name: 'Criar afirmação' })).toBeVisible();
    await window.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(promotionConfirmation).toHaveCount(0);

    await firstPossibility.getByRole('button', { name: 'Promover possibilidade a fato' }).click();
    await window.getByLabel('Categoria').selectOption('rumor');
    await expect(promotionConfirmation).toHaveCount(0);
    expect(readAssertion(dataDirectory, records.firstAssertionId).knowledgeState).toBe(
      'possibility',
    );
    await window.getByLabel('Categoria').selectOption('possibility');
    await expect(firstPossibility).toBeVisible();
    await expect(archivedPossibility).toBeVisible();

    const promotionCallsBeforeBack = trace
      .snapshot()
      .filter(({ event }) => event === 'promotion-start').length;
    const possibilityListsBeforeBack = trace
      .snapshot()
      .filter(
        ({ event, category, hasCursor }) =>
          event === 'list-complete' && category === 'possibility' && hasCursor === false,
      ).length;
    const allListsBeforeBack = trace
      .snapshot()
      .filter(
        ({ event, category, hasCursor }) =>
          event === 'list-complete' && category === null && hasCursor === false,
      ).length;
    await firstPossibility.getByRole('button', { name: 'Promover possibilidade a fato' }).click();
    await expect(promotionConfirmation).toContainText('A passagem pode estar aberta.');
    await window.getByRole('button', { name: /Voltar para detalhes da campanha/ }).click();
    await expect(
      window.getByRole('heading', { name: 'Registro de Cânone', exact: true }),
    ).toHaveCount(0);
    await window.getByRole('button', { name: 'Registro de Cânone' }).click();
    await expect(
      window.getByRole('heading', { name: 'Registro de Cânone', exact: true }),
    ).toBeVisible();
    await trace.waitFor(
      ({ event, category, hasCursor }) =>
        event === 'list-complete' && category === null && hasCursor === false,
      allListsBeforeBack,
    );
    await window.getByLabel('Categoria').selectOption('possibility');
    await trace.waitFor(
      ({ event, category, hasCursor }) =>
        event === 'list-complete' && category === 'possibility' && hasCursor === false,
      possibilityListsBeforeBack,
    );
    await expect(firstPossibility).toBeVisible();
    await expect(promotionConfirmation).toHaveCount(0);
    expect(trace.snapshot().filter(({ event }) => event === 'promotion-start')).toHaveLength(
      promotionCallsBeforeBack,
    );
    expect(readAssertion(dataDirectory, records.firstAssertionId).knowledgeState).toBe(
      'possibility',
    );

    // Let the old page response finish after the active category and promotion refresh responses.
    await window.getByRole('button', { name: 'Carregar mais afirmações' }).click();
    const possibilityPageStart = await trace.waitFor(
      ({ event, category, hasCursor }) =>
        event === 'list-start' && category === 'possibility' && hasCursor === true,
    );
    await firstPossibility.getByRole('button', { name: 'Promover possibilidade a fato' }).click();
    await expect(promotionConfirmation).toContainText('A passagem pode estar aberta.');
    await expect(promotionConfirmation).toContainText('A Sentinela');
    await expect(
      registry
        .locator('article')
        .filter({ hasText: 'A ponte pode estar guardada.' })
        .getByRole('button', { name: 'Promover possibilidade a fato' }),
    ).toBeDisabled();
    const promotionStartsBeforeRace = trace
      .snapshot()
      .filter(({ event }) => event === 'promotion-start').length;
    await promotionConfirmation.getByRole('button', { name: 'Confirmar promoção a fato' }).click();
    const promotionStarted = await trace.waitFor(
      ({ event }) => event === 'promotion-start',
      promotionStartsBeforeRace,
    );
    await window.getByLabel('Categoria').selectOption('fact');
    const firstFactListStart = await trace.waitFor(
      ({ event, category, hasCursor }) =>
        event === 'list-start' && category === 'fact' && !hasCursor,
    );
    const promotionCompleted = await trace.waitFor(({ event }) => event === 'promotion-complete');
    const secondFactListStart = await trace.waitFor(
      ({ event, category, hasCursor }) =>
        event === 'list-start' && category === 'fact' && !hasCursor,
      1,
    );
    const firstFactListComplete = await trace.waitFor(
      ({ event, category, hasCursor }) =>
        event === 'list-complete' && category === 'fact' && !hasCursor,
    );
    const secondFactListComplete = await trace.waitFor(
      ({ event, category, hasCursor }) =>
        event === 'list-complete' && category === 'fact' && !hasCursor,
      1,
    );
    const possibilityPageComplete = await trace.waitFor(
      ({ event, category, hasCursor }) =>
        event === 'list-complete' && category === 'possibility' && hasCursor === true,
    );
    expect(possibilityPageStart.sequence).toBeLessThan(promotionStarted.sequence);
    expect(promotionStarted.sequence).toBeLessThan(firstFactListStart.sequence);
    expect(firstFactListStart.sequence).toBeLessThan(promotionCompleted.sequence);
    expect(promotionCompleted.sequence).toBeLessThan(secondFactListStart.sequence);
    expect(firstFactListComplete.sequence).toBeLessThan(possibilityPageComplete.sequence);
    expect(secondFactListComplete.sequence).toBeLessThan(possibilityPageComplete.sequence);
    await expect(window.getByLabel('Categoria')).toHaveValue('fact');
    await expect(registry.locator('article')).toHaveCount(1);
    await expect(registry).toContainText('A passagem pode estar aberta.');
    await expect(registry).not.toContainText('A ponte pode estar guardada.');
    await expect(registry).not.toContainText('Registro adicional');
    await expect(registry).not.toContainText('A prisão pode estar esquecida.');
    await expect(window.getByRole('button', { name: 'Carregar mais afirmações' })).toHaveCount(0);
    await expect(window.getByText('Carregando…')).toHaveCount(0);
    await expect(promotionConfirmation).toHaveCount(0);
    expect(readAssertion(dataDirectory, records.firstAssertionId)).toMatchObject({
      knowledgeState: 'fact',
      revision: 2,
    });

    await window.getByLabel('Categoria').selectOption('possibility');
    const stalePossibility = registry
      .locator('article')
      .filter({ hasText: 'A ponte pode estar guardada.' });
    await expect(stalePossibility).toBeVisible();
    await stalePossibility.getByRole('button', { name: 'Promover possibilidade a fato' }).click();
    const staleConfirmation = window.getByRole('alert').filter({
      hasText: 'Promover esta possibilidade a fato?',
    });
    await expect(staleConfirmation).toContainText('A ponte pode estar guardada.');
    bumpAssertionRevision(dataDirectory, records.secondAssertionId);
    await staleConfirmation.getByRole('button', { name: 'Confirmar promoção a fato' }).click();
    await expect(staleConfirmation).toHaveCount(0);
    await expect(
      window.getByRole('alert').filter({ hasText: 'Este registro foi alterado em outra operação' }),
    ).toBeVisible();
    expect(readAssertion(dataDirectory, records.secondAssertionId).knowledgeState).toBe(
      'possibility',
    );
    await stalePossibility.getByRole('button', { name: 'Promover possibilidade a fato' }).click();
    await window
      .getByRole('alert')
      .filter({ hasText: 'Promover esta possibilidade a fato?' })
      .getByRole('button', { name: 'Confirmar promoção a fato' })
      .click();
    await expect
      .poll(() => readAssertion(dataDirectory, records.secondAssertionId))
      .toMatchObject({
        knowledgeState: 'fact',
        revision: 3,
      });

    await window.getByLabel('Categoria').selectOption('fact');
    await expect(registry).toContainText('A passagem pode estar aberta.');
    await expect(registry).toContainText('A ponte pode estar guardada.');
    expect(readAssertion(dataDirectory, records.firstAssertionId)).toMatchObject({
      knowledgeState: 'fact',
      canonState: 'accepted',
      visibility: 'players',
      originKind: 'session',
      sourceId: records.firstSessionId,
      revision: 2,
    });
    expect(readSourceDescription(dataDirectory, records.firstSessionId)).toBe('Relato registrado');
  } finally {
    trace?.dispose();
    await application?.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

function seedPossibilities(dataDirectory: string): {
  archivedAssertionId: string;
  firstAssertionId: string;
  firstSessionId: string;
  secondAssertionId: string;
} {
  const database = new Database(path.join(dataDirectory, 'database', 'app.db'));
  try {
    const campaign = database
      .prepare('SELECT id FROM campaigns WHERE name = ?')
      .get(campaignName) as { id: string } | undefined;
    const entity = database
      .prepare('SELECT id FROM entities WHERE name = ? AND campaign_id = ?')
      .get('A Sentinela', campaign?.id) as { id: string } | undefined;
    const archivedEntity = database
      .prepare('SELECT id FROM entities WHERE name = ? AND campaign_id = ?')
      .get('Sentinela arquivada', campaign?.id) as { id: string } | undefined;
    if (campaign === undefined || entity === undefined || archivedEntity === undefined)
      throw new Error('A campanha e as entidades E2E deveriam existir.');

    const firstSessionId = randomUUID();
    const secondSessionId = randomUUID();
    const firstAssertionId = randomUUID();
    const secondAssertionId = randomUUID();
    const archivedAssertionId = randomUUID();
    const additionalAssertionIds = Array.from({ length: 51 }, () => randomUUID());
    database.transaction(() => {
      database
        .prepare(
          "INSERT INTO sessions (id, campaign_id, sequence_number, title, status, created_at, updated_at, revision) VALUES (?, ?, 1, 'Sessão de observação', 'completed', ?, ?, 1), (?, ?, 2, 'Sessão do arquivo', 'completed', ?, ?, 1)",
        )
        .run(
          firstSessionId,
          campaign.id,
          timestamp,
          timestamp,
          secondSessionId,
          campaign.id,
          timestamp,
          timestamp,
        );
      database
        .prepare(
          "INSERT INTO sources (id, kind, session_id, description, created_at) VALUES (?, 'session', ?, 'Relato registrado', ?)",
        )
        .run(firstSessionId, firstSessionId, timestamp);
      database
        .prepare(
          "INSERT INTO sources (id, kind, session_id, description, created_at) VALUES (?, 'session', ?, 'Nota do arquivo', ?)",
        )
        .run(secondSessionId, secondSessionId, timestamp);
      database
        .prepare(
          "INSERT INTO assertions (id, campaign_id, subject_entity_id, statement, canon_state, knowledge_state, visibility, origin_kind, source_id, created_at, updated_at, revision) VALUES (?, ?, ?, 'A passagem pode estar aberta.', 'accepted', 'possibility', 'players', 'session', ?, ?, ?, 1), (?, ?, ?, 'A ponte pode estar guardada.', 'accepted', 'possibility', 'gm', 'session', ?, ?, ?, 1)",
        )
        .run(
          firstAssertionId,
          campaign.id,
          entity.id,
          firstSessionId,
          timestamp,
          timestamp,
          secondAssertionId,
          campaign.id,
          entity.id,
          secondSessionId,
          timestamp,
          timestamp,
        );
      database
        .prepare(
          "INSERT INTO assertions (id, campaign_id, subject_entity_id, statement, canon_state, knowledge_state, visibility, origin_kind, source_id, created_at, updated_at, revision) VALUES (?, ?, ?, 'A prisão pode estar esquecida.', 'accepted', 'possibility', 'gm', 'manual', NULL, ?, ?, 1)",
        )
        .run(
          archivedAssertionId,
          campaign.id,
          archivedEntity.id,
          '2026-11-14T11:59:58.000Z',
          '2026-11-14T11:59:58.000Z',
        );
      const insertAdditional = database.prepare(
        "INSERT INTO assertions (id, campaign_id, subject_entity_id, statement, canon_state, knowledge_state, visibility, origin_kind, source_id, created_at, updated_at, revision) VALUES (?, ?, ?, ?, 'accepted', 'possibility', 'gm', 'manual', NULL, ?, ?, 1)",
      );
      for (const [index, id] of additionalAssertionIds.entries()) {
        const time = '2026-11-14T10:00:00.000Z';
        insertAdditional.run(
          id,
          campaign.id,
          entity.id,
          `Registro adicional ${String(index + 1).padStart(2, '0')}.`,
          time,
          time,
        );
      }
      database
        .prepare('UPDATE entities SET archived_at = ?, revision = revision + 1 WHERE id = ?')
        .run(timestamp, archivedEntity.id);
    })();
    return { archivedAssertionId, firstAssertionId, firstSessionId, secondAssertionId };
  } finally {
    database.close();
  }
}

function bumpAssertionRevision(dataDirectory: string, assertionId: string): void {
  const database = new Database(path.join(dataDirectory, 'database', 'app.db'));
  try {
    database
      .prepare('UPDATE assertions SET revision = revision + 1, updated_at = ? WHERE id = ?')
      .run('2026-11-14T12:05:00.000Z', assertionId);
  } finally {
    database.close();
  }
}

function readAssertion(
  dataDirectory: string,
  assertionId: string,
): {
  knowledgeState: string;
  canonState: string;
  visibility: string;
  originKind: string;
  sourceId: string;
  revision: number;
} {
  const database = new Database(path.join(dataDirectory, 'database', 'app.db'), {
    readonly: true,
  });
  try {
    return database
      .prepare(
        'SELECT knowledge_state AS knowledgeState, canon_state AS canonState, visibility, origin_kind AS originKind, source_id AS sourceId, revision FROM assertions WHERE id = ?',
      )
      .get(assertionId) as {
      knowledgeState: string;
      canonState: string;
      visibility: string;
      originKind: string;
      sourceId: string;
      revision: number;
    };
  } finally {
    database.close();
  }
}

function readSourceDescription(dataDirectory: string, sourceId: string): string | null {
  const database = new Database(path.join(dataDirectory, 'database', 'app.db'), {
    readonly: true,
  });
  try {
    return (
      (
        database.prepare('SELECT description FROM sources WHERE id = ?').get(sourceId) as
          { description: string | null } | undefined
      )?.description ?? null
    );
  } finally {
    database.close();
  }
}

async function launch(
  dataDirectory: string,
  environment: Record<string, string> = {},
): Promise<ElectronApplication> {
  const inheritedEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  delete inheritedEnvironment.ELECTRON_RUN_AS_NODE;
  return electron.launch({
    executablePath: electronExecutable,
    args: [repositoryRoot],
    env: {
      ...inheritedEnvironment,
      ...environment,
      APP_DATA_DIR: dataDirectory,
      NODE_ENV: 'test',
    },
  });
}

interface CanonRegistryTraceEvent {
  event: string;
  sequence: number;
  category?: string | null;
  hasCursor?: boolean;
}

interface CanonRegistryTrace {
  snapshot(): CanonRegistryTraceEvent[];
  waitFor(
    predicate: (event: CanonRegistryTraceEvent) => boolean,
    occurrence?: number,
  ): Promise<CanonRegistryTraceEvent>;
  dispose(): void;
}

function attachCanonRegistryTrace(application: ElectronApplication): CanonRegistryTrace {
  const output = application.process().stdout;
  if (output === null) throw new Error('O processo Electron E2E não expõe stdout.');
  const prefix = '__CANON_REGISTRY_TEST__';
  const events: CanonRegistryTraceEvent[] = [];
  const waiters: {
    predicate: (event: CanonRegistryTraceEvent) => boolean;
    occurrence: number;
    resolve: (event: CanonRegistryTraceEvent) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }[] = [];
  let pendingText = '';

  const onData = (chunk: Buffer | string): void => {
    pendingText += chunk.toString();
    const lines = pendingText.split(/\r?\n/);
    pendingText = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith(prefix)) continue;
      const event = JSON.parse(line.slice(prefix.length)) as CanonRegistryTraceEvent;
      events.push(event);
      for (const waiter of [...waiters]) {
        const matches = events.filter(waiter.predicate);
        const matchingEvent = matches[waiter.occurrence];
        if (matchingEvent === undefined) continue;
        clearTimeout(waiter.timer);
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(matchingEvent);
      }
    }
  };
  output.on('data', onData);

  return {
    snapshot: () => [...events],
    waitFor: (predicate, occurrence = 0) => {
      const matches = events.filter(predicate);
      const match = matches[occurrence];
      if (match !== undefined) return Promise.resolve(match);
      return new Promise<CanonRegistryTraceEvent>((resolve, reject) => {
        const waiter = {
          predicate,
          occurrence,
          resolve,
          reject,
          timer: setTimeout(() => {
            waiters.splice(waiters.indexOf(waiter), 1);
            reject(
              new Error(
                `Tempo esgotado aguardando evento de concorrência do Registro: ${JSON.stringify(events)}`,
              ),
            );
          }, 15_000),
        };
        waiters.push(waiter);
      });
    },
    dispose: () => {
      output.off('data', onData);
      for (const waiter of waiters) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error('Rastreamento E2E encerrado.'));
      }
      waiters.length = 0;
    },
  };
}
