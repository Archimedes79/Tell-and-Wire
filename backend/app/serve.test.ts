import { describe, it, expect, afterAll } from 'vitest';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { request as httpRequest, type Server } from 'node:http';
import { serve } from './serve.ts';
import { API, pathFor } from './api.ts';

/**
 * The endpoints a deployed page calls, and the rules about them.
 *
 * The shapes are not this server's to choose: `api.ts` declares them for both
 * ends, and a snapshot missing `done` looks to the page exactly like a run that
 * never finishes -- which is how it first behaved.
 *
 * The other rules are what is *absent* and who may ask. A deployed tool must
 * not offer code generation or graph editing; those routes are not "not
 * implemented yet", they are the boundary, and a test is the only thing that
 * keeps a boundary from being widened by someone being helpful. And the server
 * answers its own page only: any web page can address 127.0.0.1.
 */

const REPO = resolve(__dirname, '..', '..');
const started: Server[] = [];

afterAll(() => { for (const server of started) server.close(); });

/**
 * A graph with nothing to carry along, so what is tested is the server -- a
 * copy, because a served graph keeps what its rounds leave beside it.
 */
const MINIMAL = join(mkdtempSync(join(tmpdir(), 'served-')), 'minimal.json');
copyFileSync(resolve(REPO, 'graph', 'test', 'fixtures', 'minimal.json'), MINIMAL);

async function serveGraph(options: { host?: string } = {}) {
  const { server, url } = await serve({ graphPath: MINIMAL, port: 0, ...options });
  started.push(server);
  return url;
}

const asJson = (response: Response) => response.json() as Promise<Record<string, unknown>>;

/** A request with exactly the headers given: `fetch` will not send a Host or Origin of its own choosing. */
function ask(url: string, path: string, headers: Record<string, string>, body?: string) {
  const { port } = new URL(url);
  return new Promise<{ status: number; text: string }>((answered, failed) => {
    const sent = httpRequest({ host: '127.0.0.1', port, path, method: body === undefined ? 'GET' : 'POST', headers }, (reply) => {
      let text = '';
      reply.on('data', (chunk) => { text += chunk; });
      reply.on('end', () => answered({ status: reply.statusCode ?? 0, text }));
    });
    sent.on('error', failed);
    sent.end(body);
  });
}
const status = async (...args: Parameters<typeof ask>) => (await ask(...args)).status;

describe('what a deployed tool serves', () => {
  it('runs a round watchably, in the shape the page reads', async () => {
    const url = await serveGraph();
    const post = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' };
    const { round_id: roundId, total } = await asJson(await fetch(`${url}/api/runtime/rounds`, post)) as
      { round_id: string; total: number };

    expect(typeof roundId).toBe('string');
    expect(total).toBeGreaterThan(0);

    let snapshot: Record<string, unknown> = {};
    for (let attempt = 0; attempt < 60; attempt += 1) {
      snapshot = await asJson(await fetch(`${url}/api/runtime/rounds/${roundId}`));
      if (snapshot.done) break;
      await new Promise((wait) => setTimeout(wait, 100));
    }

    // Every field the page's `RoundSnapshot` declares. A missing one is not a
    // cosmetic gap: `done` is how the page knows to stop polling.
    expect(snapshot).toMatchObject({ round_id: roundId, done: true, cancelled: false, total, error: null });
    expect(snapshot).toHaveProperty('current_label');
    expect(snapshot).toHaveProperty('item_done');
    expect(snapshot).toHaveProperty('item_total');
    expect(snapshot).toHaveProperty('idle_seconds');
    expect((snapshot.result as { status: string }).status).toBe('success');
  }, 60_000);

  // That the editor serves every route is not tested by calling them -- some
  // write settings or ask a model -- but by starting it: a server with a route
  // and no handler refuses to start, and the editor test below started.
  it('serves its own routes of the contract, none of the editor\'s, and nothing a tool has no business offering', async () => {
    const url = await serveGraph();
    for (const [name, route] of Object.entries(API)) {
      const { path } = pathFor(name as keyof typeof API, { id: 'none' });
      const stop = new AbortController();
      const init = { method: route.method, headers: { 'Content-Type': 'application/json' }, body: route.method === 'GET' ? undefined : '{}', signal: stop.signal };
      const response = await fetch(`${url}${path}`, init);
      // A stream answers by going on: that it opened is the handler.
      if (response.headers.get('content-type')?.startsWith('text/event-stream')) {
        expect(route.for, name).toBe('tool');
        stop.abort();
        continue;
      }
      // Any answer but "no such route" means a handler: its own refusals (a run that is not there) are its business.
      const detail = (await asJson(response)).detail;
      if (route.for === 'editor') expect(detail, name).toBe('Not part of this server.');
      else expect(detail, name).not.toBe('Not part of this server.');
    }
    // Code generation and graph editing belong to building a tool, not to running one; and a tool
    // handed the graph its visitor posts would do what the visitor says, not what it ships.
    for (const path of ['/api/ai/generate', '/api/graphs/file/save', '/api/nodes/code/run', '/api/runtime/hold']) {
      expect((await fetch(`${url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, path).toBe(404);
    }
  }, 60_000);
});

describe('a web page elsewhere in the same browser', () => {
  /**
   * A form or `fetch` posting `text/plain` goes out without the browser asking
   * first, and a page that renamed its own site to 127.0.0.1 (DNS rebinding) can
   * even read the answer. The editor's server runs code, writes files and holds
   * keys, so it answers its own page only.
   */
  it('answers its own page, by any loopback name, and refuses another host, origin, site or content type', async () => {
    const url = await serveGraph();
    const { port, host } = new URL(url);
    const json = { 'Content-Type': 'application/json' };
    for (const name of ['127.0.0.1', 'localhost', '[::1]']) {
      const own = { ...json, Host: `${name}:${port}`, Origin: `http://${name}:${port}` };
      expect(await status(url, '/api/runtime/requirements', own, '{}'), name).toBe(200);
    }
    expect(await status(url, '/api/runtime/page', { Host: `evil.example:${port}` })).toBe(403);
    expect(await status(url, '/api/runtime/page', { Host: 'localhost:1' })).toBe(403);
    expect(await status(url, '/', { Host: `evil.example:${port}` })).toBe(403);
    const foreigners: Record<string, string>[] = [{ Origin: 'https://evil.example' }, { Origin: 'http://localhost:1' }, { Origin: 'null' }, { 'Sec-Fetch-Site': 'cross-site' }];
    for (const foreign of foreigners) {
      expect(await status(url, '/api/runtime/requirements', { ...json, Host: host, ...foreign }, '{}'), JSON.stringify(foreign)).toBe(403);
    }
    // text/plain is what a page may post anywhere without the browser asking first.
    expect(await status(url, '/api/runtime/requirements', { Host: host, 'Content-Type': 'text/plain' }, '{}')).toBe(415);
    expect(await status(url, '/api/runtime/requirements', { Host: host }, '{}')).toBe(415);
    // A body that is no object is not the parameters of a route.
    expect(await status(url, '/api/runtime/requirements', { ...json, Host: host }, '[1]')).toBe(400);
  });

  it('served beyond loopback (a container), answers as this machine on any port and as a name it was given, never as one a page chose', async () => {
    const json = { 'Content-Type': 'application/json' };
    const url = await serveGraph({ host: '0.0.0.0' });
    // Said as an address a browser opens: 0.0.0.0 is none.
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(await status(url, '/api/runtime/requirements', { ...json, Host: 'localhost:8000', Origin: 'http://localhost:8000' }, '{}')).toBe(200);
    expect(await status(url, '/api/runtime/requirements', { ...json, Host: 'evil.example:8000', Origin: 'http://evil.example:8000' }, '{}')).toBe(403);
    expect(await status(url, '/', { Host: 'tool.lan' })).toBe(403);

    process.env.TW_ALLOWED_HOSTS = 'Tool.lan, other.lan';
    try {
      const named = await serveGraph({ host: '0.0.0.0' });
      expect(await status(named, '/api/runtime/requirements', { ...json, Host: 'tool.lan', Origin: 'http://tool.lan' }, '{}')).toBe(200);
      // Behind a TLS reverse proxy the page's origin is https.
      expect(await status(named, '/api/runtime/requirements', { ...json, Host: 'tool.lan', Origin: 'https://tool.lan' }, '{}')).toBe(200);
      expect(await status(named, '/api/runtime/requirements', { ...json, Host: 'tool.lan', Origin: 'https://evil.example' }, '{}')).toBe(403);
      expect(await status(named, '/', { Host: 'evil.example' })).toBe(403);
    } finally {
      delete process.env.TW_ALLOWED_HOSTS;
    }
  });
});

describe('the server as the front door of the editor', () => {
  it('serves the editor page for any deep link, a file by its decoded name and never one from above it, forbids being framed, refuses what nothing serves, and serves the page of the graph it is handed', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'editor-dist-'));
    const dist = join(parent, 'dist');
    await mkdir(dist);
    await writeFile(join(dist, 'index.html'), '<!doctype html><title>the editor</title>');
    await writeFile(join(dist, 'my file.js'), 'inside');
    await writeFile(join(parent, 'secret.txt'), 'above');
    const { server, url } = await serve({ port: 0, editor: { dist } });
    started.push(server);
    const { host } = new URL(url);

    expect((await ask(url, '/some/route', { Host: host })).text).toContain('the editor');
    expect((await ask(url, '/my%20file.js', { Host: host })).text).toBe('inside');
    // A file name that is not there is a 404, not the page; so is one from above, however it is spelt.
    expect(await status(url, '/gone.js', { Host: host })).toBe(404);
    expect(await status(url, '/..%2fsecret.txt', { Host: host })).toBe(404);
    expect(await status(url, '/../../package.json', { Host: host })).toBe(404);
    const page = await fetch(`${url}/some/route`);
    expect([page.headers.get('x-frame-options'), page.headers.get('content-security-policy')]).toEqual(['DENY', "frame-ancestors 'none'"]);
    expect(await status(url, '/api/nothing/here', { Host: host })).toBe(404);

    // "Open as tool": the editor hands its session the graph it is editing, and the runtime page then
    // asks for its page over the ordinary route. Before that there is nothing to serve.
    expect((await fetch(`${url}/api/runtime/page`)).status).toBe(404);
    const graph = JSON.parse(await readFile(MINIMAL, 'utf8'));
    graph.metadata.name = 'Handed over';
    const held = await asJson(await fetch(`${url}/api/runtime/hold`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ graph }),
    }));
    expect(await asJson(await fetch(`${url}/api/runtime/page`))).toMatchObject({ session: held.session, name: 'Handed over' });
  });
});
