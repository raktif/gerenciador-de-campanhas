import { z } from 'zod';
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

const nullablePredicateSchema = z.string().trim().min(1).max(200).nullable();
const nullableStatementSchema = z.string().trim().min(1).max(10000).nullable();
const nullableEntityIdSchema = z.uuid().nullable();
const nullableJsonSchema = z.json().nullable();

function hasValidContent(content: {
  predicate: string | null;
  objectEntityId: string | null;
  statement: string | null;
  value: unknown;
}): boolean {
  return (
    content.statement !== null ||
    (content.predicate !== null && (content.objectEntityId !== null || content.value !== null))
  );
}

function validateContent(
  content: Parameters<typeof hasValidContent>[0],
  context: z.core.$RefinementCtx<Parameters<typeof hasValidContent>[0]>,
): void {
  if (hasValidContent(content)) return;
  context.addIssue({
    code: 'custom',
    message: 'Informe uma declaração textual ou um predicado acompanhado de objeto ou valor.',
  });
}

export const assertionSchema = z
  .object({
    id: z.uuid(),
    campaignId: z.uuid(),
    subjectEntityId: z.uuid(),
    predicate: nullablePredicateSchema,
    objectEntityId: nullableEntityIdSchema,
    statement: nullableStatementSchema,
    value: nullableJsonSchema,
    canonState: z.enum(canonStates),
    knowledgeState: z.enum(knowledgeStates),
    visibility: z.enum(visibilityStates),
    originKind: z.enum(originKinds),
    sourceId: nullableSourceIdSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    archivedAt: z.iso.datetime().nullable(),
    revision: z.number().int().positive(),
  })
  .strict()
  .superRefine(validateContent);
export type Assertion = z.infer<typeof assertionSchema>;

export const createAssertionInputSchema = z
  .object({
    campaignId: z.uuid(),
    subjectEntityId: z.uuid(),
    predicate: nullablePredicateSchema.default(null),
    objectEntityId: nullableEntityIdSchema.default(null),
    statement: nullableStatementSchema.default(null),
    value: nullableJsonSchema.default(null),
    canonState: z.enum(canonStates).default(manualNarrativeDefaults.canonState),
    knowledgeState: z.enum(knowledgeStates).default(manualNarrativeDefaults.knowledgeState),
    visibility: z.enum(visibilityStates).default(manualNarrativeDefaults.visibility),
    originKind: z.enum(originKinds).default(manualNarrativeDefaults.originKind),
    sourceId: nullableSourceIdSchema.default(null),
  })
  .strict()
  .superRefine(validateContent);
export type CreateAssertionInput = z.output<typeof createAssertionInputSchema>;
export type CreateAssertionInputRequest = z.input<typeof createAssertionInputSchema>;

export const assertionPatchSchema = z
  .object({
    subjectEntityId: z.uuid().optional(),
    predicate: nullablePredicateSchema.optional(),
    objectEntityId: nullableEntityIdSchema.optional(),
    statement: nullableStatementSchema.optional(),
    value: nullableJsonSchema.optional(),
    canonState: z.enum(canonStates).optional(),
    knowledgeState: z.enum(knowledgeStates).optional(),
    visibility: z.enum(visibilityStates).optional(),
    originKind: z.enum(originKinds).optional(),
    sourceId: nullableSourceIdSchema.optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'Informe ao menos uma alteração.');
export type AssertionPatch = z.infer<typeof assertionPatchSchema>;

export const updateAssertionInputSchema = z
  .object({
    campaignId: z.uuid(),
    id: z.uuid(),
    revision: z.number().int().positive(),
    patch: assertionPatchSchema,
  })
  .strict();
export type UpdateAssertionInput = z.infer<typeof updateAssertionInputSchema>;

export const getAssertionInputSchema = z.object({ campaignId: z.uuid(), id: z.uuid() }).strict();
export type GetAssertionInput = z.infer<typeof getAssertionInputSchema>;

export const assertionLifecycleInputSchema = z
  .object({ campaignId: z.uuid(), id: z.uuid(), revision: z.number().int().positive() })
  .strict();
export type AssertionLifecycleInput = z.infer<typeof assertionLifecycleInputSchema>;

export const assertionPageRequestSchema = z
  .object({
    campaignId: z.uuid(),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.number().int().positive().max(maximumPageLimit).default(defaultPageLimit),
    filters: z
      .object({
        entityId: z.uuid().optional(),
        canonState: z.enum(canonStates).optional(),
        knowledgeState: z.enum(knowledgeStates).optional(),
        visibility: z.enum(visibilityStates).optional(),
        originKind: z.enum(originKinds).optional(),
        archived: z.boolean().default(false),
      })
      .strict()
      .default({ archived: false }),
    sort: z.enum(['updatedAt', 'createdAt']).default('updatedAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();
export type AssertionPageRequest = z.infer<typeof assertionPageRequestSchema>;
export type AssertionPageRequestInput = z.input<typeof assertionPageRequestSchema>;
export type AssertionPageResult = PageResult<Assertion>;

export const assertionPageResultSchema = z
  .object({
    items: z.array(assertionSchema),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative().optional(),
  })
  .strict();

export interface AssertionGateway {
  create(input: CreateAssertionInputRequest): Promise<Result<Assertion>>;
  get(input: GetAssertionInput): Promise<Result<Assertion>>;
  list(input: AssertionPageRequestInput): Promise<Result<AssertionPageResult>>;
  update(input: UpdateAssertionInput): Promise<Result<Assertion>>;
  archive(input: AssertionLifecycleInput): Promise<Result<Assertion>>;
  restore(input: AssertionLifecycleInput): Promise<Result<Assertion>>;
}
