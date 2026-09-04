import { describe, expect, it } from 'vitest';
import {
  createNoteInputSchema,
  noteDetailsSchema,
  notePageRequestSchema,
  type Note,
  type NoteDetails,
  type NoteEntityLinkInput,
  type NotePageRequest,
  type NotePageResult,
} from '../../src/core/contracts/notes';
import type { Entity } from '../../src/core/contracts/entities';
import type { Campaign } from '../../src/core/contracts/campaigns';
import { AppError } from '../../src/core/errors/app-error';
import type {
  NoteRepositoryUpdate,
  NoteSourceContext,
} from '../../src/db/repositories/note-repository';
import { NoteService, type NoteRepositoryPort } from '../../src/main/services/note-service';

const campaignId = '00000000-0000-4000-8000-000000000001';
const otherCampaignId = '00000000-0000-4000-8000-000000000002';
const missingCampaignId = '00000000-0000-4000-8000-000000000099';
const noteId = '50000000-0000-4000-8000-000000000001';
const entityA = '30000000-0000-4000-8000-000000000001';
const entityB = '30000000-0000-4000-8000-000000000002';
const foreignEntity = '30000000-0000-4000-8000-000000000003';
const archivedEntity = '30000000-0000-4000-8000-000000000004';
const sourceId = '60000000-0000-4000-8000-000000000001';
const timestamp = '2026-09-03T12:00:00.000Z';

describe('NoteService', () => {
  it('rejeita campanha inexistente ao criar ou listar, mesmo sem vínculos ou filtros', () => {
    const repository = new MemoryRepository();
    const service = createService(repository);
    expect(
      capture(() =>
        service.create(
          createNoteInputSchema.parse({
            campaignId: missingCampaignId,
            title: 'Sem campanha',
            bodyMarkdown: 'Não deve persistir.',
          }),
        ),
      ).code,
    ).toBe('CAMPAIGN_NOT_FOUND');
    expect(repository.count()).toBe(0);
    expect(
      capture(() => service.list(notePageRequestSchema.parse({ campaignId: missingCampaignId })))
        .code,
    ).toBe('CAMPAIGN_NOT_FOUND');
  });

  it('cria nota com vínculos normalizados e ordenados deterministicamente', () => {
    const repository = new MemoryRepository();
    const result = createService(repository).create(
      createNoteInputSchema.parse({
        campaignId,
        title: 'Cena inicial',
        bodyMarkdown: 'Uma **pista**.',
        knowledgeState: 'possibility',
        links: [
          { entityId: entityB, role: ' testemunha ' },
          { entityId: entityA, role: 'alvo' },
        ],
      }),
    );
    expect(result.note).toMatchObject({
      id: noteId,
      knowledgeState: 'possibility',
      revision: 1,
      archivedAt: null,
    });
    expect(result.links.map(({ entityId, role }) => ({ entityId, role }))).toEqual([
      { entityId: entityA, role: 'alvo' },
      { entityId: entityB, role: 'testemunha' },
    ]);
  });

  it('impede vínculos estrangeiros, arquivados ou duplicados', () => {
    const service = createService(new MemoryRepository());
    const input = (links: NoteEntityLinkInput[]) =>
      createNoteInputSchema.parse({ campaignId, title: 'Nota', bodyMarkdown: 'Corpo', links });
    expect(
      capture(() => service.create(input([{ entityId: foreignEntity, role: 'alvo' }]))).code,
    ).toBe('ENTITY_NOT_FOUND');
    expect(
      capture(() => service.create(input([{ entityId: archivedEntity, role: 'alvo' }]))).code,
    ).toBe('INVALID_ENTITY_STATE');
    expect(
      capture(() =>
        service.create({
          ...input([]),
          links: [
            { entityId: entityA, role: 'alvo' },
            { entityId: entityA, role: ' alvo ' },
          ],
        }),
      ).code,
    ).toBe('DUPLICATE_NOTE_ENTITY_LINK');
  });

  it('substitui todos os vínculos e aplica revisão otimista', () => {
    const repository = new MemoryRepository([createDetails()]);
    const service = createService(repository);
    expect(
      capture(() =>
        service.update({
          campaignId,
          id: noteId,
          revision: 99,
          patch: { title: 'Concorrente' },
        }),
      ).code,
    ).toBe('REVISION_CONFLICT');
    const updated = service.update({
      campaignId,
      id: noteId,
      revision: 1,
      patch: { title: 'Revisada' },
      links: [{ entityId: entityB, role: 'local' }],
    });
    expect(updated.note).toMatchObject({ title: 'Revisada', revision: 2 });
    expect(updated.links).toEqual([{ noteId, entityId: entityB, role: 'local' }]);
  });

  it('preserva corpo e vínculos ao arquivar e restaurar, revalidando entidades', () => {
    const repository = new MemoryRepository([createDetails()]);
    const service = createService(repository);
    const archived = service.archive({ campaignId, id: noteId, revision: 1 });
    expect(archived.note).toMatchObject({ bodyMarkdown: 'Corpo **original**.', revision: 2 });
    expect(archived.links).toEqual(createDetails().links);
    const restored = service.restore({ campaignId, id: noteId, revision: 2 });
    expect(restored.note).toMatchObject({ archivedAt: null, revision: 3 });
    expect(restored.links).toEqual(createDetails().links);

    const archivedLink = createDetails({ archivedAt: timestamp, revision: 2 }, archivedEntity);
    const invalidService = createService(new MemoryRepository([archivedLink]));
    expect(
      capture(() => invalidService.restore({ campaignId, id: noteId, revision: 2 })).code,
    ).toBe('INVALID_ENTITY_STATE');
  });

  it('valida proveniência e o filtro por entidade no contexto da campanha', () => {
    const repository = new MemoryRepository();
    const service = createService(repository);
    const sessionNote = createNoteInputSchema.parse({
      campaignId,
      title: 'Sessão',
      bodyMarkdown: 'Registro',
      originKind: 'session',
    });
    expect(capture(() => service.create(sessionNote)).code).toBe('NOTE_SOURCE_REQUIRED');
    repository.sources.set(sourceId, { kind: 'session', sessionCampaignId: otherCampaignId });
    expect(capture(() => service.create({ ...sessionNote, sourceId })).code).toBe(
      'NOTE_SOURCE_CAMPAIGN_MISMATCH',
    );
    repository.sources.set(sourceId, { kind: 'manual', sessionCampaignId: null });
    expect(capture(() => service.create({ ...sessionNote, sourceId })).code).toBe(
      'NOTE_SOURCE_KIND_MISMATCH',
    );
    expect(
      capture(() =>
        service.list(
          notePageRequestSchema.parse({
            campaignId,
            filters: { entityId: foreignEntity, archived: false },
          }),
        ),
      ).code,
    ).toBe('ENTITY_NOT_FOUND');
  });
});

class MemoryRepository implements NoteRepositoryPort {
  public readonly sources = new Map<string, NoteSourceContext>();
  private records: NoteDetails[];

  public constructor(records: NoteDetails[] = []) {
    this.records = records;
  }

  public count(): number {
    return this.records.length;
  }

  public insert(note: Note, links: NoteEntityLinkInput[]): NoteDetails {
    const details = noteDetailsSchema.parse({
      note,
      links: links.map((link) => ({ noteId: note.id, ...link })),
    });
    this.records.push(details);
    return details;
  }

  public findById(campaign: string, id: string): NoteDetails | null {
    return (
      this.records.find((item) => item.note.campaignId === campaign && item.note.id === id) ?? null
    );
  }

  public findSourceContext(id: string): NoteSourceContext | null {
    return this.sources.get(id) ?? null;
  }

  public list(request: NotePageRequest): NotePageResult {
    const items = this.records
      .filter((item) => item.note.campaignId === request.campaignId)
      .map((item) => item.note);
    return { items, nextCursor: null, total: items.length };
  }

  public update(input: NoteRepositoryUpdate, updatedAt: string): NoteDetails {
    const current = this.findById(input.campaignId, input.id);
    if (current === null) throw new Error('Registro ausente.');
    if (current.note.revision !== input.revision) throw new Error('Conflito não interceptado.');
    const updated = noteDetailsSchema.parse({
      note: {
        ...current.note,
        ...input.patch,
        updatedAt,
        revision: current.note.revision + 1,
      },
      links:
        input.links === undefined
          ? current.links
          : input.links.map((link) => ({ noteId: input.id, ...link })),
    });
    this.records = this.records.map((item) => (item.note.id === updated.note.id ? updated : item));
    return updated;
  }
}

function createService(repository: NoteRepositoryPort): NoteService {
  const campaigns = new Map<string, Campaign>([
    [campaignId, createCampaign(campaignId)],
    [otherCampaignId, createCampaign(otherCampaignId)],
  ]);
  const entities = new Map<string, Entity>([
    [entityA, createEntity(entityA, campaignId)],
    [entityB, createEntity(entityB, campaignId)],
    [foreignEntity, createEntity(foreignEntity, otherCampaignId)],
    [archivedEntity, createEntity(archivedEntity, campaignId, timestamp)],
  ]);
  return new NoteService({
    repository,
    campaigns: { findById: (id) => campaigns.get(id) ?? null },
    entities: {
      findById: (campaign, id) => {
        const entity = entities.get(id);
        return entity?.campaignId === campaign ? entity : null;
      },
    },
    createId: () => noteId,
    now: () => timestamp,
  });
}

function createCampaign(id: string): Campaign {
  return {
    id,
    name: id,
    systemName: null,
    concept: null,
    genre: null,
    tone: null,
    summary: null,
    imagePath: null,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    revision: 1,
  };
}

function createEntity(id: string, owner: string, archivedAt: string | null = null): Entity {
  return {
    id,
    campaignId: owner,
    entityTypeId: '10000000-0000-4000-8000-000000000001',
    name: id,
    summary: null,
    canonState: 'accepted',
    knowledgeState: 'fact',
    visibility: 'gm',
    originKind: 'manual',
    sourceId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt,
    revision: 1,
  };
}

function createDetails(noteOverrides: Partial<Note> = {}, linkedEntityId = entityA): NoteDetails {
  return noteDetailsSchema.parse({
    note: {
      id: noteId,
      campaignId,
      title: 'Original',
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
      ...noteOverrides,
    },
    links: [{ noteId, entityId: linkedEntityId, role: 'related' }],
  });
}

function capture(operation: () => unknown): AppError {
  try {
    operation();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('A operação deveria falhar.');
}
