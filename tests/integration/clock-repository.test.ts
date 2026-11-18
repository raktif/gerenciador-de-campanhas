import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import { migrations } from '../../src/db/migrations/registry';
import { ClockRepository } from '../../src/db/repositories/clock-repository';
import { CampaignRepository } from '../../src/db/repositories/campaign-repository';
import { ClockService } from '../../src/main/services/clock-service';
import type { CreateClockInput } from '../../src/core/contracts/clocks';
import type { Clock } from '../../src/core/contracts/clocks';
import { TestLogger } from '../helpers/test-logger';

const now = '2026-11-16T14:00:00.000Z';
const roots: string[] = [];
const contexts: DatabaseContext[] = [];

afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('persistência SQLite de Relógios', () => {
  it('lista referências da mesma origem vinculadas à campanha solicitada', async () => {
    const { context, ids, service, repository } = await setup();
    const campaignSourceId = randomUUID();
    const otherCampaignSourceId = randomUUID();
    context.native
      .prepare(
        `INSERT INTO sources (id, kind, import_batch_id, description, created_at)
         VALUES (@id, 'import', @batchId, @description, @createdAt)`,
      )
      .run({
        id: campaignSourceId,
        batchId: randomUUID(),
        description: 'Importação desta campanha',
        createdAt: now,
      });
    context.native
      .prepare(
        `INSERT INTO sources (id, kind, import_batch_id, description, created_at)
         VALUES (@id, 'import', @batchId, @description, @createdAt)`,
      )
      .run({
        id: otherCampaignSourceId,
        batchId: randomUUID(),
        description: 'Importação de outra campanha',
        createdAt: now,
      });
    context.native
      .prepare('UPDATE entities SET source_id = @sourceId WHERE id = @entityId')
      .run({ sourceId: campaignSourceId, entityId: ids.entity });
    context.native
      .prepare('UPDATE entities SET source_id = @sourceId WHERE id = @entityId')
      .run({ sourceId: otherCampaignSourceId, entityId: ids.otherEntity });

    expect(service.sourceOptions({ campaignId: ids.campaign, originKind: 'import' })).toEqual([
      { id: campaignSourceId, label: 'Importação desta campanha' },
    ]);
    expect(repository.listSourceOptions({ campaignId: ids.campaign, originKind: 'ai' })).toEqual(
      [],
    );
  });

  it('deduplica reenvio da mesma criação/evento, rejeita reuso divergente e preserva novas criações intencionais', async () => {
    const { context, directories, ids, service } = await setup();
    const idempotencyKey = randomUUID();
    const request = {
      campaignId: ids.campaign,
      idempotencyKey,
      name: 'Criação reenviada',
      description: null,
      clockType: 'countdown' as const,
      segmentsTotal: 4 as const,
      segmentsFilled: 4,
      entityId: ids.entity,
      consequence: 'Um evento potencial.',
      generateEvent: true,
    };

    const first = service.create(request);
    context.close();
    const reopened = await openApplicationDatabase(directories, new TestLogger());
    contexts.push(reopened);
    const reopenedService = new ClockService({
      repository: new ClockRepository(reopened.native),
      campaigns: new CampaignRepository(reopened.orm),
      now: () => now,
    });
    const retriedAfterLostResponse = reopenedService.create(request);
    expect(retriedAfterLostResponse).toEqual(first);
    expect(reopened.native.prepare('SELECT count(*) AS total FROM clocks').get()).toEqual({
      total: 1,
    });
    expect(reopened.native.prepare('SELECT count(*) AS total FROM events').get()).toEqual({
      total: 1,
    });
    expect(
      reopened.native.prepare('SELECT count(*) AS total FROM clock_create_operations').get(),
    ).toEqual({ total: 1 });

    const concurrentRequest = {
      ...request,
      idempotencyKey: randomUUID(),
      name: 'Criação concorrente',
    };
    const concurrentResults = await Promise.all([
      Promise.resolve().then(() => reopenedService.create(concurrentRequest)),
      Promise.resolve().then(() => reopenedService.create(concurrentRequest)),
    ]);
    expect(concurrentResults[0]).toEqual(concurrentResults[1]);
    expect(reopened.native.prepare('SELECT count(*) AS total FROM clocks').get()).toEqual({
      total: 2,
    });
    expect(reopened.native.prepare('SELECT count(*) AS total FROM events').get()).toEqual({
      total: 2,
    });

    expect(() =>
      new ClockRepository(reopened.native).create({
        idempotencyKey: randomUUID(),
        id: randomUUID(),
        campaignId: ids.campaign,
        name: 'Falha ao criar Evento',
        description: null,
        consequence: 'A transação deve reverter.',
        clockType: 'progress',
        segmentsTotal: 4,
        segmentsFilled: 4,
        entityId: ids.entity,
        canonState: 'accepted',
        knowledgeState: 'fact',
        visibility: 'gm',
        originKind: 'manual',
        sourceId: null,
        generateEvent: true,
        generatedEventId: first.generatedEventId,
        now,
      }),
    ).toThrow();
    expect(reopened.native.prepare('SELECT count(*) AS total FROM clocks').get()).toEqual({
      total: 2,
    });
    expect(reopened.native.prepare('SELECT count(*) AS total FROM events').get()).toEqual({
      total: 2,
    });
    expect(
      reopened.native.prepare('SELECT count(*) AS total FROM clock_create_operations').get(),
    ).toEqual({ total: 2 });

    expect(() => reopenedService.create({ ...request, name: 'Payload diferente' })).toThrow(
      expect.objectContaining({ code: 'CLOCK_CREATE_IDEMPOTENCY_CONFLICT' }),
    );
    expect(() => reopenedService.create({ ...request, campaignId: ids.otherCampaign })).toThrow(
      expect.objectContaining({ code: 'CLOCK_CREATE_IDEMPOTENCY_CONFLICT' }),
    );
    expect(reopened.native.prepare('SELECT count(*) AS total FROM clocks').get()).toEqual({
      total: 2,
    });
    expect(reopened.native.prepare('SELECT count(*) AS total FROM events').get()).toEqual({
      total: 2,
    });

    const deliberateDuplicate = reopenedService.create({
      ...request,
      idempotencyKey: randomUUID(),
    });
    expect(deliberateDuplicate.id).not.toBe(first.id);
    expect(reopened.native.prepare('SELECT count(*) AS total FROM clocks').get()).toEqual({
      total: 3,
    });
    expect(reopened.native.prepare('SELECT count(*) AS total FROM events').get()).toEqual({
      total: 3,
    });

    const noEventRequest = {
      campaignId: ids.campaign,
      idempotencyKey: randomUUID(),
      name: 'Criação ativa sem Evento',
      clockType: 'progress' as const,
      segmentsTotal: 6 as const,
      segmentsFilled: 2,
      entityId: ids.entity,
      consequence: 'Ainda não concluído.',
    };
    const activeFirstAttempt = reopenedService.create(noEventRequest);
    const activeRetry = reopenedService.create(noEventRequest);
    expect(activeRetry).toEqual(activeFirstAttempt);
    expect(reopened.native.prepare('SELECT count(*) AS total FROM clocks').get()).toEqual({
      total: 4,
    });
    expect(reopened.native.prepare('SELECT count(*) AS total FROM events').get()).toEqual({
      total: 3,
    });
  });

  it('persiste picklists e classifica todos os tipos com a mesma regra de progresso', async () => {
    const { context, ids, service } = await setup();
    expect(
      context.native
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'clock%' ORDER BY name",
        )
        .all(),
    ).toEqual([
      { name: 'clock_create_operations' },
      { name: 'clock_entity_links' },
      { name: 'clocks' },
    ]);
    expect(
      (context.native.pragma('table_info(clocks)') as { name: string }[]).map(({ name }) => name),
    ).not.toContain('session_id');
    const totals = [4, 6, 8, 10, 12] as const;
    const types = [
      'progress',
      'threat',
      'countdown',
      'project',
      'investigation',
      'custom',
    ] as const;
    for (const [index, clockType] of types.entries()) {
      const segmentsTotal = totals[index % totals.length];
      if (segmentsTotal === undefined) throw new Error('Total de divisões ausente no teste.');
      const clock = service.create({
        campaignId: ids.campaign,
        name: `Relógio ${String(segmentsTotal)}`,
        clockType,
        segmentsTotal,
        segmentsFilled: segmentsTotal,
        entityId: ids.entity,
        consequence: 'A consequência do relógio.',
        generateEvent: false,
      });
      expect(clock).toMatchObject({
        segmentsTotal,
        segmentsFilled: segmentsTotal,
        status: 'completed',
      });
    }
    const countdown = service.create({
      campaignId: ids.campaign,
      name: 'Contagem',
      clockType: 'countdown',
      segmentsTotal: 4,
      segmentsFilled: 0,
      entityId: ids.entity,
      consequence: 'Uma consequência.',
    });
    expect(countdown).toMatchObject({ segmentsFilled: 0, status: 'active' });
    expect(
      context.native
        .prepare('SELECT status, segments_filled FROM clocks WHERE id = ?')
        .get(countdown.id),
    ).toEqual({ status: 'active', segments_filled: 0 });

    expect(() =>
      context.native
        .prepare(
          `INSERT INTO clocks (
            id, campaign_id, name, segments_total, segments_filled, clock_type, status,
            created_at, updated_at
          ) VALUES (?, ?, 'Inválido', 5, 0, 'progress', 'active', ?, ?)`,
        )
        .run(randomUUID(), ids.campaign, now, now),
    ).toThrow();
    expect(() =>
      context.native
        .prepare(
          `INSERT INTO clocks (
            id, campaign_id, name, segments_total, segments_filled, clock_type, status,
            created_at, updated_at
          ) VALUES (?, ?, 'Estado removido', 4, 0, 'progress', 'inactive', ?, ?)`,
        )
        .run(randomUUID(), ids.campaign, now, now),
    ).toThrow();
  });

  it('conclui automaticamente na edição que preenche o total e rejeita combinações incompatíveis sem truncar', async () => {
    const { context, ids, service, repository } = await setup();
    const active = service.create({
      campaignId: ids.campaign,
      name: 'Objetivo',
      clockType: 'progress',
      segmentsTotal: 6,
      segmentsFilled: 2,
      entityId: ids.entity,
      consequence: 'Acontecimento iminente.',
    });
    const completed = service.update({
      campaignId: ids.campaign,
      id: active.id,
      revision: active.revision,
      patch: { segmentsFilled: 6 },
      generateEvent: false,
    });
    expect(completed).toMatchObject({
      segmentsTotal: 6,
      segmentsFilled: 6,
      entityId: ids.entity,
      consequence: 'Acontecimento iminente.',
      status: 'completed',
      revision: 2,
    });
    expect(() =>
      service.update({
        campaignId: ids.campaign,
        id: active.id,
        revision: 1,
        patch: { name: 'Stale' },
      }),
    ).toThrow(expect.objectContaining({ code: 'REVISION_CONFLICT' }));
    expect(() =>
      service.update({
        campaignId: ids.campaign,
        id: completed.id,
        revision: completed.revision,
        patch: { name: 'Editar concluído' },
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_CLOCK_STATE' }));
    expect(() =>
      context.native.prepare('DELETE FROM clocks WHERE id = ?').run(completed.id),
    ).toThrow();
    expect(
      context.native
        .prepare('SELECT name, status, revision FROM clocks WHERE id = ?')
        .get(active.id),
    ).toEqual({ name: 'Objetivo', status: 'completed', revision: 2 });

    const partial = service.create({
      campaignId: ids.campaign,
      name: 'Progresso preservado',
      clockType: 'threat',
      segmentsTotal: 8,
      segmentsFilled: 7,
      entityId: ids.entity,
      consequence: 'Progresso preservado.',
    });
    expect(() =>
      repository.update({
        campaignId: ids.campaign,
        id: partial.id,
        revision: partial.revision,
        patch: { segmentsTotal: 4 },
        now,
      }),
    ).toThrow(expect.objectContaining({ code: 'CLOCK_PROGRESS_EXCEEDS_TOTAL' }));
    expect(service.get({ campaignId: ids.campaign, id: partial.id })).toMatchObject({
      segmentsTotal: 8,
      segmentsFilled: 7,
      status: 'active',
      revision: 1,
    });
  });

  it('permite conclusão manual parcial ou vazia, preserva o progresso e veda alterações posteriores', async () => {
    const { context, ids, service } = await setup();
    for (const segmentsFilled of [0, 3]) {
      const clock = service.create({
        campaignId: ids.campaign,
        name: `Manual ${String(segmentsFilled)}`,
        clockType: 'countdown',
        segmentsTotal: 4,
        segmentsFilled,
        entityId: ids.entity,
        consequence: 'Conclusão manual.',
      });
      const completed = service.complete({
        campaignId: ids.campaign,
        id: clock.id,
        revision: clock.revision,
        generateEvent: false,
      });
      expect(completed).toMatchObject({
        segmentsFilled,
        status: 'completed',
        revision: 2,
      });
      expect(() =>
        service.complete({
          campaignId: ids.campaign,
          id: clock.id,
          revision: completed.revision,
          generateEvent: false,
        }),
      ).toThrow(expect.objectContaining({ code: 'INVALID_CLOCK_STATE' }));
      expect(() =>
        context.native
          .prepare('UPDATE clocks SET name = ?, revision = revision + 1 WHERE id = ?')
          .run('Alteração direta', clock.id),
      ).toThrow();
      expect(service.get({ campaignId: ids.campaign, id: clock.id })).toMatchObject({
        name: `Manual ${String(segmentsFilled)}`,
        segmentsFilled,
        status: 'completed',
        revision: 2,
      });
    }
  });

  it('bloqueia INSERT OR REPLACE e UPDATE OR REPLACE que tentariam substituir concluídos com recursive_triggers=0', async () => {
    const { context, ids, service } = await setup();
    expect(context.native.pragma('recursive_triggers', { simple: true })).toBe(0);
    const completed = service.create({
      campaignId: ids.campaign,
      name: 'Registro histórico',
      description: 'Não pode ser substituído.',
      clockType: 'progress',
      segmentsTotal: 4,
      segmentsFilled: 4,
      entityId: ids.entity,
      consequence: 'Não substituir.',
      generateEvent: false,
    });
    const active = service.create({
      campaignId: ids.campaign,
      name: 'Outro relógio',
      clockType: 'threat',
      segmentsTotal: 6,
      segmentsFilled: 1,
      entityId: ids.entity,
      consequence: 'Outro.',
    });
    const replaceCompleted = context.native.prepare(`
      INSERT OR REPLACE INTO clocks (
        id, campaign_id, name, description, segments_total, segments_filled,
        clock_type, status, created_at, updated_at, revision
      ) VALUES (?, ?, 'Substituição', NULL, 4, 0, 'custom', 'active', ?, ?, 1)
    `);
    expect(() => replaceCompleted.run(completed.id, ids.campaign, now, now)).toThrow(
      /completed_clock_immutable/,
    );
    expect(() =>
      context.native
        .prepare(
          `
          UPDATE OR REPLACE clocks
          SET id = ?, name = 'Substituição via update'
          WHERE id = ?
        `,
        )
        .run(completed.id, active.id),
    ).toThrow(/completed_clock_immutable/);
    expect(service.get({ campaignId: ids.campaign, id: completed.id })).toMatchObject({
      id: completed.id,
      name: 'Registro histórico',
      description: 'Não pode ser substituído.',
      segmentsFilled: 4,
      status: 'completed',
      revision: 1,
    });
    expect(service.get({ campaignId: ids.campaign, id: active.id })).toMatchObject({
      id: active.id,
      name: 'Outro relógio',
      status: 'active',
      revision: 1,
    });
  });

  it('isola campanha, pagina resultados e mantém concluídos consultáveis', async () => {
    const { ids, service } = await setup();
    const created = [
      service.create({
        campaignId: ids.campaign,
        name: 'Ativo',
        clockType: 'project',
        segmentsTotal: 4,
        entityId: ids.entity,
        consequence: 'Alvo ativo.',
      }),
      service.create({
        campaignId: ids.campaign,
        name: 'Concluído',
        clockType: 'project',
        segmentsTotal: 6,
        segmentsFilled: 6,
        entityId: ids.entity,
        consequence: 'Alvo concluído.',
        generateEvent: false,
      }),
    ];
    const page = service.list({ campaignId: ids.campaign, limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).not.toBeNull();
    const next = service.list({
      campaignId: ids.campaign,
      limit: 1,
      cursor: page.nextCursor ?? undefined,
    });
    expect(next.items).toHaveLength(1);
    expect(new Set([...page.items, ...next.items].map(({ id }) => id))).toEqual(
      new Set(created.map(({ id }) => id)),
    );
    expect(service.list({ campaignId: ids.campaign, status: 'completed' }).items[0]?.name).toBe(
      'Concluído',
    );
    const firstClock = created[0];
    if (firstClock === undefined) throw new Error('Relógio de teste ausente.');
    expect(() => service.get({ campaignId: ids.otherCampaign, id: firstClock.id })).toThrow(
      expect.objectContaining({ code: 'CLOCK_NOT_FOUND' }),
    );
    expect(() =>
      service.list({
        campaignId: ids.otherCampaign,
        cursor: page.nextCursor ?? undefined,
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_CLOCK_CURSOR' }));
  });

  it('confere campanha ativa no serviço e dentro das transações do repositório', async () => {
    const { context, ids, repository, service } = await setup();
    const clock = service.create({
      campaignId: ids.campaign,
      name: 'Protegido',
      clockType: 'progress',
      segmentsTotal: 4,
      segmentsFilled: 2,
      entityId: ids.entity,
      consequence: 'Proteger o relógio.',
    });
    context.native
      .prepare("UPDATE campaigns SET status = 'archived', archived_at = ? WHERE id = ?")
      .run(now, ids.campaign);

    expect(() =>
      service.update({
        campaignId: ids.campaign,
        id: clock.id,
        revision: clock.revision,
        patch: { segmentsFilled: 3 },
      }),
    ).toThrow(expect.objectContaining({ code: 'CLOCK_CAMPAIGN_NOT_ACTIVE' }));
    expect(() =>
      repository.complete(ids.campaign, clock.id, clock.revision, false, undefined, now),
    ).toThrow(expect.objectContaining({ code: 'CLOCK_CAMPAIGN_NOT_ACTIVE' }));
    expect(() =>
      repository.create({
        idempotencyKey: randomUUID(),
        id: randomUUID(),
        campaignId: ids.campaign,
        name: 'Bloqueado',
        description: null,
        consequence: 'Bloqueado.',
        clockType: 'progress',
        segmentsTotal: 4,
        segmentsFilled: 0,
        entityId: ids.entity,
        canonState: 'accepted',
        knowledgeState: 'fact',
        visibility: 'gm',
        originKind: 'manual',
        sourceId: null,
        generateEvent: false,
        generatedEventId: null,
        now,
      }),
    ).toThrow(expect.objectContaining({ code: 'CLOCK_CAMPAIGN_NOT_ACTIVE' }));
    expect(
      context.native
        .prepare('SELECT status, segments_filled, revision FROM clocks WHERE id = ?')
        .get(clock.id),
    ).toEqual({ status: 'active', segments_filled: 2, revision: 1 });
  });

  it('exige uma entidade ativa da campanha e consequência e persiste metadados narrativos/fonte válida', async () => {
    const { context, ids, service } = await setup();
    const sessionId = randomUUID();
    const campaignSourceId = randomUUID();
    const otherCampaignSourceId = randomUUID();
    context.native
      .prepare(
        'INSERT INTO sessions (id, campaign_id, sequence_number, title, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)',
      )
      .run(sessionId, ids.campaign, 'Sessão de origem', now, now);
    context.native
      .prepare('INSERT INTO sources (id, kind, session_id, created_at) VALUES (?, ?, ?, ?)')
      .run(campaignSourceId, 'session', sessionId, now);
    const pickerSessionId = randomUUID();
    context.native
      .prepare(
        'INSERT INTO sessions (id, campaign_id, sequence_number, title, created_at, updated_at) VALUES (?, ?, 2, ?, ?, ?)',
      )
      .run(pickerSessionId, ids.campaign, 'Sessão escolhida', now, now);
    const otherSessionId = randomUUID();
    context.native
      .prepare(
        'INSERT INTO sessions (id, campaign_id, sequence_number, title, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)',
      )
      .run(otherSessionId, ids.otherCampaign, 'Sessão alheia', now, now);
    context.native
      .prepare('INSERT INTO sources (id, kind, session_id, created_at) VALUES (?, ?, ?, ?)')
      .run(otherCampaignSourceId, 'session', otherSessionId, now);

    const clock = service.create({
      campaignId: ids.campaign,
      name: 'Relógio com proveniência',
      clockType: 'progress',
      segmentsTotal: 4,
      entityId: ids.entity,
      consequence: 'A consequência obrigatória.',
      originKind: 'session',
      sourceId: campaignSourceId,
    });
    expect(clock).toMatchObject({
      entityId: ids.entity,
      entityName: 'Entidade',
      consequence: 'A consequência obrigatória.',
      canonState: 'accepted',
      knowledgeState: 'fact',
      visibility: 'gm',
      originKind: 'session',
      sourceId: campaignSourceId,
      sessionId,
    });
    const pickerClock = service.create({
      campaignId: ids.campaign,
      name: 'Relógio ligado à sessão escolhida',
      clockType: 'progress',
      segmentsTotal: 4,
      entityId: ids.entity,
      consequence: 'A sessão foi associada.',
      originKind: 'session',
      sessionId: pickerSessionId,
    });
    expect(pickerClock).toMatchObject({
      originKind: 'session',
      sourceId: pickerSessionId,
      sessionId: pickerSessionId,
    });
    expect(
      context.native
        .prepare('SELECT kind, session_id FROM sources WHERE id = ?')
        .get(pickerSessionId),
    ).toEqual({ kind: 'session', session_id: pickerSessionId });
    expect(
      context.native
        .prepare('SELECT clock_id, entity_id FROM clock_entity_links WHERE clock_id = ?')
        .get(clock.id),
    ).toEqual({ clock_id: clock.id, entity_id: ids.entity });
    expect(() =>
      context.native
        .prepare('UPDATE clocks SET entity_id = ? WHERE id = ?')
        .run(ids.otherEntity, clock.id),
    ).toThrow(/CLOCK_ENTITY_LINK_INVALID/);
    expect(() =>
      context.native
        .prepare('UPDATE clocks SET source_id = ? WHERE id = ?')
        .run(otherCampaignSourceId, clock.id),
    ).toThrow(/CLOCK_SOURCE_INVALID/);
    expect(() =>
      context.native
        .prepare('INSERT INTO clock_entity_links (clock_id, entity_id) VALUES (?, ?)')
        .run(clock.id, ids.otherEntity),
    ).toThrow(/CLOCK_ENTITY_LINK_INVALID/);
    expect(service.get({ campaignId: ids.campaign, id: clock.id })).toMatchObject({
      entityId: ids.entity,
      sourceId: campaignSourceId,
    });
    expect(() =>
      service.create({
        campaignId: ids.campaign,
        name: 'Entidade de outra campanha',
        clockType: 'progress',
        segmentsTotal: 4,
        entityId: ids.otherEntity,
        consequence: 'Não deve ser criado.',
      }),
    ).toThrow(expect.objectContaining({ code: 'CLOCK_ENTITY_NOT_FOUND' }));
    expect(() =>
      service.create({
        campaignId: ids.campaign,
        name: 'Fonte de outra campanha',
        clockType: 'progress',
        segmentsTotal: 4,
        entityId: ids.entity,
        consequence: 'Não deve ser criado.',
        originKind: 'session',
        sourceId: otherCampaignSourceId,
      }),
    ).toThrow(expect.objectContaining({ code: 'CLOCK_SOURCE_INVALID' }));
    expect(() =>
      service.create({
        campaignId: ids.campaign,
        name: 'Sessão de outra campanha',
        clockType: 'progress',
        segmentsTotal: 4,
        entityId: ids.entity,
        consequence: 'Não deve ser criado.',
        originKind: 'session',
        sessionId: otherSessionId,
      }),
    ).toThrow(expect.objectContaining({ code: 'SESSION_NOT_FOUND' }));
    expect(() =>
      service.create({
        campaignId: ids.campaign,
        name: 'Fonte ausente',
        clockType: 'progress',
        segmentsTotal: 4,
        entityId: ids.entity,
        consequence: 'Não deve ser criado.',
        originKind: 'session',
      }),
    ).toThrow(expect.objectContaining({ code: 'CLOCK_SOURCE_REQUIRED' }));
  });

  it('preserva vínculo histórico de entidade arquivada, bloqueia novos vínculos/Eventos e permite conclusão sem Evento', async () => {
    const { context, ids, service } = await setup();
    const existing = service.create({
      campaignId: ids.campaign,
      name: 'Relógio histórico da entidade',
      clockType: 'threat',
      segmentsTotal: 6,
      segmentsFilled: 2,
      entityId: ids.entity,
      consequence: 'A entidade será arquivada.',
    });
    context.native
      .prepare('UPDATE entities SET archived_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, ids.entity);
    expect(service.get({ campaignId: ids.campaign, id: existing.id })).toMatchObject({
      status: 'active',
      segmentsFilled: 2,
      entityArchivedAt: now,
      entityName: 'Entidade',
    });
    expect(() =>
      service.create({
        campaignId: ids.campaign,
        name: 'Novo vínculo arquivado',
        clockType: 'progress',
        segmentsTotal: 4,
        entityId: ids.entity,
        consequence: 'Não deve ser criado.',
      }),
    ).toThrow(expect.objectContaining({ code: 'CLOCK_ENTITY_ARCHIVED' }));
    expect(() =>
      context.native.prepare('DELETE FROM entities WHERE id = ?').run(ids.entity),
    ).toThrow();

    expect(() =>
      service.complete({
        campaignId: ids.campaign,
        id: existing.id,
        revision: existing.revision,
        generateEvent: true,
      }),
    ).toThrow(expect.objectContaining({ code: 'CLOCK_ENTITY_ARCHIVED' }));
    expect(context.native.prepare('SELECT count(*) AS total FROM events').get()).toEqual({
      total: 0,
    });
    expect(service.get({ campaignId: ids.campaign, id: existing.id })).toMatchObject({
      status: 'active',
      segmentsFilled: 2,
      revision: 1,
      generatedEventId: null,
    });
    const completed = service.complete({
      campaignId: ids.campaign,
      id: existing.id,
      revision: existing.revision,
      generateEvent: false,
    });
    expect(completed).toMatchObject({
      status: 'completed',
      segmentsFilled: 2,
      entityArchivedAt: now,
    });
    expect(
      context.native
        .prepare('SELECT clock_id, entity_id FROM clock_entity_links WHERE clock_id = ?')
        .get(existing.id),
    ).toEqual({ clock_id: existing.id, entity_id: ids.entity });
    expect(() =>
      context.native.prepare('DELETE FROM clock_entity_links WHERE clock_id = ?').run(existing.id),
    ).toThrow();
  });

  it('gera Evento Rascunho relacionado na mesma transação e reverte tudo em colisão/revisão obsoleta', async () => {
    const { context, ids, service, repository } = await setup();
    const completedAtCreate = service.create({
      campaignId: ids.campaign,
      name: 'Ritual de invocação',
      clockType: 'countdown',
      segmentsTotal: 8,
      segmentsFilled: 8,
      entityId: ids.entity,
      consequence: 'Invocar a criatura.',
      generateEvent: true,
    });
    const eventRow = context.native
      .prepare(
        `SELECT id, campaign_id, session_id, title, description_markdown, canon_state,
                knowledge_state, visibility, origin_kind, source_id
         FROM events WHERE id = ?`,
      )
      .get(completedAtCreate.generatedEventId) as Record<string, unknown>;
    expect(eventRow).toMatchObject({
      id: completedAtCreate.generatedEventId,
      campaign_id: ids.campaign,
      session_id: null,
      title: 'Ritual de invocação',
      description_markdown: 'Invocar a criatura.',
      canon_state: 'draft',
      knowledge_state: 'possibility',
      visibility: 'gm',
      origin_kind: 'manual',
      source_id: null,
    });
    expect(
      context.native
        .prepare('SELECT event_id, entity_id, role FROM event_entity_links WHERE event_id = ?')
        .get(completedAtCreate.generatedEventId),
    ).toEqual({
      event_id: completedAtCreate.generatedEventId,
      entity_id: ids.entity,
      role: 'related',
    });
    expect(
      context.native
        .prepare('SELECT clock_id, entity_id FROM clock_entity_links WHERE clock_id = ?')
        .get(completedAtCreate.id),
    ).toEqual({ clock_id: completedAtCreate.id, entity_id: ids.entity });

    const partial = service.create({
      campaignId: ids.campaign,
      name: 'Conclusão antecipada',
      clockType: 'progress',
      segmentsTotal: 6,
      segmentsFilled: 3,
      entityId: ids.entity,
      consequence: 'Consequência antecipada.',
    });
    const partialCompleted = service.complete({
      campaignId: ids.campaign,
      id: partial.id,
      revision: partial.revision,
      generateEvent: true,
    });
    expect(partialCompleted).toMatchObject({
      status: 'completed',
      segmentsFilled: 3,
    });
    expect(typeof partialCompleted.generatedEventId).toBe('string');
    const eventCountAfterCompletion = (
      context.native.prepare('SELECT count(*) AS total FROM events').get() as { total: number }
    ).total;
    expect(() =>
      service.complete({
        campaignId: ids.campaign,
        id: partial.id,
        revision: partial.revision,
        generateEvent: true,
      }),
    ).toThrow(expect.objectContaining({ code: 'REVISION_CONFLICT' }));
    expect(context.native.prepare('SELECT count(*) AS total FROM events').get()).toEqual({
      total: eventCountAfterCompletion,
    });

    const empty = service.create({
      campaignId: ids.campaign,
      name: 'Conclusão sem avanço',
      clockType: 'progress',
      segmentsTotal: 4,
      entityId: ids.entity,
      consequence: 'Sem avanço.',
    });
    const eventCount = (
      context.native.prepare('SELECT count(*) AS total FROM events').get() as { total: number }
    ).total;
    expect(() =>
      repository.complete(
        ids.campaign,
        empty.id,
        empty.revision,
        true,
        completedAtCreate.generatedEventId ?? undefined,
        now,
      ),
    ).toThrow();
    expect(service.get({ campaignId: ids.campaign, id: empty.id })).toMatchObject({
      status: 'active',
      segmentsFilled: 0,
      revision: 1,
      generatedEventId: null,
    });
    expect(context.native.prepare('SELECT count(*) AS total FROM events').get()).toEqual({
      total: eventCount,
    });
    expect(() =>
      service.complete({
        campaignId: ids.campaign,
        id: empty.id,
        revision: 99,
        generateEvent: true,
      }),
    ).toThrow(expect.objectContaining({ code: 'REVISION_CONFLICT' }));
    expect(service.get({ campaignId: ids.campaign, id: empty.id })).toMatchObject({
      status: 'active',
      segmentsFilled: 0,
      revision: 1,
    });
  });

  it('atualiza a v24 sem backup no lote da v33 e preserva estado após reabrir', async () => {
    const root = await makeRoot();
    const directories = getDataDirectories(root);
    await ensureDataDirectories(directories);
    const file = path.join(directories.database, 'app.db');
    const legacy = new Database(file);
    legacy.pragma('foreign_keys = ON');
    legacy.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);
    for (const migration of migrations.filter((item) => item.version <= 24)) {
      if (migration.requiresForeignKeysDisabled) {
        legacy.pragma('foreign_keys = OFF');
        if (migration.requiresLegacyAlterTable) legacy.pragma('legacy_alter_table = ON');
      }
      legacy.transaction(() => {
        legacy.exec(migration.sql);
        legacy
          .prepare(
            'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
          )
          .run(migration.version, migration.name, migration.checksum, now);
      })();
      if (migration.requiresForeignKeysDisabled) {
        if (migration.requiresLegacyAlterTable) legacy.pragma('legacy_alter_table = OFF');
        legacy.pragma('foreign_keys = ON');
      }
    }
    const campaignId = randomUUID();
    const entityTypeId = randomUUID();
    const entityId = randomUUID();
    legacy
      .prepare('INSERT INTO campaigns (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(campaignId, 'Campanha preexistente', now, now);
    legacy
      .prepare(
        `INSERT INTO entity_types (
        id, campaign_id, name, singular_name, slug, created_at, updated_at
      ) VALUES (?, ?, 'Pessoas', 'Pessoa', 'pessoa', ?, ?)`,
      )
      .run(entityTypeId, campaignId, now, now);
    legacy.close();

    const migrated = await openApplicationDatabase(directories, new TestLogger());
    contexts.push(migrated);
    expect(migrated.schemaVersion).toBe(migrations.at(-1)?.version);
    expect(migrated.native.prepare('SELECT count(*) AS total FROM clocks').get()).toEqual({
      total: 0,
    });
    expect(migrated.native.pragma('foreign_key_check')).toEqual([]);
    expect(await readdir(directories.automaticBackups)).toEqual([]);
    const repo = new ClockRepository(migrated.native);
    const service = new ClockService({
      repository: repo,
      campaigns: new CampaignRepository(migrated.orm),
      now: () => now,
    });
    migrated.native
      .prepare(
        `INSERT INTO entities (id, campaign_id, entity_type_id, name, created_at, updated_at)
         VALUES (?, ?, ?, 'Entidade vinculada', ?, ?)`,
      )
      .run(entityId, campaignId, entityTypeId, now, now);
    const clock = service.create({
      campaignId,
      idempotencyKey: randomUUID(),
      name: 'Persistente',
      clockType: 'investigation',
      segmentsTotal: 10,
      segmentsFilled: 4,
      entityId,
      consequence: 'Persistir depois de reiniciar.',
    });
    migrated.close();
    contexts.pop();

    const reopened = await openApplicationDatabase(directories, new TestLogger());
    contexts.push(reopened);
    expect(reopened.schemaVersion).toBe(migrations.at(-1)?.version);
    expect(new ClockRepository(reopened.native).findById(campaignId, clock.id)).toMatchObject({
      name: 'Persistente',
      segmentsTotal: 10,
      segmentsFilled: 4,
      status: 'active',
      revision: 1,
    });
  });

  it.each([25, 26])(
    'falha atomicamente ao atualizar instalação v%s com relógio sem entidade e não cria backup',
    async (version) => {
      const { directories, file, database } = await createDatabaseAtMigrationVersion(version);
      const campaignId = randomUUID();
      const clockId = randomUUID();
      database
        .prepare('INSERT INTO campaigns (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run(campaignId, `Campanha v${String(version)}`, now, now);
      database
        .prepare(
          `INSERT INTO clocks (
            id, campaign_id, name, segments_total, segments_filled, clock_type, status,
            created_at, updated_at
          ) VALUES (?, ?, 'Legado sem entidade', 4, 0, 'progress', 'active', ?, ?)`,
        )
        .run(clockId, campaignId, now, now);
      const previousChecksum = database
        .prepare('SELECT checksum FROM schema_migrations WHERE version = ?')
        .pluck()
        .get(version) as string;
      database.close();

      await expect(openApplicationDatabase(directories, new TestLogger())).rejects.toThrow(
        'CLOCKS_V27_INCOMPATIBLE_LEGACY_CLOCKS',
      );
      expect(await readdir(directories.automaticBackups)).toEqual([]);
      const preserved = new Database(file);
      expect(
        preserved.prepare('SELECT max(version) AS version FROM schema_migrations').get(),
      ).toEqual({ version });
      expect(
        preserved
          .prepare('SELECT checksum FROM schema_migrations WHERE version = ?')
          .pluck()
          .get(version),
      ).toBe(previousChecksum);
      expect(
        preserved.prepare('SELECT id, name, status FROM clocks WHERE id = ?').get(clockId),
      ).toEqual({ id: clockId, name: 'Legado sem entidade', status: 'active' });
      expect(preserved.pragma('quick_check', { simple: true })).toBe('ok');
      preserved.close();
    },
  );

  it.each([25, 26, 27])(
    'atualiza banco v%s vazio para v28 sem perder integridade',
    async (version) => {
      const { directories, database } = await createDatabaseAtMigrationVersion(version);
      database.close();
      const upgraded = await openApplicationDatabase(directories, new TestLogger());
      contexts.push(upgraded);
      expect(upgraded.schemaVersion).toBe(migrations.at(-1)?.version);
      expect(upgraded.native.prepare('SELECT count(*) AS total FROM clocks').get()).toEqual({
        total: 0,
      });
      expect(
        upgraded.native.prepare('SELECT count(*) AS total FROM clock_create_operations').get(),
      ).toEqual({ total: 0 });
      expect(upgraded.native.pragma('foreign_key_check')).toEqual([]);
      expect(upgraded.native.pragma('quick_check', { simple: true })).toBe('ok');
      for (const migration of migrations.filter((item) => item.version <= version)) {
        expect(
          upgraded.native
            .prepare('SELECT checksum FROM schema_migrations WHERE version = ?')
            .pluck()
            .get(migration.version),
        ).toBe(migration.checksum);
      }
    },
  );
});

async function createDatabaseAtMigrationVersion(version: number): Promise<{
  directories: ReturnType<typeof getDataDirectories>;
  file: string;
  database: Database.Database;
}> {
  const root = await makeRoot();
  const directories = getDataDirectories(root);
  await ensureDataDirectories(directories);
  const file = path.join(directories.database, 'app.db');
  const database = new Database(file);
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
  for (const migration of migrations.filter((item) => item.version <= version)) {
    if (migration.requiresForeignKeysDisabled) {
      database.pragma('foreign_keys = OFF');
      if (migration.requiresLegacyAlterTable) database.pragma('legacy_alter_table = ON');
    }
    database.transaction(() => {
      database.exec(migration.sql);
      database
        .prepare(
          'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
        )
        .run(migration.version, migration.name, migration.checksum, now);
    })();
    if (migration.requiresForeignKeysDisabled) {
      if (migration.requiresLegacyAlterTable) database.pragma('legacy_alter_table = OFF');
      database.pragma('foreign_keys = ON');
    }
  }
  return { directories, file, database };
}

async function setup(): Promise<{
  directories: ReturnType<typeof getDataDirectories>;
  context: DatabaseContext;
  ids: {
    campaign: string;
    otherCampaign: string;
    entity: string;
    otherEntity: string;
    campaignEntityType: string;
    otherEntityType: string;
  };
  repository: ClockRepository;
  service: Omit<ClockService, 'create'> & {
    create(
      input: Omit<CreateClockInput, 'idempotencyKey'> &
        Partial<Pick<CreateClockInput, 'idempotencyKey'>>,
    ): Clock;
  };
}> {
  const root = await makeRoot();
  const directories = getDataDirectories(root);
  await ensureDataDirectories(directories);
  const context = await openApplicationDatabase(directories, new TestLogger());
  contexts.push(context);
  const ids = {
    campaign: randomUUID(),
    otherCampaign: randomUUID(),
    entity: randomUUID(),
    otherEntity: randomUUID(),
    campaignEntityType: randomUUID(),
    otherEntityType: randomUUID(),
  };
  const insert = context.native.prepare(
    'INSERT INTO campaigns (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
  );
  insert.run(ids.campaign, 'Campanha de teste', now, now);
  insert.run(ids.otherCampaign, 'Outra campanha', now, now);
  const insertType = context.native.prepare(
    `INSERT INTO entity_types (
      id, campaign_id, name, singular_name, slug, created_at, updated_at
    ) VALUES (?, ?, 'Personagens', 'Personagem', 'personagem', ?, ?)`,
  );
  insertType.run(ids.campaignEntityType, ids.campaign, now, now);
  insertType.run(ids.otherEntityType, ids.otherCampaign, now, now);
  const insertEntity = context.native.prepare(
    `INSERT INTO entities (id, campaign_id, entity_type_id, name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  insertEntity.run(ids.entity, ids.campaign, ids.campaignEntityType, 'Entidade', now, now);
  insertEntity.run(
    ids.otherEntity,
    ids.otherCampaign,
    ids.otherEntityType,
    'Entidade alheia',
    now,
    now,
  );
  const repository = new ClockRepository(context.native);
  const instance = new ClockService({
    repository,
    campaigns: new CampaignRepository(context.orm),
    now: () => now,
  });
  const service = {
    create: (
      input: Omit<CreateClockInput, 'idempotencyKey'> &
        Partial<Pick<CreateClockInput, 'idempotencyKey'>>,
    ) =>
      instance.create({
        ...input,
        idempotencyKey: input.idempotencyKey ?? randomUUID(),
      }),
    get: instance.get.bind(instance),
    list: instance.list.bind(instance),
    sourceOptions: instance.sourceOptions.bind(instance),
    update: instance.update.bind(instance),
    complete: instance.complete.bind(instance),
  };
  return {
    directories,
    context,
    ids,
    repository,
    service,
  };
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'campaign-clock-test-'));
  roots.push(root);
  return root;
}
