import { z } from 'zod';
import {
  canonStates,
  knowledgeStates,
  manualNarrativeDefaults,
  noteTypes,
  nullableSourceIdSchema,
  originKinds,
  visibilityStates,
} from './narrative';
import { defaultPageLimit, maximumPageLimit, type PageResult } from './pagination';
import type { Result } from './result';

const titleSchema = z.string().trim().min(1).max(200);
const bodyMarkdownSchema = z
  .string()
  .min(1)
  .max(100000)
  .refine((body) => body.trim().length > 0, 'O corpo da nota não pode ficar em branco.');
const roleSchema = z.string().trim().min(1).max(100);

export const noteEntityLinkSchema = z
  .object({
    noteId: z.uuid(),
    entityId: z.uuid(),
    role: roleSchema,
  })
  .strict();
export type NoteEntityLink = z.infer<typeof noteEntityLinkSchema>;

export const noteEntityLinkInputSchema = z
  .object({
    entityId: z.uuid(),
    role: roleSchema.default('related'),
  })
  .strict();
export type NoteEntityLinkInput = z.output<typeof noteEntityLinkInputSchema>;
export type NoteEntityLinkInputRequest = z.input<typeof noteEntityLinkInputSchema>;

export const noteEntityLinksInputSchema = z
  .array(noteEntityLinkInputSchema)
  .max(100)
  .superRefine((links, context) => {
    const seen = new Set<string>();
    links.forEach((link, index) => {
      const key = `${link.entityId}\u0000${link.role}`;
      if (!seen.has(key)) {
        seen.add(key);
        return;
      }
      context.addIssue({
        code: 'custom',
        message: 'O mesmo vínculo e papel não podem ser informados mais de uma vez.',
        path: [index],
      });
    });
  });

export const noteSchema = z
  .object({
    id: z.uuid(),
    campaignId: z.uuid(),
    title: titleSchema,
    bodyMarkdown: bodyMarkdownSchema,
    noteType: z.enum(noteTypes),
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
export type Note = z.infer<typeof noteSchema>;

export const noteDetailsSchema = z
  .object({ note: noteSchema, links: z.array(noteEntityLinkSchema) })
  .strict();
export type NoteDetails = z.infer<typeof noteDetailsSchema>;

export const createNoteInputSchema = z
  .object({
    campaignId: z.uuid(),
    title: titleSchema,
    bodyMarkdown: bodyMarkdownSchema,
    noteType: z.enum(noteTypes).default('general'),
    canonState: z.enum(canonStates).default(manualNarrativeDefaults.canonState),
    knowledgeState: z.enum(knowledgeStates).default(manualNarrativeDefaults.knowledgeState),
    visibility: z.enum(visibilityStates).default(manualNarrativeDefaults.visibility),
    originKind: z.enum(originKinds).default(manualNarrativeDefaults.originKind),
    sourceId: nullableSourceIdSchema.default(null),
    links: noteEntityLinksInputSchema.default([]),
  })
  .strict();
export type CreateNoteInput = z.output<typeof createNoteInputSchema>;
export type CreateNoteInputRequest = z.input<typeof createNoteInputSchema>;

export const notePatchSchema = z
  .object({
    title: titleSchema.optional(),
    bodyMarkdown: bodyMarkdownSchema.optional(),
    noteType: z.enum(noteTypes).optional(),
    canonState: z.enum(canonStates).optional(),
    knowledgeState: z.enum(knowledgeStates).optional(),
    visibility: z.enum(visibilityStates).optional(),
    originKind: z.enum(originKinds).optional(),
    sourceId: nullableSourceIdSchema.optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'Informe ao menos uma alteração.');
export type NotePatch = z.infer<typeof notePatchSchema>;

export const updateNoteInputSchema = z
  .object({
    campaignId: z.uuid(),
    id: z.uuid(),
    revision: z.number().int().positive(),
    patch: notePatchSchema.optional(),
    links: noteEntityLinksInputSchema.optional(),
  })
  .strict()
  .refine(
    (input) => input.patch !== undefined || input.links !== undefined,
    'Informe ao menos uma alteração.',
  );
export type UpdateNoteInput = z.infer<typeof updateNoteInputSchema>;

export const getNoteInputSchema = z.object({ campaignId: z.uuid(), id: z.uuid() }).strict();
export type GetNoteInput = z.infer<typeof getNoteInputSchema>;

export const noteLifecycleInputSchema = z
  .object({ campaignId: z.uuid(), id: z.uuid(), revision: z.number().int().positive() })
  .strict();
export type NoteLifecycleInput = z.infer<typeof noteLifecycleInputSchema>;

export const notePageRequestSchema = z
  .object({
    campaignId: z.uuid(),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.number().int().positive().max(maximumPageLimit).default(defaultPageLimit),
    filters: z
      .object({
        entityId: z.uuid().optional(),
        noteType: z.enum(noteTypes).optional(),
        canonState: z.enum(canonStates).optional(),
        knowledgeState: z.enum(knowledgeStates).optional(),
        visibility: z.enum(visibilityStates).optional(),
        originKind: z.enum(originKinds).optional(),
        archived: z.boolean().default(false),
      })
      .strict()
      .default({ archived: false }),
    sort: z.enum(['title', 'updatedAt', 'createdAt']).default('updatedAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();
export type NotePageRequest = z.infer<typeof notePageRequestSchema>;
export type NotePageRequestInput = z.input<typeof notePageRequestSchema>;
export type NotePageResult = PageResult<Note>;

export const notePageResultSchema = z
  .object({
    items: z.array(noteSchema),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative().optional(),
  })
  .strict();

export interface NoteGateway {
  create(input: CreateNoteInputRequest): Promise<Result<NoteDetails>>;
  get(input: GetNoteInput): Promise<Result<NoteDetails>>;
  list(input: NotePageRequestInput): Promise<Result<NotePageResult>>;
  update(input: UpdateNoteInput): Promise<Result<NoteDetails>>;
  archive(input: NoteLifecycleInput): Promise<Result<NoteDetails>>;
  restore(input: NoteLifecycleInput): Promise<Result<NoteDetails>>;
}
