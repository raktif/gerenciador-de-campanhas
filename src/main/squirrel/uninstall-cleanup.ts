import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function scheduleSquirrelUninstallCleanup(): void {
  if (process.platform !== 'win32' || process.argv[1] !== '--squirrel-uninstall') return;

  const installRoot = resolveSquirrelInstallRoot(process.execPath);
  if (installRoot === null) return;

  const windowsDirectory = process.env.SystemRoot ?? 'C:\\Windows';
  const powershell = path.join(
    windowsDirectory,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  const encodedCommand = encodePowerShellCommand(
    createCleanupCommand(installRoot, process.pid, process.ppid),
  );
  const cleanupCommandLine = [
    `"${powershell}"`,
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-WindowStyle Hidden',
    `-EncodedCommand ${encodedCommand}`,
  ].join(' ');
  const brokerCommand = createProcessBrokerCommand(cleanupCommandLine);
  spawnSync(
    powershell,
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      encodePowerShellCommand(brokerCommand),
    ],
    {
      cwd: os.tmpdir(),
      stdio: 'ignore',
      timeout: 5_000,
      windowsHide: true,
    },
  );
}

export function resolveSquirrelInstallRoot(executablePath: string): string | null {
  const versionDirectory = path.dirname(path.resolve(executablePath));
  if (!path.basename(versionDirectory).toLowerCase().startsWith('app-')) return null;

  const installRoot = path.dirname(versionDirectory);
  if (!existsSync(path.join(installRoot, 'Update.exe'))) return null;
  return installRoot;
}

export function createCleanupCommand(
  installRoot: string,
  applicationProcessId: number,
  updaterProcessId: number,
): string {
  const escapedRoot = installRoot.replaceAll("'", "''");
  return [
    `$applicationProcessId = ${String(applicationProcessId)}`,
    `$updaterProcessId = ${String(updaterProcessId)}`,
    `$installRoot = '${escapedRoot}'`,
    'Wait-Process -Id $applicationProcessId -ErrorAction SilentlyContinue',
    'Wait-Process -Id $updaterProcessId -ErrorAction SilentlyContinue',
    '$desktop = [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory)',
    '$programs = [Environment]::GetFolderPath([Environment+SpecialFolder]::Programs)',
    "if ($desktop) { Remove-Item -LiteralPath (Join-Path $desktop 'Gerenciador de Campanhas de RPG.lnk') -Force -ErrorAction SilentlyContinue }",
    "if ($programs) { Remove-Item -LiteralPath (Join-Path $programs 'Projeto Gerenciador de Campanhas de RPG') -Recurse -Force -ErrorAction SilentlyContinue }",
    'for ($attempt = 0; $attempt -lt 20 -and (Test-Path -LiteralPath $installRoot); $attempt++) {',
    '  Start-Sleep -Milliseconds 500',
    '  Remove-Item -LiteralPath $installRoot -Recurse -Force -ErrorAction SilentlyContinue',
    '}',
  ].join('; ');
}

export function createProcessBrokerCommand(commandLine: string): string {
  const escapedCommandLine = commandLine.replaceAll("'", "''");
  return [
    `$commandLine = '${escapedCommandLine}'`,
    "([wmiclass]'Win32_Process').Create($commandLine) | Out-Null",
  ].join('; ');
}

function encodePowerShellCommand(command: string): string {
  return Buffer.from(command, 'utf16le').toString('base64');
}
