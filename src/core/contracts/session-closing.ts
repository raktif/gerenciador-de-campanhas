import { z } from 'zod';
import type { Result } from './result';

export const sessionClosingSteps = [
  'inbox',
  'events',
  'changes',
  'clocks',
  'consequences',
  'threads',
  'signals',
  'next_session',
] as const;
export const sessionClosingStepStatuses = ['pending', 'completed', 'skipped'] as const;
export const sessionPreparationObjectTypes = ['story_thread', 'clock', 'demand', 'signal'] as const;
export type SessionClosingStep = (typeof sessionClosingSteps)[number];
export type SessionClosingStepStatus = (typeof sessionClosingStepStatuses)[number];
export type SessionPreparationObjectType = (typeof sessionPreparationObjectTypes)[number];

export const sessionClosingStepSchema = z
  .object({
    id: z.uuid(),
    campaignId: z.uuid(),
    sessionId: z.uuid(),
    step: z.enum(sessionClosingSteps),
    status: z.enum(sessionClosingStepStatuses),
    completedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
    revision: z.number().int().positive(),
  })
  .strict();
export type SessionClosingStepRecord = z.infer<typeof sessionClosingStepSchema>;
export const sessionClosingWorkflowSchema = z
  .object({
    campaignId: z.uuid(),
    sessionId: z.uuid(),
    steps: z.array(sessionClosingStepSchema).length(sessionClosingSteps.length),
  })
  .strict();
export type SessionClosingWorkflow = z.infer<typeof sessionClosingWorkflowSchema>;
export const getSessionClosingInputSchema = z
  .object({ campaignId: z.uuid(), sessionId: z.uuid() })
  .strict();
export type GetSessionClosingInput = z.infer<typeof getSessionClosingInputSchema>;
export const updateSessionClosingStepInputSchema = z
  .object({
    campaignId: z.uuid(),
    sessionId: z.uuid(),
    step: z.enum(sessionClosingSteps),
    revision: z.number().int().positive(),
    status: z.enum(sessionClosingStepStatuses),
  })
  .strict();
export type UpdateSessionClosingStepInput = z.infer<typeof updateSessionClosingStepInputSchema>;
export const quickCloseSessionInputSchema = getSessionClosingInputSchema;
export type QuickCloseSessionInput = z.infer<typeof quickCloseSessionInputSchema>;

export const sessionPreparationItemSchema = z
  .object({
    id: z.uuid(),
    campaignId: z.uuid(),
    sessionId: z.uuid(),
    objectType: z.enum(sessionPreparationObjectTypes),
    objectId: z.uuid(),
    label: z.string().min(1),
    reason: z.string().min(1),
    selected: z.boolean(),
    updatedAt: z.iso.datetime(),
    revision: z.number().int().positive(),
  })
  .strict();
export type SessionPreparationItem = z.infer<typeof sessionPreparationItemSchema>;
export const sessionPreparationSchema = z
  .object({
    campaignId: z.uuid(),
    sessionId: z.uuid(),
    items: z.array(sessionPreparationItemSchema),
  })
  .strict();
export type SessionPreparation = z.infer<typeof sessionPreparationSchema>;
export const getSessionPreparationInputSchema = getSessionClosingInputSchema;
export type GetSessionPreparationInput = z.infer<typeof getSessionPreparationInputSchema>;
export const selectSessionPreparationItemInputSchema = z
  .object({
    campaignId: z.uuid(),
    sessionId: z.uuid(),
    id: z.uuid(),
    revision: z.number().int().positive(),
    selected: z.boolean(),
  })
  .strict();
export type SelectSessionPreparationItemInput = z.infer<
  typeof selectSessionPreparationItemInputSchema
>;

export interface SessionClosingGateway {
  get(input: GetSessionClosingInput): Promise<Result<SessionClosingWorkflow>>;
  updateStep(input: UpdateSessionClosingStepInput): Promise<Result<SessionClosingWorkflow>>;
  quickClose(input: QuickCloseSessionInput): Promise<Result<SessionClosingWorkflow>>;
  getPreparation(input: GetSessionPreparationInput): Promise<Result<SessionPreparation>>;
  selectPreparationItem(
    input: SelectSessionPreparationItemInput,
  ): Promise<Result<SessionPreparation>>;
}
