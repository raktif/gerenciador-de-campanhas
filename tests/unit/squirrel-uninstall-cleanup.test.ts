import { describe, expect, it } from 'vitest';
import {
  createCleanupCommand,
  createProcessBrokerCommand,
} from '../../src/main/squirrel/uninstall-cleanup';

describe('limpeza da desinstalação Squirrel', () => {
  it('escapa o diretório e limita a remoção ao caminho calculado', () => {
    const command = createCleanupCommand("C:\\Users\\Narrador's\\App", 123, 456);

    expect(command).toContain("$installRoot = 'C:\\Users\\Narrador''s\\App'");
    expect(command).toContain('Wait-Process -Id $applicationProcessId');
    expect(command).toContain('Wait-Process -Id $updaterProcessId');
    expect(command).toContain('SpecialFolder]::DesktopDirectory');
    expect(command).toContain('Gerenciador de Campanhas de RPG.lnk');
    expect(command).toContain('Remove-Item -LiteralPath $installRoot -Recurse -Force');
    expect(command).toContain('$attempt -lt 20');
  });

  it('escapa a linha de comando entregue ao broker WMI', () => {
    const command = createProcessBrokerCommand("powershell.exe -Command 'teste'");

    expect(command).toContain("$commandLine = 'powershell.exe -Command ''teste''' ".trim());
    expect(command).toContain("([wmiclass]'Win32_Process').Create($commandLine)");
  });
});
