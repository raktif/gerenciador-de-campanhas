import { access, mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AttachmentDeletionJournal,
  recoverPendingAttachmentDeletions,
  type AttachmentDeletionIdentity,
} from '../../src/main/services/attachment-deletion-journal';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('validação fail-closed do journal de exclusão', () => {
  it('preserva quarentena quando os paths divergem do banco', async () => {
    const fixture = await createFixture();
    await fixture.journal.moveImage();
    await expectRecoveryFailure(fixture, {
      ...fixture.identity,
      relativePath: `${fixture.identity.relativePath}.divergente`,
    });
    await expectQuarantinePreserved(fixture);
  });

  it('preserva quarentena quando a revisão diverge do banco', async () => {
    const fixture = await createFixture();
    await fixture.journal.moveImage();
    await expectRecoveryFailure(fixture, { ...fixture.identity, revision: 2 });
    await expectQuarantinePreserved(fixture);
  });

  it('rejeita nome de diretório que não corresponde ao manifesto', async () => {
    const fixture = await createFixture();
    await fixture.journal.moveImage();
    const divergentDirectory = `${fixture.operationDirectory}-divergente`;
    await rename(fixture.operationDirectory, divergentDirectory);
    fixture.operationDirectory = divergentDirectory;
    await expectRecoveryFailure(fixture, fixture.identity);
    await expectQuarantinePreserved(fixture);
  });

  it('preserva diretório sem manifesto que contém asset', async () => {
    const fixture = await createEmptyJournalRoot();
    const operationDirectory = path.join(fixture.journalRoot, 'operacao-sem-manifesto');
    await mkdir(operationDirectory);
    const quarantined = path.join(operationDirectory, 'image.asset');
    await writeFile(quarantined, 'image');
    await expect(
      recoverPendingAttachmentDeletions(
        { findAttachmentDeletionIdentity: () => null },
        fixture.directories,
      ),
    ).rejects.toMatchObject({ code: 'ATTACHMENT_DELETE_MANIFEST_INVALID' });
    expect(await readFile(quarantined, 'utf8')).toBe('image');
  });

  it('não recua para state anterior quando o state mais recente é inválido', async () => {
    const fixture = await createFixture();
    await fixture.journal.moveImage();
    await writeFile(path.join(fixture.operationDirectory, 'state-1-image-moved.json'), '{inválido');
    await expectRecoveryFailure(fixture, fixture.identity);
    await expectQuarantinePreserved(fixture);
    expect(
      await access(path.join(fixture.operationDirectory, 'state-0-prepared.json')),
    ).toBeUndefined();
  });
});

async function createFixture() {
  const base = await createEmptyJournalRoot();
  const campaignId = '00000000-0000-4000-8000-000000000001';
  const attachmentId = '10000000-0000-4000-8000-000000000001';
  const operationId = '20000000-0000-4000-8000-000000000001';
  const relativePath = `${campaignId}/${attachmentId}.webp`;
  const thumbnailRelativePath = `${campaignId}/${attachmentId}-thumb.webp`;
  const image = path.join(base.directories.attachments, ...relativePath.split('/'));
  const thumbnail = path.join(base.directories.thumbnails, ...thumbnailRelativePath.split('/'));
  await Promise.all([
    mkdir(path.dirname(image), { recursive: true }),
    mkdir(path.dirname(thumbnail), { recursive: true }),
  ]);
  await Promise.all([writeFile(image, 'image'), writeFile(thumbnail, 'thumbnail')]);
  const journal = await AttachmentDeletionJournal.create(base.directories, {
    campaignId,
    attachmentId,
    attachmentRevision: 1,
    relativePath,
    thumbnailRelativePath,
    operationId,
    createdAt: '2026-10-28T12:00:00.000Z',
  });
  const operationDirectory = path.join(
    base.journalRoot,
    `${campaignId}_${attachmentId}_${operationId}`,
  );
  const identity: AttachmentDeletionIdentity = {
    attachmentId,
    campaignId,
    revision: 1,
    relativePath,
    thumbnailRelativePath,
  };
  return { ...base, journal, operationDirectory, image, thumbnail, identity };
}

async function createEmptyJournalRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'journal-validation-'));
  roots.push(root);
  const directories = {
    attachments: path.join(root, 'attachments'),
    thumbnails: path.join(root, 'thumbnails'),
    temporary: path.join(root, 'tmp'),
  };
  const journalRoot = path.join(directories.temporary, 'attachment-deletions');
  await mkdir(journalRoot, { recursive: true });
  return { directories, journalRoot };
}

async function expectRecoveryFailure(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  identity: AttachmentDeletionIdentity,
): Promise<void> {
  await expect(
    recoverPendingAttachmentDeletions(
      { findAttachmentDeletionIdentity: () => identity },
      fixture.directories,
    ),
  ).rejects.toMatchObject({ code: 'ATTACHMENT_DELETE_MANIFEST_INVALID' });
}

async function expectQuarantinePreserved(
  fixture: Awaited<ReturnType<typeof createFixture>>,
): Promise<void> {
  expect(await readdir(fixture.operationDirectory)).toContain('image.asset');
  await expect(access(fixture.image)).rejects.toThrow();
  expect(await readFile(fixture.thumbnail, 'utf8')).toBe('thumbnail');
}
