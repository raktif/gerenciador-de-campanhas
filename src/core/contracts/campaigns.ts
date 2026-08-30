import { z } from 'zod';
import { defaultPageLimit, maximumPageLimit, type PageResult } from './pagination';
import type { Result } from './result';

export const campaignStatuses = ['active', 'archived', 'deleted'] as const;

const optionalCampaignTextSchema = z.string().trim().min(1).optional();
const nullableCampaignTextSchema = z.string().trim().min(1).nullable();

export const campaignSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1),
    systemName: z.string().nullable(),
    concept: z.string().nullable(),
    genre: z.string().nullable(),
    tone: z.string().nullable(),
    summary: z.string().nullable(),
    imagePath: z.string().nullable(),
    status: z.enum(campaignStatuses),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    archivedAt: z.iso.datetime().nullable(),
    revision: z.number().int().positive(),
  })
  .strict();
export type Campaign = z.infer<typeof campaignSchema>;

export const createCampaignInputSchema = z
  .object({
    name: z.string().trim().min(1),
    systemName: optionalCampaignTextSchema,
    concept: optionalCampaignTextSchema,
    genre: optionalCampaignTextSchema,
    tone: optionalCampaignTextSchema,
    summary: optionalCampaignTextSchema,
    imagePath: optionalCampaignTextSchema,
  })
  .strict();
export type CreateCampaignInput = z.infer<typeof createCampaignInputSchema>;

export const campaignPatchSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    systemName: nullableCampaignTextSchema.optional(),
    concept: nullableCampaignTextSchema.optional(),
    genre: nullableCampaignTextSchema.optional(),
    tone: nullableCampaignTextSchema.optional(),
    summary: nullableCampaignTextSchema.optional(),
    imagePath: nullableCampaignTextSchema.optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'Informe ao menos uma alteração.');
export type CampaignPatch = z.infer<typeof campaignPatchSchema>;

export const updateCampaignInputSchema = z
  .object({
    id: z.uuid(),
    revision: z.number().int().positive(),
    patch: campaignPatchSchema,
  })
  .strict();
export type UpdateCampaignInput = z.infer<typeof updateCampaignInputSchema>;

export const campaignLifecycleInputSchema = z
  .object({
    id: z.uuid(),
    revision: z.number().int().positive(),
  })
  .strict();
export type CampaignLifecycleInput = z.infer<typeof campaignLifecycleInputSchema>;

export const getCampaignInputSchema = z.object({ id: z.uuid() }).strict();
export type GetCampaignInput = z.infer<typeof getCampaignInputSchema>;

export const campaignSorts = ['updatedAt', 'createdAt', 'name'] as const;

export const campaignPageRequestSchema = z
  .object({
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.number().int().positive().max(maximumPageLimit).default(defaultPageLimit),
    filters: z
      .object({
        statuses: z.array(z.enum(campaignStatuses)).min(1).default(['active']),
      })
      .strict()
      .default({ statuses: ['active'] }),
    sort: z.enum(campaignSorts).default('updatedAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();
export type CampaignPageRequest = z.infer<typeof campaignPageRequestSchema>;
export type CampaignPageRequestInput = z.input<typeof campaignPageRequestSchema>;
export const campaignPageResultSchema = z
  .object({
    items: z.array(campaignSchema),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative().optional(),
  })
  .strict();
export type CampaignPageResult = PageResult<Campaign>;

export interface CampaignGateway {
  create(input: CreateCampaignInput): Promise<Result<Campaign>>;
  get(input: GetCampaignInput): Promise<Result<Campaign>>;
  list(input?: CampaignPageRequestInput): Promise<Result<CampaignPageResult>>;
  update(input: UpdateCampaignInput): Promise<Result<Campaign>>;
  archive(input: CampaignLifecycleInput): Promise<Result<Campaign>>;
  restore(input: CampaignLifecycleInput): Promise<Result<Campaign>>;
  moveToTrash(input: CampaignLifecycleInput): Promise<Result<Campaign>>;
}
