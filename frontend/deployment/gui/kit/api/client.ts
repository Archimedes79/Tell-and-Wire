// A gui's end of the wire: the routes of `backend/deployment/host/api.ts`, called by name.
//
// The mirror of `serve.ts`. The server serves those tables and this calls them, so
// a route's path, method and the shapes going each way are written once, in
// the backend (`api.ts`), and both ends are checked against them by the compiler. What is
// left here is the calling: how a request becomes a URL and a body, and a
// failure an `ApiError` whose message is the server's own `detail`.
//
// No clock on any call. A local model asked to design a whole graph takes as
// long as it takes, and a browser that gives up first turns a slow answer into
// no answer -- with the request still running on the other side.
import {
  API, GUI_API, pathFor,
  type Failure, type RequestOf, type ResponseOf, type Routes,
} from '../../../../../backend/deployment/host/api.ts';

export type {
  BrowseEntry, BrowsePage, Requirement, RoundSnapshot, SessionView, ToolAiSettings,
} from '../../../../../backend/deployment/host/api.ts';

/** A call the server answered with an error. `message` is its `detail`; `body` the rest of what it said. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: Partial<Failure>;
  constructor(status: number, body: Partial<Failure>) {
    super(body.detail || `The server answered ${status}.`);
    this.status = status;
    this.body = body;
  }
}

/** A call's options. *keepalive*: the request outlives the page that sends it -- one sent as the page closes. */
export interface CallOptions { keepalive?: boolean }

/**
 * The function that calls the routes of *api* by name.
 *
 * GET carries the request on the query; POST as a JSON body. `:params` are
 * filled into the path. A JSON answer is returned as it came; anything else
 * is a download, named by the server (`Download`): a File, which is a Blob
 * that also carries that name, so no caller works the name out again.
 */
export function caller<A extends Routes>(api: A) {
  return async function call<K extends keyof A & string>(
    name: K,
    request?: RequestOf<A[K]>,
    { keepalive = false }: CallOptions = {},
  ): Promise<ResponseOf<A[K]>> {
    const route = api[name];
    const { path, rest } = pathFor(route, (request ?? {}) as Record<string, unknown>);
    let url = path;
    let body: BodyInit | undefined;
    const headers: Record<string, string> = {};

    if (route.method === 'POST') {
      body = JSON.stringify(rest);
      headers['Content-Type'] = 'application/json';
    } else if (Object.keys(rest).length) {
      url += `?${new URLSearchParams(rest as Record<string, string>)}`;
    }

    const response = await fetch(url, { method: route.method, headers, body, keepalive });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({})) as Partial<Failure>;
      throw new ApiError(response.status, failure);
    }
    const type = response.headers.get('Content-Type') ?? '';
    if (type.includes('application/json')) return response.json() as Promise<ResponseOf<A[K]>>;
    const blob = await response.blob();
    const named = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? 'download';
    return new File([blob], named, { type: blob.type }) as ResponseOf<A[K]>;
  };
}

/** Call one route of a host with a gui. */
export const call = caller({ ...API, ...GUI_API });
