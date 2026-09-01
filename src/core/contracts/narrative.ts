import { z } from 'zod';

export const canonStates = ['draft', 'accepted', 'rejected', 'archived'] as const;
export const knowledgeStates = [
  'fact',
  'rumor',
  'suspicion',
  'secret',
  'possibility',
  'disproved',
] as const;
export const visibilityStates = ['gm', 'players', 'public'] as const;
export const originKinds = [
  'manual',
  'session',
  'import',
  'document',
  'ruleset',
  'ai',
  'generator',
] as const;
export const sessionStatuses = ['planned', 'in_progress', 'completed', 'cancelled'] as const;
export const noteTypes = [
  'general',
  'idea',
  'scene',
  'clue',
  'secret',
  'preparation',
  'reference',
] as const;
export const sessionParticipantRoles = [
  'player_character',
  'ally',
  'npc',
  'observer',
  'other',
] as const;
export const sessionIntentionStatuses = ['open', 'completed', 'abandoned', 'transformed'] as const;
export const eventEntityRoles = [
  'participant',
  'location',
  'cause',
  'target',
  'witness',
  'beneficiary',
  'victim',
  'related',
] as const;
export const inboxStatuses = ['new', 'reviewing', 'converted', 'dismissed', 'archived'] as const;

export const canonStateSchema = z.enum(canonStates);
export const knowledgeStateSchema = z.enum(knowledgeStates);
export const visibilityStateSchema = z.enum(visibilityStates);
export const originKindSchema = z.enum(originKinds);
export const sessionStatusSchema = z.enum(sessionStatuses);
export const noteTypeSchema = z.enum(noteTypes);
export const sessionParticipantRoleSchema = z.enum(sessionParticipantRoles);
export const sessionIntentionStatusSchema = z.enum(sessionIntentionStatuses);
export const eventEntityRoleSchema = z.enum(eventEntityRoles);
export const inboxStatusSchema = z.enum(inboxStatuses);
export const identifierSchema = z.uuid();
export const timestampSchema = z.iso.datetime();
export const revisionSchema = z.number().int().positive();
export const nullableSourceIdSchema = identifierSchema.nullable();

export const manualNarrativeDefaults = {
  canonState: 'accepted',
  knowledgeState: 'fact',
  visibility: 'gm',
  originKind: 'manual',
} as const;

export const narrativeMetadataSchema = z
  .object({
    canonState: canonStateSchema,
    knowledgeState: knowledgeStateSchema,
    visibility: visibilityStateSchema,
    originKind: originKindSchema,
    sourceId: nullableSourceIdSchema,
  })
  .strict();

export const sourceSchema = z
  .object({
    id: identifierSchema,
    kind: originKindSchema,
    sessionId: identifierSchema.nullable(),
    documentChunkId: identifierSchema.nullable(),
    aiRunId: identifierSchema.nullable(),
    importBatchId: identifierSchema.nullable(),
    rulesetPackId: identifierSchema.nullable(),
    description: z.string().trim().min(1).max(2000).nullable(),
    createdAt: timestampSchema,
  })
  .strict()
  .superRefine((source, context) => {
    const references = {
      session: source.sessionId,
      document: source.documentChunkId,
      ai: source.aiRunId,
      import: source.importBatchId,
      ruleset: source.rulesetPackId,
    } as const;
    const populated = Object.entries(references).filter(([, value]) => value !== null);
    if (source.kind === 'manual' && populated.length === 0) return;
    if (source.kind === 'generator' && populated.length === 0 && source.description !== null)
      return;
    if (source.kind in references && populated.length === 1 && populated[0]?.[0] === source.kind)
      return;
    context.addIssue({
      code: 'custom',
      message: 'A combinação entre o tipo e a referência da fonte é inválida.',
    });
  });

export type CanonState = z.infer<typeof canonStateSchema>;
export type KnowledgeState = z.infer<typeof knowledgeStateSchema>;
export type VisibilityState = z.infer<typeof visibilityStateSchema>;
export type OriginKind = z.infer<typeof originKindSchema>;
export type NarrativeMetadata = z.infer<typeof narrativeMetadataSchema>;
export type Source = z.infer<typeof sourceSchema>;
