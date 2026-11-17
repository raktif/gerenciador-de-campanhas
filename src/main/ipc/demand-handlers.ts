import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import {
  acceptDemandSchema,
  demandDetailsSchema,
  demandIdentitySchema,
  demandPageSchema,
  demandPageResultSchema,
  demandSuggestionRequestSchema,
  demandSuggestionSchema,
  demandTargetRequestSchema,
  demandTargetsSchema,
  transformDemandSchema,
  transitionDemandSchema,
  updateDemandSchema,
} from '../../core/contracts/demands';
import { demandChannels } from '../../core/contracts/ipc-channels';
import type { Logger } from '../../core/logging/logger';
import type { DemandService } from '../services/demand-service';
import { executeIpcHandler } from './ipc-handler';

export function registerDemandIpcHandlers(
  ipcMain: IpcMain,
  dependencies: {
    service: DemandService;
    logger: Logger;
    authorizedWebContentsId: number;
  },
): () => void {
  const channels: string[] = [];
  function register<I, O>(
    channel: string,
    input: z.ZodType<I>,
    output: z.ZodType<O>,
    operation: (value: I) => O,
  ) {
    channels.push(channel);
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, value: unknown) =>
      executeIpcHandler(event, value, input, output, dependencies, operation),
    );
  }
  register(demandChannels.suggestion, demandSuggestionRequestSchema, demandSuggestionSchema, (v) =>
    dependencies.service.suggestion(v),
  );
  register(demandChannels.get, demandIdentitySchema, demandDetailsSchema, (v) =>
    dependencies.service.get(v),
  );
  register(demandChannels.list, demandPageSchema, demandPageResultSchema, (v) =>
    dependencies.service.list(v),
  );
  register(demandChannels.targets, demandTargetRequestSchema, demandTargetsSchema, (v) =>
    dependencies.service.targets(v),
  );
  register(demandChannels.accept, acceptDemandSchema, demandDetailsSchema, (v) =>
    dependencies.service.accept(v),
  );
  register(demandChannels.update, updateDemandSchema, demandDetailsSchema, (v) =>
    dependencies.service.update(v),
  );
  register(demandChannels.transform, transformDemandSchema, demandDetailsSchema, (v) =>
    dependencies.service.transform(v),
  );
  register(demandChannels.transition, transitionDemandSchema, demandDetailsSchema, (v) =>
    dependencies.service.transition(v),
  );
  register(demandChannels.sourceLocks, demandIdentitySchema, z.array(z.uuid()), (v) =>
    dependencies.service.sourceLocks(v),
  );
  return () => {
    for (const channel of channels) ipcMain.removeHandler(channel);
  };
}
