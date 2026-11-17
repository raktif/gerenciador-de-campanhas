import { describe, expect, it } from 'vitest';
import {
  copyStartupDiagnosticInputSchema,
  demandScreenDiagnosticOperations,
} from '../../src/core/contracts/diagnostics';
import {
  campaignSignalChannels,
  demandChannels,
  entityChannels,
  eventChannels,
} from '../../src/core/contracts/ipc-channels';
import {
  createUserFacingDiagnostic,
  presentUserFacingError,
} from '../../src/core/errors/user-facing-error';

describe('diagnósticos dos canais usados na tela de Demandas', () => {
  const expected = [
    [demandChannels.list, 'demands.list'],
    [demandChannels.get, 'demands.get'],
    [demandChannels.suggestion, 'demands.suggestion'],
    [demandChannels.targets, 'demands.targets'],
    ...[
      demandChannels.accept,
      demandChannels.update,
      demandChannels.transform,
      demandChannels.transition,
    ].map((channel) => [channel, 'demands.mutate'] as const),
    [campaignSignalChannels.list, 'signals.list'],
    ...[
      campaignSignalChannels.recalculate,
      campaignSignalChannels.dismiss,
      campaignSignalChannels.snooze,
      campaignSignalChannels.reactivate,
    ].map((channel) => [channel, 'signals.mutate'] as const),
    [entityChannels.get, 'entities.get'],
    [eventChannels.get, 'events.get'],
    ...[eventChannels.update, eventChannels.archive, eventChannels.restore].map(
      (channel) => [channel, 'events.mutate'] as const,
    ),
  ] as const;
  it('cobre exatamente todos os canais consumidos, sem fallback de operação', () => {
    expect(demandScreenDiagnosticOperations).toEqual(Object.fromEntries(expected));
  });
  it.each(expected)('%s constrói payload validado para %s', (channel, operation) => {
    const actual = demandScreenDiagnosticOperations[channel];
    expect(actual).toBe(operation);
    const error = presentUserFacingError({ code: 'DATABASE_UNAVAILABLE' }, actual);
    const diagnostic = createUserFacingDiagnostic(error, actual);
    expect(diagnostic).toMatchObject({ operation, screen: operation.split('.')[0] });
    expect(copyStartupDiagnosticInputSchema.safeParse(diagnostic).success).toBe(true);
  });
});
