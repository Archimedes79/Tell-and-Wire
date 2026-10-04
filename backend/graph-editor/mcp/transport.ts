// stdio: JSON-RPC, one message per line.
//
// Knows nothing of what the tools do: it is handed them (`tools.ts`) and speaks the
// protocol for them.

import { message } from '../../app/http.ts';
import { INSTRUCTIONS, MAX_GRAPH_BYTES } from './spec.ts';
import type { GraphTools, ToolResult } from './tools.ts';

/** One protocol line: the largest graph, plus room for JSON's own escaping around it. */
const MAX_LINE_CHARS = 2 * MAX_GRAPH_BYTES;

/** Newest first. The client's version is echoed when it is one of these; otherwise it is offered the first. */
const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'tell-and-wire', version: '1.0.0' };

export interface StdioStreams {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  /** Where anything that is not protocol goes. Never `output`. */
  log?: NodeJS.WritableStream;
}

interface RpcRequest {
  jsonrpc?: string;
  id?: number | string | null;
  method?: unknown;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

/**
 * Serve *tools* until the input ends.
 *
 * **The output stream carries protocol messages and nothing else.** The client
 * parses every line of it; one stray `console.log` is a parse error on the far
 * side and a tool that "randomly disconnects". Anything worth saying to a
 * person goes to `log`.
 *
 * Requests are answered as they finish, not in the order they arrived: a
 * generation takes a minute, and a `ping` sent meanwhile is the client asking
 * whether this process is still alive. Every line is written whole, so answers
 * cannot interleave.
 *
 * Nothing a client sends ends the loop. A line that is not JSON, a method that
 * does not exist and a tool that throws each get their answer, and the next
 * line is read.
 */
export function serveStdio(
  tools: GraphTools,
  streams: StdioStreams = { input: process.stdin, output: process.stdout, log: process.stderr },
): Promise<void> {
  const { input, output, log } = streams;
  const running = new Set<Promise<void>>();

  const send = (answer: { id: number | string | null; result?: unknown; error?: { code: number; message: string } }): void => {
    output.write(`${JSON.stringify({ jsonrpc: '2.0', ...answer })}\n`);
  };

  const handle = async (line: string): Promise<void> => {
    let request: RpcRequest;
    try {
      request = JSON.parse(line) as RpcRequest;
    } catch {
      // The one answer with no id to carry: the id was in what could not be read.
      return send({ id: null, error: { code: -32700, message: 'Parse error: that line is not JSON. One JSON-RPC message per line.' } });
    }
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      // Batches included: the protocol version this speaks took them out.
      return send({ id: null, error: { code: -32600, message: 'Invalid request: expected one JSON-RPC object.' } });
    }

    const { id, method, params } = request;
    if (typeof method !== 'string') {
      // An answer to a question this server never asked. Nothing to do with it.
      if ('result' in request || 'error' in request) return;
      return send({ id: id ?? null, error: { code: -32600, message: 'Invalid request: no method.' } });
    }
    // Notifications get no answer; that is what makes them notifications.
    // `notifications/initialized` and `notifications/cancelled` both end here.
    if (id === undefined || id === null) return;

    if (method === 'initialize') {
      const wanted = (params as { protocolVersion?: unknown } | undefined)?.protocolVersion;
      return send({
        id,
        result: {
          protocolVersion: typeof wanted === 'string' && PROTOCOL_VERSIONS.includes(wanted) ? wanted : PROTOCOL_VERSIONS[0],
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        },
      });
    }
    if (method === 'ping') return send({ id, result: {} });
    if (method === 'tools/list') {
      return send({
        id,
        result: { tools: tools.specs.map((spec) => ({ name: spec.name, description: spec.description, inputSchema: spec.parameters })) },
      });
    }
    if (method === 'tools/call') {
      const { name, arguments: given } = (params ?? {}) as { name?: unknown; arguments?: unknown };
      if (typeof name !== 'string' || !tools.specs.some((spec) => spec.name === name)) {
        return send({ id, error: { code: -32602, message: `Unknown tool: ${String(name)}` } });
      }
      let result: ToolResult;
      try {
        result = await tools.call(name, (given ?? {}) as Record<string, unknown>);
      } catch (error) {
        // `call` promises not to throw. This is for the day a change breaks that promise.
        result = { text: `${name} failed: ${message(error)}`, isError: true };
      }
      return send({ id, result: { content: [{ type: 'text', text: result.text }], ...(result.isError ? { isError: true } : {}) } });
    }
    return send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
  };

  const start = (line: string): void => {
    const work: Promise<void> = handle(line)
      .catch((error) => { log?.write(`tell-and-wire mcp: ${message(error)}\n`); })
      .finally(() => { running.delete(work); });
    running.add(work);
  };

  return new Promise((done) => {
    let buffered = '';
    /** Inside a line that was too long: everything up to its newline is the rest of it. */
    let skipping = false;
    let ended = false;

    const finish = (): void => {
      if (ended) return;
      ended = true;
      // Closing stdin is how a client says goodbye; what it already asked for still gets its answer.
      void Promise.allSettled([...running]).then(() => done());
    };

    input.setEncoding('utf8');
    input.on('data', (chunk: string | Buffer) => {
      buffered += String(chunk);
      let end: number;
      while ((end = buffered.indexOf('\n')) >= 0) {
        const line = buffered.slice(0, end).trim();
        buffered = buffered.slice(end + 1);
        if (skipping) { skipping = false; continue; }
        if (line) start(line);
      }
      if (buffered.length > MAX_LINE_CHARS) {
        // Bounded, or one client with no newline key fills this process's memory.
        if (!skipping) send({ id: null, error: { code: -32700, message: `Message too large: a line may be at most ${MAX_LINE_CHARS} characters.` } });
        skipping = true;
        buffered = '';
      }
    });
    input.on('end', finish);
    input.on('close', finish);
    input.on('error', finish);
    // A client that left without saying so: writing to it raises EPIPE on the
    // *stream*, and an unhandled stream error ends the process mid-run.
    output.on('error', () => {});
  });
}
