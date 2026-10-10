// A web server on this machine for the tests to read from -- the one place the
// private-address rule is switched off, and only by the test that says so.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Policy } from './safeFetch.ts';

export type Handler = (request: IncomingMessage, response: ServerResponse) => void;

export interface Served {
  base: string;
  /** The paths asked for, in order. */
  hits: string[];
  close(): Promise<void>;
}

export async function serve(handler: Handler): Promise<Served> {
  const hits: string[] = [];
  const server = createServer((request, response) => {
    hits.push(request.url ?? '');
    handler(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    hits,
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}

/** The rules as the public sees them. */
export const strict: Policy = { allowPrivate: false, timeoutMs: 5000, maxBytes: 1024 * 1024, maxRedirects: 5 };
/** The same, but this machine may be read: what a test of a page on a server of its own needs. */
export const open: Policy = { ...strict, allowPrivate: true };

export const html = (body: string, title = 'A page'): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;
