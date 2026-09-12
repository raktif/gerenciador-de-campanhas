import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createNoteInputSchema,
  notePageRequestSchema,
  noteSchema,
  type Note,
  type NoteEntityLinkInput,
} from '../../src/core/contracts/notes';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import { EntityRepository } from '../../src/db/repositories/entity-repository';
import { CampaignRepository } from '../../src/db/repositories/campaign-repository';
import { NoteRepository } from '../../src/db/repositories/note-repository';
import { NoteService } from '../../src/main/services/note-service';
import { TestLogger } from '../helpers/test-logger';

const campaignId = '00000000-0000-4000-8000-000000000001';
const otherCampaignId = '00000000-0000-4000-8000-000000000002';
const missingCampaignId = '00000000-0000-4000-8000-000000000099';
const entityTypeId = '10000000-0000-4000-8000-000000000001';
const otherEntityTypeId = '10000000-0000-4000-8000-000000000002';
const entityA = '30000000-0000-4000-8000-000000000001';
const entityB = '30000000-0000-4000-8000-000000000002';
const entityC = '30000000-0000-4000-8000-000000000003';
const foreignEntity = '30000000-0000-4000-8000-000000000004';
const noteA = '50000000-0000-4000-8000-000000000001';
const timestamp = '2026-09-03T12:00:00.000Z';
const roots: string[] = [];
const contexts: DatabaseContext[] = [];

afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('NoteRepository', () => {
  it('falha previsivelmente para campanha inexistente sem persistir uma nota', async () => {
    const { context, repository } = await setup();
    const service = new NoteService({
      repository,
      campaigns: new CampaignRepository(context.orm),
      entities: new EntityRepository(context.orm),
      createId: () => noteA,
      now: () => timestamp,
    });
    expect(
      captureCode(() =>
        service.create(
          createNoteInputSchema.parse({
            campaignId: missingCampaignId,
            title: 'Sem campanha',
            bodyMarkdown: 'Não deve persistir.',
          }),
        ),
      ),
    ).toBe('CAMPAIGN_NOT_FOUND');
    expect(context.native.prepare('SELECT COUNT(*) AS total FROM notes').get()).toEqual({
      total: 0,
    });
    expect(
      captureCode(() =>
        service.list(notePageRequestSchema.parse({ campaignId: missingCampaignId })),
      ),
    ).toBe('CAMPAIGN_NOT_FOUND');
    context.close();
  });

  it('recupera a nota a partir de cada entidade vinculada e isola campanhas', async () => {
    const { context, repository } = await setup();
    repository.insert(createNote(noteA), [
      { entityId: entityA, role: 'alvo' },
      { entityId: entityB, role: 'testemunha' },
    ]);
    repository.insert(
      createNote('50000000-0000-4000-8000-000000000002', {
        campaignId: otherCampaignId,
      }),
      [{ entityId: foreignEntity, role: 'related' }],
    );

    for (const entityId of [entityA, entityB]) {
      const result = repository.list(
        notePageRequestSchema.parse({ campaignId, filters: { entityId, archived: false } }),
      );
      expect(result.items.map((note) => note.id)).toEqual([noteA]);
      expect(result.total).toBe(1);
    }
    expect(repository.findById(otherCampaignId, noteA)).toBeNull();
    expect(
      repository.list(notePageRequestSchema.parse({ campaignId, filters: { archived: false } }))
        .items,
    ).toHaveLength(1);
    context.close();
  });

  it('pagina de modo estável e vincula o cursor a campanha, filtros e ordenação', async () => {
    const { context, repository } = await setup();
    for (let index = 1; index <= 4; index += 1) {
      const id = `50000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
      repository.insert(
        createNote(id, {
          title: index < 3 ? 'Mesmo título' : `Título ${String(index)}`,
          updatedAt: index < 3 ? timestamp : `2026-09-03T1${String(index)}:00:00.000Z`,
        }),
        [{ entityId: entityA, role: 'related' }],
      );
    }
    const request = notePageRequestSchema.parse({
      campaignId,
      limit: 2,
      filters: { entityId: entityA, archived: false },
      sort: 'updatedAt',
      order: 'asc',
    });
    const first = repository.list(request);
    const second = repository.list({ ...request, cursor: first.nextCursor ?? undefined });
    expect([...first.items, ...second.items].map((note) => note.id)).toEqual([
      '50000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002',
      '50000000-0000-4000-8000-000000000003',
      '50000000-0000-4000-8000-000000000004',
    ]);
    expect(() =>
      repository.list({
        ...request,
        campaignId: otherCampaignId,
        cursor: first.nextCursor ?? undefined,
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_CURSOR' }));
    expect(() =>
      repository.list({ ...request, order: 'desc', cursor: first.nextCursor ?? undefined }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_CURSOR' }));
    context.close();
  });

  it('substitui vínculos atomicamente e detecta concorrência otimista', async () => {
    const { context, repository } = await setup();
    repository.insert(createNote(noteA), [{ entityId: entityA, role: 'related' }]);
    const updated = repository.update(
      {
        campaignId,
        id: noteA,
        revision: 1,
        patch: { title: 'Revisada', bodyMarkdown: 'Novo **corpo**.' },
        links: [
          { entityId: entityB, role: 'alvo' },
          { entityId: entityC, role: 'local' },
        ],
      },
      '2026-09-03T13:00:00.000Z',
    );
    expect(updated.note).toMatchObject({ title: 'Revisada', revision: 2 });
    expect(updated.links.map((link) => link.entityId)).toEqual([entityB, entityC]);
    expect(
      repository.list(
        notePageRequestSchema.parse({
          campaignId,
          filters: { entityId: entityA, archived: false },
        }),
      ).items,
    ).toEqual([]);
    expect(() =>
      repository.update(
        { campaignId, id: noteA, revision: 1, patch: { title: 'Obsoleta' } },
        '2026-09-03T14:00:00.000Z',
      ),
    ).toThrow(expect.objectContaining({ code: 'REVISION_CONFLICT' }));
    context.close();
  });

  it('reverte integralmente falhas ao criar ou editar nota e vínculos', async () => {
    const { context, repository } = await setup();
    const duplicateLinks: NoteEntityLinkInput[] = [
      { entityId: entityA, role: 'related' },
      { entityId: entityA, role: 'related' },
    ];
    expect(() => repository.insert(createNote(noteA), duplicateLinks)).toThrow();
    expect(repository.findById(campaignId, noteA)).toBeNull();

    repository.insert(createNote(noteA), [{ entityId: entityA, role: 'original' }]);
    expect(() =>
      repository.update(
        {
          campaignId,
          id: noteA,
          revision: 1,
          patch: { title: 'Não pode persistir' },
          links: duplicateLinks,
        },
        '2026-09-03T13:00:00.000Z',
      ),
    ).toThrow();
    expect(repository.findById(campaignId, noteA)).toMatchObject({
      note: { title: 'Nota original', revision: 1 },
      links: [{ entityId: entityA, role: 'original' }],
    });
    context.close();
  });

  it('preserva corpo e vínculos ao arquivar/restaurar e valida isolamento e proveniência', async () => {
    const { context, repository } = await setup();
    const service = new NoteService({
      repository,
      campaigns: new CampaignRepository(context.orm),
      entities: new EntityRepository(context.orm),
      createId: () => noteA,
      now: () => '2026-09-03T15:00:00.000Z',
    });
    const created = service.create(
      createNoteInputSchema.parse({
        campaignId,
        title: 'Crônica',
        bodyMarkdown: '# Corpo\n\nTexto.',
        links: [{ entityId: entityA, role: 'protagonista' }],
      }),
    );
    expect(
      captureCode(() =>
        service.update({
          campaignId: otherCampaignId,
          id: created.note.id,
          revision: 1,
          links: [{ entityId: foreignEntity, role: 'related' }],
        }),
      ),
    ).toBe('NOTE_NOT_FOUND');
    const archived = service.archive({ campaignId, id: created.note.id, revision: 1 });
    const restored = service.restore({ campaignId, id: created.note.id, revision: 2 });
    expect(restored.note).toMatchObject({
      bodyMarkdown: '# Corpo\n\nTexto.',
      archivedAt: null,
      revision: 3,
    });
    expect(restored.links).toEqual(archived.links);

    const sessionId = '70000000-0000-4000-8000-000000000001';
    const sourceId = '60000000-0000-4000-8000-000000000001';
    context.native
      .prepare(
        "INSERT INTO sessions (id, campaign_id, sequence_number, title, status, created_at, updated_at, revision) VALUES (?, ?, 1, 'Sessão', 'planned', ?, ?, 1)",
      )
      .run(sessionId, otherCampaignId, timestamp, timestamp);
    context.native
      .prepare("INSERT INTO sources (id, kind, session_id, created_at) VALUES (?, 'session', ?, ?)")
      .run(sourceId, sessionId, timestamp);
    expect(
      captureCode(() =>
        service.create(
          createNoteInputSchema.parse({
            campaignId,
            title: 'Fonte estrangeira',
            bodyMarkdown: 'Registro',
            originKind: 'session',
            sourceId,
          }),
        ),
      ),
    ).toBe('NOTE_SOURCE_CAMPAIGN_MISMATCH');
    context.close();
  });
});

async function setup(): Promise<{ context: DatabaseContext; repository: NoteRepository }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rpg-notes-test-'));
  roots.push(root);
  const directories = getDataDirectories(root);
  await ensureDataDirectories(directories);
  const context = await openApplicationDatabase(directories, new TestLogger());
  contexts.push(context);
  const insertCampaign = context.native.prepare(
    "INSERT INTO campaigns (id, name, status, created_at, updated_at, revision) VALUES (?, ?, 'active', ?, ?, 1)",
  );
  insertCampaign.run(campaignId, 'Ethéria', timestamp, timestamp);
  insertCampaign.run(otherCampaignId, 'Outra', timestamp, timestamp);
  const insertType = context.native.prepare(
    "INSERT INTO entity_types (id, campaign_id, name, singular_name, slug, sort_order, is_system, is_archived, created_at, updated_at, revision) VALUES (?, ?, 'Entidades', 'Entidade', 'entidades', 0, 0, 0, ?, ?, 1)",
  );
  insertType.run(entityTypeId, campaignId, timestamp, timestamp);
  insertType.run(otherEntityTypeId, otherCampaignId, timestamp, timestamp);
  const insertEntity = context.native.prepare(
    "INSERT INTO entities (id, campaign_id, entity_type_id, name, canon_state, knowledge_state, visibility, origin_kind, created_at, updated_at, revision) VALUES (?, ?, ?, ?, 'accepted', 'fact', 'gm', 'manual', ?, ?, 1)",
  );
  for (const id of [entityA, entityB, entityC])
    insertEntity.run(id, campaignId, entityTypeId, id, timestamp, timestamp);
  insertEntity.run(
    foreignEntity,
    otherCampaignId,
    otherEntityTypeId,
    foreignEntity,
    timestamp,
    timestamp,
  );
  return { context, repository: new NoteRepository(context.orm) };
}

function createNote(id: string, overrides: Partial<Note> = {}): Note {
  return noteSchema.parse({
    id,
    campaignId,
    title: 'Nota original',
    bodyMarkdown: 'Corpo **original**.',
    noteType: 'general',
    canonState: 'accepted',
    knowledgeState: 'fact',
    visibility: 'gm',
    originKind: 'manual',
    sourceId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    revision: 1,
    ...overrides,
  });
}

function captureCode(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error) return String(error.code);
    throw error;
  }
  throw new Error('A operação deveria falhar.');
}
