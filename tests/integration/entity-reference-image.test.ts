import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import { AttachmentRepository } from '../../src/db/repositories/attachment-repository';
import { EntityReferenceImageService } from '../../src/main/services/entity-reference-image-service';
import { ImageImportService } from '../../src/main/services/image-import-service';
import { ImageProcessingService } from '../../src/main/services/image-processing-service';
import { TestLogger } from '../helpers/test-logger';

const roots: string[] = [];
const contexts: DatabaseContext[] = [];

afterEach(async () => {
  for (const context of contexts.splice(0)) if (context.native.open) context.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('imagem de referência da entidade', () => {
  it('importa pelo pipeline comum, associa atomicamente e entrega preview privado', async () => {
    const fixture = await createFixture();
    const bytes = new Uint8Array(await sharp(svg(1600, 1200)).png().toBuffer());

    const choice = await fixture.imports.importEntityReferenceBytes({
      campaignId: firstCampaignId,
      entityId: firstEntityId,
      revision: 1,
      bytes,
      metadata: { originalFilename: 'retrato.png', sourceKind: 'clipboard' },
    });
    expect(choice.status).toBe('oversize_choice_required');

    const imported = await fixture.imports.importEntityReferenceBytes({
      campaignId: firstCampaignId,
      entityId: firstEntityId,
      revision: 1,
      oversizeMode: 'crop',
      bytes,
      metadata: { originalFilename: 'retrato.png', sourceKind: 'clipboard' },
    });
    if (imported.status !== 'imported') throw new Error('A importação deveria concluir.');
    expect(imported.entity).toMatchObject({
      id: firstEntityId,
      referenceImageAttachmentId: imported.attachment.id,
      revision: 2,
    });
    expect(imported.attachment).toMatchObject({
      campaignId: firstCampaignId,
      width: 1280,
      height: 1024,
      processingStatus: 'ready',
    });
    expect(JSON.stringify(imported)).not.toMatch(
      /relativePath|thumbnailRelativePath|storedFilename/u,
    );
    expect(
      fixture.context.native
        .prepare('SELECT revision FROM campaigns WHERE id = ?')
        .get(firstCampaignId),
    ).toEqual({ revision: 1 });

    const preview = await fixture.references.getPreview({
      campaignId: firstCampaignId,
      entityId: firstEntityId,
    });
    expect(preview).toMatchObject({ attachmentId: imported.attachment.id, mimeType: 'image/webp' });
    expect(preview?.bytes.byteLength).toBeGreaterThan(0);
    const display = await fixture.references.getDisplay({
      campaignId: firstCampaignId,
      entityId: firstEntityId,
    });
    expect(display).toMatchObject({ attachmentId: imported.attachment.id, mimeType: 'image/webp' });
    expect(display.bytes.byteLength).toBeGreaterThan(preview?.bytes.byteLength ?? 0);
    expect(() =>
      fixture.attachments.updateProcessingStatus({
        campaignId: firstCampaignId,
        id: imported.attachment.id,
        revision: 1,
        processingStatus: 'failed',
        updatedAt: timestamp,
      }),
    ).toThrow();
    expect(() =>
      fixture.attachments.prepareAttachmentDeletion({
        campaignId: firstCampaignId,
        attachmentId: imported.attachment.id,
        revision: 1,
      }),
    ).toThrow();
  });

  it('rejeita campanha e revisão alheias, remove o vínculo e libera a exclusão', async () => {
    const fixture = await createFixture();
    const bytes = new Uint8Array(await sharp(svg(320, 240)).webp().toBuffer());
    const imported = await fixture.imports.importEntityReferenceBytes({
      campaignId: firstCampaignId,
      entityId: firstEntityId,
      revision: 1,
      bytes,
      metadata: { originalFilename: 'retrato.webp', sourceKind: 'drag_drop' },
    });
    if (imported.status !== 'imported') throw new Error('A importação deveria concluir.');

    expect(() =>
      fixture.references.set({
        campaignId: secondCampaignId,
        entityId: secondEntityId,
        attachmentId: imported.attachment.id,
        revision: 1,
      }),
    ).toThrow();
    expect(() =>
      fixture.references.remove({
        campaignId: firstCampaignId,
        entityId: firstEntityId,
        revision: 1,
      }),
    ).toThrow();

    const removed = fixture.references.remove({
      campaignId: firstCampaignId,
      entityId: firstEntityId,
      revision: 2,
    });
    expect(removed.entity).toMatchObject({ referenceImageAttachmentId: null, revision: 3 });
    expect(removed.attachment).toBeNull();
    expect(
      fixture.attachments.prepareAttachmentDeletion({
        campaignId: firstCampaignId,
        attachmentId: imported.attachment.id,
        revision: 1,
      }).attachment.id,
    ).toBe(imported.attachment.id);
  });

  it('compensa arquivos publicados quando a persistência da entidade falha', async () => {
    const fixture = await createFixture();
    fixture.context.native
      .prepare('UPDATE entities SET revision = 2, updated_at = ? WHERE id = ?')
      .run('2026-10-29T12:01:00.000Z', firstEntityId);
    const entityBefore = fixture.context.native
      .prepare(
        `SELECT reference_image_attachment_id, revision, updated_at
         FROM entities WHERE id = ?`,
      )
      .get(firstEntityId);
    const attachmentCountBefore = fixture.context.native
      .prepare('SELECT count(*) AS count FROM attachments')
      .get();
    const filesBefore = await publishedWebpFiles(fixture.directories);
    const bytes = new Uint8Array(await sharp(svg(320, 240)).png().toBuffer());

    await expect(
      fixture.imports.importEntityReferenceBytes({
        campaignId: firstCampaignId,
        entityId: firstEntityId,
        revision: 1,
        bytes,
        metadata: { originalFilename: 'conflito.png', sourceKind: 'clipboard' },
      }),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });

    expect(
      fixture.context.native
        .prepare(
          `SELECT reference_image_attachment_id, revision, updated_at
           FROM entities WHERE id = ?`,
        )
        .get(firstEntityId),
    ).toEqual(entityBefore);
    expect(
      fixture.context.native.prepare('SELECT count(*) AS count FROM attachments').get(),
    ).toEqual(attachmentCountBefore);
    expect(await publishedWebpFiles(fixture.directories)).toEqual(filesBefore);
    expect(
      await recursiveEntries(path.join(fixture.directories.temporary, 'image-imports')),
    ).toEqual([]);
  });
});

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'entity-reference-image-'));
  roots.push(root);
  const directories = getDataDirectories(root);
  await ensureDataDirectories(directories);
  const context = await openApplicationDatabase(directories, new TestLogger());
  contexts.push(context);
  seed(context, firstCampaignId, firstEntityTypeId, firstEntityId, 'Primeira');
  seed(context, secondCampaignId, secondEntityTypeId, secondEntityId, 'Segunda');
  const attachments = new AttachmentRepository(context.native);
  let sequence = 100;
  const imports = new ImageImportService({
    repository: attachments,
    processor: new ImageProcessingService(),
    directories,
    selectImageFile: () => Promise.resolve(null),
    createId: () => `00000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`,
    now: () => new Date(timestamp),
  });
  const references = new EntityReferenceImageService({
    repository: attachments,
    directories,
    now: () => new Date(timestamp),
  });
  return { context, directories, attachments, imports, references };
}

function seed(
  context: DatabaseContext,
  campaignId: string,
  entityTypeId: string,
  entityId: string,
  name: string,
): void {
  context.native
    .prepare(
      `INSERT INTO campaigns (id, name, status, created_at, updated_at, revision)
       VALUES (?, ?, 'active', ?, ?, 1)`,
    )
    .run(campaignId, name, timestamp, timestamp);
  context.native
    .prepare(
      `INSERT INTO entity_types
       (id, campaign_id, name, singular_name, slug, sort_order, is_system, is_archived,
        created_at, updated_at, revision)
       VALUES (?, ?, 'Pessoas', 'Pessoa', ?, 0, 0, 0, ?, ?, 1)`,
    )
    .run(entityTypeId, campaignId, `pessoas-${name.toLowerCase()}`, timestamp, timestamp);
  context.native
    .prepare(
      `INSERT INTO entities
       (id, campaign_id, entity_type_id, name, canon_state, knowledge_state, visibility,
        origin_kind, created_at, updated_at, revision)
       VALUES (?, ?, ?, ?, 'accepted', 'fact', 'gm', 'manual', ?, ?, 1)`,
    )
    .run(entityId, campaignId, entityTypeId, `${name} entidade`, timestamp, timestamp);
}

function svg(width: number, height: number): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}"><rect width="100%" height="100%" fill="#345"/></svg>`,
  );
}

async function publishedWebpFiles(directories: {
  attachments: string;
  thumbnails: string;
}): Promise<string[]> {
  const entries = await Promise.all([
    recursiveEntries(directories.attachments),
    recursiveEntries(directories.thumbnails),
  ]);
  return entries
    .flat()
    .filter((entry) => entry.endsWith('.webp'))
    .sort();
}

async function recursiveEntries(root: string): Promise<string[]> {
  try {
    return (await readdir(root, { recursive: true })).sort();
  } catch {
    return [];
  }
}

const timestamp = '2026-10-29T12:00:00.000Z';
const firstCampaignId = '00000000-0000-4000-8000-000000000001';
const secondCampaignId = '00000000-0000-4000-8000-000000000002';
const firstEntityTypeId = '10000000-0000-4000-8000-000000000001';
const secondEntityTypeId = '10000000-0000-4000-8000-000000000002';
const firstEntityId = '20000000-0000-4000-8000-000000000001';
const secondEntityId = '20000000-0000-4000-8000-000000000002';
