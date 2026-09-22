import { z } from 'zod';
import type { Result } from './result';

const diagnosticCodeSchema = z.string().regex(/^[A-Z0-9_]{1,80}$/);

export const copyStartupDiagnosticInputSchema = z
  .object({
    version: z.literal(1),
    screen: z.literal('campaigns'),
    operation: z.literal('campaigns.list'),
    code: diagnosticCodeSchema,
  })
  .strict();
export type CopyStartupDiagnosticInput = z.infer<typeof copyStartupDiagnosticInputSchema>;

export const copiedStartupDiagnosticSchema = z.object({ copied: z.literal(true) }).strict();
export type CopiedStartupDiagnostic = z.infer<typeof copiedStartupDiagnosticSchema>;

export interface DiagnosticsGateway {
  copyStartupDiagnostic(
    input: CopyStartupDiagnosticInput,
  ): Promise<Result<CopiedStartupDiagnostic>>;
}
