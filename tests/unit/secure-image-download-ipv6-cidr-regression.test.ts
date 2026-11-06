import { describe, expect, it, vi } from 'vitest';
import {
  SecureImageDownloadService,
  type ImageDnsResolver,
  type ImageHttpResponse,
  type ImageHttpTransport,
} from '../../src/main/services/secure-image-download-service';

const newlyAllocatedAddresses = [
  '2001:e00::1',
  '2001:a000::1',
  '2001:b000::1',
  '2410::1',
  '2610::1',
  '2620::1',
  '2630::1',
  '2a10::1',
] as const;

describe('regressão focal da allowlist IPv6 IANA', () => {
  it('bloqueia 2001:db8::/32 literal embora esteja dentro do bloco global externo', async () => {
    await expect(service().download('https://[2001:db8::1]/capa.png')).rejects.toMatchObject({
      code: 'IMAGE_URL_DESTINATION_BLOCKED',
    });
  });

  it('bloqueia 2001:db8::/32 retornado por DNS antes da conexão', async () => {
    const request = vi.fn<ImageHttpTransport>();
    const resolve: ImageDnsResolver = () =>
      Promise.resolve([{ address: '2001:0db8:0:0:0:0:0:1', family: 6 }]);
    await expect(
      service({ resolve, request }).download('https://images.example/capa.png'),
    ).rejects.toMatchObject({ code: 'IMAGE_URL_DESTINATION_BLOCKED' });
    expect(request).not.toHaveBeenCalled();
  });

  it.each(newlyAllocatedAddresses)(
    'aceita bloco global alocado em URL literal: %s',
    async (address) => {
      await expect(service().download(`https://[${address}]/capa.png`)).resolves.toMatchObject({
        contentType: 'image/png',
      });
    },
  );

  it.each(newlyAllocatedAddresses)(
    'aceita bloco global alocado retornado por DNS: %s',
    async (address) => {
      const resolve: ImageDnsResolver = () => Promise.resolve([{ address, family: 6 }]);
      await expect(
        service({ resolve }).download('https://images.example/capa.png'),
      ).resolves.toMatchObject({ contentType: 'image/png' });
    },
  );
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
