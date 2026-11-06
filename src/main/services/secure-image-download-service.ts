import { lookup as dnsLookup } from 'node:dns/promises';
import http, { type IncomingHttpHeaders, type IncomingMessage } from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { maximumImageBytes } from '../../core/contracts/image-processing';
import { AppError } from '../../core/errors/app-error';

export const imageDownloadTimeoutMilliseconds = 10_000;
export const maximumImageRedirects = 3;

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface ImageHttpResponse {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: AsyncIterable<Uint8Array>;
  discard(): void;
}

export type ImageDnsResolver = (hostname: string) => Promise<readonly ResolvedAddress[]>;
export type ImageHttpTransport = (
  url: URL,
  pinnedAddress: ResolvedAddress,
  timeoutMilliseconds: number,
) => Promise<ImageHttpResponse>;

export interface SecureImageDownloadDependencies {
  resolve?: ImageDnsResolver;
  request?: ImageHttpTransport;
  timeoutMilliseconds?: number;
  maximumRedirects?: number;
}

export interface SecureImageDownload {
  bytes: Uint8Array;
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
  sourceUrl: string;
  originalFilename: string;
}

export interface ImageDownloader {
  download(rawUrl: string): Promise<SecureImageDownload>;
}

export class SecureImageDownloadService implements ImageDownloader {
  private readonly resolve: ImageDnsResolver;
  private readonly request: ImageHttpTransport;
  private readonly timeoutMilliseconds: number;
  private readonly maximumRedirects: number;

  public constructor(dependencies: SecureImageDownloadDependencies = {}) {
    this.resolve = dependencies.resolve ?? resolveHostname;
    this.request = dependencies.request ?? requestPinned;
    this.timeoutMilliseconds = dependencies.timeoutMilliseconds ?? imageDownloadTimeoutMilliseconds;
    this.maximumRedirects = dependencies.maximumRedirects ?? maximumImageRedirects;
  }

  public async download(rawUrl: string): Promise<SecureImageDownload> {
    const sourceUrl = parseSafeHttpUrl(rawUrl).toString();
    let currentUrl = new URL(sourceUrl);
    const deadline = Date.now() + this.timeoutMilliseconds;

    for (let redirects = 0; ; redirects += 1) {
      const pinnedAddress = await withDeadline(
        resolveSafeAddress(currentUrl, this.resolve),
        deadline,
      );
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw timeoutError();
      const response = await this.request(currentUrl, pinnedAddress, remaining);
      if (isRedirect(response.statusCode)) {
        response.discard();
        if (redirects >= this.maximumRedirects) {
          throw new AppError(
            'IMAGE_URL_REDIRECT_LIMIT',
            'A imagem excedeu o limite de redirecionamentos.',
          );
        }
        const location = singleHeader(response.headers.location);
        if (location === null) {
          throw new AppError(
            'IMAGE_URL_REDIRECT_INVALID',
            'O redirecionamento da imagem não informou um destino válido.',
          );
        }
        currentUrl = parseRedirectUrl(location, currentUrl);
        continue;
      }
      if (response.statusCode < 200 || response.statusCode > 299) {
        response.discard();
        throw new AppError('IMAGE_URL_HTTP_STATUS', 'A origem da imagem recusou a solicitação.', {
          statusCode: response.statusCode,
        });
      }

      const contentType = parseImageContentType(response.headers['content-type']);
      const declaredLength = parseContentLength(response.headers['content-length']);
      if (declaredLength !== null && declaredLength > maximumImageBytes) {
        response.discard();
        throw payloadTooLarge(declaredLength);
      }
      const bytes = await readBoundedBody(response, deadline);
      return {
        bytes,
        contentType,
        sourceUrl,
        originalFilename: filenameFromUrl(currentUrl),
      };
    }
  }
}

export function parseSafeHttpUrl(rawUrl: string): URL {
  if (rawUrl !== rawUrl.trim() || rawUrl.length < 1 || rawUrl.length > 2048) throw invalidUrl();
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw invalidUrl();
  }
  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.hostname === '' ||
    parsed.hash !== ''
  ) {
    throw invalidUrl();
  }
  const hostname = normalizeHostname(parsed.hostname);
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) throw blockedDestination();
  if (isIP(hostname) !== 0 && !isPublicAddress(hostname)) throw blockedDestination();
  return parsed;
}

async function resolveSafeAddress(url: URL, resolve: ImageDnsResolver): Promise<ResolvedAddress> {
  const hostname = normalizeHostname(url.hostname);
  const literalFamily = isIP(hostname);
  const addresses =
    literalFamily === 0
      ? await safelyResolve(resolve, hostname)
      : [{ address: hostname, family: literalFamily as 4 | 6 }];
  if (
    addresses.length === 0 ||
    addresses.some(({ address, family }) => isIP(address) !== family || !isPublicAddress(address))
  ) {
    throw blockedDestination();
  }
  const selectedAddress = addresses[0];
  if (selectedAddress === undefined) throw blockedDestination();
  return selectedAddress;
}

async function safelyResolve(
  resolve: ImageDnsResolver,
  hostname: string,
): Promise<readonly ResolvedAddress[]> {
  try {
    return await resolve(hostname);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('IMAGE_URL_DNS_FAILED', 'O endereço da imagem não pôde ser resolvido.');
  }
}

async function resolveHostname(hostname: string): Promise<readonly ResolvedAddress[]> {
  const results = await dnsLookup(hostname, { all: true, verbatim: true });
  return results.map(({ address, family }) => ({ address, family: family as 4 | 6 }));
}

export function requestPinned(
  url: URL,
  pinnedAddress: ResolvedAddress,
  timeoutMilliseconds: number,
): Promise<ImageHttpResponse> {
  return new Promise((resolve, reject) => {
    const lookup: LookupFunction = (_hostname, _options, callback) => {
      if (_options.all) {
        callback(null, [pinnedAddress]);
        return;
      }
      callback(null, pinnedAddress.address, pinnedAddress.family);
    };
    const client = url.protocol === 'https:' ? https : http;
    const request = client.request(
      url,
      {
        method: 'GET',
        agent: false,
        lookup,
        headers: {
          Accept: 'image/png, image/jpeg, image/webp',
          'User-Agent': 'Gerenciador-de-Campanhas/0.0.1',
        },
      },
      (response) => resolve(toImageHttpResponse(response)),
    );
    request.setTimeout(timeoutMilliseconds, () => request.destroy(timeoutError()));
    request.once('error', (error) => {
      reject(
        error instanceof AppError
          ? error
          : new AppError('IMAGE_URL_REQUEST_FAILED', 'Não foi possível baixar a imagem.'),
      );
    });
    request.end();
  });
}

function toImageHttpResponse(response: IncomingMessage): ImageHttpResponse {
  return {
    statusCode: response.statusCode ?? 0,
    headers: response.headers,
    body: response,
    discard: () => response.destroy(),
  };
}

async function readBoundedBody(response: ImageHttpResponse, deadline: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for await (const chunk of response.body) {
      if (Date.now() > deadline) throw timeoutError();
      total += chunk.byteLength;
      if (total > maximumImageBytes) throw payloadTooLarge(total);
      chunks.push(chunk);
    }
  } catch (error) {
    response.discard();
    throw error;
  }
  if (total === 0) throw new AppError('IMAGE_URL_EMPTY', 'A imagem remota está vazia.');
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function parseImageContentType(
  header: string | string[] | undefined,
): SecureImageDownload['contentType'] {
  const raw = singleHeader(header);
  const mediaType = raw?.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType === 'image/png' || mediaType === 'image/jpeg' || mediaType === 'image/webp') {
    return mediaType;
  }
  throw new AppError(
    'IMAGE_URL_CONTENT_TYPE_UNSUPPORTED',
    'A resposta remota não declarou um tipo de imagem aceito.',
  );
}

function parseContentLength(header: string | string[] | undefined): number | null {
  const raw = singleHeader(header);
  if (raw === null) return null;
  if (!/^\d+$/u.test(raw)) {
    throw new AppError(
      'IMAGE_URL_CONTENT_LENGTH_INVALID',
      'O tamanho remoto informado é inválido.',
    );
  }
  const length = Number(raw);
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new AppError(
      'IMAGE_URL_CONTENT_LENGTH_INVALID',
      'O tamanho remoto informado é inválido.',
    );
  }
  return length;
}

function singleHeader(header: string | string[] | undefined): string | null {
  if (typeof header === 'string') return header;
  if (header?.length === 1) return header[0] ?? null;
  return null;
}

function isRedirect(statusCode: number): boolean {
  return (
    statusCode === 301 ||
    statusCode === 302 ||
    statusCode === 303 ||
    statusCode === 307 ||
    statusCode === 308
  );
}

function parseRedirectUrl(location: string, currentUrl: URL): URL {
  try {
    return parseSafeHttpUrl(new URL(location, currentUrl).toString());
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      'IMAGE_URL_REDIRECT_INVALID',
      'O redirecionamento da imagem informou um destino inválido.',
    );
  }
}

async function withDeadline<T>(operation: Promise<T>, deadline: number): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw timeoutError();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(timeoutError()), remaining);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function filenameFromUrl(url: URL): string {
  const encoded = url.pathname.split('/').at(-1) ?? '';
  let decoded: string;
  try {
    decoded = decodeURIComponent(encoded);
  } catch {
    decoded = encoded;
  }
  const safe = decoded.replace(/[\\/]/gu, '_').trim();
  return safe.length === 0 ? 'imagem-remota' : safe.slice(0, 255);
}

function normalizeHostname(hostname: string): string {
  const unwrapped =
    hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  return unwrapped.replace(/\.$/u, '').toLowerCase();
}

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return false;
  const [a = 0, b = 0, c = 0] = octets;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPublicIpv6(address: string): boolean {
  const bytes = parseIpv6(address);
  if (bytes === null) return false;
  return (
    globallyRoutableIpv6Cidrs.some((cidr) => matchesIpv6Cidr(bytes, cidr)) &&
    !specialPurposeIpv6Cidrs.some((cidr) => matchesIpv6Cidr(bytes, cidr))
  );
}

interface Ipv6Cidr {
  network: Uint8Array;
  prefixLength: number;
}

const globallyRoutableIpv6Cidrs = [
  '2001:0200::/23',
  '2001:0400::/23',
  '2001:0600::/23',
  '2001:0800::/22',
  '2001:0c00::/23',
  '2001:0e00::/23',
  '2001:1200::/23',
  '2001:1400::/22',
  '2001:1800::/23',
  '2001:1a00::/23',
  '2001:1c00::/22',
  '2001:2000::/19',
  '2001:4000::/23',
  '2001:4200::/23',
  '2001:4400::/23',
  '2001:4600::/23',
  '2001:4800::/23',
  '2001:4a00::/23',
  '2001:4c00::/23',
  '2001:5000::/20',
  '2001:8000::/19',
  '2001:a000::/20',
  '2001:b000::/20',
  '2003::/18',
  '2400::/12',
  '2410::/12',
  '2600::/12',
  '2610::/23',
  '2620::/23',
  '2630::/12',
  '2800::/12',
  '2a00::/12',
  '2a10::/12',
  '2c00::/12',
].map(parseIpv6Cidr);

const specialPurposeIpv6Cidrs = ['2001:db8::/32'].map(parseIpv6Cidr);

function parseIpv6Cidr(value: string): Ipv6Cidr {
  const [address = '', prefix = ''] = value.split('/');
  const network = parseIpv6(address);
  const prefixLength = Number(prefix);
  if (
    network === null ||
    !Number.isInteger(prefixLength) ||
    prefixLength < 0 ||
    prefixLength > 128
  ) {
    throw new Error('CIDR IPv6 interno inválido.');
  }
  return { network, prefixLength };
}

function matchesIpv6Cidr(address: Uint8Array, cidr: Ipv6Cidr): boolean {
  const completeBytes = Math.floor(cidr.prefixLength / 8);
  for (let index = 0; index < completeBytes; index += 1) {
    if (address[index] !== cidr.network[index]) return false;
  }
  const remainingBits = cidr.prefixLength % 8;
  if (remainingBits === 0) return true;
  const mask = (0xff << (8 - remainingBits)) & 0xff;
  return ((address[completeBytes] ?? 0) & mask) === ((cidr.network[completeBytes] ?? 0) & mask);
}

function parseIpv6(address: string): Uint8Array | null {
  if (isIP(address) !== 6) return null;
  const doubleColonParts = address.toLowerCase().split('::');
  if (doubleColonParts.length > 2) return null;
  const left = parseIpv6Side(doubleColonParts[0] ?? '');
  const right = parseIpv6Side(doubleColonParts[1] ?? '');
  if (left === null || right === null) return null;
  const omittedGroups = 8 - left.length - right.length;
  if (
    omittedGroups < 0 ||
    (doubleColonParts.length === 1 && omittedGroups !== 0) ||
    (doubleColonParts.length === 2 && omittedGroups < 1)
  ) {
    return null;
  }
  const groups = [...left, ...Array<number>(omittedGroups).fill(0), ...right];
  if (groups.length !== 8) return null;
  const bytes = new Uint8Array(16);
  for (const [index, group] of groups.entries()) {
    bytes[index * 2] = group >>> 8;
    bytes[index * 2 + 1] = group & 0xff;
  }
  return bytes;
}

function parseIpv6Side(value: string): number[] | null {
  if (value === '') return [];
  const groups: number[] = [];
  for (const token of value.split(':')) {
    if (token.includes('.')) {
      const octets = token.split('.').map(Number);
      if (
        octets.length !== 4 ||
        octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
      ) {
        return null;
      }
      groups.push(((octets[0] ?? 0) << 8) | (octets[1] ?? 0));
      groups.push(((octets[2] ?? 0) << 8) | (octets[3] ?? 0));
      continue;
    }
    if (!/^[0-9a-f]{1,4}$/u.test(token)) return null;
    groups.push(Number.parseInt(token, 16));
  }
  return groups;
}

function invalidUrl(): AppError {
  return new AppError('IMAGE_URL_INVALID', 'Informe uma URL HTTP ou HTTPS válida.');
}

function blockedDestination(): AppError {
  return new AppError(
    'IMAGE_URL_DESTINATION_BLOCKED',
    'O destino da imagem não é permitido por segurança.',
  );
}

function timeoutError(): AppError {
  return new AppError('IMAGE_URL_TIMEOUT', 'O download da imagem excedeu o tempo limite.');
}

function payloadTooLarge(receivedBytes: number): AppError {
  return new AppError('IMAGE_PAYLOAD_TOO_LARGE', 'A imagem ultrapassa o limite de 10 MB.', {
    maximumBytes: maximumImageBytes,
    receivedBytes,
  });
}
