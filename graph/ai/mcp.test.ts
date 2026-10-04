import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import type { ToolSession } from '../nodes/Runtime.ts';
import { mcpToolService, type McpServerConfig } from './mcp.ts';
import { executeGraph } from '../execution/executor.ts';
import { registry } from '../nodes/registry.ts';
import { graphOf, quietRuntime } from '../test/fakes.ts';

const FIXTURE = join(__dirname, 'fixtures', 'echo-mcp-server.mjs');

/** The fixture as a machine would configure it: the interpreter already running, and a script. */
const echo = (...flags: string[]): McpServerConfig => ({ command: process.execPath, args: [FIXTURE, ...flags] });

const open: ToolSession[] = [];
const track = (session: ToolSession): ToolSession => { open.push(session); return session; };

afterEach(async () => {
  // A test that fails halfway must not leave a child process holding vitest open.
  await Promise.all(open.splice(0).map((session) => session.close()));
});

describe('the security boundary', () => {
  it('opens only the names this machine has configured, never a command line from a graph, and starts nothing when one name is unknown', async () => {
    const tools = mcpToolService({ files: echo('--mute') }, { handshakeTimeoutMs: 60_000 });
    await expect(tools.open(['shell'])).rejects.toThrow(
      /graph asks for tool server "shell", which this machine has not configured.*mcp_servers.*ai-settings\.json/s,
    );
    // Every one of these is a *name*, looked up and not found. None is run.
    for (const attempt of [`${process.execPath} ${FIXTURE}`, 'npx -y some-server', 'cmd /c calc', '__proto__', 'constructor']) {
      await expect(tools.open([attempt])).rejects.toThrow(/has not configured/);
    }
    // Resolved before anything is spawned: this server would hang the wait.
    const started = Date.now();
    await expect(tools.open(['files', 'unknown'])).rejects.toThrow(/"unknown"/);
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});

describe('a stdio server', () => {
  it('lists its tools across pages, calls them, and hands a failed tool to the model as text', async () => {
    const session = track(await mcpToolService({ echo: echo() }).open(['echo']));

    expect(session.specs.map((spec) => spec.name)).toEqual(['add', 'echo', 'fail', 'hang']);
    expect(await session.call('echo', { text: 'grüße, 世界' })).toBe('grüße, 世界');
    // Calls made at the same time each get their own result.
    expect(await Promise.all([1, 2, 3].map((n) => session.call('add', { a: n, b: n })))).toEqual(['2', '4', '6']);

    // A failed tool is the model's to deal with, not the run's: text, not an exception.
    expect(await session.call('fail', {})).toBe('Tool error: it did not work');
    expect(await session.call('subtract', {})).toMatch(/^Tool error: there is no tool named "subtract"/);
  });

  it('gives up on a tool that never answers, and lets Stop do it sooner', async () => {
    const wedged = track(await mcpToolService({ echo: echo() }, { callTimeoutMs: 300 }).open(['echo']));
    await expect(wedged.call('hang', {})).rejects.toThrow(/did not answer tools\/call within 0\.3 s/);

    // With no clock at all -- TW_MCP_TIMEOUT_MS=0 -- the run's own Stop
    // is what ends the call, or a stopped run would sit here forever.
    const patient = track(await mcpToolService({ echo: echo() }, { callTimeoutMs: 0 }).open(['echo']));
    const stop = new AbortController();
    setTimeout(() => stop.abort(), 100);
    await expect(patient.call('hang', {}, stop.signal)).rejects.toThrow(/Stopped\./);
  });

  it("is stopped by the run's Stop while an AI node waits for it to say hello", async () => {
    const tools = mcpToolService({ mute: echo('--mute') }, { handshakeTimeoutMs: 20_000 });
    const ask = {
      id: 'ask', node_type: 'ai' as const, label: 'ask', description: '', position: { x: 0, y: 0 }, inputs: [],
      outputs: [{ id: 'output', name: 'output', kind: 'output' as const, data_type: 'text' as const, multi: false, required: false, description: '' }],
      config: { prompt: 'hello', mcp_servers: ['mute'] },
    };
    const stop = new AbortController();
    setTimeout(() => stop.abort(), 200);
    const started = Date.now();
    const result = await executeGraph(graphOf([ask]), { runtime: quietRuntime({ tools }), registry, signal: stop.signal });
    expect(result.status).toBe('cancelled');
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});

// ---------------------------------------------------------------------------
// Streamable HTTP
// ---------------------------------------------------------------------------

interface Seen { method: string; rpc?: string; session?: string; version?: string; accept?: string; auth?: string }

/**
 * An MCP server over HTTP, answering the way the spec lets a server choose to:
 * `initialize` as JSON, everything else as an event stream with something
 * unrelated on it first. It sets a session id and records whether it got it back.
 */
async function httpServer(): Promise<{ url: string; seen: Seen[]; server: Server }> {
  const seen: Seen[] = [];
  const body = async (request: IncomingMessage): Promise<string> => {
    let text = '';
    for await (const chunk of request) text += chunk;
    return text;
  };

  const server = createServer(async (request, response) => {
    const message = request.method === 'POST' ? JSON.parse(await body(request)) : {};
    seen.push({
      method: request.method ?? '',
      rpc: message.method,
      session: request.headers['mcp-session-id'] as string | undefined,
      version: request.headers['mcp-protocol-version'] as string | undefined,
      accept: request.headers.accept,
      auth: request.headers.authorization,
    });

    if (request.method === 'DELETE') { response.writeHead(204).end(); return; }

    const { id, method, params } = message;
    if (id === undefined) { response.writeHead(202).end(); return; }

    if (method === 'initialize') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Mcp-Session-Id': 'session-1' });
      response.end(JSON.stringify({
        jsonrpc: '2.0', id,
        result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'http', version: '0' } },
      }));
      return;
    }

    const result = method === 'tools/list'
      ? { tools: [{ name: 'add', description: 'Add.', inputSchema: { type: 'object' } }] }
      : { content: [{ type: 'text', text: String(params.arguments.a + params.arguments.b) }] };

    // A stream that is never ended: the client has to stop reading at its
    // answer, because this server will not hang up to tell it so.
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write(': a comment, which is how servers keep a stream alive\n\n');
    response.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress', params: {} })}\n\n`);
    response.write(`event: message\r\ndata: ${JSON.stringify({ jsonrpc: '2.0', id, result })}\r\n\r\n`);
  });

  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/mcp`, seen, server };
}

describe('an HTTP server', () => {
  let server: Server | undefined;
  afterEach(() => {
    server?.closeAllConnections();
    server?.close();
    server = undefined;
  });

  it('is opened by URL, read as JSON or as a stream, told its session id back, and given configured headers only by name', async () => {
    const http = await httpServer();
    server = http.server;

    const session = await mcpToolService({}).open([http.url]);
    expect(session.specs.map((spec) => spec.name)).toEqual(['add']);
    expect(await session.call('add', { a: 20, b: 22 })).toBe('42');
    await session.close();

    expect(http.seen.map((request) => request.rpc ?? request.method)).toEqual([
      'initialize', 'notifications/initialized', 'tools/list', 'tools/call', 'DELETE',
    ]);
    expect(http.seen[0].accept).toBe('application/json, text/event-stream');
    // Nothing to send back before the server has said anything, and both on everything after.
    expect(http.seen[0].session).toBeUndefined();
    for (const request of http.seen.slice(1)) {
      expect(request.session).toBe('session-1');
      expect(request.version).toBe('2025-03-26');
    }
    // A URL a graph names carries no header; a configured one carries its own.
    expect(http.seen.every((request) => request.auth === undefined)).toBe(true);
    http.seen.length = 0;
    const tools = mcpToolService({ remote: { url: http.url, headers: { Authorization: 'Bearer secret' } } });
    await (await tools.open(['remote'])).close();
    expect(http.seen.every((request) => request.auth === 'Bearer secret')).toBe(true);
  });
});
