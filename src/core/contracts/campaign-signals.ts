import { z } from 'zod';

export const campaignSignalIdentifierSchema = z
  .string()
  .regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u);
export const campaignSignalTimestampSchema = z.iso.datetime({ precision: 3 });

export const campaignSignalTypes = [
  'explicit_need',
  'blocked_goal',
  'open_consequence',
  'clock_pressure',
  'shared_resource',
  'recent_change',
  'open_thread',
  'stale_thread',
  'uninvestigated_clue',
  'ignored_demand',
  'cross_plot_bridge',
  'potential_contradiction',
  'inactive_entity',
  'unresolved_mystery',
  'unfulfilled_promise',
] as const;
export const campaignSignalStatuses = [
  'new',
  'viewed',
  'dismissed',
  'snoozed',
  'converted',
  'resolved',
  'stale',
] as const;
export const campaignSignalSeverities = ['low', 'medium', 'high'] as const;
export const campaignSignalGeneratorKinds = ['deterministic'] as const;
export const signalEvidenceObjectTypes = [
  'entity',
  'relationship',
  'assertion',
  'event',
  'session',
  'note',
] as const;

export const campaignSignalTypeSchema = z.enum(campaignSignalTypes);
export const campaignSignalStatusSchema = z.enum(campaignSignalStatuses);
export const campaignSignalSeveritySchema = z.enum(campaignSignalSeverities);
export const campaignSignalGeneratorKindSchema = z.enum(campaignSignalGeneratorKinds);
export const signalEvidenceObjectTypeSchema = z.enum(signalEvidenceObjectTypes);
export const campaignSignalScoreSchema = z.number().int().min(-5).max(5);
export const campaignSignalRevisionSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const signalEvidenceSortOrderSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const campaignSignalSeverityLabels = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
} as const satisfies Record<(typeof campaignSignalSeverities)[number], string>;

export const campaignSignalSchema = z
  .object({
    id: campaignSignalIdentifierSchema,
    campaignId: campaignSignalIdentifierSchema,
    signalType: campaignSignalTypeSchema,
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    score: campaignSignalScoreSchema,
    severity: campaignSignalSeveritySchema,
    status: campaignSignalStatusSchema,
    generatedAt: campaignSignalTimestampSchema,
    lastDetectedAt: campaignSignalTimestampSchema,
    dismissedUntil: campaignSignalTimestampSchema.nullable(),
    ruleVersion: z.string().trim().min(1),
    generatorKind: campaignSignalGeneratorKindSchema,
    createdAt: campaignSignalTimestampSchema,
    updatedAt: campaignSignalTimestampSchema,
    revision: campaignSignalRevisionSchema,
  })
  .strict();
export type CampaignSignal = z.infer<typeof campaignSignalSchema>;

// SQLite length(TEXT) counts Unicode code points, not JavaScript UTF-16 units.
// Apply the same limit after the existing whitespace normalization.
function evidenceTextSchema(maximumCodePoints: number) {
  return z
    .string()
    .trim()
    .min(1)
    .refine((value) => !value.includes('\0'), 'O texto não deve conter NUL.')
    .refine(
      (value) => Array.from(value).length <= maximumCodePoints,
      `O texto deve ter no máximo ${String(maximumCodePoints)} pontos de código Unicode.`,
    );
}

export const signalEvidenceSchema = z
  .object({
    id: campaignSignalIdentifierSchema,
    signalId: campaignSignalIdentifierSchema,
    objectType: signalEvidenceObjectTypeSchema,
    objectId: campaignSignalIdentifierSchema,
    role: evidenceTextSchema(100),
    description: evidenceTextSchema(2000).nullable(),
    graphPath: z.array(z.json()).nullable(),
    sortOrder: signalEvidenceSortOrderSchema,
    createdAt: campaignSignalTimestampSchema,
  })
  .strict();
export type SignalEvidence = z.infer<typeof signalEvidenceSchema>;
