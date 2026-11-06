import { access, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AttachmentDeletionJournal,
  recoverPendingAttachmentDeletions,
} from '../../src/main/services/attachment-deletion-journal';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('journal durável de exclusão de attachments', () => {
  it('restaura a imagem após crash entre o primeiro e o segundo rename', async () => {
    const fixture = await createFixture();
    await fixture.journal.moveImage();

    await expect(recover(fixture, true)).resolves.toEqual({ restored: 1, purged: 0 });
    expect(await readFile(fixture.image, 'utf8')).toBe('image');
    expect(await readFile(fixture.thumbnail, 'utf8')).toBe('thumbnail');
    expect(await journalEntries(fixture.directories.temporary)).toEqual([]);
  });

  it('restaura ambos os assets após crash antes do commit', async () => {
    const fixture = await createFixture();
    await fixture.journal.moveImage();
    await fixture.journal.moveThumbnail();

    await expect(recover(fixture, true)).resolves.toEqual({ restored: 1, purged: 0 });
    expect(await readFile(fixture.image, 'utf8')).toBe('image');
    expect(await readFile(fixture.thumbnail, 'utf8')).toBe('thumbnail');
  });

  it('purga a quarentena após crash entre o commit e o registro da fase final', async () => {
    const fixture = await createFixture();
    await fixture.journal.moveImage();
    await fixture.journal.moveThumbnail();

    await expect(recover(fixture, false)).resolves.toEqual({ restored: 0, purged: 1 });
    await expect(access(fixture.image)).rejects.toThrow();
    await expect(access(fixture.thumbnail)).rejects.toThrow();
    expect(await journalEntries(fixture.directories.temporary)).toEqual([]);
  });

  it('está ligado ao bootstrap antes da criação da janela', async () => {
    const application = await readFile(
      path.join(process.cwd(), 'src', 'main', 'bootstrap', 'application.ts'),
      'utf8',
    );
    const recoveryCall = application.indexOf(
      'await recoverPendingAttachmentDeletions(attachmentRepository, directories)',
    );
    const windowCreation = application.indexOf('const window = createWindowWithInitialTheme');
    expect(recoveryCall).toBeGreaterThan(-1);
    expect(windowCreation).toBeGreaterThan(recoveryCall);
  });
});

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'attachment-deletion-journal-'));
  roots.push(root);
  const campaignId = '00000000-0000-4000-8000-000000000001';
  const attachmentId = '10000000-0000-4000-8000-000000000001';
  const directories = {
    attachments: path.join(root, 'attachments'),
    thumbnails: path.join(root, 'thumbnails'),
    temporary: path.join(root, 'tmp'),
  };
  const relativePath = `${campaignId}/${attachmentId}.webp`;
  const thumbnailRelativePath = `${campaignId}/${attachmentId}-thumb.webp`;
  const image = path.join(directories.attachments, ...relativePath.split('/'));
  const thumbnail = path.join(directories.thumbnails, ...thumbnailRelativePath.split('/'));
  await Promise.all([
    mkdir(path.dirname(image), { recursive: true }),
    mkdir(path.dirname(thumbnail), { recursive: true }),
  ]);
  await Promise.all([writeFile(image, 'image'), writeFile(thumbnail, 'thumbnail')]);
  const journal = await AttachmentDeletionJournal.create(directories, {
    campaignId,
    attachmentId,
    attachmentRevision: 1,
    relativePath,
    thumbnailRelativePath,
    operationId: '20000000-0000-4000-8000-000000000001',
    createdAt: '2026-10-28T12:00:00.000Z',
  });
  return {
    directories,
    campaignId,
    attachmentId,
    relativePath,
    thumbnailRelativePath,
    image,
    thumbnail,
    journal,
  };
}

function recover(fixture: Awaited<ReturnType<typeof createFixture>>, attachmentExists: boolean) {
  return recoverPendingAttachmentDeletions(
    {
      findAttachmentDeletionIdentity: (attachmentId) =>
        attachmentExists && attachmentId === fixture.attachmentId
          ? {
              attachmentId: fixture.attachmentId,
              campaignId: fixture.campaignId,
              revision: 1,
              relativePath: fixture.relativePath,
              thumbnailRelativePath: fixture.thumbnailRelativePath,
            }
          : null,
    },
    fixture.directories,
  );
}

async function journalEntries(temporary: string): Promise<string[]> {
  return readdir(path.join(temporary, 'attachment-deletions'));
}
