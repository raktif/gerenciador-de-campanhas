import { z } from 'zod';
import type { Result } from './result';

export const relationshipViewTypes = ['campaign', 'neighborhood'] as const;
export const relationshipViewTypeSchema = z.enum(relationshipViewTypes);
export const minimumRelationshipViewZoom = 0.1;
export const maximumRelationshipViewZoom = 4;
export const maximumRelationshipViewCoordinate = 1_000_000;
export const maximumRelationshipViewNodeSize = 4096;
export const maximumRelationshipViewNodes = 250;

const coordinateSchema = z
  .number()
  .finite()
  .min(-maximumRelationshipViewCoordinate)
  .max(maximumRelationshipViewCoordinate);
const nodeSizeSchema = z.number().finite().positive().max(maximumRelationshipViewNodeSize);

export const relationshipViewportSchema = z
  .object({
    x: coordinateSchema,
    y: coordinateSchema,
    zoom: z.number().finite().min(minimumRelationshipViewZoom).max(maximumRelationshipViewZoom),
  })
  .strict();
export type RelationshipViewport = z.infer<typeof relationshipViewportSchema>;

export const relationshipViewSchema = z
  .object({
    id: z.uuid(),
    campaignId: z.uuid(),
    name: z.string().trim().min(1).max(120),
    viewType: relationshipViewTypeSchema,
    sourceEntityId: z.uuid().nullable(),
    isDefault: z.boolean(),
    viewport: relationshipViewportSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    revision: z.number().int().positive(),
  })
  .strict()
  .superRefine(validateViewSource);
export type RelationshipView = z.infer<typeof relationshipViewSchema>;

export const relationshipViewNodeSchema = z
  .object({
    relationshipViewId: z.uuid(),
    entityId: z.uuid(),
    x: coordinateSchema,
    y: coordinateSchema,
    width: nodeSizeSchema,
    height: nodeSizeSchema,
    pinned: z.boolean(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type RelationshipViewNode = z.infer<typeof relationshipViewNodeSchema>;

export const relationshipViewStateSchema = z
  .object({
    view: relationshipViewSchema,
    nodes: z.array(relationshipViewNodeSchema).max(maximumRelationshipViewNodes),
  })
  .strict()
  .superRefine((state, context) => {
    const entityIds = new Set<string>();
    state.nodes.forEach((node, index) => {
      if (node.relationshipViewId !== state.view.id)
        context.addIssue({
          code: 'custom',
          path: ['nodes', index, 'relationshipViewId'],
          message: 'O nó deve pertencer à mesma visualização do estado.',
        });
      if (entityIds.has(node.entityId))
        context.addIssue({
          code: 'custom',
          path: ['nodes', index, 'entityId'],
          message: 'O estado não pode repetir entidades.',
        });
      entityIds.add(node.entityId);
    });
  });
export type RelationshipViewState = z.infer<typeof relationshipViewStateSchema>;

export const getRelationshipViewInputSchema = z
  .object({
    campaignId: z.uuid(),
    viewType: relationshipViewTypeSchema,
    sourceEntityId: z.uuid().nullable(),
  })
  .strict()
  .superRefine(validateViewSource);
export type GetRelationshipViewInput = z.infer<typeof getRelationshipViewInputSchema>;

export const relationshipNodePositionSchema = z
  .object({
    entityId: z.uuid(),
    x: coordinateSchema,
    y: coordinateSchema,
    width: nodeSizeSchema,
    height: nodeSizeSchema,
    pinned: z.boolean(),
  })
  .strict();
export type RelationshipNodePosition = z.infer<typeof relationshipNodePositionSchema>;

const relationshipViewMutationBaseSchema = z
  .object({
    campaignId: z.uuid(),
    relationshipViewId: z.uuid(),
    revision: z.number().int().positive(),
  })
  .strict();

export const saveRelationshipNodePositionInputSchema = relationshipViewMutationBaseSchema
  .extend({ position: relationshipNodePositionSchema })
  .strict();
export type SaveRelationshipNodePositionInput = z.infer<
  typeof saveRelationshipNodePositionInputSchema
>;

export const saveRelationshipViewportInputSchema = relationshipViewMutationBaseSchema
  .extend({ viewport: relationshipViewportSchema })
  .strict();
export type SaveRelationshipViewportInput = z.infer<typeof saveRelationshipViewportInputSchema>;

export const applyRelationshipAutoLayoutInputSchema = relationshipViewMutationBaseSchema
  .extend({
    positions: z
      .array(relationshipNodePositionSchema)
      .min(1)
      .max(maximumRelationshipViewNodes)
      .refine(
        (positions) =>
          new Set(positions.map((position) => position.entityId)).size === positions.length,
        'O layout não pode repetir entidades.',
      ),
    viewport: relationshipViewportSchema,
  })
  .strict();
export type ApplyRelationshipAutoLayoutInput = z.infer<
  typeof applyRelationshipAutoLayoutInputSchema
>;

export const resetRelationshipLayoutInputSchema = relationshipViewMutationBaseSchema;
export type ResetRelationshipLayoutInput = z.infer<typeof resetRelationshipLayoutInputSchema>;

export interface RelationshipViewGateway {
  get(input: GetRelationshipViewInput): Promise<Result<RelationshipViewState>>;
  saveNodePosition(
    input: SaveRelationshipNodePositionInput,
  ): Promise<Result<RelationshipViewState>>;
  saveViewport(input: SaveRelationshipViewportInput): Promise<Result<RelationshipViewState>>;
  autoLayout(input: ApplyRelationshipAutoLayoutInput): Promise<Result<RelationshipViewState>>;
  resetLayout(input: ResetRelationshipLayoutInput): Promise<Result<RelationshipViewState>>;
}

function validateViewSource(
  value: { viewType: (typeof relationshipViewTypes)[number]; sourceEntityId: string | null },
  context: z.RefinementCtx,
): void {
  const sourceIsCoherent =
    (value.viewType === 'campaign' && value.sourceEntityId === null) ||
    (value.viewType === 'neighborhood' && value.sourceEntityId !== null);
  if (!sourceIsCoherent)
    context.addIssue({
      code: 'custom',
      path: ['sourceEntityId'],
      message: 'A origem deve existir apenas em visualizações de vizinhança.',
    });
}
