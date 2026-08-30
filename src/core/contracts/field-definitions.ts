import { z } from 'zod';
import { defaultPageLimit, maximumPageLimit, type PageResult } from './pagination';
import type { Result } from './result';

export const fieldDataTypes = [
  'short_text',
  'long_text',
  'number',
  'boolean',
  'date',
  'single_select',
  'multi_select',
  'entity_reference',
  'entity_reference_list',
  'progress',
  'structured',
] as const;

export const fieldSemanticRoles = [
  'name',
  'description',
  'goal',
  'need',
  'fear',
  'resource',
  'obstacle',
  'status',
  'secret',
  'location',
  'owner',
  'motivation',
  'stakes',
  'clue',
  'reward',
] as const;

export const referenceDirections = ['outgoing', 'incoming'] as const;
export const referenceDeleteBehaviors = ['restrict', 'unlink'] as const;

const keySchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use letras minúsculas, números e hífens simples.');
const labelSchema = z.string().trim().min(1).max(120);
const descriptionSchema = z.string().trim().min(1).max(2000);
const jsonValueSchema = z.json();

export const fieldDefinitionSchema = z
  .object({
    id: z.uuid(),
    entityTypeId: z.uuid(),
    key: keySchema,
    label: labelSchema,
    description: z.string().max(2000).nullable(),
    dataType: z.enum(fieldDataTypes),
    semanticRole: z.enum(fieldSemanticRoles).nullable(),
    required: z.boolean(),
    searchable: z.boolean(),
    secretByDefault: z.boolean(),
    defaultValue: jsonValueSchema.nullable(),
    options: jsonValueSchema.nullable(),
    validation: jsonValueSchema.nullable(),
    referenceRelationshipTypeId: z.uuid().nullable(),
    referenceDirection: z.enum(referenceDirections).nullable(),
    allowedTargetTypeIds: z.array(z.uuid()).nullable(),
    onDeleteBehavior: z.enum(referenceDeleteBehaviors).nullable(),
    sortOrder: z.number().int().nonnegative(),
    isArchived: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    revision: z.number().int().positive(),
  })
  .strict();
export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;

const editableFieldsSchema = z.object({
  key: keySchema,
  label: labelSchema,
  description: descriptionSchema.nullable(),
  dataType: z.enum(fieldDataTypes),
  semanticRole: z.enum(fieldSemanticRoles).nullable(),
  required: z.boolean(),
  searchable: z.boolean(),
  secretByDefault: z.boolean(),
  defaultValue: jsonValueSchema.nullable(),
  options: jsonValueSchema.nullable(),
  validation: jsonValueSchema.nullable(),
  referenceRelationshipTypeId: z.uuid().nullable(),
  referenceDirection: z.enum(referenceDirections).nullable(),
  allowedTargetTypeIds: z.array(z.uuid()).nullable(),
  onDeleteBehavior: z.enum(referenceDeleteBehaviors).nullable(),
  sortOrder: z.number().int().nonnegative(),
});

export const createFieldDefinitionInputSchema = z
  .object({
    campaignId: z.uuid(),
    entityTypeId: z.uuid(),
    key: keySchema,
    label: labelSchema,
    description: descriptionSchema.nullable().default(null),
    dataType: z.enum(fieldDataTypes),
    semanticRole: z.enum(fieldSemanticRoles).nullable().default(null),
    required: z.boolean().default(false),
    searchable: z.boolean().default(false),
    secretByDefault: z.boolean().default(false),
    defaultValue: jsonValueSchema.nullable().default(null),
    options: jsonValueSchema.nullable().default(null),
    validation: jsonValueSchema.nullable().default(null),
    referenceRelationshipTypeId: z.uuid().nullable().default(null),
    referenceDirection: z.enum(referenceDirections).nullable().default(null),
    allowedTargetTypeIds: z.array(z.uuid()).nullable().default(null),
    onDeleteBehavior: z.enum(referenceDeleteBehaviors).nullable().default(null),
    sortOrder: z.number().int().nonnegative().default(0),
  })
  .strict();
export type CreateFieldDefinitionInput = z.output<typeof createFieldDefinitionInputSchema>;
export type CreateFieldDefinitionInputRequest = z.input<typeof createFieldDefinitionInputSchema>;

export const fieldDefinitionPatchSchema = editableFieldsSchema
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'Informe ao menos uma alteração.');
export type FieldDefinitionPatch = z.infer<typeof fieldDefinitionPatchSchema>;

export const updateFieldDefinitionInputSchema = z
  .object({
    campaignId: z.uuid(),
    entityTypeId: z.uuid(),
    id: z.uuid(),
    revision: z.number().int().positive(),
    patch: fieldDefinitionPatchSchema,
  })
  .strict();
export type UpdateFieldDefinitionInput = z.infer<typeof updateFieldDefinitionInputSchema>;

export const getFieldDefinitionInputSchema = z
  .object({ campaignId: z.uuid(), entityTypeId: z.uuid(), id: z.uuid() })
  .strict();
export type GetFieldDefinitionInput = z.infer<typeof getFieldDefinitionInputSchema>;

export const fieldDefinitionLifecycleInputSchema = z
  .object({
    campaignId: z.uuid(),
    entityTypeId: z.uuid(),
    id: z.uuid(),
    revision: z.number().int().positive(),
  })
  .strict();
export type FieldDefinitionLifecycleInput = z.infer<typeof fieldDefinitionLifecycleInputSchema>;

export const fieldDefinitionPageRequestSchema = z
  .object({
    campaignId: z.uuid(),
    entityTypeId: z.uuid(),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.number().int().positive().max(maximumPageLimit).default(defaultPageLimit),
    filters: z
      .object({ isArchived: z.boolean().default(false) })
      .strict()
      .default({ isArchived: false }),
    sort: z.enum(['sortOrder', 'label', 'updatedAt']).default('sortOrder'),
    order: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();
export type FieldDefinitionPageRequest = z.infer<typeof fieldDefinitionPageRequestSchema>;
export type FieldDefinitionPageRequestInput = z.input<typeof fieldDefinitionPageRequestSchema>;
export const fieldDefinitionPageResultSchema = z
  .object({
    items: z.array(fieldDefinitionSchema),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative().optional(),
  })
  .strict();
export type FieldDefinitionPageResult = PageResult<FieldDefinition>;

export interface FieldDefinitionGateway {
  create(input: CreateFieldDefinitionInputRequest): Promise<Result<FieldDefinition>>;
  get(input: GetFieldDefinitionInput): Promise<Result<FieldDefinition>>;
  list(input: FieldDefinitionPageRequestInput): Promise<Result<FieldDefinitionPageResult>>;
  update(input: UpdateFieldDefinitionInput): Promise<Result<FieldDefinition>>;
  archive(input: FieldDefinitionLifecycleInput): Promise<Result<FieldDefinition>>;
  restore(input: FieldDefinitionLifecycleInput): Promise<Result<FieldDefinition>>;
}
