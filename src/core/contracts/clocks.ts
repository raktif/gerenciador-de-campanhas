import { z } from 'zod';
import {
  canonStates,
  identifierSchema,
  knowledgeStates,
  manualNarrativeDefaults,
  nullableSourceIdSchema,
  originKinds,
  revisionSchema,
  timestampSchema,
  visibilityStates,
} from './narrative';
import type { Result } from './result';

export const clockTypes = [
  'progress',
  'threat',
  'countdown',
  'project',
  'investigation',
  'custom',
] as const;
export const clockStatuses = ['active', 'completed'] as const;
export const clockDivisionCounts = [4, 6, 8, 10, 12] as const;

export const clockTypeSchema = z.enum(clockTypes);
export const clockStatusSchema = z.enum(clockStatuses);
export const clockDivisionCountSchema = z.union([
  z.literal(4),
  z.literal(6),
  z.literal(8),
  z.literal(10),
  z.literal(12),
]);

const clockText = z.string().trim().min(1).max(200);
const clockDescription = z.string().trim().max(10000).nullable();
const clockConsequence = z.string().trim().min(1).max(10000);

const clockNarrativeFields = {
  canonState: z.enum(canonStates).default(manualNarrativeDefaults.canonState),
  knowledgeState: z.enum(knowledgeStates).default(manualNarrativeDefaults.knowledgeState),
  visibility: z.enum(visibilityStates).default(manualNarrativeDefaults.visibility),
  originKind: z.enum(originKinds).default(manualNarrativeDefaults.originKind),
  sourceId: nullableSourceIdSchema.default(null),
};

export const clockSchema = z
  .object({
    id: identifierSchema,
    campaignId: identifierSchema,
    name: clockText,
    description: z.string().max(10000).nullable(),
    consequence: clockConsequence,
    clockType: clockTypeSchema,
    segmentsTotal: clockDivisionCountSchema,
    segmentsFilled: z.number().int().min(0).max(12),
    status: clockStatusSchema,
    entityId: identifierSchema,
    entityName: clockText,
    entityArchivedAt: timestampSchema.nullable(),
    canonState: z.enum(canonStates),
    knowledgeState: z.enum(knowledgeStates),
    visibility: z.enum(visibilityStates),
    originKind: z.enum(originKinds),
    sourceId: nullableSourceIdSchema,
    generatedEventId: nullableSourceIdSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    revision: revisionSchema,
  })
  .strict()
  .superRefine((clock, context) => {
    if (clock.segmentsFilled > clock.segmentsTotal)
      context.addIssue({
        code: 'custom',
        message: 'O progresso não pode exceder o total de divisões.',
        path: ['segmentsFilled'],
      });
    if (clock.segmentsFilled === clock.segmentsTotal && clock.status !== 'completed')
      context.addIssue({
        code: 'custom',
        message: 'Um relógio totalmente preenchido deve estar concluído.',
        path: ['status'],
      });
  });

export const createClockInputSchema = z
  .object({
    campaignId: identifierSchema,
    idempotencyKey: identifierSchema,
    name: clockText,
    description: clockDescription.optional(),
    consequence: clockConsequence,
    clockType: clockTypeSchema,
    segmentsTotal: clockDivisionCountSchema,
    segmentsFilled: z.number().int().min(0).max(12).default(0),
    entityId: identifierSchema,
    ...clockNarrativeFields,
    generateEvent: z.boolean().optional(),
  })
  .strict()
  .superRefine((clock, context) => {
    if (clock.segmentsFilled > clock.segmentsTotal)
      context.addIssue({
        code: 'custom',
        message: 'O progresso não pode exceder o total de divisões.',
        path: ['segmentsFilled'],
      });
    if (clock.segmentsFilled === clock.segmentsTotal && clock.generateEvent === undefined)
      context.addIssue({
        code: 'custom',
        message: 'Informe se deseja gerar um Evento antes de criar um relógio já concluído.',
        path: ['generateEvent'],
      });
  });

export const clockPatchSchema = z
  .object({
    name: clockText.optional(),
    description: clockDescription.optional(),
    consequence: clockConsequence.optional(),
    clockType: clockTypeSchema.optional(),
    segmentsTotal: clockDivisionCountSchema.optional(),
    segmentsFilled: z.number().int().min(0).max(12).optional(),
    entityId: identifierSchema.optional(),
    canonState: z.enum(canonStates).optional(),
    knowledgeState: z.enum(knowledgeStates).optional(),
    visibility: z.enum(visibilityStates).optional(),
    originKind: z.enum(originKinds).optional(),
    sourceId: nullableSourceIdSchema.optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'Informe ao menos um campo para atualizar.');

export const updateClockInputSchema = z
  .object({
    campaignId: identifierSchema,
    id: identifierSchema,
    revision: revisionSchema,
    patch: clockPatchSchema,
    generateEvent: z.boolean().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.patch.segmentsFilled !== undefined &&
      input.patch.segmentsTotal !== undefined &&
      input.patch.segmentsFilled === input.patch.segmentsTotal &&
      input.generateEvent === undefined
    )
      context.addIssue({
        code: 'custom',
        message: 'Informe se deseja gerar um Evento antes de concluir o relógio.',
        path: ['generateEvent'],
      });
  });

export const getClockInputSchema = z
  .object({ campaignId: identifierSchema, id: identifierSchema })
  .strict();

export const completeClockInputSchema = z
  .object({
    campaignId: identifierSchema,
    id: identifierSchema,
    revision: revisionSchema,
    generateEvent: z.boolean(),
  })
  .strict();

export const clockPageRequestSchema = z
  .object({
    campaignId: identifierSchema,
    status: clockStatusSchema.optional(),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .strict();

export const clockPageResultSchema = z
  .object({
    items: z.array(clockSchema),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative(),
  })
  .strict();

export type Clock = z.infer<typeof clockSchema>;
export type ClockType = (typeof clockTypes)[number];
export type ClockStatus = (typeof clockStatuses)[number];
export type ClockDivisionCount = (typeof clockDivisionCounts)[number];
export type CreateClockInput = z.input<typeof createClockInputSchema>;
export type CreateClockRequest = z.infer<typeof createClockInputSchema>;
export type UpdateClockInput = z.infer<typeof updateClockInputSchema>;
export type GetClockInput = z.infer<typeof getClockInputSchema>;
export type CompleteClockInput = z.infer<typeof completeClockInputSchema>;
export type ClockPageRequestInput = z.input<typeof clockPageRequestSchema>;
export type ClockPageRequest = z.infer<typeof clockPageRequestSchema>;
export type ClockPageResult = z.infer<typeof clockPageResultSchema>;

export interface ClockGateway {
  create(input: CreateClockInput): Promise<Result<Clock>>;
  get(input: GetClockInput): Promise<Result<Clock>>;
  list(input: ClockPageRequestInput): Promise<Result<ClockPageResult>>;
  update(input: UpdateClockInput): Promise<Result<Clock>>;
  complete(input: CompleteClockInput): Promise<Result<Clock>>;
}
