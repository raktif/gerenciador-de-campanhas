import { z } from 'zod';
import type { Result } from './result';

export const storyThreadTypes = [
  'promise',
  'mystery',
  'clue',
  'threat',
  'relationship',
  'unanswered_question',
  'unfinished_goal',
  'ignored_demand',
  'custom',
] as const;
export const storyThreadStatuses = [
  'open',
  'active',
  'dormant',
  'resolved',
  'abandoned',
  'archived',
] as const;
export const storyThreadTargetTypes = [
  'entity',
  'relationship',
  'assertion',
  'note',
  'event',
  'session',
] as const;
export type StoryThreadTargetTypes = (typeof storyThreadTargetTypes)[number];
export const storyThreadOriginKinds = ['manual', 'session'] as const;

const reasonSchema = z.string().trim().max(2000).optional();
const threadLinkInputSchema = z
  .object({ targetType: z.enum(storyThreadTargetTypes), targetId: z.uuid() })
  .strict();
export type StoryThreadLinkInput = z.infer<typeof threadLinkInputSchema>;

export const storyThreadLinkSchema = z
  .object({
    id: z.uuid(),
    threadId: z.uuid(),
    targetType: z.enum(storyThreadTargetTypes),
    targetId: z.uuid(),
    label: z.string(),
    archived: z.boolean(),
    sortOrder: z.number().int().nonnegative(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type StoryThreadLink = z.infer<typeof storyThreadLinkSchema>;

export const storyThreadTransitionSchema = z
  .object({
    id: z.uuid(),
    threadId: z.uuid(),
    fromStatus: z.enum(storyThreadStatuses).nullable(),
    toStatus: z.enum(storyThreadStatuses),
    reason: z.string().nullable(),
    sessionId: z.uuid().nullable(),
    sessionTitle: z.string().nullable(),
    occurredAt: z.iso.datetime(),
  })
  .strict();
export type StoryThreadTransition = z.infer<typeof storyThreadTransitionSchema>;

export const storyThreadSchema = z
  .object({
    id: z.uuid(),
    campaignId: z.uuid(),
    title: z.string().trim().min(1).max(200),
    description: z.string().nullable(),
    threadType: z.enum(storyThreadTypes),
    status: z.enum(storyThreadStatuses),
    statusBeforeArchive: z.enum(storyThreadStatuses).exclude(['archived']).nullable(),
    originKind: z.enum(storyThreadOriginKinds),
    originSessionId: z.uuid().nullable(),
    originSessionTitle: z.string().nullable(),
    originReason: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    revision: z.number().int().positive(),
  })
  .strict();
export type StoryThread = z.infer<typeof storyThreadSchema>;

export const storyThreadDetailsSchema = z
  .object({
    thread: storyThreadSchema,
    links: z.array(storyThreadLinkSchema),
    transitions: z.array(storyThreadTransitionSchema),
  })
  .strict();
export type StoryThreadDetails = z.infer<typeof storyThreadDetailsSchema>;

const linkCollectionSchema = z
  .array(threadLinkInputSchema)
  .max(100)
  .superRefine((links, ctx) => {
    const keys = new Set<string>();
    links.forEach((link, index) => {
      const key = `${link.targetType}\u0000${link.targetId}`;
      if (keys.has(key))
        ctx.addIssue({
          code: 'custom',
          message: 'O mesmo registro não pode ser vinculado duas vezes.',
          path: [index],
        });
      keys.add(key);
    });
  });

export const createStoryThreadInputSchema = z
  .object({
    campaignId: z.uuid(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(10000).nullable().default(null),
    threadType: z.enum(storyThreadTypes),
    originKind: z.enum(storyThreadOriginKinds).default('manual'),
    sessionId: z.uuid().optional(),
    originReason: reasonSchema,
    links: linkCollectionSchema.default([]),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.originKind === 'session' && input.sessionId === undefined)
      ctx.addIssue({ code: 'custom', message: 'Escolha a sessão de origem.', path: ['sessionId'] });
    if (input.originKind === 'manual' && input.sessionId !== undefined)
      ctx.addIssue({
        code: 'custom',
        message: 'Sessão só pode ser informada como origem de sessão.',
        path: ['sessionId'],
      });
  });
export type CreateStoryThreadInput = z.output<typeof createStoryThreadInputSchema>;
export type CreateStoryThreadInputRequest = z.input<typeof createStoryThreadInputSchema>;

export const updateStoryThreadInputSchema = z
  .object({
    campaignId: z.uuid(),
    id: z.uuid(),
    revision: z.number().int().positive(),
    patch: z
      .object({
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().trim().max(10000).nullable().optional(),
        threadType: z.enum(storyThreadTypes).optional(),
      })
      .strict()
      .optional(),
    links: linkCollectionSchema.optional(),
  })
  .strict()
  .refine(
    (input) =>
      (input.patch !== undefined && Object.keys(input.patch).length > 0) ||
      input.links !== undefined,
    'Informe ao menos uma alteração.',
  );
export type UpdateStoryThreadInput = z.infer<typeof updateStoryThreadInputSchema>;

export const getStoryThreadInputSchema = z.object({ campaignId: z.uuid(), id: z.uuid() }).strict();
export type GetStoryThreadInput = z.infer<typeof getStoryThreadInputSchema>;

export const storyThreadLifecycleInputSchema = z
  .object({
    campaignId: z.uuid(),
    id: z.uuid(),
    revision: z.number().int().positive(),
    reason: reasonSchema,
    sessionId: z.uuid().optional(),
  })
  .strict();
export type StoryThreadLifecycleInput = z.infer<typeof storyThreadLifecycleInputSchema>;
export const setStoryThreadStatusInputSchema = storyThreadLifecycleInputSchema.extend({
  status: z.enum(['open', 'active', 'dormant']),
});
export type SetStoryThreadStatusInput = z.infer<typeof setStoryThreadStatusInputSchema>;

export const storyThreadPageRequestSchema = z
  .object({
    campaignId: z.uuid(),
    status: z.enum(storyThreadStatuses).optional(),
    threadType: z.enum(storyThreadTypes).optional(),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.number().int().positive().max(100).default(50),
  })
  .strict();
export type StoryThreadPageRequest = z.infer<typeof storyThreadPageRequestSchema>;
export type StoryThreadPageRequestInput = z.input<typeof storyThreadPageRequestSchema>;
export const storyThreadPageResultSchema = z
  .object({
    items: z.array(storyThreadSchema),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative(),
  })
  .strict();
export type StoryThreadPageResult = z.infer<typeof storyThreadPageResultSchema>;

export const storyThreadTargetRequestSchema = z
  .object({
    campaignId: z.uuid(),
    targetType: z.enum(storyThreadTargetTypes),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.number().int().positive().max(100).default(50),
  })
  .strict();
export type StoryThreadTargetRequest = z.infer<typeof storyThreadTargetRequestSchema>;
export type StoryThreadTargetRequestInput = z.input<typeof storyThreadTargetRequestSchema>;
export const storyThreadTargetSchema = z
  .object({ id: z.uuid(), label: z.string(), archived: z.boolean() })
  .strict();
export const storyThreadTargetsResultSchema = z
  .object({
    items: z.array(storyThreadTargetSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();
export type StoryThreadTarget = z.infer<typeof storyThreadTargetSchema>;
export type StoryThreadTargetPageResult = z.infer<typeof storyThreadTargetsResultSchema>;

export interface StoryThreadGateway {
  create(input: CreateStoryThreadInputRequest): Promise<Result<StoryThreadDetails>>;
  get(input: GetStoryThreadInput): Promise<Result<StoryThreadDetails>>;
  list(input: StoryThreadPageRequestInput): Promise<Result<StoryThreadPageResult>>;
  listTargets(input: StoryThreadTargetRequestInput): Promise<Result<StoryThreadTargetPageResult>>;
  update(input: UpdateStoryThreadInput): Promise<Result<StoryThreadDetails>>;
  setStatus(input: SetStoryThreadStatusInput): Promise<Result<StoryThreadDetails>>;
  resolve(input: StoryThreadLifecycleInput): Promise<Result<StoryThreadDetails>>;
  abandon(input: StoryThreadLifecycleInput): Promise<Result<StoryThreadDetails>>;
  reopen(input: StoryThreadLifecycleInput): Promise<Result<StoryThreadDetails>>;
  archive(input: StoryThreadLifecycleInput): Promise<Result<StoryThreadDetails>>;
  restore(input: StoryThreadLifecycleInput): Promise<Result<StoryThreadDetails>>;
}
