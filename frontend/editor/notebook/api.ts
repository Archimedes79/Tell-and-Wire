// The notebook's own end of the wire: the host's routes called by name, with nothing of the graph editor's client in it.
//
// The routes are the tables of `backend/deployment/host/api.ts` and `backend/editor/host/api.ts` (types and plain data, so
// either end may import them); the call itself is a few lines of `fetch`.

import { API, pathFor, type RequestOf, type ResponseOf } from '../../../backend/deployment/host/api.ts';
import { EDITOR_API } from '../../../backend/editor/host/api.ts';

const ROUTES = { ...API, ...EDITOR_API };

/** A call the server turned down or could not answer: what it said, and the status. */
export class CallFailed extends Error {
  constructor(readonly status: number, readonly body: Record<string, unknown>) {
    super(typeof body.detail === 'string' && body.detail ? body.detail : `The server answered ${status}.`);
  }
}

/** What to tell a person of a failure: the server's own words when it had some, else *fallback*. */
export function wordsOf(error: unknown, fallback: string): string {
  return (error instanceof Error && error.message) || fallback;
}

export async function call<K extends keyof typeof ROUTES & string>(name: K, request?: RequestOf<(typeof ROUTES)[K]>): Promise<ResponseOf<(typeof ROUTES)[K]>> {
  const route = ROUTES[name];
  const { path, rest } = pathFor(route, (request ?? {}) as Record<string, unknown>);
  const get = route.method === 'GET';
  const query = get ? new URLSearchParams(Object.entries(rest).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])).toString() : '';
  const response = await fetch(query ? `${path}?${query}` : path, {
    method: route.method,
    ...(get ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(rest) }),
  });
  if (!response.ok) throw new CallFailed(response.status, await response.json().catch(() => ({})) as Record<string, unknown>);
  return await response.json() as ResponseOf<(typeof ROUTES)[K]>;
}
