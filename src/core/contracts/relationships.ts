import { z } from 'zod';
import { entitySchema } from './entities';
import {
  canonStates,
  knowledgeStates,
  manualNarrativeDefaults,
  nullableSourceIdSchema,
  originKinds,
  visibilityStates,
} from './narrative';
import { defaultPageLimit, maximumPageLimit, type PageResult } from './pagination';
import type { Result } from './result';

const nullableDescription = z.string().trim().min(1).max(10000).nullable();
const nullableEventId = z.uuid().nullable();

export const relationshipSchema = z
  .object({
    id: z.uuid(),
    campaignId: z.uuid(),
    relationshipTypeId: z.uuid(),
    sourceEntityId: z.uuid(),
    targetEntityId: z.uuid(),
    description: z.string().max(10000).nullable(),
    strength: z.number().nullable(),
    canonState: z.enum(canonStates),
    knowledgeState: z.enum(knowledgeStates),
    visibility: z.enum(visibilityStates),
    originKind: z.enum(originKinds),
    sourceId: nullableSourceIdSchema,
    validFromEventId: nullableEventId,
    validToEventId: nullableEventId,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    archivedAt: z.iso.datetime().nullable(),
    revision: z.number().int().positive(),
  })
  .strict();
export type Relationship = z.infer<typeof relationshipSchema>;

export const relationshipWarningSchema = z
  .object({
    code: z.literal('POSSIBLE_DUPLICATE'),
    message: z.string().min(1),
    relationshipIds: z.array(z.uuid()).min(1),
  })
  .strict();
export type RelationshipWarning = z.infer<typeof relationshipWarningSchema>;
export const relationshipMutationResultSchema = z
  .object({ relationship: relationshipSchema, warnings: z.array(relationshipWarningSchema) })
  .strict();
export type RelationshipMutationResult = z.infer<typeof relationshipMutationResultSchema>;

const editableRelationshipSchema = z.object({
  relationshipTypeId: z.uuid(),
  sourceEntityId: z.uuid(),
  targetEntityId: z.uuid(),
  description: nullableDescription,
  strength: z.number().nullable(),
  canonState: z.enum(canonStates),
  knowledgeState: z.enum(knowledgeStates),
  visibility: z.enum(visibilityStates),
  originKind: z.enum(originKinds),
  sourceId: nullableSourceIdSchema,
  validFromEventId: nullableEventId,
  validToEventId: nullableEventId,
});

export const createRelationshipInputSchema = z
  .object({
    campaignId: z.uuid(),
    relationshipTypeId: z.uuid(),
    sourceEntityId: z.uuid(),
    targetEntityId: z.uuid(),
    description: nullableDescription.default(null),
    strength: z.number().nullable().default(null),
    canonState: z.enum(canonStates).default(manualNarrativeDefaults.canonState),
    knowledgeState: z.enum(knowledgeStates).default(manualNarrativeDefaults.knowledgeState),
    visibility: z.enum(visibilityStates).default(manualNarrativeDefaults.visibility),
    originKind: z.enum(originKinds).default(manualNarrativeDefaults.originKind),
    sourceId: nullableSourceIdSchema.default(null),
    validFromEventId: nullableEventId.default(null),
    validToEventId: nullableEventId.default(null),
  })
  .strict();
export type CreateRelationshipInput = z.output<typeof createRelationshipInputSchema>;
export type CreateRelationshipInputRequest = z.input<typeof createRelationshipInputSchema>;

export const relationshipPatchSchema = editableRelationshipSchema
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'Informe ao menos uma alteração.');
export type RelationshipPatch = z.infer<typeof relationshipPatchSchema>;
export const updateRelationshipInputSchema = z
  .object({
    campaignId: z.uuid(),
    id: z.uuid(),
    revision: z.number().int().positive(),
    patch: relationshipPatchSchema,
  })
  .strict();
export type UpdateRelationshipInput = z.infer<typeof updateRelationshipInputSchema>;
export const getRelationshipInputSchema = z.object({ campaignId: z.uuid(), id: z.uuid() }).strict();
export type GetRelationshipInput = z.infer<typeof getRelationshipInputSchema>;
export const relationshipLifecycleInputSchema = z
  .object({ campaignId: z.uuid(), id: z.uuid(), revision: z.number().int().positive() })
  .strict();
export type RelationshipLifecycleInput = z.infer<typeof relationshipLifecycleInputSchema>;

export const relationshipPageRequestSchema = z
  .object({
    campaignId: z.uuid(),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.number().int().positive().max(maximumPageLimit).default(defaultPageLimit),
    filters: z
      .object({
        relationshipTypeId: z.uuid().optional(),
        entityId: z.uuid().optional(),
        canonState: z.enum(canonStates).optional(),
        knowledgeState: z.enum(knowledgeStates).optional(),
        visibility: z.enum(visibilityStates).optional(),
        archived: z.boolean().default(false),
      })
      .strict()
      .default({ archived: false }),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();
export type RelationshipPageRequest = z.infer<typeof relationshipPageRequestSchema>;
export type RelationshipPageRequestInput = z.input<typeof relationshipPageRequestSchema>;
export type RelationshipPageResult = PageResult<Relationship>;
export const relationshipPageResultSchema = z
  .object({
    items: z.array(relationshipSchema),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative().optional(),
  })
  .strict();

export const relationshipNeighborhoodInputSchema = z
  .object({
    campaignId: z.uuid(),
    entityId: z.uuid(),
    depth: z.number().int().min(1).max(3).default(1),
    maxEntities: z.number().int().positive().max(250).default(100),
    maxRelationships: z.number().int().positive().max(500).default(200),
    filters: z
      .object({
        relationshipTypeIds: z.array(z.uuid()).max(100).default([]),
        canonStates: z.array(z.enum(canonStates)).max(canonStates.length).default([]),
        knowledgeStates: z.array(z.enum(knowledgeStates)).max(knowledgeStates.length).default([]),
        visibilities: z.array(z.enum(visibilityStates)).max(visibilityStates.length).default([]),
      })
      .strict()
      .default({
        relationshipTypeIds: [],
        canonStates: [],
        knowledgeStates: [],
        visibilities: [],
      }),
  })
  .strict();
export type RelationshipNeighborhoodInput = z.output<typeof relationshipNeighborhoodInputSchema>;
export type RelationshipNeighborhoodInputRequest = z.input<
  typeof relationshipNeighborhoodInputSchema
>;

export const relationshipNeighborhoodNodeSchema = z
  .object({
    entity: entitySchema,
    depth: z.number().int().min(0).max(3),
    pathEntityIds: z.array(z.uuid()).min(1).max(4),
    viaRelationshipId: z.uuid().nullable(),
  })
  .strict();
export type RelationshipNeighborhoodNode = z.infer<typeof relationshipNeighborhoodNodeSchema>;

export const relationshipNeighborhoodResultSchema = z
  .object({
    rootEntityId: z.uuid(),
    nodes: z.array(relationshipNeighborhoodNodeSchema),
    relationships: z.array(relationshipSchema),
    truncated: z.boolean(),
  })
  .strict();
export type RelationshipNeighborhoodResult = z.infer<typeof relationshipNeighborhoodResultSchema>;

export interface RelationshipGateway {
  create(input: CreateRelationshipInputRequest): Promise<Result<RelationshipMutationResult>>;
  get(input: GetRelationshipInput): Promise<Result<Relationship>>;
  list(input: RelationshipPageRequestInput): Promise<Result<RelationshipPageResult>>;
  update(input: UpdateRelationshipInput): Promise<Result<RelationshipMutationResult>>;
  archive(input: RelationshipLifecycleInput): Promise<Result<Relationship>>;
  restore(input: RelationshipLifecycleInput): Promise<Result<Relationship>>;
  neighborhood(
    input: RelationshipNeighborhoodInputRequest,
  ): Promise<Result<RelationshipNeighborhoodResult>>;
}
