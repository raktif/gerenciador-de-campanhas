import { z } from 'zod';
import { relativePlacements } from '../ordering/move-relative';
import { defaultPageLimit, maximumPageLimit, type PageResult } from './pagination';
import type { Result } from './result';
import { nullableHexColorSchema } from './colors';

const nameSchema = z.string().trim().min(1).max(120);
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use letras minúsculas, números e hífens simples.');
const nullableNameSchema = nameSchema.nullable();
const nullableDescriptionSchema = z.string().trim().min(1).max(2000).nullable();
const nullableSemanticRoleSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9_]*$/, 'Use letras minúsculas, números e sublinhados.')
  .nullable();
const nullableIconSchema = z.string().trim().min(1).max(120).nullable();
const allowedEntityTypeIdsSchema = z
  .array(z.uuid())
  .min(1)
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length, 'Não repita tipos de entidade.')
  .nullable();

export const relationshipTypeSchema = z
  .object({
    id: z.uuid(),
    campaignId: z.uuid(),
    packId: z.string().min(1).max(200).nullable(),
    name: nameSchema,
    slug: slugSchema,
    inverseName: z.string().max(120).nullable(),
    description: z.string().max(2000).nullable(),
    semanticRole: z.string().max(100).nullable(),
    isSymmetric: z.boolean(),
    allowedSourceTypeIds: z.array(z.uuid()).nullable(),
    allowedTargetTypeIds: z.array(z.uuid()).nullable(),
    icon: z.string().max(120).nullable(),
    color: z.string().max(64).nullable(),
    sortOrder: z.number().int().nonnegative(),
    isArchived: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    revision: z.number().int().positive(),
  })
  .strict();
export type RelationshipType = z.infer<typeof relationshipTypeSchema>;

export const createRelationshipTypeInputSchema = z
  .object({
    campaignId: z.uuid(),
    name: nameSchema,
    slug: slugSchema,
    inverseName: nullableNameSchema.default(null),
    description: nullableDescriptionSchema.default(null),
    semanticRole: nullableSemanticRoleSchema.default(null),
    isSymmetric: z.boolean().default(false),
    allowedSourceTypeIds: allowedEntityTypeIdsSchema.default(null),
    allowedTargetTypeIds: allowedEntityTypeIdsSchema.default(null),
    icon: nullableIconSchema.default(null),
    color: nullableHexColorSchema.default(null),
  })
  .strict()
  .transform((input) => ({ ...input, sortOrder: 0 }));
export type CreateRelationshipTypeInput = z.output<typeof createRelationshipTypeInputSchema>;
export type CreateRelationshipTypeInputRequest = z.input<typeof createRelationshipTypeInputSchema>;

export const relationshipTypePatchSchema = z
  .object({
    name: nameSchema.optional(),
    slug: slugSchema.optional(),
    inverseName: nullableNameSchema.optional(),
    description: nullableDescriptionSchema.optional(),
    semanticRole: nullableSemanticRoleSchema.optional(),
    isSymmetric: z.boolean().optional(),
    allowedSourceTypeIds: allowedEntityTypeIdsSchema.optional(),
    allowedTargetTypeIds: allowedEntityTypeIdsSchema.optional(),
    icon: nullableIconSchema.optional(),
    color: nullableHexColorSchema.optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'Informe ao menos uma alteração.');
export type RelationshipTypePatch = z.infer<typeof relationshipTypePatchSchema>;

export const updateRelationshipTypeInputSchema = z
  .object({
    campaignId: z.uuid(),
    id: z.uuid(),
    revision: z.number().int().positive(),
    patch: relationshipTypePatchSchema,
  })
  .strict();
export type UpdateRelationshipTypeInput = z.infer<typeof updateRelationshipTypeInputSchema>;

export const getRelationshipTypeInputSchema = z
  .object({ campaignId: z.uuid(), id: z.uuid() })
  .strict();
export type GetRelationshipTypeInput = z.infer<typeof getRelationshipTypeInputSchema>;

export const relationshipTypeLifecycleInputSchema = z
  .object({ campaignId: z.uuid(), id: z.uuid(), revision: z.number().int().positive() })
  .strict();
export type RelationshipTypeLifecycleInput = z.infer<typeof relationshipTypeLifecycleInputSchema>;

export const moveRelationshipTypeInputSchema = z
  .object({
    campaignId: z.uuid(),
    sourceId: z.uuid(),
    sourceRevision: z.number().int().positive(),
    targetId: z.uuid(),
    targetRevision: z.number().int().positive(),
    placement: z.enum(relativePlacements),
  })
  .strict()
  .refine((input) => input.sourceId !== input.targetId, {
    message: 'A origem e o destino devem ser diferentes.',
    path: ['targetId'],
  });
export type MoveRelationshipTypeInput = z.infer<typeof moveRelationshipTypeInputSchema>;
export const relationshipTypeOrderSchema = z.array(relationshipTypeSchema);

export const relationshipTypeSorts = ['sortOrder', 'name', 'updatedAt'] as const;
export const relationshipTypePageRequestSchema = z
  .object({
    campaignId: z.uuid(),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.number().int().positive().max(maximumPageLimit).default(defaultPageLimit),
    filters: z
      .object({ isArchived: z.boolean().default(false) })
      .strict()
      .default({ isArchived: false }),
    sort: z.enum(relationshipTypeSorts).default('sortOrder'),
    order: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();
export type RelationshipTypePageRequest = z.infer<typeof relationshipTypePageRequestSchema>;
export type RelationshipTypePageRequestInput = z.input<typeof relationshipTypePageRequestSchema>;
export type RelationshipTypePageResult = PageResult<RelationshipType>;
export const relationshipTypePageResultSchema = z
  .object({
    items: z.array(relationshipTypeSchema),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative().optional(),
  })
  .strict();

export interface RelationshipTypeGateway {
  create(input: CreateRelationshipTypeInputRequest): Promise<Result<RelationshipType>>;
  get(input: GetRelationshipTypeInput): Promise<Result<RelationshipType>>;
  list(input: RelationshipTypePageRequestInput): Promise<Result<RelationshipTypePageResult>>;
  update(input: UpdateRelationshipTypeInput): Promise<Result<RelationshipType>>;
  archive(input: RelationshipTypeLifecycleInput): Promise<Result<RelationshipType>>;
  restore(input: RelationshipTypeLifecycleInput): Promise<Result<RelationshipType>>;
  move(input: MoveRelationshipTypeInput): Promise<Result<RelationshipType[]>>;
}
