import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import { imageImportChannels } from '../../src/core/contracts/ipc-channels';
import { registerImageImportIpcHandlers } from '../../src/main/ipc/image-import-handlers';
import type { ImageImportService } from '../../src/main/services/image-import-service';
import { TestLogger } from '../helpers/test-logger';

type CapturedHandler = (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown>;

describe('handlers IPC de ingresso de imagens', () => {
  it('registra somente os canais explícitos e os remove', () => {
    const handlers = new Map<string, CapturedHandler>();
    const unregister = register(handlers, new FakeImageImportService());
    expect([...handlers.keys()].sort()).toEqual(
      [
        imageImportChannels.selectLocal,
        imageImportChannels.importBytes,
        imageImportChannels.importUrl,
      ].sort(),
    );
    unregister();
    expect(handlers.size).toBe(0);
  });

  it('encaminha cancelamento do diálogo nativo sem expor caminho', async () => {
    const handlers = new Map<string, CapturedHandler>();
    register(handlers, new FakeImageImportService());
    const result = await required(handlers, imageImportChannels.selectLocal)(event(42), identity());
    expect(result).toMatchObject({ ok: true, data: { status: 'cancelled' } });
    expect(JSON.stringify(result)).not.toMatch(/path|filePaths|C:\\/u);
  });

  it('aceita apenas bytes e metadados estritos para clipboard ou drag/drop', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeImageImportService();
    register(handlers, service);
    const handler = required(handlers, imageImportChannels.importBytes);
    const valid = {
      ...identity(),
      bytes: new Uint8Array([1, 2, 3]),
      metadata: { originalFilename: 'capa.png', sourceKind: 'drag_drop' },
    };
    expect(await handler(event(42), valid)).toMatchObject({
      ok: true,
      data: { status: 'oversize_choice_required' },
    });
    expect(service.lastBytesInput).toEqual(valid);

    for (const invalid of [
      { ...valid, path: 'C:\\privado\\capa.png' },
      { ...valid, metadata: { ...valid.metadata, path: 'C:\\privado\\capa.png' } },
      { ...valid, metadata: { ...valid.metadata, sourceKind: 'file' } },
      { ...valid, metadata: { ...valid.metadata, originalFilename: '..\\capa.png' } },
    ]) {
      expect(await handler(event(42), invalid)).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
    }
  });

  it('bloqueia sender não autorizado antes de chamar o serviço', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeImageImportService();
    register(handlers, service);
    expect(
      await required(handlers, imageImportChannels.selectLocal)(event(7), identity()),
    ).toMatchObject({ ok: false, error: { code: 'IPC_SENDER_NOT_ALLOWED' } });
    expect(service.selectCalls).toBe(0);
  });

  it('valida URL estrita e não aceita paths ou credenciais pelo IPC', async () => {
    const handlers = new Map<string, CapturedHandler>();
    const service = new FakeImageImportService();
    register(handlers, service);
    const handler = required(handlers, imageImportChannels.importUrl);
    const valid = { ...identity(), url: 'https://images.example/capa.png' };
    const result = await handler(event(42), valid);
    expect(result).toMatchObject({
      ok: true,
      data: { status: 'oversize_choice_required' },
    });
    expect(JSON.stringify(result)).not.toContain(valid.url);
    expect(service.lastUrlInput).toEqual(valid);
    for (const invalid of [
      { ...valid, path: 'C:\\privado\\capa.png' },
      { ...valid, url: 'file:///C:/privado/capa.png' },
      { ...valid, url: 'https://user:secret@images.example/capa.png' },
      { ...valid, url: ' https://images.example/capa.png' },
    ]) {
      expect(await handler(event(42), invalid)).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
    }
  });
});

class FakeImageImportService {
  public selectCalls = 0;
  public lastBytesInput: unknown = null;
  public lastUrlInput: unknown = null;

  public selectLocal(): Promise<{ status: 'cancelled' }> {
    this.selectCalls += 1;
    return Promise.resolve({ status: 'cancelled' });
  }

  public importBytes(input: unknown) {
    this.lastBytesInput = input;
    return Promise.resolve({
      status: 'oversize_choice_required' as const,
      detectedMimeType: 'image/png' as const,
      originalWidth: 1600,
      originalHeight: 1200,
      maximumWidth: 1280 as const,
      maximumHeight: 1024 as const,
      allowedModes: ['resize', 'crop'] as const,
    });
  }

  public importUrl(input: unknown) {
    this.lastUrlInput = input;
    return Promise.resolve({
      status: 'oversize_choice_required' as const,
      detectedMimeType: 'image/png' as const,
      originalWidth: 1600,
      originalHeight: 1200,
      maximumWidth: 1280 as const,
      maximumHeight: 1024 as const,
      allowedModes: ['resize', 'crop'] as const,
    });
  }
}

function register(handlers: Map<string, CapturedHandler>, service: FakeImageImportService) {
  return registerImageImportIpcHandlers(createIpcMain(handlers), {
    service: service as unknown as ImageImportService,
    logger: new TestLogger(),
    authorizedWebContentsId: 42,
  });
}

function identity() {
  return { campaignId: '00000000-0000-4000-8000-000000000001', revision: 1 };
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
