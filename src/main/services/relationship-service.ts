import { randomUUID } from 'node:crypto';
import type { Entity } from '../../core/contracts/entities';
import type { RelationshipType } from '../../core/contracts/relationship-types';
import type {
  CreateRelationshipInput,
  Relationship,
  RelationshipLifecycleInput,
  RelationshipMutationResult,
  RelationshipNeighborhoodInput,
  RelationshipNeighborhoodResult,
  RelationshipPageRequest,
  RelationshipPageResult,
  RelationshipPatch,
  UpdateRelationshipInput,
} from '../../core/contracts/relationships';
import { AppError } from '../../core/errors/app-error';
import type { RelationshipRepositoryUpdate } from '../../db/repositories/relationship-repository';
import type { AdjacentRelationshipQuery } from '../../db/repositories/relationship-repository';

export interface RelationshipRepositoryPort {
  insert(relationship: Relationship): Relationship;
  findById(campaignId: string, id: string): Relationship | null;
  findActiveEquivalent(
    campaignId: string,
    relationshipTypeId: string,
    sourceEntityId: string,
    targetEntityId: string,
    exceptId?: string,
  ): Relationship[];
  list(request: RelationshipPageRequest): RelationshipPageResult;
  listActiveAdjacent(query: AdjacentRelationshipQuery): Relationship[];
  update(input: RelationshipRepositoryUpdate, updatedAt: string): Relationship;
}
export interface RelationshipTypeLookupPort {
  findById(campaignId: string, id: string): RelationshipType | null;
}
export interface RelationshipEntityLookupPort {
  findById(campaignId: string, id: string): Entity | null;
}

export class RelationshipService {
  private readonly createId: () => string;
  private readonly now: () => string;
  public constructor(
    private readonly dependencies: {
      repository: RelationshipRepositoryPort;
      relationshipTypes: RelationshipTypeLookupPort;
      entities: RelationshipEntityLookupPort;
      createId?: () => string;
      now?: () => string;
    },
  ) {
    this.createId = dependencies.createId ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  public create(input: CreateRelationshipInput): RelationshipMutationResult {
    const normalized = this.validateAndNormalize(input.campaignId, input);
    const timestamp = this.now();
    const relationship = this.dependencies.repository.insert({
      id: this.createId(),
      campaignId: input.campaignId,
      ...normalized,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      revision: 1,
    });
    return { relationship, warnings: this.duplicateWarnings(relationship) };
  }

  public get(input: { campaignId: string; id: string }): Relationship {
    return this.requireRelationship(input.campaignId, input.id);
  }
  public list(input: RelationshipPageRequest): RelationshipPageResult {
    if (input.filters.relationshipTypeId !== undefined)
      this.requireRelationshipType(input.campaignId, input.filters.relationshipTypeId);
    if (input.filters.entityId !== undefined)
      this.requireEntity(input.campaignId, input.filters.entityId);
    return this.dependencies.repository.list(input);
  }

  public neighborhood(input: RelationshipNeighborhoodInput): RelationshipNeighborhoodResult {
    const root = this.requireEntity(input.campaignId, input.entityId);
    for (const relationshipTypeId of input.filters.relationshipTypeIds)
      this.requireRelationshipType(input.campaignId, relationshipTypeId);

    const nodes = new Map<string, RelationshipNeighborhoodResult['nodes'][number]>([
      [root.id, { entity: root, depth: 0, pathEntityIds: [root.id], viaRelationshipId: null }],
    ]);
    const foundRelationships = new Map<string, Relationship>();
    let frontier = [root.id];
    let truncated = false;

    for (let depth = 1; depth <= input.depth && frontier.length > 0; depth += 1) {
      const adjacent = this.dependencies.repository.listActiveAdjacent({
        campaignId: input.campaignId,
        entityIds: frontier,
        ...input.filters,
      });
      const frontierSet = new Set(frontier);
      const nextFrontier: string[] = [];
      for (const relationship of adjacent) {
        const fromId = frontierSet.has(relationship.sourceEntityId)
          ? relationship.sourceEntityId
          : relationship.targetEntityId;
        const nextId =
          fromId === relationship.sourceEntityId
            ? relationship.targetEntityId
            : relationship.sourceEntityId;
        const nextKnown = nodes.has(nextId);
        if (!nextKnown && nodes.size >= input.maxEntities) {
          truncated = true;
          continue;
        }
        if (!foundRelationships.has(relationship.id)) {
          if (foundRelationships.size >= input.maxRelationships) {
            truncated = true;
            continue;
          }
          foundRelationships.set(relationship.id, relationship);
        }
        if (nextKnown) continue;
        const entity = this.requireEntity(input.campaignId, nextId);
        const parent = nodes.get(fromId);
        if (parent === undefined) continue;
        nodes.set(nextId, {
          entity,
          depth,
          pathEntityIds: [...parent.pathEntityIds, nextId],
          viaRelationshipId: relationship.id,
        });
        nextFrontier.push(nextId);
      }
      frontier = nextFrontier;
    }

    const neighborhoodEntityIds = [...nodes.keys()];
    const neighborhoodEntityIdSet = new Set(neighborhoodEntityIds);
    const closingRelationships = this.dependencies.repository.listActiveAdjacent({
      campaignId: input.campaignId,
      entityIds: neighborhoodEntityIds,
      ...input.filters,
    });
    for (const relationship of closingRelationships) {
      if (
        !neighborhoodEntityIdSet.has(relationship.sourceEntityId) ||
        !neighborhoodEntityIdSet.has(relationship.targetEntityId) ||
        foundRelationships.has(relationship.id)
      )
        continue;
      if (foundRelationships.size >= input.maxRelationships) {
        truncated = true;
        continue;
      }
      foundRelationships.set(relationship.id, relationship);
    }

    return {
      rootEntityId: root.id,
      nodes: [...nodes.values()],
      relationships: [...foundRelationships.values()],
      truncated,
    };
  }
  public update(input: UpdateRelationshipInput): RelationshipMutationResult {
    const current = this.requireRelationship(input.campaignId, input.id);
    this.requireRevision(current, input.revision);
    const merged = {
      relationshipTypeId: input.patch.relationshipTypeId ?? current.relationshipTypeId,
      sourceEntityId: input.patch.sourceEntityId ?? current.sourceEntityId,
      targetEntityId: input.patch.targetEntityId ?? current.targetEntityId,
      description:
        input.patch.description === undefined ? current.description : input.patch.description,
      strength: input.patch.strength === undefined ? current.strength : input.patch.strength,
      canonState: input.patch.canonState ?? current.canonState,
      knowledgeState: input.patch.knowledgeState ?? current.knowledgeState,
      visibility: input.patch.visibility ?? current.visibility,
      originKind: input.patch.originKind ?? current.originKind,
      sourceId: input.patch.sourceId === undefined ? current.sourceId : input.patch.sourceId,
      validFromEventId:
        input.patch.validFromEventId === undefined
          ? current.validFromEventId
          : input.patch.validFromEventId,
      validToEventId:
        input.patch.validToEventId === undefined
          ? current.validToEventId
          : input.patch.validToEventId,
    };
    const normalized = this.validateAndNormalize(input.campaignId, merged);
    const patch: RelationshipPatch = normalized;
    const relationship = this.dependencies.repository.update({ ...input, patch }, this.now());
    return { relationship, warnings: this.duplicateWarnings(relationship, relationship.id) };
  }
  public archive(input: RelationshipLifecycleInput): Relationship {
    const current = this.requireRelationship(input.campaignId, input.id);
    this.requireRevision(current, input.revision);
    if (current.archivedAt !== null)
      throw new AppError('INVALID_RELATIONSHIP_STATE', 'A relação já está arquivada.');
    return this.dependencies.repository.update(
      { ...input, patch: { archivedAt: this.now() } },
      this.now(),
    );
  }
  public restore(input: RelationshipLifecycleInput): Relationship {
    const current = this.requireRelationship(input.campaignId, input.id);
    this.requireRevision(current, input.revision);
    if (current.archivedAt === null)
      throw new AppError('INVALID_RELATIONSHIP_STATE', 'A relação já está ativa.');
    const normalized = this.validateAndNormalize(input.campaignId, current);
    return this.dependencies.repository.update(
      {
        ...input,
        patch: {
          archivedAt: null,
          sourceEntityId: normalized.sourceEntityId,
          targetEntityId: normalized.targetEntityId,
        },
      },
      this.now(),
    );
  }

  private validateAndNormalize(
    campaignId: string,
    value: Pick<
      Relationship,
      | 'relationshipTypeId'
      | 'sourceEntityId'
      | 'targetEntityId'
      | 'description'
      | 'strength'
      | 'canonState'
      | 'knowledgeState'
      | 'visibility'
      | 'originKind'
      | 'sourceId'
      | 'validFromEventId'
      | 'validToEventId'
    >,
  ) {
    const type = this.requireRelationshipType(campaignId, value.relationshipTypeId);
    if (type.isArchived)
      throw new AppError(
        'INVALID_RELATIONSHIP_TYPE_STATE',
        'Não é possível usar um tipo de relação arquivado.',
        { id: type.id },
      );
    let source = this.requireActiveEntity(campaignId, value.sourceEntityId);
    let target = this.requireActiveEntity(campaignId, value.targetEntityId);
    if (type.isSymmetric && source.id.localeCompare(target.id) > 0)
      [source, target] = [target, source];
    this.requireAllowed(type.allowedSourceTypeIds, source, 'origem');
    this.requireAllowed(type.allowedTargetTypeIds, target, 'destino');
    return { ...value, sourceEntityId: source.id, targetEntityId: target.id };
  }
  private requireAllowed(allowedIds: string[] | null, entity: Entity, role: string): void {
    if (allowedIds !== null && !allowedIds.includes(entity.entityTypeId))
      throw new AppError(
        'RELATIONSHIP_ENTITY_TYPE_NOT_ALLOWED',
        `O tipo da entidade de ${role} não é permitido por este tipo de relação.`,
        { entityId: entity.id, entityTypeId: entity.entityTypeId, role },
      );
  }
  private duplicateWarnings(value: Relationship, exceptId?: string) {
    const duplicates = this.dependencies.repository.findActiveEquivalent(
      value.campaignId,
      value.relationshipTypeId,
      value.sourceEntityId,
      value.targetEntityId,
      exceptId ?? value.id,
    );
    return duplicates.length === 0
      ? []
      : [
          {
            code: 'POSSIBLE_DUPLICATE' as const,
            message: 'Já existe uma relação ativa com o mesmo tipo, origem e destino.',
            relationshipIds: duplicates.map((item) => item.id),
          },
        ];
  }
  private requireRelationshipType(campaignId: string, id: string): RelationshipType {
    const value = this.dependencies.relationshipTypes.findById(campaignId, id);
    if (value === null)
      throw new AppError('RELATIONSHIP_TYPE_NOT_FOUND', 'O tipo de relação não foi encontrado.', {
        campaignId,
        id,
      });
    return value;
  }
  private requireEntity(campaignId: string, id: string): Entity {
    const value = this.dependencies.entities.findById(campaignId, id);
    if (value === null)
      throw new AppError('ENTITY_NOT_FOUND', 'A entidade não foi encontrada.', { campaignId, id });
    return value;
  }
  private requireActiveEntity(campaignId: string, id: string): Entity {
    const value = this.requireEntity(campaignId, id);
    if (value.archivedAt !== null)
      throw new AppError(
        'INVALID_ENTITY_STATE',
        'Não é possível relacionar uma entidade arquivada.',
        { id },
      );
    return value;
  }
  private requireRelationship(campaignId: string, id: string): Relationship {
    const value = this.dependencies.repository.findById(campaignId, id);
    if (value === null)
      throw new AppError('RELATIONSHIP_NOT_FOUND', 'A relação não foi encontrada.', {
        campaignId,
        id,
      });
    return value;
  }
  private requireRevision(value: Relationship, revision: number): void {
    if (value.revision !== revision)
      throw new AppError('REVISION_CONFLICT', 'A relação foi alterada em outra operação.', {
        expectedRevision: revision,
        currentRevision: value.revision,
        current: value,
      });
  }
}
