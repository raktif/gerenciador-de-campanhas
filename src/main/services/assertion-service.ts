import { randomUUID } from 'node:crypto';
import type { Campaign } from '../../core/contracts/campaigns';
import type {
  Assertion,
  AssertionLifecycleInput,
  AssertionPageRequest,
  AssertionPageResult,
  AssertionRegistryPageResult,
  CreateAssertionInput,
  GetAssertionInput,
  PromoteAssertionPossibilityInput,
  UpdateAssertionInput,
} from '../../core/contracts/assertions';
import type { Entity } from '../../core/contracts/entities';
import type { Session } from '../../core/contracts/sessions';
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

export interface AssertionSessionLookupPort {
  findById(campaignId: string, id: string): Session | null;
}

export class AssertionService {
  private readonly createId: () => string;
  private readonly now: () => string;

  public constructor(
    private readonly dependencies: {
      repository: AssertionRepositoryPort;
      campaigns: AssertionCampaignLookupPort;
      entities: AssertionEntityLookupPort;
      sessions?: AssertionSessionLookupPort;
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
    const { sessionId, ...assertionInput } = input;
    const sourceId =
      input.originKind === 'session' ? this.requireSession(input.campaignId, sessionId).id : null;
    if (input.originKind !== 'session')
      this.validateSource(input.campaignId, input.originKind, sourceId);
    const timestamp = this.now();
    return this.dependencies.repository.insert({
      id: this.createId(),
      ...assertionInput,
      sourceId,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      revision: 1,
    });
  }

  public get(input: GetAssertionInput): Assertion {
    return this.withSessionId(this.requireAssertion(input.campaignId, input.id));
  }

  public list(input: AssertionPageRequest): AssertionPageResult {
    this.requireCampaign(input.campaignId);
    if (input.filters.entityId !== undefined)
      this.requireEntity(input.campaignId, input.filters.entityId);
    const page = this.dependencies.repository.list(input);
    return { ...page, items: page.items.map((assertion) => this.withSessionId(assertion)) };
  }

  public listRegistry(input: AssertionPageRequest): AssertionRegistryPageResult {
    const page = this.list(input);
    return {
      ...page,
      items: page.items.map((assertion) => {
        const subject = this.dependencies.entities.findById(
          input.campaignId,
          assertion.subjectEntityId,
        );
        const object =
          assertion.objectEntityId === null
            ? null
            : this.dependencies.entities.findById(input.campaignId, assertion.objectEntityId);
        if (assertion.sourceId === null)
          return {
            assertion,
            subjectName: subject?.name ?? null,
            subjectArchived: subject !== null && subject.archivedAt !== null,
            objectName: object?.name ?? null,
            objectArchived: object !== null && object.archivedAt !== null,
            sourceDescription: null,
            sessionTitle: null,
          };
        const source = this.dependencies.repository.findSourceContext(assertion.sourceId);
        if (source === null)
          return {
            assertion,
            subjectName: subject?.name ?? null,
            subjectArchived: subject !== null && subject.archivedAt !== null,
            objectName: object?.name ?? null,
            objectArchived: object !== null && object.archivedAt !== null,
            sourceDescription: null,
            sessionTitle: null,
          };
        if (source.kind !== assertion.originKind)
          throw new AppError(
            'ASSERTION_SOURCE_KIND_MISMATCH',
            'A fonte não corresponde à origem da afirmação.',
            { assertionId: assertion.id, sourceId: assertion.sourceId },
          );
        if (source.kind === 'session' && source.sessionCampaignId !== input.campaignId)
          throw new AppError(
            'ASSERTION_SOURCE_CAMPAIGN_MISMATCH',
            'A fonte de sessão não pertence à campanha da afirmação.',
            { campaignId: input.campaignId, assertionId: assertion.id },
          );
        if (source.inboxCampaignId != null && source.inboxCampaignId !== input.campaignId)
          throw new AppError(
            'ASSERTION_SOURCE_CAMPAIGN_MISMATCH',
            'A fonte da afirmação não pertence à campanha solicitada.',
            { campaignId: input.campaignId, assertionId: assertion.id },
          );
        return {
          assertion,
          subjectName: subject?.name ?? null,
          subjectArchived: subject !== null && subject.archivedAt !== null,
          objectName: object?.name ?? null,
          objectArchived: object !== null && object.archivedAt !== null,
          sourceDescription: source.description ?? null,
          sessionTitle: source.kind === 'session' ? (source.sessionTitle ?? null) : null,
        };
      }),
    };
  }

  public update(input: UpdateAssertionInput): Assertion {
    const current = this.requireAssertion(input.campaignId, input.id);
    this.requireRevision(current, input.revision);
    if (current.knowledgeState === 'possibility' && input.patch.knowledgeState === 'fact')
      throw new AppError(
        'ASSERTION_PROMOTION_CONFIRMATION_REQUIRED',
        'Promova a possibilidade a fato pela ação explícita de confirmação.',
        { campaignId: input.campaignId, id: input.id },
      );
    const { sessionId, ...patch } = input.patch;
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
      sourceId: sessionId ?? current.sourceId,
    };
    this.validateEntities(
      input.campaignId,
      updatedContent.subjectEntityId,
      updatedContent.objectEntityId,
      true,
    );
    this.validateContent(updatedContent);
    if (updatedContent.originKind === 'session') {
      if (sessionId !== undefined) this.requireSession(input.campaignId, sessionId);
      else this.validateSource(input.campaignId, updatedContent.originKind, current.sourceId);
    } else this.validateSource(input.campaignId, updatedContent.originKind, null);
    return this.withSessionId(
      this.dependencies.repository.update(
        { ...input, patch, ...(sessionId === undefined ? {} : { sessionId }) },
        this.now(),
      ),
    );
  }

  public promotePossibilityToFact(input: PromoteAssertionPossibilityInput): Assertion {
    const confirmation: unknown = input.confirmation;
    if (confirmation !== 'possibility-to-fact')
      throw new AppError(
        'ASSERTION_PROMOTION_CONFIRMATION_REQUIRED',
        'A confirmação explícita da promoção é obrigatória.',
        { campaignId: input.campaignId, id: input.id },
      );
    const current = this.requireAssertion(input.campaignId, input.id);
    this.requireRevision(current, input.revision);
    if (current.knowledgeState !== 'possibility')
      throw new AppError(
        'INVALID_ASSERTION_STATE',
        'Somente uma possibilidade pode ser promovida a fato.',
        { currentKnowledgeState: current.knowledgeState },
      );
    try {
      this.validateEntities(
        input.campaignId,
        current.subjectEntityId,
        current.objectEntityId,
        true,
      );
    } catch (error) {
      if (error instanceof AppError && error.code === 'INVALID_ENTITY_STATE')
        throw new AppError(
          'ASSERTION_PROMOTION_BLOCKED_ARCHIVED_ENTITY',
          'A possibilidade não foi promovida: o assunto ou objeto está arquivado. Restaure a entidade e tente novamente.',
          error.details,
        );
      throw error;
    }
    return this.withSessionId(
      this.dependencies.repository.update(
        {
          campaignId: input.campaignId,
          id: input.id,
          revision: input.revision,
          patch: { knowledgeState: 'fact' },
        },
        this.now(),
      ),
    );
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
    if (source.inboxCampaignId != null && source.inboxCampaignId !== campaignId)
      throw new AppError(
        'ASSERTION_SOURCE_CAMPAIGN_MISMATCH',
        'A fonte da afirmação não pertence à campanha informada.',
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

  private withSessionId(assertion: Assertion): Assertion {
    if (assertion.originKind !== 'session' || assertion.sourceId === null) return assertion;
    const source = this.dependencies.repository.findSourceContext(assertion.sourceId);
    if (source?.sessionId === null || source?.sessionId === undefined) return assertion;
    return { ...assertion, sessionId: source.sessionId };
  }

  private requireSession(campaignId: string, id: string | undefined): Session {
    if (id === undefined)
      throw new AppError('SESSION_NOT_FOUND', 'A sessão não foi encontrada.', { campaignId });
    const session = this.dependencies.sessions?.findById(campaignId, id) ?? null;
    if (session === null)
      throw new AppError('SESSION_NOT_FOUND', 'A sessão não foi encontrada nesta campanha.', {
        campaignId,
        id,
      });
    return session;
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
