// One GET of a public web address, with what a tool that reads other people's
// pages on someone's own machine must not do without.
//
//   - It connects only to public addresses. The check runs in the lookup the
//     socket itself uses, so the address checked is the address connected to
//     (a name that answers differently a second time gains nothing), and again
//     on every redirect.
//   - It gives up after a time, and after a size, counted on the unpacked page.
//   - It sends no cookies and no credentials, and says who it is.

import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { pipeline } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { USER_AGENT } from './info.ts';
import { isPublicAddress } from './ip.ts';

export type FetchErrorCode = 'url' | 'blocked' | 'robots' | 'network' | 'timeout' | 'size' | 'http' | 'type' | 'empty';

/** Something that went wrong in a way worth telling the person, in words they can act on. */
export class FetchError extends Error {
  code: FetchErrorCode;
  constructor(code: FetchErrorCode, message: string) {
    super(message);
    this.name = 'FetchError';
    this.code = code;
  }
}

export interface Policy {
  /** Read addresses that are not public (the machine itself, its network): off unless its owner says so. */
  allowPrivate: boolean;
  /** Replaces the address check altogether (for tests). */
  allowAddress?: (address: string) => boolean;
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
}

/** The limits, and what the owner of the machine has chosen, from the environment. */
export function policyFromEnv(env: NodeJS.ProcessEnv = process.env): Policy {
  const number = (name: string, fallback: number, min: number, max: number): number => {
    const given = Number(env[name]);
    return env[name] && Number.isFinite(given) ? Math.min(max, Math.max(min, Math.trunc(given))) : fallback;
  };
  return {
    allowPrivate: env.TW_WEB_ALLOW_PRIVATE === '1',
    timeoutMs: number('TW_WEB_TIMEOUT_MS', 20_000, 1_000, 120_000),
    maxBytes: number('TW_WEB_MAX_BYTES', 5 * 1024 * 1024, 64 * 1024, 50 * 1024 * 1024),
    maxRedirects: 5,
  };
}

const addressAllowed = (policy: Policy) => (address: string): boolean =>
  policy.allowAddress ? policy.allowAddress(address) : policy.allowPrivate || isPublicAddress(address);

const notPublic = (what: string): FetchError =>
  new FetchError('blocked', `${what} is not a public address; this tool reads the public web only`);

/** *input* as an address this tool may read, or why not. An IP written in the address itself is judged here. */
export function parseTarget(input: string, policy: Policy): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new FetchError('url', `"${input}" is not a web address`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FetchError('url', `only http and https addresses are read, not ${url.protocol}`);
  }
  if (url.username || url.password) throw new FetchError('url', 'an address with a user name or password is not read');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && !addressAllowed(policy)(host)) throw notPublic(host);
  return url;
}

/** The socket's own lookup, with every address it found held to the rule before it may be used. */
function guardedLookup(allowed: (address: string) => boolean): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (error, found) => {
      if (error) { callback(error, '', 0); return; }
      const addresses = found as LookupAddress[];
      const refused = addresses.find((entry) => !allowed(entry.address));
      if (!addresses.length || refused) {
        callback(notPublic(`${hostname}${refused ? ` (${refused.address})` : ''}`) as NodeJS.ErrnoException, '', 0);
        return;
      }
      if (options.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

function send(url: URL, policy: Policy, accept: string, signal: AbortSignal): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const open = (url.protocol === 'https:' ? httpsRequest : httpRequest) as typeof httpRequest;
    const request = open(url, {
      method: 'GET',
      agent: false,
      signal,
      lookup: guardedLookup(addressAllowed(policy)),
      headers: {
        'user-agent': USER_AGENT,
        accept,
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'en;q=0.9,*;q=0.5',
      },
    }, resolve);
    request.on('error', reject);
    request.end();
  });
}

const seconds = (ms: number): string => (ms < 1000 ? `${ms} ms` : `${Math.round(ms / 1000)} s`);
const tooBig = (maxBytes: number): FetchError =>
  new FetchError('size', `the page is larger than ${Math.round(maxBytes / 1024 / 1024 * 10) / 10} MB (TW_WEB_MAX_BYTES)`);

function explain(error: unknown, url: URL, signal: AbortSignal, timeoutMs: number): FetchError {
  if (error instanceof FetchError) return error;
  if (signal.aborted) return new FetchError('timeout', `${url.host} did not finish within ${seconds(timeoutMs)}`);
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return new FetchError('network', `could not reach ${url.host}${code ? ` (${code})` : `: ${error instanceof Error ? error.message : String(error)}`}`);
}

/** The body, unpacked, and never more than *maxBytes* of it. */
async function read(response: IncomingMessage, maxBytes: number): Promise<Uint8Array> {
  const encoding = String(response.headers['content-encoding'] ?? '').trim().toLowerCase();
  if (!encoding && Number(response.headers['content-length']) > maxBytes) {
    response.destroy();
    throw tooBig(maxBytes);
  }
  const decoder = encoding === 'gzip' || encoding === 'x-gzip' ? createGunzip()
    : encoding === 'deflate' ? createInflate()
      : encoding === 'br' ? createBrotliDecompress() : null;
  if (encoding && encoding !== 'identity' && !decoder) {
    response.destroy();
    throw new FetchError('type', `the page is packed as "${encoding}", which is not supported`);
  }
  const source: AsyncIterable<Buffer> = decoder ? pipeline(response, decoder, () => {}) : response;
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of source) {
      size += chunk.length;
      if (size > maxBytes) throw tooBig(maxBytes);
      chunks.push(chunk);
    }
  } finally {
    response.destroy();
    decoder?.destroy();
  }
  return Buffer.concat(chunks);
}

export interface GetOptions {
  accept?: string;
  maxBytes?: number;
  timeoutMs?: number;
  /** Asked before every request, the first and each redirect's: it may refuse by throwing. */
  beforeRequest?: (url: URL) => Promise<void>;
}

export interface Fetched {
  /** Where it ended up, after redirects. */
  url: URL;
  status: number;
  statusText: string;
  contentType: string;
  /** Empty for a status that is not a success. */
  body: Uint8Array;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/** The page at *input*, or a FetchError that says why not. Any status that is no redirect is handed back. */
export async function get(input: string, policy: Policy, options: GetOptions = {}): Promise<Fetched> {
  const timeoutMs = options.timeoutMs ?? policy.timeoutMs;
  const maxBytes = options.maxBytes ?? policy.maxBytes;
  const accept = options.accept ?? 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1';
  const signal = AbortSignal.timeout(timeoutMs);
  let url = parseTarget(input, policy);
  for (let hop = 0; ; hop += 1) {
    await options.beforeRequest?.(url);
    let response: IncomingMessage;
    try {
      response = await send(url, policy, accept, signal);
    } catch (error) {
      throw explain(error, url, signal, timeoutMs);
    }
    const status = response.statusCode ?? 0;
    if (REDIRECTS.has(status)) {
      response.resume();
      const location = response.headers.location;
      if (!location) throw new FetchError('http', `HTTP ${status} without a Location`);
      if (hop >= policy.maxRedirects) throw new FetchError('http', `more than ${policy.maxRedirects} redirects`);
      try {
        url = parseTarget(new URL(location, url).href, policy);
      } catch (error) {
        throw error instanceof FetchError ? error : new FetchError('http', `HTTP ${status} to an address that is not valid`);
      }
      continue;
    }
    const contentType = String(response.headers['content-type'] ?? '');
    const statusText = response.statusMessage ?? '';
    if (status < 200 || status >= 300) {
      response.resume();
      return { url, status, statusText, contentType, body: new Uint8Array() };
    }
    try {
      return { url, status, statusText, contentType, body: await read(response, maxBytes) };
    } catch (error) {
      throw explain(error, url, signal, timeoutMs);
    }
  }
}

/** The text of *body*, in the charset the page says it is in (header, then a meta tag), else UTF-8. */
export function decode(body: Uint8Array, contentType: string): string {
  const named = /charset\s*=\s*["']?([\w:.-]+)/i.exec(contentType)?.[1]
    ?? /<meta[^>]+charset\s*=\s*["']?([\w:.-]+)/i.exec(new TextDecoder('latin1').decode(body.subarray(0, 4096)))?.[1];
  try {
    return new TextDecoder(named ?? 'utf-8').decode(body);
  } catch {
    return new TextDecoder('utf-8').decode(body);
  }
}
