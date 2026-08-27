import path from 'node:path';
import { z } from 'zod';

const environmentSchema = z.object({
  APP_DATA_DIR: z.string().trim().min(1).optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Environment = z.infer<typeof environmentSchema>;

export function readEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const parsed = environmentSchema.safeParse({
    APP_DATA_DIR: source.APP_DATA_DIR,
    LOG_LEVEL: source.LOG_LEVEL,
  });

  if (!parsed.success) {
    throw new Error(`Configuração de ambiente inválida: ${parsed.error.message}`);
  }

  return parsed.data;
}

export function resolveDataRoot(userDataDirectory: string, environment: Environment): string {
  if (environment.APP_DATA_DIR !== undefined) {
    return path.resolve(environment.APP_DATA_DIR);
  }

  return path.join(userDataDirectory, 'campaign-manager-data');
}
