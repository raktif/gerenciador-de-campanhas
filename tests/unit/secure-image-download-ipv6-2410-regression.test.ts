import { describe, expect, it } from 'vitest';
import {
  SecureImageDownloadService,
  type ImageDnsResolver,
  type ImageHttpResponse,
} from '../../src/main/services/secure-image-download-service';

describe('regressão focal do bloco IPv6 2410::/12', () => {
  it('aceita endereço literal do bloco global 2410::/12', async () => {
    await expect(service().download('https://[2410::1]/capa.png')).resolves.toMatchObject({
      contentType: 'image/png',
    });
  });

  it('aceita endereço do bloco global 2410::/12 retornado por DNS', async () => {
    const resolve: ImageDnsResolver = () =>
      Promise.resolve([{ address: '2410:0000:0000:0000:0000:0000:0000:0001', family: 6 }]);
    await expect(
      service(resolve).download('https://images.example/capa.png'),
    ).resolves.toMatchObject({ contentType: 'image/png' });
  });
});

function service(resolve?: ImageDnsResolver): SecureImageDownloadService {
  return new SecureImageDownloadService({
    ...(resolve === undefined ? {} : { resolve }),
    request: () => Promise.resolve(okResponse()),
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
