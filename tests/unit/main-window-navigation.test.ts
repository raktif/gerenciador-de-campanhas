import { describe, expect, it, vi } from 'vitest';
import {
  loadMainWindowContent,
  selectMainWindowDevelopmentUrl,
} from '../../src/main/windows/main-window-navigation';

describe('navegação inicial da janela principal', () => {
  it('carrega o arquivo do renderer na produção', async () => {
    const window = { loadFile: vi.fn().mockResolvedValue(undefined), loadURL: vi.fn() };

    await loadMainWindowContent(window, undefined, 'renderer/main_window/index.html');

    expect(window.loadFile).toHaveBeenCalledWith('renderer/main_window/index.html');
    expect(window.loadURL).not.toHaveBeenCalled();
  });

  it('usa a URL Vite no desenvolvimento', async () => {
    const window = { loadFile: vi.fn(), loadURL: vi.fn().mockResolvedValue(undefined) };

    await loadMainWindowContent(window, 'http://localhost:5173', 'ignored.html');

    expect(window.loadURL).toHaveBeenCalledWith('http://localhost:5173');
    expect(window.loadFile).not.toHaveBeenCalled();
  });

  it('repete apenas recusas transitórias de conexão do Vite e depois carrega a janela', async () => {
    const window = {
      loadFile: vi.fn(),
      loadURL: vi
        .fn()
        .mockRejectedValueOnce(
          new Error('ERR_CONNECTION_REFUSED (-102) loading http://localhost:5173/'),
        )
        .mockResolvedValue(undefined),
    };
    const delay = vi.fn().mockResolvedValue(undefined);
    const onRetry = vi.fn();

    await loadMainWindowContent(window, 'http://localhost:5173', 'ignored.html', {
      delay,
      onRetry,
    });

    expect(window.loadURL).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledWith(250);
    expect(onRetry).toHaveBeenCalledWith(1, 8);
    expect(window.loadFile).not.toHaveBeenCalled();
  });

  it('não mascara uma URL de desenvolvimento inválida nem tenta indefinidamente', async () => {
    const invalidUrlError = new Error('ERR_NAME_NOT_RESOLVED (-105) loading http://invalid.test/');
    const window = { loadFile: vi.fn(), loadURL: vi.fn().mockRejectedValue(invalidUrlError) };
    const delay = vi.fn().mockResolvedValue(undefined);

    await expect(
      loadMainWindowContent(window, 'http://invalid.test', 'ignored.html', { delay }),
    ).rejects.toBe(invalidUrlError);

    expect(window.loadURL).toHaveBeenCalledTimes(1);
    expect(delay).not.toHaveBeenCalled();
  });

  it('interrompe a tentativa transitória após o limite explícito', async () => {
    const refusedError = new Error('ERR_CONNECTION_REFUSED (-102) loading http://localhost:5173/');
    const window = { loadFile: vi.fn(), loadURL: vi.fn().mockRejectedValue(refusedError) };
    const delay = vi.fn().mockResolvedValue(undefined);

    await expect(
      loadMainWindowContent(window, 'http://localhost:5173', 'ignored.html', { delay }),
    ).rejects.toBe(refusedError);

    expect(window.loadURL).toHaveBeenCalledTimes(8);
    expect(delay).toHaveBeenCalledTimes(7);
  });

  it('carrega o entry local no E2E, mesmo quando o artefato principal veio do desenvolvimento', async () => {
    const window = { loadFile: vi.fn().mockResolvedValue(undefined), loadURL: vi.fn() };

    await loadMainWindowContent(
      window,
      selectMainWindowDevelopmentUrl('http://localhost:5173', 'test'),
      'renderer/main_window/index.html',
    );

    expect(window.loadFile).toHaveBeenCalledWith('renderer/main_window/index.html');
    expect(window.loadURL).not.toHaveBeenCalled();
    expect(selectMainWindowDevelopmentUrl('http://localhost:5173', 'development')).toBe(
      'http://localhost:5173',
    );
  });
});
