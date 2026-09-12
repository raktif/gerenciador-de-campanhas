import { z } from 'zod';
import { eventEntityLinkSchema, eventSchema } from './events';
import { defaultPageLimit, maximumPageLimit, type PageResult } from './pagination';
import type { Result } from './result';

export const timelineEntrySchema = z
  .object({
    event: eventSchema,
    sessionSequenceNumber: z.number().int().positive().nullable(),
    links: z.array(eventEntityLinkSchema),
  })
  .strict();
export type TimelineEntry = z.infer<typeof timelineEntrySchema>;

const timelineFiltersSchema = z.object({ archived: z.boolean().default(false) }).strict();

// A cronologia não interpreta occurredAtLabel: primeiro vêm os eventos de sessão
// (sequência da sessão, ordem, criação e ID); depois os sem sessão (criação e ID).
export const timelineCampaignRequestSchema = z
  .object({
    campaignId: z.uuid(),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.number().int().positive().max(maximumPageLimit).default(defaultPageLimit),
    filters: timelineFiltersSchema.default({ archived: false }),
  })
  .strict();
export type TimelineCampaignRequest = z.infer<typeof timelineCampaignRequestSchema>;
export type TimelineCampaignRequestInput = z.input<typeof timelineCampaignRequestSchema>;

export const timelineEntityRequestSchema = timelineCampaignRequestSchema
  .extend({ entityId: z.uuid() })
  .strict();
export type TimelineEntityRequest = z.infer<typeof timelineEntityRequestSchema>;
export type TimelineEntityRequestInput = z.input<typeof timelineEntityRequestSchema>;

export type TimelinePageResult = PageResult<TimelineEntry>;
export const timelinePageResultSchema = z
  .object({
    items: z.array(timelineEntrySchema),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative().optional(),
  })
  .strict();

export interface TimelineGateway {
  listCampaign(input: TimelineCampaignRequestInput): Promise<Result<TimelinePageResult>>;
  listEntity(input: TimelineEntityRequestInput): Promise<Result<TimelinePageResult>>;
}
