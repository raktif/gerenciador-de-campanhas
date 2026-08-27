import type { Logger } from '../../src/core/logging/logger';

export class TestLogger implements Logger {
  public readonly entries: { level: string; message: string; context?: Record<string, unknown> }[] =
    [];

  public debug(message: string, context?: Record<string, unknown>): Promise<void> {
    this.entries.push({ level: 'debug', message, ...(context === undefined ? {} : { context }) });
    return Promise.resolve();
  }

  public info(message: string, context?: Record<string, unknown>): Promise<void> {
    this.entries.push({ level: 'info', message, ...(context === undefined ? {} : { context }) });
    return Promise.resolve();
  }

  public warn(message: string, context?: Record<string, unknown>): Promise<void> {
    this.entries.push({ level: 'warn', message, ...(context === undefined ? {} : { context }) });
    return Promise.resolve();
  }

  public error(message: string, context?: Record<string, unknown>): Promise<void> {
    this.entries.push({ level: 'error', message, ...(context === undefined ? {} : { context }) });
    return Promise.resolve();
  }
}
