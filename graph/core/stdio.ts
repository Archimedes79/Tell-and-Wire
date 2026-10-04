// A graph core as a program of its own: the protocol (`protocol.ts`) over
// stdin and stdout, one JSON object per line.
//
// `serveCore` is the core's half -- what `node backend/app/main.ts core` runs,
// and what a core in another language does in its own way. `processCore` is
// the wrapper's half: it starts such a program and is a `GraphCore` to the
// session, the command line and the editor alike. `chosenCore` says which
// one a wrapper runs graphs with.

import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import type { Held } from '../execution/latch.ts';
import { localCore, type LocalCoreOptions } from './localCore.ts';
import { OPERATIONS, PROTOCOL, type CoreAnswer, type CoreEvent, type CoreHello, type CoreRequest, type GraphCore } from './protocol.ts';

/**
 * Answer requests from *input* on *output* until *input* ends. Requests are
 * answered as they come, several at once: a `stop` reaches a round while it
 * goes. When *input* ends, whatever still goes is stopped -- a wrapper that
 * is gone asks for nothing more.
 */
export function serveCore(core: GraphCore, input: Readable, output: Writable): Promise<void> {
  const going = new Map<number, AbortController>();
  const send = (answer: CoreAnswer): void => { output.write(`${JSON.stringify(answer)}\n`); };

  const answer = async (request: CoreRequest): Promise<unknown> => {
    const stop = new AbortController();
    going.set(request.id, stop);
    const report = (event: CoreEvent): void => send({ id: request.id, event });
    try {
      switch (request.op) {
        case 'hello': return await core.hello();
        case 'open': return await core.open(request.held);
        case 'round': return await core.round(request, report, stop.signal);
        case 'node': return await core.node(request, stop.signal);
        case 'example': return await core.example(request, stop.signal);
        case 'test': return await core.test(request, stop.signal);
        case 'arriving': return await core.arriving(request, stop.signal);
        case 'forget': return await core.forget();
        case 'stop': {
          const stopped = going.get(request.of);
          stopped?.abort();
          return { stopped: !!stopped };
        }
        default: throw new Error(`No operation "${String((request as { op?: unknown }).op)}": a core answers ${OPERATIONS.join(', ')}.`);
      }
    } finally {
      going.delete(request.id);
    }
  };

  const lines = createInterface({ input, crlfDelay: Infinity });
  lines.on('line', (line) => {
    if (!line.trim()) return;
    let request: CoreRequest;
    try {
      request = JSON.parse(line) as CoreRequest;
      if (!request || typeof request !== 'object' || typeof request.id !== 'number') throw new Error('no id');
    } catch {
      send({ id: 0, error: `Not a request -- one JSON object a line, with a numeric "id": ${line.slice(0, 80)}` });
      return;
    }
    answer(request).then(
      (reply) => send({ id: request.id, reply: reply ?? null }),
      (error: unknown) => send({ id: request.id, error: error instanceof Error ? error.message : String(error) }),
    );
  });
  return new Promise((ended) => {
    lines.on('close', () => {
      for (const stop of going.values()) stop.abort();
      ended();
    });
  });
}

/** How long a core has to say `hello` once started: a program that never answers is not one. */
const HELLO_MS = 15_000;
/** How long a core has to end once its stdin is closed, before it is ended. */
const CLOSE_MS = 5_000;

/** A request as it is asked, before it is numbered. */
type Asked = CoreRequest extends infer R ? R extends { id: number } ? Omit<R, 'id'> : never : never;

/** What a request is answered with, once its core replies. */
interface Waiting {
  resolve: (reply: unknown) => void;
  reject: (error: Error) => void;
  report?: (event: CoreEvent) => void;
}

/** A core program that is gone: it ended, or could not start. The next request starts it again. */
export class CoreGone extends Error {}

/** One running core program: its process, the requests it owes an answer, and its `hello`. */
interface Running {
  child: ChildProcessByStdio<Writable, Readable, null>;
  waiting: Map<number, Waiting>;
  gone: CoreGone | null;
  ready: Promise<CoreHello>;
}

/**
 * The core *program* runs, started with *args*: a `GraphCore` that asks it
 * over its stdin and stdout. What it says on stderr goes to this process's.
 *
 * It is started when first asked, says `hello` first -- a program that does
 * not answer within *helloMs*, or speaks another protocol, is refused -- and
 * started again when asked after it ended, handed what it was last opened
 * with: what it made since is gone with it, and said on stderr.
 */
export function processCore(
  program: string,
  args: string[] = [],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; helloMs?: number } = {},
): GraphCore {
  let next = 1;
  let started = 0;
  let running: Running | null = null;
  let opened: Record<string, Held> | undefined;
  let closed = false;

  const write = (run: Running, message: object): void => {
    if (!run.gone) run.child.stdin.write(`${JSON.stringify(message)}\n`);
  };

  /** *request* to *run*, answered when it replies -- or refused after *timeout* ms, when given. */
  const send = <T>(run: Running, request: Asked, report?: (event: CoreEvent) => void, signal?: AbortSignal, timeout?: number): Promise<T> => (
    new Promise<T>((resolve, reject) => {
      if (run.gone) {
        reject(run.gone);
        return;
      }
      const id = next++;
      const clock = timeout ? setTimeout(() => {
        run.waiting.delete(id);
        reject(new CoreGone(`The graph core "${program}" did not answer "${request.op}" within ${timeout / 1000} s.`));
        run.child.kill();
      }, timeout) : undefined;
      run.waiting.set(id, {
        resolve: (reply) => { clearTimeout(clock); resolve(reply as T); },
        reject: (error) => { clearTimeout(clock); reject(error); },
        report,
      });
      write(run, { ...request, id });
      // Stopped before it was even asked, or while it goes: either way the core is told.
      const stop = (): void => { if (run.waiting.has(id)) write(run, { id: next++, op: 'stop', of: id }); };
      if (signal?.aborted) stop();
      else signal?.addEventListener('abort', stop, { once: true });
    })
  );

  const start = (): Running => {
    // A .cmd or .bat file is run by the shell on Windows, never as a program of its own.
    const shell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(program);
    const child = spawn(program, args, { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true, cwd: options.cwd, env: options.env ?? process.env, shell });
    const run: Running = { child, waiting: new Map(), gone: null, ready: Promise.resolve({ protocol: PROTOCOL, language: '', core: '' }) };
    const end = (why: string): void => {
      if (run.gone) return;
      run.gone = new CoreGone(why);
      for (const { reject } of run.waiting.values()) reject(run.gone);
      run.waiting.clear();
      if (running === run) running = null;
    };
    child.on('error', (error) => end(`The graph core "${program}" could not be started: ${error.message}`));
    child.on('close', (code, signal) => end(`The graph core "${program}" ended (${signal ?? `exit code ${code}`}).`));
    // Writing to a core that just died is said by its 'close', not by a crash of the wrapper.
    child.stdin.on('error', () => end(`The graph core "${program}" stopped reading what it is asked.`));

    createInterface({ input: child.stdout, crlfDelay: Infinity }).on('line', (line) => {
      let answer: CoreAnswer;
      try {
        answer = JSON.parse(line) as CoreAnswer;
      } catch {
        return; // Not the protocol: nothing a core may write on stdout, and nothing to act on.
      }
      if (!answer || typeof answer !== 'object' || typeof answer.id !== 'number') return;
      const asked = run.waiting.get(answer.id);
      if (!asked) return;
      if ('event' in answer) {
        asked.report?.(answer.event);
        return;
      }
      run.waiting.delete(answer.id);
      if ('error' in answer) asked.reject(new Error(answer.error));
      else asked.resolve(answer.reply);
    });

    run.ready = send<CoreHello>(run, { op: 'hello' }, undefined, undefined, options.helloMs ?? HELLO_MS).then((hello) => {
      if (hello?.protocol !== PROTOCOL) {
        throw new Error(`The graph core "${program}" speaks protocol ${String(hello?.protocol)}; this wrapper speaks ${PROTOCOL}.`);
      }
      return hello;
    });
    // A refused hello is said by every request that waits for it, not as an unheard rejection.
    run.ready.catch(() => {});
    return run;
  };

  /** *request*, to the core program running -- started, or started again, when there is none. */
  const ask = async <T>(request: Asked, report?: (event: CoreEvent) => void, signal?: AbortSignal): Promise<T> => {
    if (closed) throw new CoreGone(`The graph core "${program}" was let go.`);
    let run = running;
    if (!run) {
      run = running = start();
      started += 1;
      if (started > 1) {
        process.stderr.write(`The graph core "${program}" was started again: what it made since it was opened is gone with it.\n`);
        // What it was opened with, again, before anything else is asked of it.
        const again = run;
        if (opened && request.op !== 'open') again.ready = again.ready.then(async (hello) => { await send(again, { op: 'open', held: opened }); return hello; });
      }
    }
    await run.ready;
    return send<T>(run, request, report, signal);
  };

  return {
    hello: () => ask<CoreHello>({ op: 'hello' }),
    open: (held) => {
      opened = held;
      return ask({ op: 'open', held });
    },
    round: (asked, report, signal) => ask({ op: 'round', ...asked }, report, signal),
    node: (asked, signal) => ask({ op: 'node', ...asked }, undefined, signal),
    example: (asked, signal) => ask({ op: 'example', ...asked }, undefined, signal),
    test: (asked, signal) => ask({ op: 'test', ...asked }, undefined, signal),
    arriving: (asked, signal) => ask({ op: 'arriving', ...asked }, undefined, signal),
    forget: () => {
      opened = undefined;
      return ask({ op: 'forget' });
    },
    async close() {
      closed = true;
      const run = running;
      if (!run || run.gone) return;
      const ended = new Promise<void>((done) => { run.child.once('close', () => done()); });
      run.child.stdin.end();
      // A core that does not end once nothing more is asked of it is ended.
      const late = setTimeout(() => run.child.kill(), CLOSE_MS);
      await ended;
      clearTimeout(late);
    },
  };
}

/**
 * *command* as a program and its arguments: split at spaces outside quotes,
 * the quotes taken off -- `"C:/Program Files/core.exe" --name="a b"` is the
 * program and `--name=a b`.
 */
export function commandParts(command: string): string[] {
  const parts: string[] = [];
  let part = '';
  let quote = '';
  let begun = false;
  for (const char of command) {
    if (quote) {
      if (char === quote) quote = '';
      else part += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      begun = true;
    } else if (/\s/.test(char)) {
      if (begun) parts.push(part);
      part = '';
      begun = false;
    } else {
      part += char;
      begun = true;
    }
  }
  if (begun) parts.push(part);
  return parts;
}

/**
 * The graph core this wrapper runs graphs with: the program `AI_GRAPH_CORE`
 * names, with its arguments -- `node backend/app/main.ts core`, or a core in
 * another language -- else the JavaScript core in this process.
 */
export function chosenCore(options: LocalCoreOptions = {}): GraphCore {
  const command = process.env.AI_GRAPH_CORE?.trim();
  if (!command) return localCore(options);
  const [program, ...args] = commandParts(command);
  return processCore(program, args);
}
