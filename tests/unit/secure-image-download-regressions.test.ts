import http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  requestPinned,
  SecureImageDownloadService,
  type ImageDnsResolver,
  type ImageHttpResponse,
  type ImageHttpTransport,
} from '../../src/main/services/secure-image-download-service';

const originalGlobalAgent = http.globalAgent;

afterEach(() => {
  http.globalAgent = originalGlobalAgent;
});

describe('regressões de segurança do download de imagens', () => {
  it.each([
    'http://[2001:2::1]/capa.png',
    'http://[2001:0002:0000:0000:0000:0000:0000:0001]/capa.png',
    'http://[3fff::1]/capa.png',
    'http://[3000::1]/capa.png',
  ])('bloqueia IPv6 literal especial, documental ou não alocado: %s', async (url) => {
    await expect(service().download(url)).rejects.toMatchObject({
      code: 'IMAGE_URL_DESTINATION_BLOCKED',
    });
  });

  it.each(['2001:2::1', '2001:0002:0:0:0:0:0:1', '3fff::1', '3000::1'])(
    'bloqueia IPv6 proibido retornado por DNS: %s',
    async (address) => {
      const resolve: ImageDnsResolver = () => Promise.resolve([{ address, family: 6 }]);
      const request = vi.fn<ImageHttpTransport>();
      await expect(
        service({ resolve, request }).download('https://images.example/capa.png'),
      ).rejects.toMatchObject({ code: 'IMAGE_URL_DESTINATION_BLOCKED' });
      expect(request).not.toHaveBeenCalled();
    },
  );

  it.each(['2606:4700:4700::1111', '2606:4700:4700:0000:0000:0000:0000:1111'])(
    'aceita forma comprimida ou canônica de unicast global alocado: %s',
    async (address) => {
      const resolve: ImageDnsResolver = () => Promise.resolve([{ address, family: 6 }]);
      await expect(
        service({ resolve }).download('https://images.example/capa.png'),
      ).resolves.toMatchObject({ contentType: 'image/png' });
    },
  );

  it('força agente descartável e não consulta o globalAgent', async () => {
    const sentinel = new http.Agent();
    const createConnection = vi.spyOn(sentinel, 'createConnection');
    http.globalAgent = sentinel;
    const server = http.createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'image/png' });
      response.end('png');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('Porta indisponível.');
      const response = await requestPinned(
        new URL(`http://images.example:${String(address.port)}/capa.png`),
        { address: '127.0.0.1', family: 4 },
        2_000,
      );
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.body) chunks.push(chunk);
      expect(chunks).not.toHaveLength(0);
      expect(createConnection).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error === undefined ? resolve() : reject(error))),
      );
    }
  });
});

function service(
  overrides: {
    resolve?: ImageDnsResolver;
    request?: ImageHttpTransport;
  } = {},
): SecureImageDownloadService {
  return new SecureImageDownloadService({
    resolve: () => Promise.resolve([{ address: '2606:4700:4700::1111', family: 6 }]),
    request: () => Promise.resolve(okResponse()),
    ...overrides,
  });
}

function okResponse(): ImageHttpResponse {
  return {
    statusCode: 200,
    headers: { 'content-type': 'image/png' },
    body: {
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield new Uint8Array([1]);
      },
    },
    discard: () => undefined,
  };
}
