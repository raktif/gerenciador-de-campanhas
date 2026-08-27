import { randomUUID } from 'node:crypto';
import { mkdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';

export interface BackupResult {
  path: string;
  integrity: 'ok';
}

export async function createVerifiedBackup(
  database: Database.Database,
  backupDirectory: string,
  reason: string,
): Promise<BackupResult> {
  await mkdir(backupDirectory, { recursive: true });
  const identifier = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`;
  const temporaryPath = path.join(backupDirectory, `${identifier}.tmp`);
  const finalPath = path.join(backupDirectory, `${identifier}-${reason}.db`);

  try {
    await database.backup(temporaryPath);
    const verificationDatabase = new Database(temporaryPath, {
      readonly: true,
      fileMustExist: true,
    });
    const integrity = verificationDatabase.pragma('integrity_check', { simple: true });
    verificationDatabase.close();

    if (integrity !== 'ok') {
      throw new Error(`Falha na verificação do backup: ${String(integrity)}`);
    }

    await rename(temporaryPath, finalPath);
    return { path: finalPath, integrity: 'ok' };
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}
