import { randomUUID } from 'node:crypto';
import type { IpcMainInvokeEvent } from 'electron';
import type { z } from 'zod';
import { failure, success, type Result } from '../../core/contracts/result';
import { AppError, toSafeError } from '../../core/errors/app-error';
import type { Logger } from '../../core/logging/logger';

export interface IpcHandlerDependencies {
  logger: Logger;
  authorizedWebContentsId: number;
}

export async function executeIpcHandler<TInput, TOutput>(
  event: IpcMainInvokeEvent,
  input: unknown,
  inputSchema: z.ZodType<TInput>,
  outputSchema: z.ZodType<TOutput>,
  dependencies: IpcHandlerDependencies,
  operation: (validatedInput: TInput) => TOutput | Promise<TOutput>,
): Promise<Result<TOutput>> {
  const requestId = randomUUID();

  try {
    assertAuthorizedSender(event, dependencies.authorizedWebContentsId);
    const validatedInput = parseInput(inputSchema, input);
    const output = await operation(validatedInput);
    return success(outputSchema.parse(output), requestId);
  } catch (error) {
    await dependencies.logger.error('Falha em operação IPC.', {
      requestId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    return failure(toSafeError(error), requestId);
  }
}

function parseInput<TInput>(schema: z.ZodType<TInput>, input: unknown): TInput {
  const result = schema.safeParse(input ?? {});
  if (result.success) return result.data;
  throw new AppError('VALIDATION_ERROR', 'Os dados enviados são inválidos.', {
    issues: result.error.issues.map(({ code, message, path }) => ({ code, message, path })),
  });
}

function assertAuthorizedSender(event: IpcMainInvokeEvent, authorizedWebContentsId: number): void {
  if (
    event.sender.id !== authorizedWebContentsId ||
    event.senderFrame === null ||
    event.senderFrame !== event.sender.mainFrame
  ) {
    throw new AppError('IPC_SENDER_NOT_ALLOWED', 'A origem da operação não é autorizada.');
  }
}
