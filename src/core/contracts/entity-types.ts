import { z } from 'zod';
import { defaultPageLimit, maximumPageLimit, type PageResult } from './pagination';
import type { Result } from './result';

const nameSchema = z.string().trim().min(1).max(120);
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use letras minúsculas, números e hífens simples.');
const nullableDescriptionSchema = z.string().trim().min(1).max(2000).nullable();
const nullableIconSchema = z.string().trim().min(1).max(120).nullable();
const nullableColorSchema = z.string().trim().min(1).max(64).nullable();

export const entityTypeSchema = z
  .object({
    id: z.uuid(),
    campaignId: z.uuid(),
    packId: z.string().min(1).max(200).nullable(),
    name: nameSchema,
    singularName: nameSchema,
    slug: slugSchema,
    description: z.string().max(2000).nullable(),
    icon: z.string().max(120).nullable(),
    color: z.string().max(64).nullable(),
    sortOrder: z.number().int().nonnegative(),
    isSystem: z.boolean(),
    isArchived: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    revision: z.number().int().positive(),
  })
  .strict();
export type EntityType = z.infer<typeof entityTypeSchema>;

export const createEntityTypeInputSchema = z
  .object({
    campaignId: z.uuid(),
    name: nameSchema,
    singularName: nameSchema,
    slug: slugSchema,
    description: z.string().trim().min(1).max(2000).optional(),
    icon: z.string().trim().min(1).max(120).optional(),
    color: z.string().trim().min(1).max(64).optional(),
    sortOrder: z.number().int().nonnegative().default(0),
  })
  .strict();
export type CreateEntityTypeInput = z.infer<typeof createEntityTypeInputSchema>;
export type CreateEntityTypeInputRequest = z.input<typeof createEntityTypeInputSchema>;

export const entityTypePatchSchema = z
  .object({
    name: nameSchema.optional(),
    singularName: nameSchema.optional(),
    slug: slugSchema.optional(),
    description: nullableDescriptionSchema.optional(),
    icon: nullableIconSchema.optional(),
    color: nullableColorSchema.optional(),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'Informe ao menos uma alteração.');
export type EntityTypePatch = z.infer<typeof entityTypePatchSchema>;

export const updateEntityTypeInputSchema = z
  .object({
    campaignId: z.uuid(),
    id: z.uuid(),
    revision: z.number().int().positive(),
    patch: entityTypePatchSchema,
  })
  .strict();
export type UpdateEntityTypeInput = z.infer<typeof updateEntityTypeInputSchema>;

export const getEntityTypeInputSchema = z.object({ campaignId: z.uuid(), id: z.uuid() }).strict();
export type GetEntityTypeInput = z.infer<typeof getEntityTypeInputSchema>;

export const entityTypeLifecycleInputSchema = z
  .object({
    campaignId: z.uuid(),
    id: z.uuid(),
    revision: z.number().int().positive(),
  })
  .strict();
export type EntityTypeLifecycleInput = z.infer<typeof entityTypeLifecycleInputSchema>;

export const entityTypeSorts = ['sortOrder', 'name', 'updatedAt'] as const;

export const entityTypePageRequestSchema = z
  .object({
    campaignId: z.uuid(),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.number().int().positive().max(maximumPageLimit).default(defaultPageLimit),
    filters: z
      .object({ isArchived: z.boolean().default(false) })
      .strict()
      .default({ isArchived: false }),
    sort: z.enum(entityTypeSorts).default('sortOrder'),
    order: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();
export type EntityTypePageRequest = z.infer<typeof entityTypePageRequestSchema>;
export type EntityTypePageRequestInput = z.input<typeof entityTypePageRequestSchema>;
export const entityTypePageResultSchema = z
  .object({
    items: z.array(entityTypeSchema),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative().optional(),
  })
  .strict();
export type EntityTypePageResult = PageResult<EntityType>;

export interface EntityTypeGateway {
  create(input: CreateEntityTypeInputRequest): Promise<Result<EntityType>>;
  get(input: GetEntityTypeInput): Promise<Result<EntityType>>;
  list(input: EntityTypePageRequestInput): Promise<Result<EntityTypePageResult>>;
  update(input: UpdateEntityTypeInput): Promise<Result<EntityType>>;
  archive(input: EntityTypeLifecycleInput): Promise<Result<EntityType>>;
  restore(input: EntityTypeLifecycleInput): Promise<Result<EntityType>>;
}
