import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export interface DataDirectories {
  root: string;
  database: string;
  libraryDocuments: string;
  attachments: string;
  thumbnails: string;
  automaticBackups: string;
  manualBackups: string;
  exports: string;
  logs: string;
  encryptedSecrets: string;
  jobs: string;
  temporary: string;
  config: string;
}

export function getDataDirectories(root: string): DataDirectories {
  return {
    root,
    database: path.join(root, 'database'),
    libraryDocuments: path.join(root, 'library', 'documents'),
    attachments: path.join(root, 'attachments'),
    thumbnails: path.join(root, 'thumbnails'),
    automaticBackups: path.join(root, 'backups', 'automatic'),
    manualBackups: path.join(root, 'backups', 'manual'),
    exports: path.join(root, 'exports'),
    logs: path.join(root, 'logs'),
    encryptedSecrets: path.join(root, 'encrypted-secrets'),
    jobs: path.join(root, 'jobs'),
    temporary: path.join(root, 'tmp'),
    config: path.join(root, 'config'),
  };
}

export async function ensureDataDirectories(directories: DataDirectories): Promise<void> {
  const paths = [
    directories.root,
    directories.database,
    directories.libraryDocuments,
    directories.attachments,
    directories.thumbnails,
    directories.automaticBackups,
    directories.manualBackups,
    directories.exports,
    directories.logs,
    directories.encryptedSecrets,
    directories.jobs,
    directories.temporary,
    directories.config,
  ];
  await Promise.all(paths.map((directory) => mkdir(directory, { recursive: true })));
}
