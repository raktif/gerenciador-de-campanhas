import { z } from 'zod';
import type { Result } from './result';

export const causalObjectTypes = [
  'entity',
  'relationship',
  'assertion',
  'note',
  'event',
  'session',
  'clock',
  'demand',
  'story_thread',
] as const;
export const causalTypes = [
  'causes',
  'contributes_to',
  'enables',
  'blocks',
  'worsens',
  'improves',
  'transforms',
  'resolves',
  'reveals',
] as const;
export type CausalObjectType = (typeof causalObjectTypes)[number];
export type CausalType = (typeof causalTypes)[number];

export const causalObjectSchema = z
  .object({
    id: z.uuid(),
    campaignId: z.uuid(),
    objectType: z.enum(causalObjectTypes),
    objectId: z.uuid(),
    label: z.string(),
    archived: z.boolean(),
  })
  .strict();
export type CausalObject = z.infer<typeof causalObjectSchema>;
export const causalLinkSchema = z
  .object({
    id: z.uuid(),
    campaignId: z.uuid(),
    source: causalObjectSchema,
    target: causalObjectSchema,
    causalType: z.enum(causalTypes),
    description: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    revision: z.number().int().positive(),
  })
  .strict();
export type CausalLink = z.infer<typeof causalLinkSchema>;

export const createCausalLinkInputSchema = z
  .object({
    campaignId: z.uuid(),
    sourceType: z.enum(causalObjectTypes),
    sourceId: z.uuid(),
    targetType: z.enum(causalObjectTypes),
    targetId: z.uuid(),
    causalType: z.enum(causalTypes),
    description: z.string().trim().max(2000).nullable().default(null),
  })
  .strict()
  .refine((input) => input.sourceType !== input.targetType || input.sourceId !== input.targetId, {
    message: 'A causa e o efeito devem ser registros diferentes.',
  });
export type CreateCausalLinkInput = z.input<typeof createCausalLinkInputSchema>;
export const updateCausalLinkInputSchema = z
  .object({
    campaignId: z.uuid(),
    id: z.uuid(),
    revision: z.number().int().positive(),
    description: z.string().trim().max(2000).nullable(),
  })
  .strict();
export type UpdateCausalLinkInput = z.infer<typeof updateCausalLinkInputSchema>;
export const getCausalChainInputSchema = z
  .object({
    campaignId: z.uuid(),
    objectType: z.enum(causalObjectTypes),
    objectId: z.uuid(),
    direction: z.enum(['outgoing', 'incoming', 'both']).default('outgoing'),
    maxDepth: z.number().int().positive().max(20).default(8),
    maxNodes: z.number().int().positive().max(500).default(100),
  })
  .strict();
export type GetCausalChainInput = z.input<typeof getCausalChainInputSchema>;
export const causalChainSchema = z
  .object({
    root: causalObjectSchema,
    nodes: z.array(causalObjectSchema),
    links: z.array(causalLinkSchema),
    truncated: z.boolean(),
    maxDepth: z.number().int().positive(),
    maxNodes: z.number().int().positive(),
  })
  .strict();
export type CausalChain = z.infer<typeof causalChainSchema>;
export interface CausalityGateway {
  createLink(input: CreateCausalLinkInput): Promise<Result<CausalLink>>;
  updateLink(input: UpdateCausalLinkInput): Promise<Result<CausalLink>>;
  getChain(input: GetCausalChainInput): Promise<Result<CausalChain>>;
}
