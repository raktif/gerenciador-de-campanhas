import { z } from 'zod';

export const appErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.unknown().optional(),
});

export type AppErrorPayload = z.infer<typeof appErrorSchema>;

export type Result<T> =
  | { ok: true; data: T; requestId: string }
  | { ok: false; error: AppErrorPayload; requestId: string };

export function success<T>(data: T, requestId: string): Result<T> {
  return { ok: true, data, requestId };
}

export function failure(error: AppErrorPayload, requestId: string): Result<never> {
  return { ok: false, error, requestId };
}
