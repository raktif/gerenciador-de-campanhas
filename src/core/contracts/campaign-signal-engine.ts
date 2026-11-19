import { z } from 'zod';
import {
  campaignSignalIdentifierSchema,
  campaignSignalRevisionSchema,
  campaignSignalSchema,
  campaignSignalTimestampSchema,
  signalEvidenceObjectTypeSchema,
} from './campaign-signals';
import type { CampaignSignal } from './campaign-signals';
import type { Result } from './result';
import { assertionSchema } from './assertions';

export const campaignSignalCampaignInputSchema = z
  .object({ campaignId: campaignSignalIdentifierSchema })
  .strict();
export type CampaignSignalCampaignInput = z.infer<typeof campaignSignalCampaignInputSchema>;

export const campaignSignalEvidenceReviewSchema = z
  .object({
    objectType: signalEvidenceObjectTypeSchema,
    role: z.string().trim().min(1),
    description: z.string().trim().min(1).nullable(),
    objectName: z.string().trim().min(1).nullable(),
    objectArchived: z.boolean().nullable(),
  })
  .strict();
export type CampaignSignalEvidenceReview = z.infer<typeof campaignSignalEvidenceReviewSchema>;

export const campaignSignalReviewItemSchema = z
  .object({
    signal: campaignSignalSchema,
    evidence: z.array(campaignSignalEvidenceReviewSchema),
  })
  .strict();
export type CampaignSignalReviewItem = z.infer<typeof campaignSignalReviewItemSchema>;

export const campaignSignalListResultSchema = z
  .object({ items: z.array(campaignSignalReviewItemSchema) })
  .strict();
export type CampaignSignalListResult = z.infer<typeof campaignSignalListResultSchema>;

export const campaignSignalRecalculationResultSchema = z
  .object({
    items: z.array(campaignSignalReviewItemSchema),
    detectedCount: z.number().int().nonnegative(),
    expiredSnoozes: z.number().int().nonnegative(),
  })
  .strict();
export type CampaignSignalRecalculationResult = z.infer<
  typeof campaignSignalRecalculationResultSchema
>;

const campaignSignalActionBase = {
  campaignId: campaignSignalIdentifierSchema,
  id: campaignSignalIdentifierSchema,
  revision: campaignSignalRevisionSchema,
};

export const reviewCampaignSignalInputSchema = z.object(campaignSignalActionBase).strict();
export type ReviewCampaignSignalInput = z.infer<typeof reviewCampaignSignalInputSchema>;

const contradictionReviewAssertionSchema = z
  .object({
    assertion: assertionSchema,
    subjectName: z.string(),
    objectName: z.string().nullable(),
    sourceDescription: z.string().nullable(),
    sessionTitle: z.string().nullable(),
    sourceState: z.enum(['unlinked', 'available', 'unavailable']),
  })
  .strict()
  .refine(
    (entry) =>
      entry.sourceState === 'available' ||
      (entry.sourceDescription === null && entry.sessionTitle === null),
    'Proveniência indisponível não pode conter descrições ou títulos apresentados como reais.',
  );
export const contradictionReviewSchema = z
  .object({
    signal: campaignSignalSchema,
    assertions: z.tuple([contradictionReviewAssertionSchema, contradictionReviewAssertionSchema]),
  })
  .strict()
  .refine(
    ({ signal, assertions }) =>
      signal.signalType === 'potential_contradiction' &&
      assertions[0].assertion.id !== assertions[1].assertion.id &&
      assertions.every(({ assertion }) => assertion.campaignId === signal.campaignId),
    'O par deve conter duas afirmações distintas da campanha do aviso.',
  );
export type ContradictionReview = z.infer<typeof contradictionReviewSchema>;

export const dismissCampaignSignalInputSchema = z.object(campaignSignalActionBase).strict();
export type DismissCampaignSignalInput = z.infer<typeof dismissCampaignSignalInputSchema>;

export const reactivateCampaignSignalInputSchema = z.object(campaignSignalActionBase).strict();
export type ReactivateCampaignSignalInput = z.infer<typeof reactivateCampaignSignalInputSchema>;

export const snoozeCampaignSignalInputSchema = z
  .object({
    ...campaignSignalActionBase,
    dismissedUntil: campaignSignalTimestampSchema,
  })
  .strict();
export type SnoozeCampaignSignalInput = z.infer<typeof snoozeCampaignSignalInputSchema>;

export const markContradictionExceptionInputSchema = z.object(campaignSignalActionBase).strict();
export type MarkContradictionExceptionInput = z.infer<typeof markContradictionExceptionInputSchema>;

export interface CampaignSignalGateway {
  getContradictionReview(input: ReviewCampaignSignalInput): Promise<Result<ContradictionReview>>;
  list(input: CampaignSignalCampaignInput): Promise<Result<CampaignSignalListResult>>;
  listForWorldInMotion(
    input: CampaignSignalCampaignInput,
  ): Promise<Result<CampaignSignalListResult>>;
  recalculate(
    input: CampaignSignalCampaignInput,
  ): Promise<Result<CampaignSignalRecalculationResult>>;
  review(input: ReviewCampaignSignalInput): Promise<Result<CampaignSignal>>;
  dismiss(input: DismissCampaignSignalInput): Promise<Result<CampaignSignal>>;
  reactivate(input: ReactivateCampaignSignalInput): Promise<Result<CampaignSignal>>;
  snooze(input: SnoozeCampaignSignalInput): Promise<Result<CampaignSignal>>;
  markContradictionException(
    input: MarkContradictionExceptionInput,
  ): Promise<Result<CampaignSignal>>;
}
