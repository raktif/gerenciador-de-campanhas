import { z } from 'zod';
import type { Result } from './result';

export const demandStatuses = [
  'available',
  'active',
  'resolved',
  'failed',
  'ignored',
  'archived',
] as const;
export const demandRoles = [
  'requester',
  'affected',
  'location',
  'opposition',
  'resource',
  'clue',
  'hidden_connection',
  'beneficiary',
  'related',
] as const;
export const demandTargetTypes = ['entity', 'clock', 'session'] as const;
const id = z.uuid();
const revision = z.number().int().positive();
const text = z.string().trim().min(1).max(200);
export const demandLinkInputSchema = z
  .object({
    targetType: z.enum(demandTargetTypes),
    targetId: id,
    role: z.enum(demandRoles).default('related'),
  })
  .strict()
  .refine(
    (link) => link.targetType === 'entity' || link.role === 'related',
    'Relógios e Sessões usam associação geral.',
  );
const links = z
  .array(demandLinkInputSchema)
  .max(100)
  .superRefine((items, ctx) => {
    const keys = new Set<string>();
    items.forEach((item, index) => {
      const key = `${item.targetType}:${item.targetId}:${item.role}`;
      if (keys.has(key))
        ctx.addIssue({ code: 'custom', message: 'Vínculo repetido.', path: [index] });
      keys.add(key);
    });
  });
export const demandContentSchema = z
  .object({
    title: text,
    need: z
      .string()
      .min(1)
      .max(100000)
      .refine((value) => value.trim().length > 0),
    summary: z.string().max(100000).default(''),
    obstacle: z.string().max(10000).default(''),
    risks: z.string().max(10000).default(''),
    urgency: z.enum(['low', 'medium', 'high', 'critical']),
    requesterEntityId: id,
    links: links.default([]),
  })
  .strict()
  .refine(
    (value) => value.need.length + value.summary.length + 2 <= 100000,
    'Necessidade e resumo juntos devem caber no limite de 100.000 caracteres do Evento; nenhum texto será truncado.',
  );
export const demandIdentitySchema = z.object({ campaignId: id, id }).strict();
export const demandActionSchema = demandIdentitySchema.extend({ revision });
export const acceptDemandSchema = z
  .object({
    campaignId: id,
    signalId: id,
    signalRevision: revision,
    content: demandContentSchema,
  })
  .strict();
export const updateDemandSchema = demandActionSchema.extend({ content: demandContentSchema });
export const transformDemandSchema = updateDemandSchema.extend({
  idempotencyKey: id,
  confirmed: z.literal(true),
});
export const transitionDemandSchema = demandActionSchema.extend({
  action: z.enum(['activate', 'fail', 'ignore', 'reopen', 'archive', 'restore', 'resolve']),
  confirmed: z.boolean().optional(),
});
export const demandPageSchema = z
  .object({
    campaignId: id,
    status: z.enum(demandStatuses).optional(),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .strict();
export const demandTargetRequestSchema = z
  .object({
    campaignId: id,
    targetType: z.enum(demandTargetTypes),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .strict();
export const demandTargetSchema = z
  .object({ id, label: z.string(), archived: z.boolean() })
  .strict();
export const demandTargetsSchema = z
  .object({ items: z.array(demandTargetSchema), nextCursor: z.string().nullable() })
  .strict();
export const demandSchema = z
  .object({
    id,
    campaignId: id,
    title: z.string(),
    need: z.string(),
    summary: z.string(),
    obstacle: z.string(),
    risks: z.string(),
    urgency: z.enum(['low', 'medium', 'high', 'critical']),
    requesterEntityId: id,
    status: z.enum(demandStatuses),
    statusBeforeArchive: z.enum(demandStatuses).exclude(['archived']).nullable(),
    parentId: id.nullable(),
    lineageSignalId: id,
    acceptedSignalId: id.nullable(),
    sourceEntityId: id,
    sourceFieldDefinitionId: id,
    sourceFieldValueId: id,
    sourceId: id,
    sourceSnapshot: z.string(),
    generatedEventId: id.nullable(),
    canonState: z.literal('draft'),
    knowledgeState: z.literal('possibility'),
    visibility: z.literal('gm'),
    originKind: z.literal('generator'),
    createdAt: z.string(),
    updatedAt: z.string(),
    revision,
  })
  .strict();
export const demandDetailsSchema = z
  .object({
    demand: demandSchema,
    links: z.array(demandLinkInputSchema.extend({ label: z.string(), archived: z.boolean() })),
    children: z.array(demandSchema),
    canResolve: z.boolean(),
  })
  .strict();
export const demandPageResultSchema = z
  .object({
    items: z.array(demandSchema),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative(),
  })
  .strict();
export const demandSuggestionSchema = z
  .object({
    signalId: id,
    signalRevision: revision,
    entityId: id,
    entityName: z.string(),
    fieldLabel: z.string(),
    need: z.string(),
    title: z.string(),
    rationale: z.string(),
  })
  .strict();
export const demandSuggestionRequestSchema = z.object({ campaignId: id, signalId: id }).strict();
export type Demand = z.infer<typeof demandSchema>;
export type DemandDetails = z.infer<typeof demandDetailsSchema>;
export type DemandContent = z.infer<typeof demandContentSchema>;
export type DemandLink = z.infer<typeof demandLinkInputSchema>;
export type DemandSuggestion = z.infer<typeof demandSuggestionSchema>;
export type DemandTarget = z.infer<typeof demandTargetSchema>;
export type DemandPage = z.infer<typeof demandPageSchema>;
export type DemandTargetsRequest = z.infer<typeof demandTargetRequestSchema>;
export type AcceptDemand = z.infer<typeof acceptDemandSchema>;
export type UpdateDemand = z.infer<typeof updateDemandSchema>;
export type TransformDemand = z.infer<typeof transformDemandSchema>;
export type TransitionDemand = z.infer<typeof transitionDemandSchema>;
export interface DemandGateway {
  sourceLocks(input: z.infer<typeof demandIdentitySchema>): Promise<Result<string[]>>;
  suggestion(
    input: z.infer<typeof demandSuggestionRequestSchema>,
  ): Promise<Result<DemandSuggestion>>;
  accept(input: AcceptDemand): Promise<Result<DemandDetails>>;
  get(input: z.infer<typeof demandIdentitySchema>): Promise<Result<DemandDetails>>;
  list(
    input: z.input<typeof demandPageSchema>,
  ): Promise<Result<z.infer<typeof demandPageResultSchema>>>;
  targets(
    input: z.input<typeof demandTargetRequestSchema>,
  ): Promise<Result<z.infer<typeof demandTargetsSchema>>>;
  update(input: UpdateDemand): Promise<Result<DemandDetails>>;
  transform(input: TransformDemand): Promise<Result<DemandDetails>>;
  transition(input: TransitionDemand): Promise<Result<DemandDetails>>;
}
