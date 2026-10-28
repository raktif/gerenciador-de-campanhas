import { access, mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error';
import type { DataDirectories } from '../../core/storage/data-directories';

const deletionPhases = ['prepared', 'image_moved', 'assets_moved', 'db_deleted'] as const;
type DeletionPhase = (typeof deletionPhases)[number];

const internalRelativePathSchema = z
  .string()
  .min(1)
  .max(1000)
  .refine(
    (value) =>
      /^[a-z0-9](?:[a-z0-9._/-]*[a-z0-9])?$/u.test(value) &&
      !value.includes('\\') &&
      !value.startsWith('/') &&
      !value.includes('//') &&
      !value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..'),
  );

const deletionManifestSchema = z
  .object({
    version: z.literal(1),
    operationId: z.uuid(),
    campaignId: z.uuid(),
    attachmentId: z.uuid(),
    attachmentRevision: z.number().int().positive(),
    relativePath: internalRelativePathSchema,
    thumbnailRelativePath: internalRelativePathSchema,
    phase: z.enum(deletionPhases),
    createdAt: z.iso.datetime(),
  })
  .strict()
  .superRefine((manifest, context) => {
    const campaignPrefix = `${manifest.campaignId}/`;
    if (!manifest.relativePath.startsWith(campaignPrefix)) {
      context.addIssue({
        code: 'custom',
        path: ['relativePath'],
        message: 'O asset principal não pertence à campanha do manifesto.',
      });
    }
    if (!manifest.thumbnailRelativePath.startsWith(campaignPrefix)) {
      context.addIssue({
        code: 'custom',
        path: ['thumbnailRelativePath'],
        message: 'A miniatura não pertence à campanha do manifesto.',
      });
    }
  });
type DeletionManifest = z.infer<typeof deletionManifestSchema>;

const phaseFileNames: Record<DeletionPhase, string> = {
  prepared: 'state-0-prepared.json',
  image_moved: 'state-1-image-moved.json',
  assets_moved: 'state-2-assets-moved.json',
  db_deleted: 'state-3-db-deleted.json',
};

export interface CreateDeletionJournalInput {
  campaignId: string;
  attachmentId: string;
  attachmentRevision: number;
  relativePath: string;
  thumbnailRelativePath: string;
  operationId: string;
  createdAt: string;
}

export interface AttachmentDeletionIdentity {
  attachmentId: string;
  campaignId: string;
  revision: number;
  relativePath: string;
  thumbnailRelativePath: string;
}

export interface AttachmentExistenceRepository {
  findAttachmentDeletionIdentity(attachmentId: string): AttachmentDeletionIdentity | null;
}

export interface AttachmentDeletionRecoveryResult {
  restored: number;
  purged: number;
}

export class AttachmentDeletionJournal {
  private readonly manifest: DeletionManifest;
  private readonly operationDirectory: string;
  private readonly sourceImage: string;
  private readonly sourceThumbnail: string;
  private readonly quarantinedImage: string;
  private readonly quarantinedThumbnail: string;

  private constructor(
    directories: Pick<DataDirectories, 'attachments' | 'thumbnails' | 'temporary'>,
    manifest: DeletionManifest,
    operationDirectory: string,
  ) {
    this.manifest = manifest;
    this.operationDirectory = operationDirectory;
    this.sourceImage = resolvePrivateAssetPath(directories.attachments, manifest.relativePath);
    this.sourceThumbnail = resolvePrivateAssetPath(
      directories.thumbnails,
      manifest.thumbnailRelativePath,
    );
    this.quarantinedImage = path.join(operationDirectory, 'image.asset');
    this.quarantinedThumbnail = path.join(operationDirectory, 'thumbnail.asset');
  }

  public static resume(
    directories: Pick<DataDirectories, 'attachments' | 'thumbnails' | 'temporary'>,
    manifest: DeletionManifest,
    operationDirectory: string,
  ): AttachmentDeletionJournal {
    return new AttachmentDeletionJournal(directories, manifest, operationDirectory);
  }

  public static async create(
    directories: Pick<DataDirectories, 'attachments' | 'thumbnails' | 'temporary'>,
    input: CreateDeletionJournalInput,
  ): Promise<AttachmentDeletionJournal> {
    const manifest = deletionManifestSchema.parse({ version: 1, phase: 'prepared', ...input });
    const operationDirectory = path.join(
      journalRoot(directories.temporary),
      `${manifest.campaignId}_${manifest.attachmentId}_${manifest.operationId}`,
    );
    await mkdir(journalRoot(directories.temporary), { recursive: true });
    await mkdir(operationDirectory, { recursive: false });
    const journal = AttachmentDeletionJournal.resume(directories, manifest, operationDirectory);
    await journal.writePhase('prepared');
    return journal;
  }

  public async moveImage(): Promise<void> {
    await rename(this.sourceImage, this.quarantinedImage);
    await this.writePhase('image_moved');
  }

  public async moveThumbnail(): Promise<void> {
    await rename(this.sourceThumbnail, this.quarantinedThumbnail);
    await this.writePhase('assets_moved');
  }

  public async markDatabaseDeleted(): Promise<void> {
    await this.writePhase('db_deleted');
  }

  public async restore(): Promise<boolean> {
    const results = await Promise.all([
      restoreIfPresent(this.quarantinedImage, this.sourceImage),
      restoreIfPresent(this.quarantinedThumbnail, this.sourceThumbnail),
    ]);
    return results.every(Boolean);
  }

  public async purge(): Promise<void> {
    await rm(this.operationDirectory, { recursive: true, force: true });
  }

  private async writePhase(phase: DeletionPhase): Promise<void> {
    const state = deletionManifestSchema.parse({ ...this.manifest, phase });
    const statePath = path.join(this.operationDirectory, phaseFileNames[phase]);
    const handle = await open(statePath, 'wx');
    try {
      await handle.writeFile(JSON.stringify(state), 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}

export async function recoverPendingAttachmentDeletions(
  repository: AttachmentExistenceRepository,
  directories: Pick<DataDirectories, 'attachments' | 'thumbnails' | 'temporary'>,
): Promise<AttachmentDeletionRecoveryResult> {
  const root = journalRoot(directories.temporary);
  await mkdir(root, { recursive: true });
  const entries = (await readdir(root, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const plans: RecoveryPlan[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const operationDirectory = path.join(root, entry.name);
    const manifest = await readLatestManifest(operationDirectory);
    assertCanonicalOperationDirectory(entry.name, manifest);
    const identity = repository.findAttachmentDeletionIdentity(manifest.attachmentId);
    if (identity !== null) assertManifestMatchesIdentity(manifest, identity);
    const journal = AttachmentDeletionJournal.resume(directories, manifest, operationDirectory);
    plans.push({ journal, attachmentExists: identity !== null });
  }

  let restored = 0;
  let purged = 0;
  for (const plan of plans) {
    if (plan.attachmentExists) {
      if (!(await plan.journal.restore())) {
        throw new AppError(
          'ATTACHMENT_DELETE_RECOVERY_FAILED',
          'Uma exclusão interrompida não pôde ser recuperada com segurança.',
        );
      }
      await plan.journal.purge();
      restored += 1;
    } else {
      await plan.journal.purge();
      purged += 1;
    }
  }
  return { restored, purged };
}

interface RecoveryPlan {
  journal: AttachmentDeletionJournal;
  attachmentExists: boolean;
}

async function readLatestManifest(operationDirectory: string): Promise<DeletionManifest> {
  const entries = await readdir(operationDirectory);
  const allowedFiles = new Set<string>([
    ...Object.values(phaseFileNames),
    'image.asset',
    'thumbnail.asset',
  ]);
  if (entries.some((name) => !allowedFiles.has(name))) throw invalidManifest();
  const stateFiles = entries.filter((name) => name.startsWith('state-')).sort();
  if (stateFiles.length === 0) throw invalidManifest();
  const expectedPrefix = deletionPhases
    .slice(0, stateFiles.length)
    .map((phase) => phaseFileNames[phase]);
  if (
    stateFiles.length > deletionPhases.length ||
    stateFiles.some((name, index) => name !== expectedPrefix[index])
  ) {
    throw invalidManifest();
  }
  let latest: DeletionManifest | null = null;
  for (const file of stateFiles) {
    let manifest: DeletionManifest;
    try {
      manifest = deletionManifestSchema.parse(
        JSON.parse(await readFile(path.join(operationDirectory, file), 'utf8')),
      );
    } catch {
      throw invalidManifest();
    }
    if (phaseFileNames[manifest.phase] !== file) throw invalidManifest();
    if (latest !== null && !sameManifestIdentity(latest, manifest)) throw invalidManifest();
    latest = manifest;
  }
  if (latest === null) throw invalidManifest();
  return latest;
}

function assertCanonicalOperationDirectory(
  directoryName: string,
  manifest: DeletionManifest,
): void {
  const expected = `${manifest.campaignId}_${manifest.attachmentId}_${manifest.operationId}`;
  if (directoryName !== expected) throw invalidManifest();
}

function assertManifestMatchesIdentity(
  manifest: DeletionManifest,
  identity: AttachmentDeletionIdentity,
): void {
  if (
    identity.attachmentId !== manifest.attachmentId ||
    identity.campaignId !== manifest.campaignId ||
    identity.revision !== manifest.attachmentRevision ||
    identity.relativePath !== manifest.relativePath ||
    identity.thumbnailRelativePath !== manifest.thumbnailRelativePath
  ) {
    throw invalidManifest();
  }
}

function sameManifestIdentity(left: DeletionManifest, right: DeletionManifest): boolean {
  return (
    left.operationId === right.operationId &&
    left.campaignId === right.campaignId &&
    left.attachmentId === right.attachmentId &&
    left.attachmentRevision === right.attachmentRevision &&
    left.relativePath === right.relativePath &&
    left.thumbnailRelativePath === right.thumbnailRelativePath &&
    left.createdAt === right.createdAt
  );
}

function invalidManifest(): AppError {
  return new AppError(
    'ATTACHMENT_DELETE_MANIFEST_INVALID',
    'O manifesto de uma exclusão interrompida é inválido.',
  );
}

async function restoreIfPresent(quarantine: string, source: string): Promise<boolean> {
  if (!(await exists(quarantine))) return true;
  if (await exists(source)) return false;
  await mkdir(path.dirname(source), { recursive: true });
  try {
    await rename(quarantine, source);
    return true;
  } catch {
    return false;
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function journalRoot(temporaryRoot: string): string {
  return path.join(temporaryRoot, 'attachment-deletions');
}

function resolvePrivateAssetPath(root: string, relativePath: string): string {
  const normalizedRoot = path.resolve(root);
  const resolved = path.resolve(normalizedRoot, ...relativePath.split('/'));
  if (!resolved.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new AppError('ATTACHMENT_PATH_INVALID', 'O caminho interno do anexo é inválido.');
  }
  return resolved;
}
