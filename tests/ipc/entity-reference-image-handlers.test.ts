import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import { imageImportChannels } from '../../src/core/contracts/ipc-channels';
import { registerEntityReferenceImageIpcHandlers } from '../../src/main/ipc/entity-reference-image-handlers';
import type { EntityReferenceImageService } from '../../src/main/services/entity-reference-image-service';
import { TestLogger } from '../helpers/test-logger';

type CapturedHandler = (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>;

describe('handlers IPC da imagem de referência', () => {
  it('registra e remove somente os canais de associação e leitura', () => {
    const handlers = new Map<string, CapturedHandler>();
    const unregister = register(handlers, new FakeEntityReferenceImageService());
    expect([...handlers.keys()].sort()).toEqual(
      [
        imageImportChannels.getEntityReference,
        imageImportChannels.getEntityReferencePreview,
        imageImportChannels.getEntityReferenceDisplay,
        imageImportChannels.setEntityReference,
        imageImportChannels.removeEntityReference,
      ].sort(),
    );
    unregister();
    expect(handlers.size).toBe(0);
  });

  it('encaminha entrada e saída públicas estritas', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeEntityReferenceImageService();
    register(handlers, service);
    const identity = { campaignId, entityId };
    const setInput = { ...identity, attachmentId, revision: 1 };
    expect(
      await required(handlers, imageImportChannels.getEntityReference)(event(42), identity),
    ).toMatchObject({ ok: true, data: { entity, attachment } });
    expect(
      await required(handlers, imageImportChannels.getEntityReferencePreview)(event(42), identity),
    ).toMatchObject({ ok: true, data: { attachmentId, mimeType: 'image/webp' } });
    expect(
      await required(handlers, imageImportChannels.getEntityReferenceDisplay)(event(42), identity),
    ).toMatchObject({ ok: true, data: { attachmentId, mimeType: 'image/webp' } });
    await required(handlers, imageImportChannels.setEntityReference)(event(42), setInput);
    await required(handlers, imageImportChannels.removeEntityReference)(event(42), {
      ...identity,
      revision: 2,
    });
    expect(service.calls).toEqual(['get', 'preview', 'display', 'set', 'remove']);
    expect(
      await required(handlers, imageImportChannels.setEntityReference)(event(42), {
        ...setInput,
        path: 'C:\\privado\\retrato.webp',
      }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('bloqueia remetente não autorizado e entrada inválida antes do serviço', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeEntityReferenceImageService();
    register(handlers, service);
    const handler = required(handlers, imageImportChannels.removeEntityReference);
    expect(await handler(event(7), { campaignId, entityId, revision: 1 })).toMatchObject({
      ok: false,
      error: { code: 'IPC_SENDER_NOT_ALLOWED' },
    });
    expect(
      await handler(event(42), { campaignId: 'inválida', entityId, revision: 0 }),
    ).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(service.calls).toEqual([]);
  });
});

class FakeEntityReferenceImageService {
  public readonly calls: string[] = [];
  public get() {
    this.calls.push('get');
    return { entity, attachment };
  }
  public getPreview() {
    this.calls.push('preview');
    return {
      attachmentId,
      mimeType: 'image/webp' as const,
      bytes: new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
    };
  }
  public getDisplay() {
    this.calls.push('display');
    return {
      attachmentId,
      mimeType: 'image/webp' as const,
      bytes: new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
    };
  }
  public set() {
    this.calls.push('set');
    return {
      entity: { ...entity, referenceImageAttachmentId: attachmentId, revision: 2 },
      attachment,
    };
  }
  public remove() {
    this.calls.push('remove');
    return {
      entity: { ...entity, referenceImageAttachmentId: null, revision: 3 },
      attachment: null,
    };
  }
}

function register(
  handlers: Map<string, CapturedHandler>,
  service: FakeEntityReferenceImageService,
) {
  return registerEntityReferenceImageIpcHandlers(createIpcMain(handlers), {
    service: service as unknown as EntityReferenceImageService,
    logger: new TestLogger(),
    authorizedWebContentsId: 42,
  });
}

const campaignId = '00000000-0000-4000-8000-000000000001';
const entityId = '20000000-0000-4000-8000-000000000001';
const attachmentId = '30000000-0000-4000-8000-000000000001';
const timestamp = '2026-10-29T12:00:00.000Z';
const entity = {
  id: entityId,
  campaignId,
  entityTypeId: '10000000-0000-4000-8000-000000000001',
  referenceImageAttachmentId: null,
  name: 'Gorel',
  summary: null,
  canonState: 'accepted' as const,
  knowledgeState: 'fact' as const,
  visibility: 'gm' as const,
  originKind: 'manual' as const,
  sourceId: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  archivedAt: null,
  revision: 1,
};
const attachment = {
  id: attachmentId,
  campaignId,
  originalFilename: 'retrato.png',
  mimeType: 'image/png' as const,
  fileSize: 1024,
  checksumSha256: 'a'.repeat(64),
  visibility: 'gm' as const,
  width: 800,
  height: 600,
  sourceKind: 'file' as const,
  processedMimeType: 'image/webp' as const,
  processingStatus: 'ready' as const,
  createdAt: timestamp,
  updatedAt: timestamp,
  revision: 1,
};

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
