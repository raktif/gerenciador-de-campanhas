import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppError } from '../../src/core/errors/app-error';
import {
  ensureDataDirectories,
  getDataDirectories,
  type DataDirectories,
} from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import {
  AppearanceRepository,
  appearanceThemeSettingKey,
} from '../../src/db/repositories/appearance-repository';
import { TestLogger } from '../helpers/test-logger';

const temporaryRoots: string[] = [];
const contexts: DatabaseContext[] = [];
const firstTimestamp = '2026-10-20T12:00:00.000Z';
const secondTimestamp = '2026-10-20T13:00:00.000Z';

afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((temporaryRoot) => rm(temporaryRoot, { recursive: true, force: true })),
  );
});

describe('AppearanceRepository', () => {
  it('retorna light com revis\u00e3o zero quando a prefer\u00eancia ainda n\u00e3o existe', async () => {
    const { context, repository } = await createRepository();

    expect(repository.get()).toEqual({ theme: 'light', revision: 0 });
    expect(readRawSetting(context)).toBeUndefined();
  });

  it('insere na primeira CAS, atualiza por revis\u00e3o e persiste ao reabrir', async () => {
    const root = await createTemporaryRoot();
    const directories = getDataDirectories(root);
    await ensureDataDirectories(directories);
    const firstContext = await openTestDatabase(directories);
    const repository = new AppearanceRepository(firstContext.orm);

    const inserted = repository.update({ theme: 'dark', revision: 0 }, firstTimestamp);
    expect(inserted).toEqual({ theme: 'dark', revision: 1 });
    expect(repository.update({ theme: 'light', revision: 1 }, secondTimestamp)).toEqual({
      theme: 'light',
      revision: 2,
    });
    expect(readRawSetting(firstContext)).toEqual({
      value_json: '"light"',
      created_at: firstTimestamp,
      updated_at: secondTimestamp,
      revision: 2,
    });
    firstContext.close();

    const secondContext = await openTestDatabase(directories);
    expect(new AppearanceRepository(secondContext.orm).get()).toEqual({
      theme: 'light',
      revision: 2,
    });
  });

  it('rejeita revis\u00e3o obsoleta, inclusive em duas primeiras inser\u00e7\u00f5es concorrentes', async () => {
    const { repository } = await createRepository();
    const inserted = repository.update({ theme: 'dark', revision: 0 }, firstTimestamp);

    const firstInsertConflict = captureAppError(() =>
      repository.update({ theme: 'light', revision: 0 }, secondTimestamp),
    );
    expect(firstInsertConflict.code).toBe('REVISION_CONFLICT');
    expect(firstInsertConflict.details).toEqual({
      expectedRevision: 0,
      currentRevision: 1,
      current: inserted,
    });

    const updateConflict = captureAppError(() =>
      repository.update({ theme: 'light', revision: 2 }, secondTimestamp),
    );
    expect(updateConflict.code).toBe('REVISION_CONFLICT');
    expect(updateConflict.details).toEqual({
      expectedRevision: 2,
      currentRevision: 1,
      current: inserted,
    });
  });

  it('trata JSON persistido como n\u00e3o confi\u00e1vel sem sobrescrev\u00ea-lo', async () => {
    const { context, repository } = await createRepository();
    context.native
      .prepare(
        `INSERT INTO app_settings (key, value_json, created_at, updated_at, revision)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(appearanceThemeSettingKey, '{inv\u00e1lido', firstTimestamp, firstTimestamp, 7);

    expect(repository.get()).toEqual({ theme: 'light', revision: 7 });
    expect(readRawSetting(context)).toEqual({
      value_json: '{inv\u00e1lido',
      created_at: firstTimestamp,
      updated_at: firstTimestamp,
      revision: 7,
    });

    expect(repository.update({ theme: 'dark', revision: 7 }, secondTimestamp)).toEqual({
      theme: 'dark',
      revision: 8,
    });
  });

  it('isola appearance.theme das demais chaves de app_settings', async () => {
    const { context, repository } = await createRepository();
    const unrelatedSetting = {
      key: 'diagnostics.level',
      value_json: '"detailed"',
      created_at: '2026-10-19T10:00:00.000Z',
      updated_at: '2026-10-19T11:00:00.000Z',
      revision: 4,
    };
    context.native
      .prepare(
        `INSERT INTO app_settings (key, value_json, created_at, updated_at, revision)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        unrelatedSetting.key,
        unrelatedSetting.value_json,
        unrelatedSetting.created_at,
        unrelatedSetting.updated_at,
        unrelatedSetting.revision,
      );

    expect(repository.get()).toEqual({ theme: 'light', revision: 0 });
    expect(repository.update({ theme: 'dark', revision: 0 }, firstTimestamp)).toEqual({
      theme: 'dark',
      revision: 1,
    });
    expect(repository.update({ theme: 'light', revision: 1 }, secondTimestamp)).toEqual({
      theme: 'light',
      revision: 2,
    });
    expect(
      captureAppError(() => repository.update({ theme: 'dark', revision: 1 }, secondTimestamp))
        .code,
    ).toBe('REVISION_CONFLICT');

    expect(
      context.native
        .prepare(
          `SELECT key, value_json, created_at, updated_at, revision
           FROM app_settings WHERE key = ?`,
        )
        .get(unrelatedSetting.key),
    ).toEqual(unrelatedSetting);
  });
});

async function createRepository(): Promise<{
  context: DatabaseContext;
  repository: AppearanceRepository;
}> {
  const root = await createTemporaryRoot();
  const directories = getDataDirectories(root);
  await ensureDataDirectories(directories);
  const context = await openTestDatabase(directories);
  return { context, repository: new AppearanceRepository(context.orm) };
}

async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rpg-appearance-test-'));
  temporaryRoots.push(root);
  return root;
}

async function openTestDatabase(directories: DataDirectories): Promise<DatabaseContext> {
  const context = await openApplicationDatabase(directories, new TestLogger());
  contexts.push(context);
  return context;
}

function readRawSetting(context: DatabaseContext): unknown {
  return context.native
    .prepare(
      `SELECT value_json, created_at, updated_at, revision
       FROM app_settings WHERE key = ?`,
    )
    .get(appearanceThemeSettingKey);
}

function captureAppError(operation: () => unknown): AppError {
  try {
    operation();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('A opera\u00e7\u00e3o deveria ter lan\u00e7ado AppError.');
}
