import { describe, expect, it } from 'vitest';
import type { AppearanceGateway, AppearanceSetting } from '../../src/core/contracts/appearance';
import { success } from '../../src/core/contracts/result';
import { createThemeSynchronizer } from '../../src/renderer/theme/theme-synchronizer';

describe('sincronizador de tema', () => {
  it('preserva o evento mais novo quando a resposta do comando chega atrasada', async () => {
    const command = deferred<AppearanceSetting>();
    const gateway = createGateway(Promise.resolve(success({ theme: 'light', revision: 1 }, 'get')));
    const accepted: AppearanceSetting[] = [];
    const synchronizer = createThemeSynchronizer({
      gateway,
      initialSetting: { theme: 'light', revision: 1 },
      onAccepted: (setting) => accepted.push(setting),
    });
    const stop = synchronizer.start();
    await Promise.resolve();

    const pendingCommand = command.promise.then((setting) => synchronizer.accept(setting));
    gateway.emit({ theme: 'light', revision: 3 });
    command.resolve({ theme: 'dark', revision: 2 });

    expect(await pendingCommand).toBe(false);
    expect(synchronizer.current()).toEqual({ theme: 'light', revision: 3 });
    expect(accepted.at(-1)).toEqual({ theme: 'light', revision: 3 });
    stop();
  });

  it('assina antes de reconciliar e não deixa a leitura atrasada sobrescrever evento novo', async () => {
    const reconciliation = deferred<ReturnType<typeof success<AppearanceSetting>>>();
    const gateway = createGateway(reconciliation.promise);
    const accepted: AppearanceSetting[] = [];
    const synchronizer = createThemeSynchronizer({
      gateway,
      initialSetting: { theme: 'light', revision: 1 },
      onAccepted: (setting) => accepted.push(setting),
    });

    const stop = synchronizer.start();
    gateway.emit({ theme: 'dark', revision: 3 });
    reconciliation.resolve(success({ theme: 'light', revision: 2 }, 'reconcile'));
    await reconciliation.promise;
    await Promise.resolve();

    expect(synchronizer.current()).toEqual({ theme: 'dark', revision: 3 });
    expect(accepted).toEqual([{ theme: 'dark', revision: 3 }]);
    stop();
  });
});

interface TestGateway extends AppearanceGateway {
  emit(setting: AppearanceSetting): void;
}

function createGateway(getResult: ReturnType<AppearanceGateway['getTheme']>): TestGateway {
  let listener: ((setting: AppearanceSetting) => void) | null = null;
  return {
    emit: (setting) => listener?.(setting),
    getTheme: () => getResult,
    onThemeChanged: (nextListener) => {
      listener = nextListener;
      return () => {
        listener = null;
      };
    },
    setTheme: () => Promise.resolve(success({ theme: 'light', revision: 1 }, 'set')),
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => {
      if (resolvePromise === undefined) throw new Error('Promise ainda não inicializada.');
      resolvePromise(value);
    },
  };
}
