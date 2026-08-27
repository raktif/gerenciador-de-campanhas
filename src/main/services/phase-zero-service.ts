import { randomUUID } from 'node:crypto';
import type {
  ApplicationStatus,
  OpenDataDirectoryResult,
  PhaseZeroTestRecord,
} from '../../core/contracts/phase-zero';
import type { DatabaseContext } from '../../db/connection';
import type { PhaseZeroRepository } from '../../db/repositories/phase-zero-repository';

export interface PhaseZeroServiceDependencies {
  applicationVersion: string;
  dataDirectory: string;
  database: DatabaseContext;
  repository: PhaseZeroRepository;
  openDataDirectory: () => Promise<void>;
}

export class PhaseZeroService {
  public constructor(private readonly dependencies: PhaseZeroServiceDependencies) {}

  public getStatus(): ApplicationStatus {
    return {
      application: 'ready',
      database: 'connected',
      applicationVersion: this.dependencies.applicationVersion,
      schemaVersion: this.dependencies.database.schemaVersion,
      sqliteVersion: this.dependencies.database.sqliteVersion,
      fts5Available: this.dependencies.database.fts5Available,
      dataDirectory: this.dependencies.dataDirectory,
    };
  }

  public writeTest(): PhaseZeroTestRecord {
    return this.dependencies.repository.write({
      value: `phase-zero-${randomUUID()}`,
      savedAt: new Date().toISOString(),
    });
  }

  public readTest(): PhaseZeroTestRecord | null {
    return this.dependencies.repository.read();
  }

  public async openDataDirectory(): Promise<OpenDataDirectoryResult> {
    await this.dependencies.openDataDirectory();
    return { opened: true };
  }
}
