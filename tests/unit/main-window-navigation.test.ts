import { describe, expect, it, vi } from 'vitest';
import { loadMainWindowContent } from '../../src/main/windows/main-window-navigation';

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
});
