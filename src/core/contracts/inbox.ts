import { z } from 'zod';
import { inboxStatuses, originKinds } from './narrative';
import {
  canonStates,
  knowledgeStates,
  manualNarrativeDefaults,
  visibilityStates,
} from './narrative';
import { entitySchema } from './entities';
import { relationshipSchema, relationshipWarningSchema } from './relationships';
import { defaultPageLimit, maximumPageLimit, type PageResult } from './pagination';
import type { Result } from './result';

const rawTextSchema = z
  .string()
  .min(1)
  .max(10000)
  .refine((value) => value.trim().length > 0, 'Informe o texto da captura.');

const nullableConvertedObjectTypeSchema = z.string().trim().min(1).max(100).nullable();

export const inboxItemSchema = z
  .object({
    id: z.uuid(),
    campaignId: z.uuid(),
    sessionId: z.uuid().nullable(),
    rawText: rawTextSchema,
    status: z.enum(inboxStatuses),
    originKind: z.enum(originKinds),
    capturedAt: z.iso.datetime(),
    convertedObjectType: nullableConvertedObjectTypeSchema,
    convertedObjectId: z.uuid().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    revision: z.number().int().positive(),
  })
  .strict()
  .superRefine((item, context) => {
    const converted = item.status === 'converted';
    const hasConvertedDestination =
      item.convertedObjectType !== null && item.convertedObjectId !== null;
    const hasNoConvertedDestination =
      item.convertedObjectType === null && item.convertedObjectId === null;
    if ((converted && !hasConvertedDestination) || (!converted && !hasNoConvertedDestination))
      context.addIssue({
        code: 'custom',
        message: 'O destino da conversão deve estar presente somente para itens convertidos.',
        path: ['status'],
      });
  });
export type InboxItem = z.infer<typeof inboxItemSchema>;

export const captureInboxItemInputSchema = z
  .object({
    campaignId: z.uuid(),
    sessionId: z.uuid().nullable().default(null),
    rawText: rawTextSchema,
  })
  .strict();
export type CaptureInboxItemInput = z.output<typeof captureInboxItemInputSchema>;
export type CaptureInboxItemInputRequest = z.input<typeof captureInboxItemInputSchema>;

export const getInboxItemInputSchema = z.object({ campaignId: z.uuid(), id: z.uuid() }).strict();
export type GetInboxItemInput = z.infer<typeof getInboxItemInputSchema>;

const inboxMutableStatuses = ['new', 'reviewing', 'dismissed', 'archived'] as const;

export const inboxLifecycleInputSchema = z
  .object({ campaignId: z.uuid(), id: z.uuid(), revision: z.number().int().positive() })
  .strict();
export type InboxLifecycleInput = z.infer<typeof inboxLifecycleInputSchema>;

export const inboxPageRequestSchema = z
  .object({
    campaignId: z.uuid(),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.number().int().positive().max(maximumPageLimit).default(defaultPageLimit),
    filters: z
      .object({
        statuses: z.array(z.enum(inboxStatuses)).min(1).max(inboxStatuses.length).optional(),
        sessionId: z.uuid().optional(),
        originKind: z.enum(originKinds).optional(),
      })
      .strict()
      .default({}),
    sort: z.enum(['capturedAt', 'updatedAt']).default('capturedAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();
export type InboxPageRequest = z.infer<typeof inboxPageRequestSchema>;
export type InboxPageRequestInput = z.input<typeof inboxPageRequestSchema>;
export type InboxPageResult = PageResult<InboxItem>;

export const inboxPageResultSchema = z
  .object({
    items: z.array(inboxItemSchema),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative().optional(),
  })
  .strict();

export const inboxReviewableStatusSchema = z.enum(inboxMutableStatuses);

const conversionEntityInputSchema = z
  .object({
    entityTypeId: z.uuid(),
    name: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(10000).nullable().default(null),
    canonState: z.enum(canonStates).default(manualNarrativeDefaults.canonState),
    knowledgeState: z.enum(knowledgeStates).default(manualNarrativeDefaults.knowledgeState),
    visibility: z.enum(visibilityStates).default(manualNarrativeDefaults.visibility),
  })
  .strict();

export const convertInboxItemToEntityInputSchema = z
  .object({
    campaignId: z.uuid(),
    id: z.uuid(),
    revision: z.number().int().positive(),
    destination: conversionEntityInputSchema,
  })
  .strict();
export type ConvertInboxItemToEntityInput = z.output<typeof convertInboxItemToEntityInputSchema>;
export type ConvertInboxItemToEntityInputRequest = z.input<
  typeof convertInboxItemToEntityInputSchema
>;

export const inboxEntityConversionResultSchema = z
  .object({ inboxItem: inboxItemSchema, entity: entitySchema })
  .strict();
export type InboxEntityConversionResult = z.infer<typeof inboxEntityConversionResultSchema>;

const relationshipConversionEndpointSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('existing'), entityId: z.uuid() }).strict(),
  z
    .object({
      mode: z.literal('new'),
      entityTypeId: z.uuid(),
      name: z.string().trim().min(1).max(200),
      summary: z.string().trim().min(1).max(10000).nullable().default(null),
    })
    .strict(),
]);

const conversionRelationshipInputSchema = z
  .object({
    relationshipTypeId: z.uuid(),
    source: relationshipConversionEndpointSchema,
    target: relationshipConversionEndpointSchema,
    description: z.string().trim().min(1).max(10000).nullable().default(null),
    strength: z.number().nullable().default(null),
    canonState: z.enum(canonStates).default(manualNarrativeDefaults.canonState),
    knowledgeState: z.enum(knowledgeStates).default(manualNarrativeDefaults.knowledgeState),
    visibility: z.enum(visibilityStates).default(manualNarrativeDefaults.visibility),
    validFromEventId: z.uuid().nullable().default(null),
    validToEventId: z.uuid().nullable().default(null),
  })
  .strict();

export const convertInboxItemToRelationshipInputSchema = z
  .object({
    campaignId: z.uuid(),
    id: z.uuid(),
    revision: z.number().int().positive(),
    destination: conversionRelationshipInputSchema,
  })
  .strict();
export type ConvertInboxItemToRelationshipInput = z.output<
  typeof convertInboxItemToRelationshipInputSchema
>;
export type ConvertInboxItemToRelationshipInputRequest = z.input<
  typeof convertInboxItemToRelationshipInputSchema
>;

export const inboxRelationshipConversionResultSchema = z
  .object({
    inboxItem: inboxItemSchema,
    relationship: relationshipSchema,
    createdEntities: z.array(entitySchema).max(2),
    warnings: z.array(relationshipWarningSchema),
  })
  .strict();
export type InboxRelationshipConversionResult = z.infer<
  typeof inboxRelationshipConversionResultSchema
>;

export interface InboxGateway {
  capture(input: CaptureInboxItemInputRequest): Promise<Result<InboxItem>>;
  get(input: GetInboxItemInput): Promise<Result<InboxItem>>;
  list(input: InboxPageRequestInput): Promise<Result<InboxPageResult>>;
  beginReview(input: InboxLifecycleInput): Promise<Result<InboxItem>>;
  dismiss(input: InboxLifecycleInput): Promise<Result<InboxItem>>;
  archive(input: InboxLifecycleInput): Promise<Result<InboxItem>>;
  restore(input: InboxLifecycleInput): Promise<Result<InboxItem>>;
  convertToEntity(
    input: ConvertInboxItemToEntityInputRequest,
  ): Promise<Result<InboxEntityConversionResult>>;
  convertToRelationship(
    input: ConvertInboxItemToRelationshipInputRequest,
  ): Promise<Result<InboxRelationshipConversionResult>>;
}
