import { describe, expect, it, vi } from 'vitest';
import { maximumImageBytes } from '../../src/core/contracts/image-processing';
import {
  SecureImageDownloadService,
  type ImageDnsResolver,
  type ImageHttpResponse,
  type ImageHttpTransport,
} from '../../src/main/services/secure-image-download-service';

const publicAddress = { address: '93.184.216.34', family: 4 as const };

describe('SecureImageDownloadService', () => {
  it.each([
    'ftp://example.com/capa.png',
    'http://user:secret@example.com/capa.png',
    'http://example.com/capa.png#fragmento',
    ' http://example.com/capa.png',
  ])('rejeita URL inválida: %s', async (url) => {
    await expectCode(createService().download(url), 'IMAGE_URL_INVALID');
  });

  it.each([
    'http://localhost/capa.png',
    'http://sub.localhost/capa.png',
    'http://127.0.0.1/capa.png',
    'http://10.0.0.1/capa.png',
    'http://169.254.169.254/capa.png',
    'http://192.168.1.1/capa.png',
    'http://192.0.2.1/capa.png',
    'http://224.0.0.1/capa.png',
    'http://[::1]/capa.png',
    'http://[fc00::1]/capa.png',
    'http://[fe80::1]/capa.png',
    'http://[ff02::1]/capa.png',
    'http://[2001:db8::1]/capa.png',
  ])('bloqueia destino literal não público: %s', async (url) => {
    await expectCode(createService().download(url), 'IMAGE_URL_DESTINATION_BLOCKED');
  });

  it('rejeita toda a resolução quando qualquer IP DNS é proibido', async () => {
    const request = vi.fn<ImageHttpTransport>();
    const resolve: ImageDnsResolver = () =>
      Promise.resolve([publicAddress, { address: '10.0.0.8', family: 4 }]);
    await expectCode(
      new SecureImageDownloadService({ resolve, request }).download(
        'https://images.example/capa.png',
      ),
      'IMAGE_URL_DESTINATION_BLOCKED',
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('fixa a conexão no IP validado e revalida cada redirecionamento', async () => {
    const resolve = vi.fn<ImageDnsResolver>().mockResolvedValue([publicAddress]);
    const request = vi
      .fn<ImageHttpTransport>()
      .mockResolvedValueOnce(response(302, { location: 'http://127.0.0.1/segredo' }));
    const service = new SecureImageDownloadService({ resolve, request });
    await expectCode(
      service.download('https://images.example/capa.png'),
      'IMAGE_URL_DESTINATION_BLOCKED',
    );
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: 'images.example' }),
      publicAddress,
      expect.any(Number),
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('aplica timeout inclusive à resolução DNS', async () => {
    const resolve: ImageDnsResolver = () => new Promise(() => undefined);
    await expectCode(
      new SecureImageDownloadService({ resolve, timeoutMilliseconds: 5 }).download(
        'https://images.example/capa.png',
      ),
      'IMAGE_URL_TIMEOUT',
    );
  });

  it('limita redirecionamentos', async () => {
    const service = createService({
      maximumRedirects: 1,
      request: vi
        .fn<ImageHttpTransport>()
        .mockResolvedValue(response(302, { location: '/outra.png' })),
    });
    await expectCode(
      service.download('https://images.example/capa.png'),
      'IMAGE_URL_REDIRECT_LIMIT',
    );
  });

  it('rejeita status, Content-Type e Content-Length inseguros', async () => {
    await expectCode(
      createService({ request: () => Promise.resolve(response(404)) }).download(
        'https://images.example/capa.png',
      ),
      'IMAGE_URL_HTTP_STATUS',
    );
    await expectCode(
      createService({
        request: () => Promise.resolve(response(200, { 'content-type': 'text/html' }, [1])),
      }).download('https://images.example/capa.png'),
      'IMAGE_URL_CONTENT_TYPE_UNSUPPORTED',
    );
    await expectCode(
      createService({
        request: () =>
          Promise.resolve(
            response(200, {
              'content-type': 'image/png',
              'content-length': String(maximumImageBytes + 1),
            }),
          ),
      }).download('https://images.example/capa.png'),
      'IMAGE_PAYLOAD_TOO_LARGE',
    );
  });

  it('interrompe corpo sem Content-Length que ultrapassa 10 MB', async () => {
    const discard = vi.fn();
    const oversized = response(
      200,
      { 'content-type': 'image/png' },
      [maximumImageBytes, 1],
      discard,
    );
    await expectCode(
      createService({ request: () => Promise.resolve(oversized) }).download(
        'https://images.example/capa.png',
      ),
      'IMAGE_PAYLOAD_TOO_LARGE',
    );
    expect(discard).toHaveBeenCalledOnce();
  });

  it('aceita resposta 2xx estritamente limitada sem devolver o destino final', async () => {
    const service = createService({
      request: () =>
        Promise.resolve(response(200, { 'content-type': 'image/webp; charset=binary' }, [3, 2])),
    });
    const result = await service.download('https://images.example/capa.webp');
    expect(result).toMatchObject({
      contentType: 'image/webp',
      sourceUrl: 'https://images.example/capa.webp',
      originalFilename: 'capa.webp',
    });
    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(result.bytes).toHaveLength(5);
  });
});

function createService(
  overrides: ConstructorParameters<typeof SecureImageDownloadService>[0] = {},
): SecureImageDownloadService {
  return new SecureImageDownloadService({
    resolve: () => Promise.resolve([publicAddress]),
    request: () => Promise.resolve(response(200, { 'content-type': 'image/png' }, [1, 2, 3])),
    ...overrides,
  });
}

function response(
  statusCode: number,
  headers: ImageHttpResponse['headers'] = {},
  chunkSizes: number[] = [],
  discard = vi.fn(),
): ImageHttpResponse {
  return {
    statusCode,
    headers,
    body: chunks(chunkSizes),
    discard,
  };
}

async function* chunks(sizes: number[]): AsyncIterable<Uint8Array> {
  await Promise.resolve();
  for (const size of sizes) yield new Uint8Array(size);
}

async function expectCode(operation: Promise<unknown>, code: string): Promise<void> {
  await expect(operation).rejects.toMatchObject({ code });
}
