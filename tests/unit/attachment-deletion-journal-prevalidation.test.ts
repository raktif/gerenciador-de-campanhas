import { access, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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

describe('pré-validação integral do journal', () => {
  it('rejeita segundo plano com path inseguro antes de restaurar ou purgar o primeiro', async () => {
    const fixture = await createFixture();
    await fixture.firstJournal.moveImage();
    await createUnsafeSecondOperation(fixture);

    await expect(
      recoverPendingAttachmentDeletions(repository(fixture.identities), fixture.directories),
    ).rejects.toMatchObject({ code: 'ATTACHMENT_DELETE_MANIFEST_INVALID' });
    expect(await readdir(fixture.firstOperationDirectory)).toContain('image.asset');
    await expect(access(fixture.firstImage)).rejects.toThrow();
    expect(await readFile(fixture.firstThumbnail, 'utf8')).toBe('thumbnail');
    expect(await readdir(fixture.journalRoot)).toHaveLength(2);
  });

  it('rejeita arquivo inesperado sem tocar na quarentena', async () => {
    const fixture = await createFixture();
    await fixture.firstJournal.moveImage();
    await writeFile(path.join(fixture.firstOperationDirectory, 'unexpected.bin'), 'unsafe');

    await expect(
      recoverPendingAttachmentDeletions(repository(fixture.identities), fixture.directories),
    ).rejects.toMatchObject({ code: 'ATTACHMENT_DELETE_MANIFEST_INVALID' });
    expect(await readdir(fixture.firstOperationDirectory)).toContain('image.asset');
    expect(
      await readFile(path.join(fixture.firstOperationDirectory, 'unexpected.bin'), 'utf8'),
    ).toBe('unsafe');
  });
});

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'journal-prevalidation-'));
  roots.push(root);
  const directories = {
    attachments: path.join(root, 'attachments'),
    thumbnails: path.join(root, 'thumbnails'),
    temporary: path.join(root, 'tmp'),
  };
  const journalRoot = path.join(directories.temporary, 'attachment-deletions');
  const firstCampaignId = '00000000-0000-4000-8000-000000000001';
  const firstAttachmentId = '10000000-0000-4000-8000-000000000001';
  const firstOperationId = '20000000-0000-4000-8000-000000000001';
  const firstRelativePath = `${firstCampaignId}/${firstAttachmentId}.webp`;
  const firstThumbnailRelativePath = `${firstCampaignId}/${firstAttachmentId}-thumb.webp`;
  const firstImage = path.join(directories.attachments, ...firstRelativePath.split('/'));
  const firstThumbnail = path.join(
    directories.thumbnails,
    ...firstThumbnailRelativePath.split('/'),
  );
  await Promise.all([
    mkdir(path.dirname(firstImage), { recursive: true }),
    mkdir(path.dirname(firstThumbnail), { recursive: true }),
  ]);
  await Promise.all([writeFile(firstImage, 'image'), writeFile(firstThumbnail, 'thumbnail')]);
  const firstJournal = await AttachmentDeletionJournal.create(directories, {
    campaignId: firstCampaignId,
    attachmentId: firstAttachmentId,
    attachmentRevision: 1,
    relativePath: firstRelativePath,
    thumbnailRelativePath: firstThumbnailRelativePath,
    operationId: firstOperationId,
    createdAt: '2026-10-28T12:00:00.000Z',
  });
  const firstOperationDirectory = path.join(
    journalRoot,
    `${firstCampaignId}_${firstAttachmentId}_${firstOperationId}`,
  );
  const identities = new Map<string, AttachmentDeletionIdentity>([
    [
      firstAttachmentId,
      {
        attachmentId: firstAttachmentId,
        campaignId: firstCampaignId,
        revision: 1,
        relativePath: firstRelativePath,
        thumbnailRelativePath: firstThumbnailRelativePath,
      },
    ],
  ]);
  return {
    directories,
    journalRoot,
    firstJournal,
    firstOperationDirectory,
    firstImage,
    firstThumbnail,
    identities,
  };
}

async function createUnsafeSecondOperation(
  fixture: Awaited<ReturnType<typeof createFixture>>,
): Promise<void> {
  const campaignId = '00000000-0000-4000-8000-000000000002';
  const attachmentId = '10000000-0000-4000-8000-000000000002';
  const operationId = '20000000-0000-4000-8000-000000000002';
  const operationDirectory = path.join(
    fixture.journalRoot,
    `${campaignId}_${attachmentId}_${operationId}`,
  );
  const relativePath = `${campaignId}/D:foo`;
  const thumbnailRelativePath = `${campaignId}/${attachmentId}-thumb.webp`;
  await mkdir(operationDirectory);
  await writeFile(
    path.join(operationDirectory, 'state-0-prepared.json'),
    JSON.stringify({
      version: 1,
      operationId,
      campaignId,
      attachmentId,
      attachmentRevision: 1,
      relativePath,
      thumbnailRelativePath,
      phase: 'prepared',
      createdAt: '2026-10-28T12:00:00.000Z',
    }),
  );
  fixture.identities.set(attachmentId, {
    attachmentId,
    campaignId,
    revision: 1,
    relativePath,
    thumbnailRelativePath,
  });
}

function repository(identities: Map<string, AttachmentDeletionIdentity>) {
  return {
    findAttachmentDeletionIdentity: (attachmentId: string) => identities.get(attachmentId) ?? null,
  };
}
