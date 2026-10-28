import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import { imageImportChannels } from '../../src/core/contracts/ipc-channels';
import { registerCampaignCoverIpcHandlers } from '../../src/main/ipc/campaign-cover-handlers';
import type { CampaignCoverService } from '../../src/main/services/campaign-cover-service';
import { TestLogger } from '../helpers/test-logger';

type CapturedHandler = (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>;

describe('handlers IPC de gestão de capa', () => {
  it('registra somente os quatro canais de gestão e remove todos', () => {
    const handlers = new Map<string, CapturedHandler>();
    const unregister = registerCampaignCoverIpcHandlers(createIpcMain(handlers), dependencies());
    expect([...handlers.keys()].sort()).toEqual(
      [
        imageImportChannels.getCover,
        imageImportChannels.getCoverPreview,
        imageImportChannels.setCover,
        imageImportChannels.removeCover,
        imageImportChannels.deleteAttachment,
      ].sort(),
    );
    unregister();
    expect(handlers.size).toBe(0);
  });

  it('encaminha contratos estritos e nunca serializa caminhos ou sourceUrl', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeCampaignCoverService();
    registerCampaignCoverIpcHandlers(createIpcMain(handlers), dependencies(service));
    const identity = { campaignId: campaign.id };
    const setInput = { ...identity, attachmentId: attachment.id, revision: 1 };
    const getResult = await required(handlers, imageImportChannels.getCover)(event(42), identity);
    const previewResult = await required(handlers, imageImportChannels.getCoverPreview)(
      event(42),
      identity,
    );
    await required(handlers, imageImportChannels.setCover)(event(42), setInput);
    await required(handlers, imageImportChannels.removeCover)(event(42), {
      ...identity,
      revision: 2,
    });
    await required(handlers, imageImportChannels.deleteAttachment)(event(42), setInput);
    expect(service.calls).toEqual(['get', 'preview', 'set', 'remove', 'delete']);
    expect(JSON.stringify(getResult)).not.toMatch(/sourceUrl|relativePath|storedFilename/u);
    expect(JSON.stringify(previewResult)).not.toMatch(/sourceUrl|relativePath|storedFilename/u);
    expect(
      await required(handlers, imageImportChannels.setCover)(event(42), {
        ...setInput,
        path: 'C:\\private\\cover.webp',
      }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('rejeita IDs, revisões e sender inváidos antes do serviço', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeCampaignCoverService();
    registerCampaignCoverIpcHandlers(createIpcMain(handlers), dependencies(service));
    const handler = required(handlers, imageImportChannels.removeCover);
    expect(await handler(event(42), { campaignId: 'inválida', revision: 0 })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(await handler(event(7), { campaignId: campaign.id, revision: 1 })).toMatchObject({
      ok: false,
      error: { code: 'IPC_SENDER_NOT_ALLOWED' },
    });
    expect(service.calls).toEqual([]);
  });
});

class FakeCampaignCoverService {
  public readonly calls: string[] = [];

  public get() {
    this.calls.push('get');
    return { campaign, attachment };
  }

  public getPreview() {
    this.calls.push('preview');
    return {
      attachmentId: attachment.id,
      mimeType: 'image/webp' as const,
      bytes: new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
    };
  }

  public set() {
    this.calls.push('set');
    return { campaign: { ...campaign, coverAttachmentId: attachment.id, revision: 2 }, attachment };
  }

  public remove() {
    this.calls.push('remove');
    return { campaign: { ...campaign, coverAttachmentId: null, revision: 3 }, attachment: null };
  }

  public deleteAttachment() {
    this.calls.push('delete');
    return Promise.resolve({ campaignId: campaign.id, attachmentId: attachment.id });
  }
}

const campaign = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Ethéria',
  systemName: null,
  concept: null,
  genre: null,
  tone: null,
  summary: null,
  coverAttachmentId: null,
  status: 'active' as const,
  createdAt: '2026-10-28T10:00:00.000Z',
  updatedAt: '2026-10-28T10:00:00.000Z',
  archivedAt: null,
  revision: 1,
};

const attachment = {
  id: '10000000-0000-4000-8000-000000000001',
  campaignId: campaign.id,
  originalFilename: 'capa.png',
  mimeType: 'image/png' as const,
  fileSize: 1024,
  checksumSha256: 'a'.repeat(64),
  visibility: 'gm' as const,
  width: 800,
  height: 600,
  sourceKind: 'url' as const,
  processedMimeType: 'image/webp' as const,
  processingStatus: 'ready' as const,
  createdAt: '2026-10-28T10:00:00.000Z',
  updatedAt: '2026-10-28T10:00:00.000Z',
  revision: 1,
};

function dependencies(service = new FakeCampaignCoverService()) {
  return {
    service: service as unknown as CampaignCoverService,
    logger: new TestLogger(),
    authorizedWebContentsId: 42,
  };
}

function createIpcMain(handlers: Map<string, CapturedHandler>): IpcMain {
  return {
    handle: (channel: string, handler: CapturedHandler) => handlers.set(channel, handler),
    removeHandler: (channel: string) => handlers.delete(channel),
  } as unknown as IpcMain;
}

function event(senderId: number): IpcMainInvokeEvent {
  const mainFrame = {};
  return {
    sender: { id: senderId, mainFrame },
    senderFrame: mainFrame,
  } as unknown as IpcMainInvokeEvent;
}

function required(handlers: Map<string, CapturedHandler>, channel: string): CapturedHandler {
  const handler = handlers.get(channel);
  if (handler === undefined) throw new Error(`Handler não registrado: ${channel}`);
  return handler;
}
