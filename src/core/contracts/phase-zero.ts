import { z } from 'zod';
import type { Result } from './result';

export const emptyInputSchema = z.object({}).strict();
export type EmptyInput = z.infer<typeof emptyInputSchema>;

export const applicationStatusSchema = z.object({
  application: z.literal('ready'),
  database: z.literal('connected'),
  applicationVersion: z.string(),
  schemaVersion: z.number().int().nonnegative(),
  sqliteVersion: z.string(),
  fts5Available: z.boolean(),
  dataDirectory: z.string(),
});
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

export const phaseZeroTestRecordSchema = z.object({
  value: z.string().min(1),
  savedAt: z.iso.datetime(),
});
export type PhaseZeroTestRecord = z.infer<typeof phaseZeroTestRecordSchema>;

export const openDataDirectoryResultSchema = z.object({ opened: z.literal(true) });
export type OpenDataDirectoryResult = z.infer<typeof openDataDirectoryResultSchema>;

export interface PhaseZeroGateway {
  getStatus(input?: EmptyInput): Promise<Result<ApplicationStatus>>;
  writeTest(input?: EmptyInput): Promise<Result<PhaseZeroTestRecord>>;
  readTest(input?: EmptyInput): Promise<Result<PhaseZeroTestRecord | null>>;
  openDataDirectory(input?: EmptyInput): Promise<Result<OpenDataDirectoryResult>>;
}

export interface CampaignManagerGateway {
  phaseZero: PhaseZeroGateway;
}
