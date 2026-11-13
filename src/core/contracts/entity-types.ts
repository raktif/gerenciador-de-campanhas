import { z } from 'zod';
import { relativePlacements } from '../ordering/move-relative';
import { defaultPageLimit, maximumPageLimit, type PageResult } from './pagination';
import type { Result } from './result';
import { hexColorSchema, nullableHexColorSchema } from './colors';
import { iconIdSchema } from './icons';
import { createTechnicalKeyCandidate, normalizeTechnicalKeyPart } from '../identifiers/technical-key';

const nameSchema = z.string().trim().min(1).max(120);
export function entityTypeSlug(name: string): string {
  return createTechnicalKeyCandidate(normalizeTechnicalKeyPart(name, 'tipo-entidade'), 1);
}
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use letras minúsculas, números e hífens simples.');
const nullableDescriptionSchema = z.string().trim().min(1).max(2000).nullable();

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
    description: z.string().trim().min(1).max(2000).optional(),
    icon: iconIdSchema.optional(),
    color: hexColorSchema.optional(),
  })
  .strict()
  .transform((input) => ({
    ...input,
    slug: entityTypeSlug(input.name),
    sortOrder: 0,
  }));
export type CreateEntityTypeInput = z.infer<typeof createEntityTypeInputSchema>;
export type CreateEntityTypeInputRequest = z.input<typeof createEntityTypeInputSchema>;

export const entityTypePatchSchema = z
  .object({
    name: nameSchema.optional(),
    singularName: nameSchema.optional(),
    description: nullableDescriptionSchema.optional(),
    icon: iconIdSchema.nullable().optional(),
    color: nullableHexColorSchema.optional(),
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

export const moveEntityTypeInputSchema = z
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
export type MoveEntityTypeInput = z.infer<typeof moveEntityTypeInputSchema>;
export const entityTypeOrderSchema = z.array(entityTypeSchema);

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
  move(input: MoveEntityTypeInput): Promise<Result<EntityType[]>>;
}
