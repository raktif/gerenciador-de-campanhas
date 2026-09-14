import { z } from 'zod';
import { inboxStatuses, originKinds } from './narrative';
import type { Result } from './result';

const rawTextSchema = z
  .string()
  .min(1)
  .max(10000)
  .refine((value) => value.trim().length > 0, 'Informe o texto da captura.');

const nullableConvertedObjectTypeSchema = z.string().trim().min(1).max(100).nullable();

export const inboxItemSchema = z
  .object({
    id: z.uuid(),
    campaignId: z.uuid(),
    sessionId: z.uuid().nullable(),
    rawText: rawTextSchema,
    status: z.enum(inboxStatuses),
    originKind: z.enum(originKinds),
    capturedAt: z.iso.datetime(),
    convertedObjectType: nullableConvertedObjectTypeSchema,
    convertedObjectId: z.uuid().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    revision: z.number().int().positive(),
  })
  .strict()
  .superRefine((item, context) => {
    const converted = item.status === 'converted';
    const hasConvertedDestination =
      item.convertedObjectType !== null && item.convertedObjectId !== null;
    const hasNoConvertedDestination =
      item.convertedObjectType === null && item.convertedObjectId === null;
    if ((converted && !hasConvertedDestination) || (!converted && !hasNoConvertedDestination))
      context.addIssue({
        code: 'custom',
        message: 'O destino da conversão deve estar presente somente para itens convertidos.',
        path: ['status'],
      });
  });
export type InboxItem = z.infer<typeof inboxItemSchema>;

export const captureInboxItemInputSchema = z
  .object({
    campaignId: z.uuid(),
    sessionId: z.uuid().nullable().default(null),
    rawText: rawTextSchema,
  })
  .strict();
export type CaptureInboxItemInput = z.output<typeof captureInboxItemInputSchema>;
export type CaptureInboxItemInputRequest = z.input<typeof captureInboxItemInputSchema>;

export interface InboxGateway {
  capture(input: CaptureInboxItemInputRequest): Promise<Result<InboxItem>>;
}
