import { z } from 'zod';
import type { Result } from './result';
import {
  campaignSignalChannels,
  demandChannels,
  entityChannels,
  eventChannels,
} from './ipc-channels';

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
  'signals',
  'story-threads',
  'clocks',
  'demands',
  'phase-zero',
]);
const diagnosticOperationSchema = z.enum([
  'campaigns.list',
  'campaigns.mutate',
  'entity-types.list',
  'entity-types.mutate',
  'entities.list',
  'entities.get',
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
  'events.get',
  'events.mutate',
  'signals.list',
  'signals.mutate',
  'story-threads.list',
  'story-threads.targets',
  'story-threads.get',
  'story-threads.mutate',
  'clocks.list',
  'clocks.get',
  'clocks.mutate',
  'demands.list',
  'demands.get',
  'demands.suggestion',
  'demands.targets',
  'demands.mutate',
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

// Exact IPC channels used by the Demand screen, mapped to the established
// diagnostic vocabulary (mutations are grouped by their owning subsystem).
export const demandScreenDiagnosticOperations = {
  [demandChannels.list]: 'demands.list',
  [demandChannels.get]: 'demands.get',
  [demandChannels.suggestion]: 'demands.suggestion',
  [demandChannels.targets]: 'demands.targets',
  [demandChannels.accept]: 'demands.mutate',
  [demandChannels.update]: 'demands.mutate',
  [demandChannels.transform]: 'demands.mutate',
  [demandChannels.transition]: 'demands.mutate',
  [campaignSignalChannels.list]: 'signals.list',
  [campaignSignalChannels.recalculate]: 'signals.mutate',
  [campaignSignalChannels.dismiss]: 'signals.mutate',
  [campaignSignalChannels.snooze]: 'signals.mutate',
  [campaignSignalChannels.reactivate]: 'signals.mutate',
  [entityChannels.get]: 'entities.get',
  [eventChannels.get]: 'events.get',
  [eventChannels.update]: 'events.mutate',
  [eventChannels.archive]: 'events.mutate',
  [eventChannels.restore]: 'events.mutate',
} as const satisfies Partial<
  Record<
    | (typeof demandChannels)[keyof typeof demandChannels]
    | (typeof campaignSignalChannels)[keyof typeof campaignSignalChannels]
    | (typeof entityChannels)[keyof typeof entityChannels]
    | (typeof eventChannels)[keyof typeof eventChannels],
    CopyStartupDiagnosticInput['operation']
  >
>;
export type DemandScreenDiagnosticChannel = keyof typeof demandScreenDiagnosticOperations;

export const copiedStartupDiagnosticSchema = z.object({ copied: z.literal(true) }).strict();
export type CopiedStartupDiagnostic = z.infer<typeof copiedStartupDiagnosticSchema>;

export interface DiagnosticsGateway {
  copyStartupDiagnostic(
    input: CopyStartupDiagnosticInput,
  ): Promise<Result<CopiedStartupDiagnostic>>;
}
