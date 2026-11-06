import { z } from 'zod';
import type { Result } from './result';

const diagnosticCodeSchema = z.string().regex(/^[A-Z0-9_]{1,80}$/);
const diagnosticScreenSchema = z.enum([
  'campaigns',
  'entity-types',
  'entities',
  'field-definitions',
  'inbox',
  'relationships',
  'relationship-types',
  'assertions',
  'notes',
  'sessions',
  'timeline',
  'events',
  'phase-zero',
]);
const diagnosticOperationSchema = z.enum([
  'campaigns.list',
  'campaigns.mutate',
  'entity-types.list',
  'entity-types.mutate',
  'entities.list',
  'entities.mutate',
  'field-definitions.list',
  'field-definitions.mutate',
  'inbox.list',
  'inbox.capture',
  'inbox.convert',
  'relationships.list',
  'relationships.mutate',
  'relationship-types.list',
  'relationship-types.mutate',
  'assertions.list',
  'assertions.mutate',
  'notes.list',
  'notes.mutate',
  'sessions.list',
  'sessions.mutate',
  'timeline.list',
  'events.list',
  'events.mutate',
  'phase-zero.operation',
]);

export const copyStartupDiagnosticInputSchema = z
  .object({
    version: z.literal(1),
    screen: diagnosticScreenSchema,
    operation: diagnosticOperationSchema,
    code: diagnosticCodeSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.screen === value.operation.split('.')[0]) return;
    context.addIssue({
      code: 'custom',
      message: 'A tela deve corresponder à operação de diagnóstico.',
      path: ['screen'],
    });
  });
export type CopyStartupDiagnosticInput = z.infer<typeof copyStartupDiagnosticInputSchema>;

export const copiedStartupDiagnosticSchema = z.object({ copied: z.literal(true) }).strict();
export type CopiedStartupDiagnostic = z.infer<typeof copiedStartupDiagnosticSchema>;

export interface DiagnosticsGateway {
  copyStartupDiagnostic(
    input: CopyStartupDiagnosticInput,
  ): Promise<Result<CopiedStartupDiagnostic>>;
}
