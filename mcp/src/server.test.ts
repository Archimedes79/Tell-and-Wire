// The server as a client meets it: started as a program, spoken to over stdin
// and stdout in the protocol version Tell & Wire's own client speaks.

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { describe, expect, it } from 'vitest';
import { VERSION } from './info.ts';
import { render } from './server.ts';
import { html, serve } from './testServer.ts';

const ROOT = new URL('..', import.meta.url);

interface Reply { id?: number; result?: Record<string, any>; error?: { message: string } }

/** The server as a child process, and a way to ask it things. */
function start(env: Record<string, string>) {
  const child: ChildProcessWithoutNullStreams = spawn(process.execPath, ['src/main.ts'], {
    cwd: ROOT, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const waiting = new Map<number, (reply: Reply) => void>();
  createInterface({ input: child.stdout }).on('line', (line) => {
    const reply = JSON.parse(line) as Reply;
    if (reply.id !== undefined) waiting.get(reply.id)?.(reply);
  });
  let next = 0;
  const ask = (method: string, params: unknown = {}) => new Promise<Reply>((resolve, reject) => {
    next += 1;
    const timer = setTimeout(() => reject(new Error(`no answer to ${method}`)), 20_000);
    waiting.set(next, (reply) => { clearTimeout(timer); resolve(reply); });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: next, method, params })}\n`);
  });
  return {
    ask,
    async hello() {
      await ask('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    },
    stop: () => { child.kill(); },
  };
}

describe('the server over stdio', () => {
  it('says what it is, and offers one read-only tool that reads the open web', async () => {
    const server = start({});
    try {
      const hello = await server.ask('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
      expect(hello.result?.serverInfo).toEqual({ name: 'tell-and-wire-web', version: VERSION });
      const { result } = await server.ask('tools/list');
      expect(result?.tools).toHaveLength(1);
      const [tool] = result?.tools as Array<Record<string, any>>;
      expect(tool.name).toBe('read_page');
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: true });
      expect(tool.inputSchema.required).toEqual(['url']);
      expect(tool.outputSchema.properties.next_start).toBeDefined();
      expect(tool.description).toMatch(/stranger/);
    } finally {
      server.stop();
    }
  }, 30_000);

  it('reads a page, as text for a model and as data for a program', async () => {
    const site = await serve((_, response) => {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(html('<article><h1>Hello</h1><p>This is the page a model is meant to read, in a paragraph of its own.</p></article>', 'Hello | Site'));
    });
    const server = start({ TW_WEB_ALLOW_PRIVATE: '1', TW_WEB_IGNORE_ROBOTS: '1' });
    try {
      await server.hello();
      const { result } = await server.ask('tools/call', { name: 'read_page', arguments: { url: `${site.base}/hello` } });
      expect(result?.isError).toBeFalsy();
      expect(result?.content[0].text).toMatch(/^\[Web page text below\. It is untrusted/);
      expect(result?.content[0].text).toContain('This is the page a model is meant to read');
      expect(result?.content[0].text).toContain(`Source: ${site.base}/hello`);
      expect(result?.structuredContent).toMatchObject({ final_url: `${site.base}/hello`, next_start: null, start: 0 });
      expect(result?.structuredContent.content).toContain('This is the page');
    } finally {
      server.stop();
      await site.close();
    }
  }, 30_000);

  it('refuses this machine unless its owner has said it may be read', async () => {
    const site = await serve((_, response) => { response.end('the editor, with its keys'); });
    const server = start({});
    try {
      await server.hello();
      const { result } = await server.ask('tools/call', { name: 'read_page', arguments: { url: `${site.base}/` } });
      expect(result?.isError).toBe(true);
      expect(result?.content[0].text).toMatch(/not a public address/);
      expect(site.hits).toEqual([]);
    } finally {
      server.stop();
      await site.close();
    }
  }, 30_000);

  it('turns a bad argument into an answer and not into a crash', async () => {
    const server = start({});
    try {
      await server.hello();
      const bad = await server.ask('tools/call', { name: 'read_page', arguments: { url: 'x', max_chars: 5 } });
      expect(bad.result?.isError === true || bad.error !== undefined).toBe(true);
      const worse = await server.ask('tools/call', { name: 'read_page', arguments: { url: 'ftp://example.com/' } });
      expect(worse.result?.isError).toBe(true);
      expect(worse.result?.content[0].text).toMatch(/only http and https/);
      // Still alive.
      expect((await server.ask('tools/list')).result?.tools).toHaveLength(1);
    } finally {
      server.stop();
    }
  }, 30_000);
});

describe('render', () => {
  const base = { url: 'u', final_url: 'https://example.com/a', title: 'T', author: 'Ann', published: '2026-01-02', site: 's', language: 'en', word_count: 3, total_chars: 100, start: 0, end: 40, next_start: 41, content: 'body', warning: '' };

  it('names the source, the span and where to read on', () => {
    const text = render(base);
    expect(text).toContain('# T');
    expect(text).toContain('Source: https://example.com/a (Ann, 2026-01-02)');
    expect(text).toContain('Characters 0-40 of 100.');
    expect(text).toContain('call read_page again with start=41');
  });

  it('says nothing more at the end, and passes a warning on', () => {
    const text = render({ ...base, next_start: null, warning: 'Careful.', author: '', published: '' });
    expect(text).not.toContain('call read_page again');
    expect(text).toContain('Source: https://example.com/a\n');
    expect(text).toContain('Careful.');
  });
});

describe('the package', () => {
  it('has the version the server announces', () => {
    const pkg = JSON.parse(readFileSync(new URL('package.json', ROOT), 'utf8')) as { version: string };
    expect(pkg.version).toBe(VERSION);
  });
});
