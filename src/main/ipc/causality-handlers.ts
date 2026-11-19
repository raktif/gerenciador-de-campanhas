import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type { z } from 'zod';
import { causalityChannels } from '../../core/contracts/ipc-channels';
import { causalChainSchema, causalLinkSchema, createCausalLinkInputSchema, getCausalChainInputSchema, updateCausalLinkInputSchema } from '../../core/contracts/causality';
import type { Logger } from '../../core/logging/logger';
import type { CausalityService } from '../services/causality-service';
import { executeIpcHandler } from './ipc-handler';
export interface CausalityHandlerDependencies { service: CausalityService; logger: Logger; authorizedWebContentsId: number }
export function registerCausalityIpcHandlers(ipcMain: IpcMain, dependencies: CausalityHandlerDependencies): () => void {
  const channels: string[] = [];
  const register = <I, O>(channel: string, input: z.ZodType<I>, output: z.ZodType<O>, operation: (value: I) => O): void => { channels.push(channel); ipcMain.handle(channel, (event: IpcMainInvokeEvent, value: unknown) => executeIpcHandler(event, value, input, output, dependencies, operation)); };
  register(causalityChannels.createLink, createCausalLinkInputSchema, causalLinkSchema, (value) => dependencies.service.createLink(value));
  register(causalityChannels.updateLink, updateCausalLinkInputSchema, causalLinkSchema, (value) => dependencies.service.updateLink(value));
  register(causalityChannels.getChain, getCausalChainInputSchema, causalChainSchema, (value) => dependencies.service.getChain(value));
  return () => { for (const channel of channels) ipcMain.removeHandler(channel); };
}
