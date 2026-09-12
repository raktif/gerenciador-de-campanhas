import { z } from 'zod';
import {
  canonStates,
  eventEntityRoles,
  knowledgeStates,
  manualNarrativeDefaults,
  nullableSourceIdSchema,
  originKinds,
  visibilityStates,
} from './narrative';
import { defaultPageLimit, maximumPageLimit, type PageResult } from './pagination';
import type { Result } from './result';

const eventTitleSchema = z.string().trim().min(1).max(200);
const nullableMarkdownSchema = z.string().max(100000).nullable();
const nullableOccurredAtLabelSchema = z.string().trim().min(1).max(200).nullable();

export const eventSchema = z
  .object({
    id: z.uuid(),
    campaignId: z.uuid(),
    sessionId: z.uuid().nullable(),
    title: eventTitleSchema,
    descriptionMarkdown: nullableMarkdownSchema,
    eventOrder: z.number().int().nonnegative(),
    occurredAtLabel: nullableOccurredAtLabelSchema,
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
  .strict();
export type Event = z.infer<typeof eventSchema>;

export const eventEntityLinkSchema = z
  .object({
    eventId: z.uuid(),
    entityId: z.uuid(),
    role: z.enum(eventEntityRoles),
    sortOrder: z.number().int().nonnegative(),
  })
  .strict();
export type EventEntityLink = z.infer<typeof eventEntityLinkSchema>;

export const eventEntityLinkInputSchema = z
  .object({
    entityId: z.uuid(),
    role: z.enum(eventEntityRoles),
    sortOrder: z.number().int().nonnegative().default(0),
  })
  .strict();
export type EventEntityLinkInput = z.output<typeof eventEntityLinkInputSchema>;
export type EventEntityLinkInputRequest = z.input<typeof eventEntityLinkInputSchema>;

function duplicateLinkIndexes(links: readonly { entityId: string; role: string }[]): number[] {
  const seen = new Set<string>();
  const duplicates: number[] = [];
  links.forEach((link, index) => {
    const key = `${link.entityId}\u0000${link.role}`;
    if (seen.has(key)) duplicates.push(index);
    else seen.add(key);
  });
  return duplicates;
}

export const eventEntityLinksInputSchema = z
  .array(eventEntityLinkInputSchema)
  .max(100)
  .superRefine((links, context) => {
    for (const index of duplicateLinkIndexes(links))
      context.addIssue({
        code: 'custom',
        message: 'A mesma entidade n\u00e3o pode ter o mesmo papel mais de uma vez no evento.',
        path: [index, 'entityId'],
      });
  });
export type EventEntityLinksInput = z.output<typeof eventEntityLinksInputSchema>;
export type EventEntityLinksInputRequest = z.input<typeof eventEntityLinksInputSchema>;

export const eventDetailsSchema = z
  .object({ event: eventSchema, links: z.array(eventEntityLinkSchema) })
  .strict();
export type EventDetails = z.infer<typeof eventDetailsSchema>;

const editableEventSchema = z
  .object({
    sessionId: z.uuid().nullable(),
    title: eventTitleSchema,
    descriptionMarkdown: nullableMarkdownSchema,
    eventOrder: z.number().int().nonnegative(),
    occurredAtLabel: nullableOccurredAtLabelSchema,
    canonState: z.enum(canonStates),
    knowledgeState: z.enum(knowledgeStates),
    visibility: z.enum(visibilityStates),
    originKind: z.enum(originKinds),
    sourceId: nullableSourceIdSchema,
  })
  .strict();

export const createEventInputSchema = editableEventSchema
  .extend({
    campaignId: z.uuid(),
    sessionId: z.uuid().nullable().default(null),
    descriptionMarkdown: nullableMarkdownSchema.default(null),
    eventOrder: z.number().int().nonnegative().default(0),
    occurredAtLabel: nullableOccurredAtLabelSchema.default(null),
    canonState: z.enum(canonStates).default(manualNarrativeDefaults.canonState),
    knowledgeState: z.enum(knowledgeStates).default(manualNarrativeDefaults.knowledgeState),
    visibility: z.enum(visibilityStates).default(manualNarrativeDefaults.visibility),
    originKind: z.enum(originKinds).default(manualNarrativeDefaults.originKind),
    sourceId: nullableSourceIdSchema.default(null),
    sourceSessionId: z.uuid().optional(),
    links: eventEntityLinksInputSchema.default([]),
  })
  .strict();
export type CreateEventInput = z.output<typeof createEventInputSchema>;
export type CreateEventInputRequest = z.input<typeof createEventInputSchema>;

export const eventPatchSchema = editableEventSchema
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'Informe ao menos uma altera\u00e7\u00e3o.');
export type EventPatch = z.infer<typeof eventPatchSchema>;

export const updateEventInputSchema = z
  .object({
    campaignId: z.uuid(),
    id: z.uuid(),
    revision: z.number().int().positive(),
    patch: eventPatchSchema.optional(),
    sourceSessionId: z.uuid().optional(),
    links: eventEntityLinksInputSchema.optional(),
  })
  .strict()
  .refine(
    (input) => input.patch !== undefined || input.links !== undefined,
    'Informe uma altera\u00e7\u00e3o ou substitua os v\u00ednculos.',
  );
export type UpdateEventInput = z.output<typeof updateEventInputSchema>;
export type UpdateEventInputRequest = z.input<typeof updateEventInputSchema>;

export const getEventInputSchema = z.object({ campaignId: z.uuid(), id: z.uuid() }).strict();
export type GetEventInput = z.infer<typeof getEventInputSchema>;

export const eventLifecycleInputSchema = z
  .object({ campaignId: z.uuid(), id: z.uuid(), revision: z.number().int().positive() })
  .strict();
export type EventLifecycleInput = z.infer<typeof eventLifecycleInputSchema>;

export const eventPageRequestSchema = z
  .object({
    campaignId: z.uuid(),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.number().int().positive().max(maximumPageLimit).default(defaultPageLimit),
    filters: z
      .object({
        sessionId: z.uuid().optional(),
        entityId: z.uuid().optional(),
        canonState: z.enum(canonStates).optional(),
        knowledgeState: z.enum(knowledgeStates).optional(),
        visibility: z.enum(visibilityStates).optional(),
        originKind: z.enum(originKinds).optional(),
        archived: z.boolean().default(false),
      })
      .strict()
      .default({ archived: false }),
    sort: z.enum(['eventOrder', 'createdAt', 'updatedAt']).default('eventOrder'),
    order: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();
export type EventPageRequest = z.infer<typeof eventPageRequestSchema>;
export type EventPageRequestInput = z.input<typeof eventPageRequestSchema>;
export type EventPageResult = PageResult<Event>;

export const eventPageResultSchema = z
  .object({
    items: z.array(eventSchema),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative().optional(),
  })
  .strict();

export interface EventGateway {
  create(input: CreateEventInputRequest): Promise<Result<EventDetails>>;
  get(input: GetEventInput): Promise<Result<EventDetails>>;
  list(input: EventPageRequestInput): Promise<Result<EventPageResult>>;
  update(input: UpdateEventInputRequest): Promise<Result<EventDetails>>;
  archive(input: EventLifecycleInput): Promise<Result<EventDetails>>;
  restore(input: EventLifecycleInput): Promise<Result<EventDetails>>;
}
