import type {
  AppearanceSetting,
  UpdateAppearanceThemeInput,
} from '../../core/contracts/appearance';

export interface AppearanceRepositoryPort {
  get(): AppearanceSetting;
  update(input: UpdateAppearanceThemeInput, updatedAt: string): AppearanceSetting;
}

export class AppearanceService {
  private readonly now: () => string;

  public constructor(
    private readonly dependencies: {
      repository: AppearanceRepositoryPort;
      now?: () => string;
    },
  ) {
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  public get(): AppearanceSetting {
    return this.dependencies.repository.get();
  }

  public update(input: UpdateAppearanceThemeInput): AppearanceSetting {
    return this.dependencies.repository.update(input, this.now());
  }
}
