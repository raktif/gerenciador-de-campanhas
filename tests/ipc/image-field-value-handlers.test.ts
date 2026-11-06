import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import { imageFieldValueChannels } from '../../src/core/contracts/ipc-channels';
import { registerImageFieldValueIpcHandlers } from '../../src/main/ipc/image-field-value-handlers';
import type { ImageFieldValueService } from '../../src/main/services/image-field-value-service';
import { TestLogger } from '../helpers/test-logger';

type CapturedHandler = (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>;

describe('handlers IPC de valores de campos de imagem', () => {
  it('registra a superficie explicita e remove todos os handlers', () => {
    const handlers = new Map<string, CapturedHandler>();
    const unregister = register(handlers, new FakeService());
    expect([...handlers.keys()].sort()).toEqual(
      Object.values(imageFieldValueChannels).slice(3).sort(),
    );
    unregister();
    expect(handlers.size).toBe(0);
  });

  it('valida entrada estrita, revisao e sender antes do servico', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeService();
    register(handlers, service);
    const input = {
      campaignId: ids.campaign,
      id: ids.value,
      revision: 1,
      patch: { caption: null },
    };
    const update = required(handlers, imageFieldValueChannels.update);

    expect(await update(event(42), input)).toMatchObject({
      ok: true,
      data: { value: { revision: 2 } },
    });
    expect(service.lastInput).toEqual(input);
    expect(await update(event(42), { ...input, path: 'C:\\privado.png' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(await update(event(7), input)).toMatchObject({
      ok: false,
      error: { code: 'IPC_SENDER_NOT_ALLOWED' },
    });
  });

  it('serve a imagem ampliada somente pelo canal validado', async () => {
    const handlers = new Map<string, CapturedHandler>();
    register(handlers, new FakeService());
    const result = await required(handlers, imageFieldValueChannels.getDisplay)(event(42), {
      campaignId: ids.campaign,
      id: ids.value,
    });
    expect(result).toMatchObject({
      ok: true,
      data: { attachmentId: ids.attachment, mimeType: 'image/webp' },
    });
    expect(JSON.stringify(result)).not.toMatch(/relativePath|storedFilename|sourceUrl|C:\\/u);
  });
});

const ids = {
  campaign: '00000000-0000-4000-8000-000000000001',
  entity: '10000000-0000-4000-8000-000000000001',
  field: '20000000-0000-4000-8000-000000000001',
  value: '30000000-0000-4000-8000-000000000001',
  attachment: '40000000-0000-4000-8000-000000000001',
};

class FakeService {
  public lastInput: unknown;
  public list() {
    return [];
  }
  public getPreview() {
    return Promise.resolve({ mimeType: 'image/webp' as const, bytes: new Uint8Array([1]) });
  }
  public getDisplay() {
    return Promise.resolve({
      attachmentId: ids.attachment,
      mimeType: 'image/webp' as const,
      bytes: new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
    });
  }
  public update(input: unknown) {
    this.lastInput = input;
    return details(2);
  }
  public remove() {
    return details(1);
  }
  public move() {
    return [details(1)];
  }
}

function details(revision: number) {
  const timestamp = '2026-11-04T10:00:00.000Z';
  return {
    value: {
      id: ids.value,
      entityId: ids.entity,
      fieldDefinitionId: ids.field,
      attachmentId: ids.attachment,
      caption: null,
      altText: 'Imagem de teste',
      sortOrder: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      revision,
    },
    attachment: {
      id: ids.attachment,
      campaignId: ids.campaign,
      originalFilename: 'imagem.png',
      mimeType: 'image/png' as const,
      fileSize: 3,
      checksumSha256: 'a'.repeat(64),
      visibility: 'gm' as const,
      width: 10,
      height: 10,
      sourceKind: 'clipboard' as const,
      processedMimeType: 'image/webp' as const,
      processingStatus: 'ready' as const,
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 1,
    },
  };
}

function register(handlers: Map<string, CapturedHandler>, service: FakeService) {
  const ipcMain = {
    handle: (channel: string, handler: CapturedHandler) => handlers.set(channel, handler),
    removeHandler: (channel: string) => handlers.delete(channel),
  } as unknown as IpcMain;
  return registerImageFieldValueIpcHandlers(ipcMain, {
    service: service as unknown as ImageFieldValueService,
    logger: new TestLogger(),
    authorizedWebContentsId: 42,
  });
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
  if (handler === undefined) throw new Error(`Handler nao registrado: ${channel}`);
  return handler;
}
