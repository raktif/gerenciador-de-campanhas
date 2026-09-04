import { z } from 'zod';
import { sessionIntentionStatuses, sessionParticipantRoles, sessionStatuses } from './narrative';
import { defaultPageLimit, maximumPageLimit, type PageResult } from './pagination';
import type { Result } from './result';

const sessionTitleSchema = z.string().trim().min(1).max(200);
const nullableMarkdownSchema = z.string().max(100000).nullable();

export const sessionSchema = z
  .object({
    id: z.uuid(),
    campaignId: z.uuid(),
    sequenceNumber: z.number().int().positive(),
    title: sessionTitleSchema,
    playedAt: z.iso.datetime().nullable(),
    status: z.enum(sessionStatuses),
    summaryMarkdown: nullableMarkdownSchema,
    gmNotesMarkdown: nullableMarkdownSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    revision: z.number().int().positive(),
  })
  .strict();
export type Session = z.infer<typeof sessionSchema>;

export const sessionParticipantSchema = z
  .object({
    sessionId: z.uuid(),
    entityId: z.uuid(),
    role: z.enum(sessionParticipantRoles),
    attended: z.boolean(),
    sortOrder: z.number().int().nonnegative(),
  })
  .strict();
export type SessionParticipant = z.infer<typeof sessionParticipantSchema>;

const sessionIntentionTextSchema = z.string().trim().min(1).max(10000);

export const sessionIntentionSchema = z
  .object({
    id: z.uuid(),
    sessionId: z.uuid(),
    entityId: z.uuid().nullable(),
    text: sessionIntentionTextSchema,
    status: z.enum(sessionIntentionStatuses),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    revision: z.number().int().positive(),
  })
  .strict();
export type SessionIntention = z.infer<typeof sessionIntentionSchema>;

export const createSessionIntentionInputSchema = z
  .object({
    campaignId: z.uuid(),
    sessionId: z.uuid(),
    entityId: z.uuid().nullable().default(null),
    text: sessionIntentionTextSchema,
  })
  .strict();
export type CreateSessionIntentionInput = z.output<typeof createSessionIntentionInputSchema>;
export type CreateSessionIntentionInputRequest = z.input<typeof createSessionIntentionInputSchema>;

export const sessionIntentionPatchSchema = z
  .object({
    entityId: z.uuid().nullable().optional(),
    text: sessionIntentionTextSchema.optional(),
    status: z.enum(sessionIntentionStatuses).optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'Informe ao menos uma alteração.');
export type SessionIntentionPatch = z.infer<typeof sessionIntentionPatchSchema>;

export const updateSessionIntentionInputSchema = z
  .object({
    campaignId: z.uuid(),
    sessionId: z.uuid(),
    id: z.uuid(),
    revision: z.number().int().positive(),
    patch: sessionIntentionPatchSchema,
  })
  .strict();
export type UpdateSessionIntentionInput = z.infer<typeof updateSessionIntentionInputSchema>;

export const getSessionIntentionInputSchema = z
  .object({ campaignId: z.uuid(), sessionId: z.uuid(), id: z.uuid() })
  .strict();
export type GetSessionIntentionInput = z.infer<typeof getSessionIntentionInputSchema>;

export const sessionIntentionPageRequestSchema = z
  .object({
    campaignId: z.uuid(),
    sessionId: z.uuid(),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.number().int().positive().max(maximumPageLimit).default(defaultPageLimit),
    filters: z
      .object({
        status: z.enum(sessionIntentionStatuses).optional(),
        entityId: z.uuid().optional(),
      })
      .strict()
      .default({}),
    sort: z.enum(['createdAt', 'updatedAt']).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();
export type SessionIntentionPageRequest = z.infer<typeof sessionIntentionPageRequestSchema>;
export type SessionIntentionPageRequestInput = z.input<typeof sessionIntentionPageRequestSchema>;
export type SessionIntentionPageResult = PageResult<SessionIntention>;

export const sessionIntentionPageResultSchema = z
  .object({
    items: z.array(sessionIntentionSchema),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative().optional(),
  })
  .strict();

export const sessionParticipantInputSchema = z
  .object({
    entityId: z.uuid(),
    role: z.enum(sessionParticipantRoles),
    attended: z.boolean().default(true),
    sortOrder: z.number().int().nonnegative().default(0),
  })
  .strict();
export type SessionParticipantInput = z.output<typeof sessionParticipantInputSchema>;
export type SessionParticipantInputRequest = z.input<typeof sessionParticipantInputSchema>;

export const sessionParticipantsInputSchema = z
  .array(sessionParticipantInputSchema)
  .max(100)
  .superRefine((participants, context) => {
    const seen = new Set<string>();
    participants.forEach((participant, index) => {
      if (!seen.has(participant.entityId)) {
        seen.add(participant.entityId);
        return;
      }
      context.addIssue({
        code: 'custom',
        message: 'A mesma entidade não pode participar mais de uma vez da sessão.',
        path: [index, 'entityId'],
      });
    });
  });

export const replaceSessionParticipantsInputSchema = z
  .object({
    campaignId: z.uuid(),
    sessionId: z.uuid(),
    revision: z.number().int().positive(),
    participants: sessionParticipantsInputSchema,
  })
  .strict();
export type ReplaceSessionParticipantsInput = z.output<
  typeof replaceSessionParticipantsInputSchema
>;
export type ReplaceSessionParticipantsInputRequest = z.input<
  typeof replaceSessionParticipantsInputSchema
>;

export const createSessionInputSchema = z
  .object({
    campaignId: z.uuid(),
    sequenceNumber: z.number().int().positive(),
    title: sessionTitleSchema,
    playedAt: z.iso.datetime().nullable().default(null),
    summaryMarkdown: nullableMarkdownSchema.default(null),
    gmNotesMarkdown: nullableMarkdownSchema.default(null),
  })
  .strict();
export type CreateSessionInput = z.output<typeof createSessionInputSchema>;
export type CreateSessionInputRequest = z.input<typeof createSessionInputSchema>;

export const sessionPatchSchema = z
  .object({
    title: sessionTitleSchema.optional(),
    playedAt: z.iso.datetime().nullable().optional(),
    summaryMarkdown: nullableMarkdownSchema.optional(),
    gmNotesMarkdown: nullableMarkdownSchema.optional(),
    status: z.enum(sessionStatuses).optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'Informe ao menos uma alteração.');
export type SessionPatch = z.infer<typeof sessionPatchSchema>;

export const updateSessionInputSchema = z
  .object({
    campaignId: z.uuid(),
    id: z.uuid(),
    revision: z.number().int().positive(),
    patch: sessionPatchSchema,
  })
  .strict();
export type UpdateSessionInput = z.infer<typeof updateSessionInputSchema>;

export const getSessionInputSchema = z.object({ campaignId: z.uuid(), id: z.uuid() }).strict();
export type GetSessionInput = z.infer<typeof getSessionInputSchema>;

export const sessionPageRequestSchema = z
  .object({
    campaignId: z.uuid(),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.number().int().positive().max(maximumPageLimit).default(defaultPageLimit),
    filters: z
      .object({ status: z.enum(sessionStatuses).optional() })
      .strict()
      .default({}),
    sort: z.enum(['sequenceNumber', 'playedAt', 'updatedAt']).default('sequenceNumber'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();
export type SessionPageRequest = z.infer<typeof sessionPageRequestSchema>;
export type SessionPageRequestInput = z.input<typeof sessionPageRequestSchema>;
export type SessionPageResult = PageResult<Session>;

export const sessionPageResultSchema = z
  .object({
    items: z.array(sessionSchema),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative().optional(),
  })
  .strict();

export interface SessionGateway {
  create(input: CreateSessionInputRequest): Promise<Result<Session>>;
  get(input: GetSessionInput): Promise<Result<Session>>;
  list(input: SessionPageRequestInput): Promise<Result<SessionPageResult>>;
  update(input: UpdateSessionInput): Promise<Result<Session>>;
}

export interface SessionParticipantsGateway {
  replace(input: ReplaceSessionParticipantsInputRequest): Promise<Result<SessionParticipant[]>>;
}

export interface SessionIntentionsGateway {
  create(input: CreateSessionIntentionInputRequest): Promise<Result<SessionIntention>>;
  get(input: GetSessionIntentionInput): Promise<Result<SessionIntention>>;
  list(input: SessionIntentionPageRequestInput): Promise<Result<SessionIntentionPageResult>>;
  update(input: UpdateSessionIntentionInput): Promise<Result<SessionIntention>>;
}
