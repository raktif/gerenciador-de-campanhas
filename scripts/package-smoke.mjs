import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { access, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repositoryRoot = process.cwd();
const packageDirectory = path.join(
  repositoryRoot,
  'out',
  `Gerenciador de Campanhas de RPG-${process.platform}-${process.arch}`,
);
const executableByPlatform = {
  win32: path.join(packageDirectory, 'gerenciador-de-campanhas.exe'),
  darwin: path.join(
    packageDirectory,
    'Gerenciador de Campanhas de RPG.app',
    'Contents',
    'MacOS',
    'Gerenciador de Campanhas de RPG',
  ),
  linux: path.join(packageDirectory, 'gerenciador-de-campanhas'),
};

const executable = executableByPlatform[process.platform];
if (executable === undefined) throw new Error(`Plataforma não suportada: ${process.platform}`);

const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'rpg-campaign-manager-package-'));
const databasePath = path.join(dataDirectory, 'database', 'app.db');
const environment = Object.fromEntries(
  Object.entries(process.env).filter((entry) => entry[1] !== undefined),
);
for (const key of Object.keys(environment)) {
  if (key.toUpperCase() === 'ELECTRON_RUN_AS_NODE') delete environment[key];
}
environment.APP_DATA_DIR = dataDirectory;
environment.NODE_ENV = 'production';
environment.PHASE_ZERO_PACKAGE_SMOKE = '1';

let child;
try {
  child = spawn(executable, [], {
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const exitPromise = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code));
  });

  await waitForFile(databasePath, 30_000, exitPromise, () => stderr);
  child.kill();
  await exitPromise;
  child = undefined;

  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  const schema = database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get();
  database.prepare('SELECT count(*) FROM app_search_fts').get();
  const sqlite = database.prepare('SELECT sqlite_version() AS version').get();
  database.close();

  if (schema.version !== 7) throw new Error(`Schema inesperado: ${schema.version}`);
  process.stdout.write(
    `Pacote validado (startup=ok, schema=${schema.version}, sqlite=${sqlite.version}, FTS5=ok).\n`,
  );
} finally {
  child?.kill();
  await rm(dataDirectory, { recursive: true, force: true });
}

async function waitForFile(filePath, timeoutMs, exitPromise, getStderr) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await access(filePath);
      return;
    } catch {
      const exitCode = await Promise.race([
        exitPromise,
        new Promise((resolve) => setTimeout(() => resolve(undefined), 200)),
      ]);
      if (exitCode !== undefined) {
        throw new Error(
          `Pacote encerrou antes de criar o banco (código ${exitCode}): ${getStderr()}`,
        );
      }
    }
  }
  throw new Error(`Pacote não criou o banco em ${timeoutMs / 1000} segundos: ${getStderr()}`);
}
