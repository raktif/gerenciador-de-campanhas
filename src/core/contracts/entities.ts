import { z } from 'zod';
import { defaultPageLimit, maximumPageLimit, type PageResult } from './pagination';
import type { Result } from './result';

export const canonStates = ['draft', 'accepted', 'rejected', 'archived'] as const;
export const knowledgeStates = [
  'fact',
  'rumor',
  'suspicion',
  'secret',
  'possibility',
  'disproved',
] as const;
export const visibilityStates = ['gm', 'players', 'public'] as const;
export const originKinds = [
  'manual',
  'session',
  'import',
  'document',
  'ruleset',
  'ai',
  'generator',
] as const;

const nullableText = z.string().trim().min(1).max(10000).nullable();
export const entitySchema = z
  .object({
    id: z.uuid(),
    campaignId: z.uuid(),
    entityTypeId: z.uuid(),
    name: z.string().trim().min(1).max(200),
    summary: z.string().max(10000).nullable(),
    canonState: z.enum(canonStates),
    knowledgeState: z.enum(knowledgeStates),
    visibility: z.enum(visibilityStates),
    originKind: z.enum(originKinds),
    sourceId: z.string().min(1).max(200).nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    archivedAt: z.iso.datetime().nullable(),
    revision: z.number().int().positive(),
  })
  .strict();
export type Entity = z.infer<typeof entitySchema>;

export const fieldValueSchema = z
  .object({
    id: z.uuid(),
    entityId: z.uuid(),
    fieldDefinitionId: z.uuid(),
    value: z.json(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    revision: z.number().int().positive(),
  })
  .strict();
export type FieldValue = z.infer<typeof fieldValueSchema>;
export const entityDetailsSchema = z
  .object({ entity: entitySchema, fieldValues: z.array(fieldValueSchema) })
  .strict();
export type EntityDetails = z.infer<typeof entityDetailsSchema>;
export const fieldValueInputSchema = z
  .object({ fieldDefinitionId: z.uuid(), value: z.json() })
  .strict();
export type FieldValueInput = z.infer<typeof fieldValueInputSchema>;

export const createEntityInputSchema = z
  .object({
    campaignId: z.uuid(),
    entityTypeId: z.uuid(),
    name: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(10000).nullable().default(null),
    canonState: z.enum(canonStates).default('accepted'),
    knowledgeState: z.enum(knowledgeStates).default('fact'),
    visibility: z.enum(visibilityStates).default('gm'),
    originKind: z.enum(originKinds).default('manual'),
    sourceId: z.string().trim().min(1).max(200).nullable().default(null),
    fieldValues: z.array(fieldValueInputSchema).default([]),
  })
  .strict();
export type CreateEntityInput = z.output<typeof createEntityInputSchema>;
export type CreateEntityInputRequest = z.input<typeof createEntityInputSchema>;

export const entityPatchSchema = z
  .object({
    entityTypeId: z.uuid().optional(),
    name: z.string().trim().min(1).max(200).optional(),
    summary: nullableText.optional(),
    canonState: z.enum(canonStates).optional(),
    knowledgeState: z.enum(knowledgeStates).optional(),
    visibility: z.enum(visibilityStates).optional(),
    originKind: z.enum(originKinds).optional(),
    sourceId: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'Informe ao menos uma alteração.');
export type EntityPatch = z.infer<typeof entityPatchSchema>;
export const updateEntityInputSchema = z
  .object({
    campaignId: z.uuid(),
    id: z.uuid(),
    revision: z.number().int().positive(),
    patch: entityPatchSchema.optional(),
    fieldValues: z.array(fieldValueInputSchema).optional(),
  })
  .strict()
  .refine(
    (input) => input.patch !== undefined || input.fieldValues !== undefined,
    'Informe ao menos uma alteração.',
  );
export type UpdateEntityInput = z.infer<typeof updateEntityInputSchema>;
export const getEntityInputSchema = z.object({ campaignId: z.uuid(), id: z.uuid() }).strict();
export type GetEntityInput = z.infer<typeof getEntityInputSchema>;
export const entityLifecycleInputSchema = z
  .object({ campaignId: z.uuid(), id: z.uuid(), revision: z.number().int().positive() })
  .strict();
export type EntityLifecycleInput = z.infer<typeof entityLifecycleInputSchema>;
export const entityPageRequestSchema = z
  .object({
    campaignId: z.uuid(),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.number().int().positive().max(maximumPageLimit).default(defaultPageLimit),
    filters: z
      .object({ entityTypeId: z.uuid().optional(), archived: z.boolean().default(false) })
      .strict()
      .default({ archived: false }),
    sort: z.enum(['name', 'updatedAt', 'createdAt']).default('name'),
    order: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();
export type EntityPageRequest = z.infer<typeof entityPageRequestSchema>;
export type EntityPageRequestInput = z.input<typeof entityPageRequestSchema>;
export type EntityPageResult = PageResult<Entity>;
export const entityPageResultSchema = z
  .object({
    items: z.array(entitySchema),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative().optional(),
  })
  .strict();

export interface EntityGateway {
  create(input: CreateEntityInputRequest): Promise<Result<EntityDetails>>;
  get(input: GetEntityInput): Promise<Result<EntityDetails>>;
  list(input: EntityPageRequestInput): Promise<Result<EntityPageResult>>;
  update(input: UpdateEntityInput): Promise<Result<EntityDetails>>;
  archive(input: EntityLifecycleInput): Promise<Result<EntityDetails>>;
  restore(input: EntityLifecycleInput): Promise<Result<EntityDetails>>;
}
