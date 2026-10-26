import { and, eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  appearanceThemeSchema,
  type AppearanceSetting,
  type UpdateAppearanceThemeInput,
} from '../../core/contracts/appearance';
import { AppError } from '../../core/errors/app-error';
import { appSettings } from '../schema';
import type * as schema from '../schema';

export const appearanceThemeSettingKey = 'appearance.theme';
const defaultAppearanceSetting: AppearanceSetting = Object.freeze({ theme: 'light', revision: 0 });

interface AppearanceSettingRow {
  valueJson: string;
  revision: number;
}

export class AppearanceRepository {
  public constructor(private readonly database: BetterSQLite3Database<typeof schema>) {}

  public get(): AppearanceSetting {
    return toAppearanceSetting(this.findRow());
  }

  public update(input: UpdateAppearanceThemeInput, updatedAt: string): AppearanceSetting {
    return this.database.transaction((transaction) => {
      if (input.revision === 0) {
        const inserted = transaction
          .insert(appSettings)
          .values({
            key: appearanceThemeSettingKey,
            valueJson: JSON.stringify(input.theme),
            createdAt: updatedAt,
            updatedAt,
            revision: 1,
          })
          .onConflictDoNothing({ target: appSettings.key })
          .run();

        if (inserted.changes === 0) {
          const current = findRow(transaction);
          throw revisionConflict(input.revision, toAppearanceSetting(current));
        }
      } else {
        const updated = transaction
          .update(appSettings)
          .set({
            valueJson: JSON.stringify(input.theme),
            updatedAt,
            revision: sql`${appSettings.revision} + 1`,
          })
          .where(
            and(
              eq(appSettings.key, appearanceThemeSettingKey),
              eq(appSettings.revision, input.revision),
            ),
          )
          .run();

        if (updated.changes === 0) {
          const current = findRow(transaction);
          throw revisionConflict(input.revision, toAppearanceSetting(current));
        }
      }

      const persisted = findRow(transaction);
      if (persisted === null)
        throw new AppError(
          'APPEARANCE_SETTING_NOT_FOUND',
          'A configura\u00e7\u00e3o de apar\u00eancia n\u00e3o foi encontrada ap\u00f3s a atualiza\u00e7\u00e3o.',
        );
      return toAppearanceSetting(persisted);
    });
  }

  private findRow(): AppearanceSettingRow | null {
    return findRow(this.database);
  }
}

type AppearanceDatabase = Pick<BetterSQLite3Database<typeof schema>, 'select'>;

function findRow(database: AppearanceDatabase): AppearanceSettingRow | null {
  return (
    database
      .select({ valueJson: appSettings.valueJson, revision: appSettings.revision })
      .from(appSettings)
      .where(eq(appSettings.key, appearanceThemeSettingKey))
      .get() ?? null
  );
}

function toAppearanceSetting(row: AppearanceSettingRow | null): AppearanceSetting {
  if (row === null) return defaultAppearanceSetting;

  try {
    const parsedTheme = appearanceThemeSchema.safeParse(JSON.parse(row.valueJson));
    if (parsedTheme.success) return { theme: parsedTheme.data, revision: row.revision };
  } catch {
    // O valor persistido n\u00e3o \u00e9 confi\u00e1vel. A leitura segura n\u00e3o o repara nem o sobrescreve.
  }

  return { theme: 'light', revision: row.revision };
}

function revisionConflict(expectedRevision: number, current: AppearanceSetting): AppError {
  return new AppError(
    'REVISION_CONFLICT',
    'A configura\u00e7\u00e3o de apar\u00eancia foi alterada em outra opera\u00e7\u00e3o.',
    {
      expectedRevision,
      currentRevision: current.revision,
      current,
    },
  );
}
