import { randomUUID } from 'node:crypto';
import type { Campaign } from '../../core/contracts/campaigns';
import type {
  Assertion,
  AssertionLifecycleInput,
  AssertionPageRequest,
  AssertionPageResult,
  CreateAssertionInput,
  GetAssertionInput,
  UpdateAssertionInput,
} from '../../core/contracts/assertions';
import type { Entity } from '../../core/contracts/entities';
import { AppError } from '../../core/errors/app-error';
import type {
  AssertionRepositoryUpdate,
  AssertionSourceContext,
} from '../../db/repositories/assertion-repository';

export interface AssertionRepositoryPort {
  insert(assertion: Assertion): Assertion;
  findById(campaignId: string, id: string): Assertion | null;
  findSourceContext(id: string): AssertionSourceContext | null;
  list(request: AssertionPageRequest): AssertionPageResult;
  update(input: AssertionRepositoryUpdate, updatedAt: string): Assertion;
}

export interface AssertionEntityLookupPort {
  findById(campaignId: string, id: string): Entity | null;
}

export interface AssertionCampaignLookupPort {
  findById(id: string): Campaign | null;
}

export class AssertionService {
  private readonly createId: () => string;
  private readonly now: () => string;

  public constructor(
    private readonly dependencies: {
      repository: AssertionRepositoryPort;
      campaigns: AssertionCampaignLookupPort;
      entities: AssertionEntityLookupPort;
      createId?: () => string;
      now?: () => string;
    },
  ) {
    this.createId = dependencies.createId ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  public create(input: CreateAssertionInput): Assertion {
    this.requireCampaign(input.campaignId);
    this.validateEntities(input.campaignId, input.subjectEntityId, input.objectEntityId, true);
    this.validateContent(input);
    this.validateSource(input.campaignId, input.originKind, input.sourceId);
    const timestamp = this.now();
    return this.dependencies.repository.insert({
      id: this.createId(),
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      revision: 1,
    });
  }

  public get(input: GetAssertionInput): Assertion {
    return this.requireAssertion(input.campaignId, input.id);
  }

  public list(input: AssertionPageRequest): AssertionPageResult {
    this.requireCampaign(input.campaignId);
    if (input.filters.entityId !== undefined)
      this.requireEntity(input.campaignId, input.filters.entityId);
    return this.dependencies.repository.list(input);
  }

  public update(input: UpdateAssertionInput): Assertion {
    const current = this.requireAssertion(input.campaignId, input.id);
    this.requireRevision(current, input.revision);
    const updatedContent = {
      subjectEntityId: input.patch.subjectEntityId ?? current.subjectEntityId,
      predicate: input.patch.predicate === undefined ? current.predicate : input.patch.predicate,
      objectEntityId:
        input.patch.objectEntityId === undefined
          ? current.objectEntityId
          : input.patch.objectEntityId,
      statement: input.patch.statement === undefined ? current.statement : input.patch.statement,
      value: input.patch.value === undefined ? current.value : input.patch.value,
      originKind: input.patch.originKind ?? current.originKind,
      sourceId: input.patch.sourceId === undefined ? current.sourceId : input.patch.sourceId,
    };
    this.validateEntities(
      input.campaignId,
      updatedContent.subjectEntityId,
      updatedContent.objectEntityId,
      true,
    );
    this.validateContent(updatedContent);
    this.validateSource(input.campaignId, updatedContent.originKind, updatedContent.sourceId);
    return this.dependencies.repository.update(input, this.now());
  }

  public archive(input: AssertionLifecycleInput): Assertion {
    const current = this.requireAssertion(input.campaignId, input.id);
    this.requireRevision(current, input.revision);
    if (current.archivedAt !== null)
      throw new AppError('INVALID_ASSERTION_STATE', 'A afirmação já está arquivada.');
    const timestamp = this.now();
    return this.dependencies.repository.update(
      { ...input, patch: { archivedAt: timestamp } },
      timestamp,
    );
  }

  public restore(input: AssertionLifecycleInput): Assertion {
    const current = this.requireAssertion(input.campaignId, input.id);
    this.requireRevision(current, input.revision);
    if (current.archivedAt === null)
      throw new AppError('INVALID_ASSERTION_STATE', 'A afirmação já está ativa.');
    this.validateEntities(input.campaignId, current.subjectEntityId, current.objectEntityId, true);
    this.validateContent(current);
    this.validateSource(input.campaignId, current.originKind, current.sourceId);
    return this.dependencies.repository.update(
      { ...input, patch: { archivedAt: null } },
      this.now(),
    );
  }

  private validateEntities(
    campaignId: string,
    subjectEntityId: string,
    objectEntityId: string | null,
    requireActive: boolean,
  ): void {
    const subject = this.requireEntity(campaignId, subjectEntityId);
    if (requireActive) this.requireActiveEntity(subject, 'sujeito');
    if (objectEntityId === null) return;
    const object = this.requireEntity(campaignId, objectEntityId);
    if (requireActive) this.requireActiveEntity(object, 'objeto');
  }

  private validateContent(content: {
    predicate: string | null;
    objectEntityId: string | null;
    statement: string | null;
    value: unknown;
  }): void {
    if (
      content.statement !== null ||
      (content.predicate !== null && (content.objectEntityId !== null || content.value !== null))
    )
      return;
    throw new AppError(
      'INVALID_ASSERTION_CONTENT',
      'Informe uma declaração textual ou um predicado acompanhado de objeto ou valor.',
    );
  }

  private validateSource(
    campaignId: string,
    originKind: Assertion['originKind'],
    sourceId: string | null,
  ): void {
    if (sourceId === null) {
      if (originKind === 'manual') return;
      throw new AppError(
        'ASSERTION_SOURCE_REQUIRED',
        'A origem informada exige uma fonte correspondente.',
        { originKind },
      );
    }
    const source = this.dependencies.repository.findSourceContext(sourceId);
    if (source === null)
      throw new AppError('SOURCE_NOT_FOUND', 'A fonte da afirmação não foi encontrada.', {
        sourceId,
      });
    if (source.kind !== originKind)
      throw new AppError(
        'ASSERTION_SOURCE_KIND_MISMATCH',
        'A fonte não corresponde à origem da afirmação.',
        { originKind, sourceKind: source.kind, sourceId },
      );
    if (source.kind === 'session' && source.sessionCampaignId !== campaignId)
      throw new AppError(
        'ASSERTION_SOURCE_CAMPAIGN_MISMATCH',
        'A fonte de sessão não pertence à campanha da afirmação.',
        { campaignId, sourceId },
      );
  }

  private requireAssertion(campaignId: string, id: string): Assertion {
    const assertion = this.dependencies.repository.findById(campaignId, id);
    if (assertion === null)
      throw new AppError('ASSERTION_NOT_FOUND', 'A afirmação não foi encontrada.', {
        campaignId,
        id,
      });
    return assertion;
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
      throw new AppError('ENTITY_NOT_FOUND', 'A entidade da afirmação não foi encontrada.', {
        campaignId,
        id,
      });
    return entity;
  }

  private requireActiveEntity(entity: Entity, role: 'sujeito' | 'objeto'): void {
    if (entity.archivedAt !== null)
      throw new AppError('INVALID_ENTITY_STATE', `A entidade usada como ${role} está arquivada.`, {
        entityId: entity.id,
        role,
      });
  }

  private requireRevision(assertion: Assertion, revision: number): void {
    if (assertion.revision !== revision)
      throw new AppError('REVISION_CONFLICT', 'A afirmação foi alterada em outra operação.', {
        expectedRevision: revision,
        currentRevision: assertion.revision,
        current: assertion,
      });
  }
}
