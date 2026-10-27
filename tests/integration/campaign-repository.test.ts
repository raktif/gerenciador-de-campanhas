import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  campaignPageRequestSchema,
  campaignSchema,
  updateCampaignInputSchema,
  type Campaign,
} from '../../src/core/contracts/campaigns';
import { AppError } from '../../src/core/errors/app-error';
import { ensureDataDirectories, getDataDirectories } from '../../src/core/storage/data-directories';
import { openApplicationDatabase, type DatabaseContext } from '../../src/db/connection';
import { CampaignRepository } from '../../src/db/repositories/campaign-repository';
import { TestLogger } from '../helpers/test-logger';

const temporaryRoots: string[] = [];
const databaseContexts: DatabaseContext[] = [];

afterEach(async () => {
  for (const context of databaseContexts.splice(0)) {
    if (context.native.open) context.close();
  }
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((temporaryRoot) => rm(temporaryRoot, { recursive: true, force: true })),
  );
});

describe('CampaignRepository', () => {
  it('insere e consulta uma campanha persistida', async () => {
    const { context, repository } = await createRepository();
    const campaign = createCampaign({
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Ethéria',
      systemName: 'Sistema próprio',
    });

    expect(repository.insert(campaign)).toEqual(campaign);
    expect(repository.findById(campaign.id)).toEqual(campaign);
    context.close();
  });

  it('pagina por cursor estável e respeita o filtro de estado', async () => {
    const { context, repository } = await createRepository();
    repository.insert(
      createCampaign({ id: '00000000-0000-4000-8000-000000000001', name: 'Ameaças' }),
    );
    repository.insert(
      createCampaign({ id: '00000000-0000-4000-8000-000000000002', name: 'Ameaças' }),
    );
    repository.insert(
      createCampaign({ id: '00000000-0000-4000-8000-000000000003', name: 'Mistérios' }),
    );
    repository.insert(
      createCampaign({
        id: '00000000-0000-4000-8000-000000000004',
        name: 'Arquivada',
        status: 'archived',
        archivedAt: '2026-08-27T12:00:00.000Z',
      }),
    );

    const request = campaignPageRequestSchema.parse({ limit: 2, sort: 'name', order: 'asc' });
    const firstPage = repository.list(request);
    expect(firstPage.items.map(({ id }) => id)).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ]);
    expect(firstPage.total).toBe(3);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = repository.list(
      campaignPageRequestSchema.parse({
        ...request,
        cursor: firstPage.nextCursor ?? undefined,
      }),
    );
    expect(secondPage.items.map(({ name }) => name)).toEqual(['Mistérios']);
    expect(secondPage.nextCursor).toBeNull();

    const archived = repository.list(
      campaignPageRequestSchema.parse({ filters: { statuses: ['archived'] } }),
    );
    expect(archived.items.map(({ name }) => name)).toEqual(['Arquivada']);
    context.close();
  });

  it('rejeita cursor adulterado ou usado com outra ordenação', async () => {
    const { context, repository } = await createRepository();
    repository.insert(
      createCampaign({ id: '00000000-0000-4000-8000-000000000001', name: 'Primeira' }),
    );
    repository.insert(
      createCampaign({ id: '00000000-0000-4000-8000-000000000002', name: 'Segunda' }),
    );
    const page = repository.list(campaignPageRequestSchema.parse({ limit: 1 }));

    const invalidCursor = captureAppError(() =>
      repository.list(campaignPageRequestSchema.parse({ cursor: 'inválido' })),
    );
    expect(invalidCursor.code).toBe('INVALID_CURSOR');

    const mismatchedCursor = captureAppError(() =>
      repository.list(
        campaignPageRequestSchema.parse({
          cursor: page.nextCursor ?? undefined,
          order: 'asc',
        }),
      ),
    );
    expect(mismatchedCursor.code).toBe('INVALID_CURSOR');
    context.close();
  });

  it('atualiza condicionalmente e informa conflito de revisão', async () => {
    const { context, repository } = await createRepository();
    const campaign = createCampaign({
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Ethéria',
    });
    repository.insert(campaign);

    const updated = repository.update(
      updateCampaignInputSchema.parse({
        id: campaign.id,
        revision: 1,
        patch: { summary: 'Uma campanha viva.' },
      }),
      '2026-08-27T13:00:00.000Z',
    );
    expect(updated).toMatchObject({
      summary: 'Uma campanha viva.',
      revision: 2,
      updatedAt: '2026-08-27T13:00:00.000Z',
    });

    const conflict = captureAppError(() =>
      repository.update(
        updateCampaignInputSchema.parse({
          id: campaign.id,
          revision: 1,
          patch: { name: 'Sobrescrita' },
        }),
        '2026-08-27T14:00:00.000Z',
      ),
    );
    expect(conflict.code).toBe('REVISION_CONFLICT');
    expect(conflict.details).toEqual({
      expectedRevision: 1,
      currentRevision: 2,
      current: updated,
    });
    context.close();
  });

  it('associa capa pronta somente à campanha proprietária e preserva revisão otimista', async () => {
    const { context, repository } = await createRepository();
    const first = createCampaign({
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Primeira',
    });
    const second = createCampaign({
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Segunda',
    });
    repository.insert(first);
    repository.insert(second);
    const firstAttachmentId = '00000000-0000-4000-8000-000000000011';
    const secondAttachmentId = '00000000-0000-4000-8000-000000000012';
    const pendingAttachmentId = '00000000-0000-4000-8000-000000000013';
    insertReadyAttachment(context, first.id, firstAttachmentId);
    insertReadyAttachment(context, second.id, secondAttachmentId);
    insertAttachment(context, first.id, pendingAttachmentId, { processingStatus: 'pending' });

    const updated = repository.update(
      {
        id: first.id,
        revision: first.revision,
        patch: { coverAttachmentId: firstAttachmentId },
      },
      '2026-10-26T13:00:00.000Z',
    );

    expect(updated).toMatchObject({ coverAttachmentId: firstAttachmentId, revision: 2 });
    expect(() =>
      repository.update(
        {
          id: first.id,
          revision: updated.revision,
          patch: { coverAttachmentId: pendingAttachmentId },
        },
        '2026-10-26T13:30:00.000Z',
      ),
    ).toThrow(/campaign cover attachment must be ready and belong to the campaign/);
    expect(() =>
      repository.update(
        {
          id: first.id,
          revision: updated.revision,
          patch: { coverAttachmentId: secondAttachmentId },
        },
        '2026-10-26T14:00:00.000Z',
      ),
    ).toThrow(/campaign cover attachment must be ready and belong to the campaign/);
    expect(() =>
      context.native
        .prepare('UPDATE attachments SET campaign_id = ? WHERE id = ?')
        .run(second.id, firstAttachmentId),
    ).toThrow(/attachment campaign cannot be changed/);
    expect(() =>
      context.native
        .prepare('UPDATE attachments SET processing_status = ? WHERE id = ?')
        .run('failed', firstAttachmentId),
    ).toThrow(/a campaign cover attachment must remain ready/);
    expect(repository.findById(first.id)).toEqual(updated);
    context.close();
  });

  it('rejeita revisão, origem incoerente e nomes ou caminhos internos não normalizados', async () => {
    const { context, repository } = await createRepository();
    const campaign = createCampaign({
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Segura',
    });
    repository.insert(campaign);
    const attachmentId = '00000000-0000-4000-8000-000000000020';

    expect(() => insertAttachment(context, campaign.id, attachmentId, { revision: 0 })).toThrow();
    expect(() =>
      insertAttachment(context, campaign.id, attachmentId, {
        sourceKind: 'file',
        sourceUrl: 'https://example.invalid/capa.png',
      }),
    ).toThrow();
    expect(() =>
      insertAttachment(context, campaign.id, attachmentId, {
        sourceKind: 'url',
        sourceUrl: null,
      }),
    ).toThrow();
    for (const storedFilename of [
      'pasta/capa.png',
      'pasta\\capa.png',
      'c:capa.png',
      '.',
      '..',
      '.oculta.png',
    ]) {
      expect(() =>
        insertAttachment(context, campaign.id, attachmentId, { storedFilename }),
      ).toThrow();
    }

    for (const relativePath of [
      '/absoluto/capa.png',
      'c:/campanha/capa.png',
      'campanha\\capa.png',
      './campanha/capa.png',
      'campanha/./capa.png',
      'campanha/../capa.png',
    ]) {
      expect(() =>
        insertAttachment(context, campaign.id, attachmentId, { relativePath }),
      ).toThrow();
    }
    for (const thumbnailRelativePath of [
      '/absoluto/miniatura.png',
      'c:/campanha/miniatura.png',
      'campanha\\miniatura.png',
      './campanha/miniatura.png',
      'campanha/./miniatura.png',
      'campanha/../miniatura.png',
    ]) {
      expect(() =>
        insertAttachment(context, campaign.id, attachmentId, { thumbnailRelativePath }),
      ).toThrow();
    }

    insertAttachment(context, campaign.id, attachmentId, {
      sourceKind: 'url',
      sourceUrl: 'https://example.invalid/capa.png',
    });
    expect(
      context.native
        .prepare('SELECT revision, source_kind, source_url FROM attachments WHERE id = ?')
        .get(attachmentId),
    ).toEqual({
      revision: 1,
      source_kind: 'url',
      source_url: 'https://example.invalid/capa.png',
    });
    context.close();
  });

  it('não devolve image_path legado pelo repositório público', async () => {
    const { context, repository } = await createRepository();
    const campaign = createCampaign({
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Legado',
    });
    repository.insert(campaign);
    context.native
      .prepare('UPDATE campaigns SET image_path = ? WHERE id = ?')
      .run('C:\\privado\\capa.png', campaign.id);

    const publicCampaign = repository.findById(campaign.id);
    expect(publicCampaign).toEqual(campaign);
    expect(publicCampaign).not.toHaveProperty('imagePath');
    context.close();
  });

  it('diferencia registro ausente de conflito de revisão', async () => {
    const { context, repository } = await createRepository();
    let error: unknown;

    try {
      repository.update(
        updateCampaignInputSchema.parse({
          id: '00000000-0000-4000-8000-000000000099',
          revision: 1,
          patch: { name: 'Inexistente' },
        }),
        '2026-08-27T14:00:00.000Z',
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'CAMPAIGN_NOT_FOUND' });
    context.close();
  });
});

async function createRepository(): Promise<{
  context: Awaited<ReturnType<typeof openApplicationDatabase>>;
  repository: CampaignRepository;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rpg-campaign-repository-test-'));
  temporaryRoots.push(root);
  const directories = getDataDirectories(root);
  await ensureDataDirectories(directories);
  const context = await openApplicationDatabase(directories, new TestLogger());
  databaseContexts.push(context);
  return { context, repository: new CampaignRepository(context.orm) };
}

function createCampaign(overrides: Partial<Campaign> & Pick<Campaign, 'id' | 'name'>): Campaign {
  const { id, name, ...optionalOverrides } = overrides;
  return campaignSchema.parse({
    id,
    name,
    systemName: null,
    concept: null,
    genre: null,
    tone: null,
    summary: null,
    coverAttachmentId: null,
    status: 'active',
    createdAt: '2026-08-27T12:00:00.000Z',
    updatedAt: '2026-08-27T12:00:00.000Z',
    archivedAt: null,
    revision: 1,
    ...optionalOverrides,
  });
}

function captureAppError(operation: () => unknown): AppError {
  try {
    operation();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('A operação deveria ter lançado AppError.');
}

function insertReadyAttachment(
  context: DatabaseContext,
  campaignId: string,
  attachmentId: string,
): void {
  insertAttachment(context, campaignId, attachmentId);
}

interface AttachmentOverrides {
  processingStatus?: 'pending' | 'ready' | 'failed';
  relativePath?: string;
  revision?: number;
  sourceKind?: 'file' | 'url' | 'clipboard' | 'drag_drop';
  sourceUrl?: string | null;
  storedFilename?: string;
  thumbnailRelativePath?: string;
}

function insertAttachment(
  context: DatabaseContext,
  campaignId: string,
  attachmentId: string,
  overrides: AttachmentOverrides = {},
): void {
  const storedFilename = overrides.storedFilename ?? `${attachmentId}.png`;
  const relativePath = overrides.relativePath ?? `${campaignId}/${attachmentId}.png`;
  const thumbnailRelativePath =
    overrides.thumbnailRelativePath ?? `${campaignId}/${attachmentId}-thumb.png`;
  const sourceKind = overrides.sourceKind ?? 'file';
  const sourceUrl = overrides.sourceUrl ?? null;
  context.native
    .prepare(
      `INSERT INTO attachments (
        id, campaign_id, original_filename, stored_filename, relative_path, mime_type,
        file_size, checksum_sha256, visibility, width, height, thumbnail_relative_path,
        source_kind, source_url, processed_mime_type, processing_status, created_at, updated_at,
        revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      attachmentId,
      campaignId,
      'capa.png',
      storedFilename,
      relativePath,
      'image/png',
      1024,
      attachmentId.endsWith('11') ? 'a'.repeat(64) : 'b'.repeat(64),
      'gm',
      1280,
      720,
      thumbnailRelativePath,
      sourceKind,
      sourceUrl,
      'image/png',
      overrides.processingStatus ?? 'ready',
      '2026-10-26T12:00:00.000Z',
      '2026-10-26T12:00:00.000Z',
      overrides.revision ?? 1,
    );
}
