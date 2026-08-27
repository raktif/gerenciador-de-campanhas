import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): Promise<void>;
  info(message: string, context?: Record<string, unknown>): Promise<void>;
  warn(message: string, context?: Record<string, unknown>): Promise<void>;
  error(message: string, context?: Record<string, unknown>): Promise<void>;
}

export class FileLogger implements Logger {
  private readonly logPath: string;

  public constructor(
    logsDirectory: string,
    private readonly minimumLevel: LogLevel,
    private readonly maxBytes = 5 * 1024 * 1024,
  ) {
    this.logPath = path.join(logsDirectory, 'application.log');
  }

  public debug(message: string, context?: Record<string, unknown>): Promise<void> {
    return this.write('debug', message, context);
  }

  public info(message: string, context?: Record<string, unknown>): Promise<void> {
    return this.write('info', message, context);
  }

  public warn(message: string, context?: Record<string, unknown>): Promise<void> {
    return this.write('warn', message, context);
  }

  public error(message: string, context?: Record<string, unknown>): Promise<void> {
    return this.write('error', message, context);
  }

  private async write(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): Promise<void> {
    if (levelWeight[level] < levelWeight[this.minimumLevel]) return;

    await mkdir(path.dirname(this.logPath), { recursive: true });
    await this.rotateIfNeeded();
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context === undefined ? {} : { context: redact(context) }),
    };
    await appendFile(this.logPath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8' });
  }

  private async rotateIfNeeded(): Promise<void> {
    try {
      const metadata = await stat(this.logPath);
      if (metadata.size < this.maxBytes) return;
      await rename(this.logPath, `${this.logPath}.${String(Date.now())}`);
    } catch (error) {
      if (isMissingFileError(error)) return;
      throw error;
    }
  }
}

function redact(value: Record<string, unknown>): Record<string, unknown> {
  const sensitivePattern = /key|secret|token|authorization|credential|password/i;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      sensitivePattern.test(key) ? '[REDACTED]' : item,
    ]),
  );
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
