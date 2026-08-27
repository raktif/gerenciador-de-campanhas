import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { PhaseZeroTestRecord } from '../../core/contracts/phase-zero';
import { phaseZeroTest } from '../schema';
import type * as schema from '../schema';

export class PhaseZeroRepository {
  public constructor(private readonly database: BetterSQLite3Database<typeof schema>) {}

  public write(record: PhaseZeroTestRecord): PhaseZeroTestRecord {
    this.database
      .insert(phaseZeroTest)
      .values({ id: 1, value: record.value, savedAt: record.savedAt })
      .onConflictDoUpdate({
        target: phaseZeroTest.id,
        set: { value: record.value, savedAt: record.savedAt },
      })
      .run();

    return record;
  }

  public read(): PhaseZeroTestRecord | null {
    const record = this.database
      .select({ value: phaseZeroTest.value, savedAt: phaseZeroTest.savedAt })
      .from(phaseZeroTest)
      .where(eq(phaseZeroTest.id, 1))
      .get();

    return record ?? null;
  }
}
