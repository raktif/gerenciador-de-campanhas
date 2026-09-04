import { randomUUID } from 'node:crypto';
import type { Campaign } from '../../core/contracts/campaigns';
import type { Entity } from '../../core/contracts/entities';
import type {
  CreateNoteInput,
  GetNoteInput,
  Note,
  NoteDetails,
  NoteEntityLinkInput,
  NoteLifecycleInput,
  NotePageRequest,
  NotePageResult,
  UpdateNoteInput,
} from '../../core/contracts/notes';
import { AppError } from '../../core/errors/app-error';
import type {
  NoteRepositoryUpdate,
  NoteSourceContext,
} from '../../db/repositories/note-repository';

export interface NoteRepositoryPort {
  insert(note: Note, links: NoteEntityLinkInput[]): NoteDetails;
  findById(campaignId: string, id: string): NoteDetails | null;
  findSourceContext(id: string): NoteSourceContext | null;
  list(request: NotePageRequest): NotePageResult;
  update(input: NoteRepositoryUpdate, updatedAt: string): NoteDetails;
}

export interface NoteEntityLookupPort {
  findById(campaignId: string, id: string): Entity | null;
}

export interface CampaignLookupPort {
  findById(id: string): Campaign | null;
}

export class NoteService {
  private readonly createId: () => string;
  private readonly now: () => string;

  public constructor(
    private readonly dependencies: {
      repository: NoteRepositoryPort;
      campaigns: CampaignLookupPort;
      entities: NoteEntityLookupPort;
      createId?: () => string;
      now?: () => string;
    },
  ) {
    this.createId = dependencies.createId ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  public create(input: CreateNoteInput): NoteDetails {
    this.requireCampaign(input.campaignId);
    const { links: linksInput, ...noteInput } = input;
    const links = this.normalizeLinks(linksInput);
    this.validateLinks(input.campaignId, links, true);
    this.validateSource(input.campaignId, input.originKind, input.sourceId);
    const timestamp = this.now();
    return this.dependencies.repository.insert(
      {
        id: this.createId(),
        ...noteInput,
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: null,
        revision: 1,
      },
      links,
    );
  }

  public get(input: GetNoteInput): NoteDetails {
    return this.requireNote(input.campaignId, input.id);
  }

  public list(input: NotePageRequest): NotePageResult {
    this.requireCampaign(input.campaignId);
    if (input.filters.entityId !== undefined)
      this.requireEntity(input.campaignId, input.filters.entityId);
    return this.dependencies.repository.list(input);
  }

  public update(input: UpdateNoteInput): NoteDetails {
    const current = this.requireNote(input.campaignId, input.id);
    this.requireRevision(current.note, input.revision);
    const patch = input.patch ?? {};
    const originKind = patch.originKind ?? current.note.originKind;
    const sourceId = patch.sourceId === undefined ? current.note.sourceId : patch.sourceId;
    this.validateSource(input.campaignId, originKind, sourceId);
    const links = input.links === undefined ? undefined : this.normalizeLinks(input.links);
    if (links !== undefined) this.validateLinks(input.campaignId, links, true);
    return this.dependencies.repository.update(
      {
        campaignId: input.campaignId,
        id: input.id,
        revision: input.revision,
        patch,
        ...(links === undefined ? {} : { links }),
      },
      this.now(),
    );
  }

  public archive(input: NoteLifecycleInput): NoteDetails {
    const current = this.requireNote(input.campaignId, input.id);
    this.requireRevision(current.note, input.revision);
    if (current.note.archivedAt !== null)
      throw new AppError('INVALID_NOTE_STATE', 'A nota já está arquivada.');
    const timestamp = this.now();
    return this.dependencies.repository.update(
      { ...input, patch: { archivedAt: timestamp } },
      timestamp,
    );
  }

  public restore(input: NoteLifecycleInput): NoteDetails {
    const current = this.requireNote(input.campaignId, input.id);
    this.requireRevision(current.note, input.revision);
    if (current.note.archivedAt === null)
      throw new AppError('INVALID_NOTE_STATE', 'A nota já está ativa.');
    this.validateLinks(
      input.campaignId,
      current.links.map(({ entityId, role }) => ({ entityId, role })),
      true,
    );
    this.validateSource(input.campaignId, current.note.originKind, current.note.sourceId);
    return this.dependencies.repository.update(
      { ...input, patch: { archivedAt: null } },
      this.now(),
    );
  }

  private normalizeLinks(links: NoteEntityLinkInput[]): NoteEntityLinkInput[] {
    const normalized = links
      .map((link) => ({ entityId: link.entityId, role: link.role.trim() }))
      .sort((left, right) =>
        left.entityId === right.entityId
          ? left.role.localeCompare(right.role)
          : left.entityId.localeCompare(right.entityId),
      );
    const seen = new Set<string>();
    for (const link of normalized) {
      if (link.role.length < 1 || link.role.length > 100)
        throw new AppError(
          'INVALID_NOTE_ENTITY_LINK_ROLE',
          'O papel do vínculo deve ter entre 1 e 100 caracteres.',
          { entityId: link.entityId },
        );
      const key = `${link.entityId}\u0000${link.role}`;
      if (seen.has(key))
        throw new AppError(
          'DUPLICATE_NOTE_ENTITY_LINK',
          'O mesmo vínculo e papel não podem ser informados mais de uma vez.',
          { entityId: link.entityId, role: link.role },
        );
      seen.add(key);
    }
    return normalized;
  }

  private validateLinks(
    campaignId: string,
    links: NoteEntityLinkInput[],
    requireActive: boolean,
  ): void {
    for (const link of links) {
      const entity = this.requireEntity(campaignId, link.entityId);
      if (requireActive && entity.archivedAt !== null)
        throw new AppError('INVALID_ENTITY_STATE', 'A entidade vinculada à nota está arquivada.', {
          entityId: entity.id,
          role: link.role,
        });
    }
  }

  private validateSource(
    campaignId: string,
    originKind: Note['originKind'],
    sourceId: string | null,
  ): void {
    if (sourceId === null) {
      if (originKind === 'manual') return;
      throw new AppError(
        'NOTE_SOURCE_REQUIRED',
        'A origem informada exige uma fonte correspondente.',
        {
          originKind,
        },
      );
    }
    const source = this.dependencies.repository.findSourceContext(sourceId);
    if (source === null)
      throw new AppError('SOURCE_NOT_FOUND', 'A fonte da nota não foi encontrada.', { sourceId });
    if (source.kind !== originKind)
      throw new AppError('NOTE_SOURCE_KIND_MISMATCH', 'A fonte não corresponde à origem da nota.', {
        originKind,
        sourceKind: source.kind,
        sourceId,
      });
    if (source.kind === 'session' && source.sessionCampaignId !== campaignId)
      throw new AppError(
        'NOTE_SOURCE_CAMPAIGN_MISMATCH',
        'A fonte de sessão não pertence à campanha da nota.',
        { campaignId, sourceId },
      );
  }

  private requireNote(campaignId: string, id: string): NoteDetails {
    const details = this.dependencies.repository.findById(campaignId, id);
    if (details === null)
      throw new AppError('NOTE_NOT_FOUND', 'A nota não foi encontrada.', { campaignId, id });
    return details;
  }

  private requireCampaign(campaignId: string): Campaign {
    const campaign = this.dependencies.campaigns.findById(campaignId);
    if (campaign === null)
      throw new AppError('CAMPAIGN_NOT_FOUND', 'A campanha não foi encontrada.', { campaignId });
    return campaign;
  }

  private requireEntity(campaignId: string, id: string): Entity {
    const entity = this.dependencies.entities.findById(campaignId, id);
    if (entity === null)
      throw new AppError('ENTITY_NOT_FOUND', 'A entidade vinculada à nota não foi encontrada.', {
        campaignId,
        id,
      });
    return entity;
  }

  private requireRevision(note: Note, revision: number): void {
    if (note.revision !== revision)
      throw new AppError('REVISION_CONFLICT', 'A nota foi alterada em outra operação.', {
        expectedRevision: revision,
        currentRevision: note.revision,
        current: note,
      });
  }
}
