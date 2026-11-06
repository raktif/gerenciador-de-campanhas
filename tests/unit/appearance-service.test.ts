import { describe, expect, it } from 'vitest';
import type {
  AppearanceSetting,
  UpdateAppearanceThemeInput,
} from '../../src/core/contracts/appearance';
import {
  AppearanceService,
  type AppearanceRepositoryPort,
} from '../../src/main/services/appearance-service';

const timestamp = '2026-10-20T12:00:00.000Z';

describe('AppearanceService', () => {
  it('l\u00ea o default seguro fornecido pela persist\u00eancia', () => {
    const repository = new MemoryAppearanceRepository();
    const service = createService(repository);

    expect(service.get()).toEqual({ theme: 'light', revision: 0 });
  });

  it('encaminha tema, revis\u00e3o e instante para a atualiza\u00e7\u00e3o CAS', () => {
    const repository = new MemoryAppearanceRepository();
    const service = createService(repository);

    expect(service.update({ theme: 'dark', revision: 0 })).toEqual({
      theme: 'dark',
      revision: 1,
    });
    expect(repository.lastUpdate).toEqual({
      input: { theme: 'dark', revision: 0 },
      updatedAt: timestamp,
    });
  });
});

class MemoryAppearanceRepository implements AppearanceRepositoryPort {
  private setting: AppearanceSetting = { theme: 'light', revision: 0 };
  public lastUpdate: { input: UpdateAppearanceThemeInput; updatedAt: string } | null = null;

  public get(): AppearanceSetting {
    return this.setting;
  }

  public update(input: UpdateAppearanceThemeInput, updatedAt: string): AppearanceSetting {
    this.lastUpdate = { input, updatedAt };
    this.setting = { theme: input.theme, revision: input.revision + 1 };
    return this.setting;
  }
}

function createService(repository: AppearanceRepositoryPort): AppearanceService {
  return new AppearanceService({ repository, now: () => timestamp });
}
