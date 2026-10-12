// Running a graph from a command line.
//
//     node backend/cli/main.ts graph.json                     once
//     node backend/cli/main.ts my_project/                    the same, for a project folder
//     node backend/cli/main.ts check my_project/ other.json   what is wrong, without running
//     node backend/cli/main.ts test my_project/ --offline     each node on its input.js, held to its output.js
//     node backend/cli/main.ts run-node my_project/ count     one node, on its input.js (or '{"input": …}')
//     node backend/cli/main.ts graph.json --event go          the round one start point starts
//     node backend/cli/main.ts graph.json --event go --value name=text   ...sent a value, by name
//     node backend/cli/main.ts my_project/ --event go --keep  ...and keep the round as a test, in tests/
//     node backend/cli/main.ts graph.json --every 5m           again, after each run
//     node backend/cli/main.ts graph.json --bundle ./out       hand it to someone else
//     node backend/cli/main.ts graph.json --serve             open its gui in a browser
//     node backend/cli/main.ts --editor frontend/dist   the editor itself, on :8000
//     node backend/cli/main.ts --mcp --mcp-root ./project     graph tools for an assistant, on stdio
//
// The same entry point a bundle uses, so what someone receives is the thing
// that was tested rather than a second launcher written for them.
//
// One rule about the two streams: **stdout is the result and nothing else.** Progress and errors go to
// stderr, so `run graph.json | jq` works.

import type { Graph } from '../../graph/graph.ts';
import { loadGraph, projectFolderOf } from '../deployment/project/folder.ts';
import { nodeName } from '../../graph/order.ts';
import { chosenCore } from '../deployment/runtime/stdio.ts';
import type { GraphCore } from '../deployment/runtime/protocol.ts';
import { registry } from '../../graph/nodes/registry.ts';
import { nodeRuntime } from '../deployment/runtime/services.ts';
import { memoryState, sendFromOutside } from '../../graph/interface.ts';
import { startFromGui } from '../../gui/gui.ts';
import { guiPart } from '../deployment/gui/hooks.ts';
import { WEB_DIR, builtGui, installFolder } from '../deployment/project/layout.ts';
import { isLoopbackHost, portTaken, serve, type ServeOptions } from '../deployment/host/serve.ts';
import { untilStopped } from '../deployment/host/lifecycle.ts';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { after, graphTriggers, parseInterval, type Trigger } from '../../graph/triggers.ts';
import { messageOf } from '../../graph/errors.ts';

interface CliOptions {
  graphPath: string;
  /** Whether the graph was named, rather than taken to be the project in this folder, the way a bundle is laid out. */
  graphNamed: boolean;
  /**
   * What the event's start point is sent: its package's values, under names
   * of the caller's own -- a dotted name inside another, `file.content`, as
   * an input that takes `file.content` reads it.
   */
  values: Record<string, unknown>;
  /** The event a round is started by, by name; none, the whole graph. */
  event?: string;
  /** Seconds between the end of one run and the start of the next. */
  every?: number;
  /** Stop after this many runs. Undefined means keep going. */
  limit?: number;
  /** Keep the round, once it ran through, as a test of the project: `tests/<name>.json`. */
  keep?: boolean;
  /** Write a runnable copy here instead of running it. */
  bundle?: string;
  /** Serve this graph's gui instead of running it once. */
  serve?: boolean;
  /** Serve the built editor from this folder. */
  editor?: string;
  /** Bind address. Loopback unless said otherwise; the `local` routes of the host's `api.ts` are off for any other. */
  host?: string;
  port?: number;
  /** Be an MCP server on stdio instead of running anything: see `backend/editor/host/mcpServer.ts`. */
  mcp?: boolean;
  /** The one folder that server may touch. Where it was started, unless said otherwise. */
  mcpRoot?: string;
}

/**
 * A page and the routes only it has, served by this command in place of a deployed gui: the editor (`--editor`), or another
 * product with a start file of its own (`backend/notebook/main.ts`, which calls `runServer` with its own).
 */
export interface Product {
  /** The page it serves, the routes it adds, and what answers them. */
  part: NonNullable<ServeOptions['editor']>;
  /** What the command calls it when it says what it does. */
  name: string;
  /** Where a free port is looked for first; 8000 where it names none. */
  port?: number;
  /** What it says about this machine's setup once it is up. */
  setup?: () => Promise<string[]>;
}

/** Where a served tool looks first. Nothing addresses it from outside, so this is a habit, not a contract. */
const DEFAULT_PORT = 8000;
/** How many in a row to try before a busy machine is the user's problem to sort out. */
const PORTS_TRIED = 10;

/** *values* with *value* put at the dotted *name*: `file.content` inside `file`. */
function put(values: Record<string, unknown>, name: string, value: string): void {
  // Own keys only, defined rather than assigned: `__proto__.x=1` would otherwise reach the object every object shares.
  const own = (into: Record<string, unknown>, key: string, held: unknown): void => {
    Object.defineProperty(into, key, { value: held, enumerable: true, writable: true, configurable: true });
  };
  const keys = name.split('.');
  let inner = values;
  for (const key of keys.slice(0, -1)) {
    const held = Object.prototype.hasOwnProperty.call(inner, key) ? inner[key] : undefined;
    if (!held || typeof held !== 'object') own(inner, key, {});
    inner = inner[key] as Record<string, unknown>;
  }
  own(inner, keys[keys.length - 1], value);
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { graphPath: '', graphNamed: false, values: {} };
  let i = 0;
  /** What follows the option, taken -- unless it is the next option, which `--editor --port 9000` has there. */
  const followed = (): string | undefined => {
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) return undefined;
    i += 1;
    return next;
  };
  const required = (arg: string, what: string): string => {
    const value = followed();
    if (value === undefined) throw new Error(`${arg} wants ${what}.`);
    return value;
  };
  for (; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--value') {
      const [name, ...rest] = (argv[++i] ?? '').split('=');
      if (name) put(options.values, name, rest.join('='));
    } else if (arg === '--event') {
      options.event = argv[++i] ?? '';
    } else if (arg === '--every') {
      options.every = parseInterval(argv[++i] ?? '');
    } else if (arg === '--limit') {
      // A whole number of runs: `round < NaN` is never true.
      const given = argv[++i] ?? '';
      const limit = Number(given);
      if (!given.trim() || !Number.isInteger(limit) || limit < 1) throw new Error(`--limit wants a whole number of runs, not "${given}".`);
      options.limit = limit;
    } else if (arg === '--keep') {
      options.keep = true;
    } else if (arg === '--bundle') {
      options.bundle = followed() ?? 'bundle';
    } else if (arg === '--serve') {
      options.serve = true;
    } else if (arg === '--port') {
      // Checked here rather than at `listen`, which answers a mistyped port
      // with ERR_SOCKET_BAD_PORT and a stack.
      const given = argv[++i] ?? '';
      const port = Number(given);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`--port wants a number from 1 to 65535, not "${given}".`);
      }
      options.port = port;
    } else if (arg === '--editor') {
      options.editor = followed() ?? join(installFolder(), 'frontend', 'dist');
    } else if (arg === '--host') {
      options.host = required(arg, 'an address');
    } else if (arg === '--mcp') {
      options.mcp = true;
    } else if (arg === '--mcp-root') {
      options.mcpRoot = required(arg, 'a folder');
    } else if (arg.startsWith('--')) {
      // A flag this command does not know is a mistake to say, not a graph to
      // look for.
      throw new Error(
        `Unknown option "${arg}". This command knows --value, --event, --keep, --every, --limit, --bundle, `
          + '--serve, --port, --editor, --host, --mcp and --mcp-root.',
      );
    } else if (!options.graphPath) {
      options.graphPath = arg;
    }
  }
  options.graphNamed = options.graphPath !== '';
  if (!options.graphNamed) options.graphPath = '.';
  return options;
}

async function runOnce(graph: Graph, trigger: Trigger | null, options: CliOptions, core: GraphCore): Promise<number> {
  // A run of everything starts the gui's start points on what the gui holds.
  if (!trigger) await startFromGui(graph, nodeRuntime(), registry);
  // Where the memory stood when the round began: a round kept starts it there again.
  const before = memoryState(graph, registry);
  const { result, nodes } = await core.round({ graph, trigger }, (event) => {
    if (event.type === 'batch') process.stderr.write(`\r  ${event.done}/${event.total}`);
    if (event.type === 'node_done' && event.status === 'error') {
      const node = graph.nodes.find((n) => n.id === event.node_id);
      process.stderr.write(`\n  ${node ? nodeName(node) : event.node_id} failed\n`);
    }
  });
  // One graph for every round: what a round leaves in a node is what the next starts from.
  for (const node of graph.nodes) registry.node(node.node_type)?.setState(node, nodes[node.id] ?? {});
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (options.keep) await (await editorCommands()).keepRun(graph, result, trigger, options.graphPath, before);
  return result.status === 'error' ? 1 : 0;
}

/**
 * Run *graph* repeatedly, *interval* seconds apart.
 *
 * Measured between the end of one run and the start of the next, not between
 * starts: a graph that takes longer than its interval would otherwise pile
 * runs on top of each other until something gives.
 *
 * One graph for every round, as a served tool's clock holds one: what a round
 * leaves in a data node is what the next starts from. Read again each round,
 * a counter counted to one for ever. And a round that could not even start is
 * said, and the next one is tried: the next may be fine.
 */
async function runEvery(graph: Graph, trigger: Trigger | null, options: CliOptions, core: GraphCore): Promise<number> {
  const seconds = options.every ?? 0;
  let code = 0;
  for (let round = 0; options.limit === undefined || round < options.limit; round += 1) {
    if (round > 0) {
      process.stderr.write(`\nWaiting ${seconds}s…\n`);
      await new Promise<void>((wake) => { after(seconds * 1000, wake); });
    }
    code = await runOnce(graph, trigger, options, core).catch((error: unknown) => {
      process.stderr.write(`\nThis run failed: ${messageOf(error)}\n`);
      return 1;
    });
  }
  return code;
}

/**
 * Serve the gui and wait.
 *
 * The gui is the one a bundle carries beside its graph (`web/`), else the
 * one this checkout built -- a project run with `--serve` has none of its own
 * -- and its absence is not an error: a graph with no interface, or a bundle
 * written without a build at hand, still serves its few endpoints, which is
 * enough for anything driving it over HTTP.
 *
 * Without `--port` it takes the first free port from 8000 up. A tool someone
 * was handed is started by double-clicking it, and "the port I chose happens
 * to be taken on your machine" is not a thing its recipient should ever have
 * to know about, let alone read a Node stack trace about.
 */
export async function runServer(options: CliOptions, given?: Product): Promise<number> {
  // The editor is loaded here and nowhere else: a package that does not carry it serves none.
  const product = given ?? (options.editor ? await editorProduct(resolve(options.editor)) : undefined);
  // The editor serves no graph of its own: the document being edited is handed
  // to the server (holdGraph), so a folder that happens to hold a graph.json is
  // not served unless it is named. A bundle is the other case, and there the
  // graph is right here. A graph that was named and is not there is a mistake to
  // say, not an empty server: `serve` says it, where it reads the graph.
  const hasGraph = options.graphNamed || (!product && existsSync(resolve(options.graphPath)));
  // Beside the project -- a bundle is one -- or beside a single graph file.
  const carried = resolve(projectFolderOf(options.graphPath) ?? dirname(resolve(options.graphPath)), WEB_DIR);
  const guiDir = !hasGraph ? undefined : existsSync(join(carried, 'gui.html')) ? carried : builtGui();

  // The editor opens, saves and runs code at any path, and keeps the keys, for
  // whoever reaches it, asking nobody who they are: beyond this machine that is
  // said out loud, not left to a flag typed in passing. A container opts in
  // (its loopback is its own); a tool the editor is not serving needs no opt-in.
  if (product && options.host && !isLoopbackHost(options.host) && process.env.TW_EDITOR_ON_NETWORK !== '1') {
    throw new Error(
      `The ${product.name} runs code, writes files and keeps keys for whoever reaches it, so it is not offered on ${options.host}.`
      + ' If this port cannot be reached by anyone else (a container published on 127.0.0.1), set TW_EDITOR_ON_NETWORK=1.',
    );
  }

  const start = (port: number) => serve({
    ...(hasGraph ? { graphPath: options.graphPath } : {}),
    guiDir,
    port,
    gui: guiPart,
    ...(product ? { editor: product.part } : {}),
    ...(options.host ? { host: options.host } : {}),
  });

  // A tool someone was handed must not die because a port is busy. The
  // default is 8000 because it has to be something, not because it matters:
  // nothing addresses this server from outside, the URL is printed and
  // opened, so the next free port does just as well. A port asked for by name
  // is different -- it was asked for -- and a busy one is said in a sentence
  // rather than as an unhandled 'error' event over a stack trace, which is
  // what a recipient running a bundle on a machine with anything on 8000 saw.
  const { url, loopback, shutdown } = await (async () => {
    if (options.port !== undefined) {
      try {
        return await start(options.port);
      } catch (error) {
        if (!portTaken(error)) throw error;
        throw new Error(
          `Port ${options.port} is already in use: something else on this machine is listening there.`
          + ' Start it on another one, for example --port 8010.',
        );
      }
    }
    const first = product?.port ?? DEFAULT_PORT;
    for (let port = first; port < first + PORTS_TRIED; port += 1) {
      try {
        return await start(port);
      } catch (error) {
        if (!portTaken(error)) throw error;
      }
    }
    // Rather than a silent 0: a machine with ten busy ports in a row is one
    // where "it picked another" would be a guess nobody can check.
    throw new Error(
      `Ports ${first} to ${first + PORTS_TRIED - 1} are all in use.`
      + ' Free one, or say which to use with --port.',
    );
  })();
  process.stderr.write(`Serving on ${url}\n`);
  if (!loopback) {
    const says = product ? 'run code, open and save files and use the keys' : 'run this tool';
    const local = product ? 'Browsing, finding and opening files work' : 'Browsing the disk works';
    process.stderr.write(`Warning: bound to ${options.host}: anyone who can reach this port can ${says}. ${local} on this machine only.\n`);
  }
  // Only the editor: a deployed tool is configured by whoever runs it, and its
  // terminal is a log rather than something a person is sitting in front of.
  for (const line of await product?.setup?.() ?? []) process.stderr.write(`${line}\n`);
  // Opening a browser is for something a person starts -- a tool they were
  // handed, or the editor -- not for a helper another process started.
  if (hasGraph || product) await open(url);
  // The server holds the process open until someone asks it to stop. Then the
  // runs in flight are ended rather than abandoned, and the code is returned so
  // the process ends by itself (see main.ts). Should something still hold it
  // open after that, it is not something worth waiting for.
  const code = await untilStopped(shutdown);
  setTimeout(() => process.exit(code), 2000).unref();
  return code;
}

/** The editor as a product: its page and routes, and what it says of the model setup. Loaded when asked for, never otherwise. */
async function editorProduct(dist: string): Promise<Product> {
  return {
    part: (await import('../editor/host/routes.ts')).editorPart(dist),
    name: 'editor',
    setup: async () => (await import('../editor/runtime/settings.ts')).setupLines(),
  };
}

/** Show the tool, if this machine has something to show it in. */
async function open(url: string): Promise<void> {
  // For CI, a container, and a helper another process started: nothing to
  // open a browser in, and the attempt is only noise.
  if (process.env.TW_NO_BROWSER) return;
  const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  // A headless machine is a fine place to serve from; the URL is printed. A
  // missing opener is not thrown but said as an 'error' event, and unheard that
  // event ended the process -- a container's, which has no xdg-open, at start.
  spawn(command, args, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
}

/**
 * Be a graph core until stdin ends: the protocol of `backend/deployment/runtime/protocol.ts` on
 * stdin and stdout, for a host that runs its graphs in a process of their
 * own (`TW_CORE`). stdout is the protocol's from the first line, so
 * whatever would print to it goes to stderr.
 */
async function runCore(): Promise<number> {
  console.log = console.error;
  const { localCore } = await import('../deployment/runtime/localCore.ts');
  const { serveCore } = await import('../deployment/runtime/stdio.ts');
  await serveCore(localCore(), process.stdin, process.stdout);
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  if (argv[0] === 'core') return runCore();
  if (argv[0] === 'check') return (await editorCommands()).runCheck(argv.slice(1));
  if (argv[0] === 'test') return withCore(async (core) => (await editorCommands()).runTests(core, argv.slice(1)));
  if (argv[0] === 'run-node') return withCore(async (core) => (await editorCommands()).runNode(core, argv.slice(1)));
  const options = parseArgs(argv);
  // First, and needing no graph: nothing below may get the chance to write a
  // line to stdout, which from here on belongs to the protocol.
  if (options.mcp) return (await editorCommands()).runMcp(options.mcpRoot || undefined);
  if (options.bundle) return (await editorCommands()).makeBundle(options.graphPath, options.bundle);
  if (options.serve || options.editor) return runServer(options);
  const graph = await loadGraph(options.graphPath);
  // The graph's own clock, when the command line names none: a graph saved as
  // "every 5 minutes" is that on any machine, not only where someone remembers
  // the flag. `--every` still wins, which is how one run is made of it.
  if (!options.every) {
    // Its shortest interval: on the command line a round is the whole graph,
    // every start point counted as started, so one clock is all there is to keep.
    const intervals = graphTriggers(graph, registry).filter((trigger) => trigger.every).map((trigger) => parseInterval(trigger.every));
    if (intervals.length) options.every = Math.min(...intervals);
  }
  // An event by name, sent the values once, however many rounds follow: its
  // start point's package. A run of the whole graph is sent nothing.
  const trigger = sendFromOutside(graph, options.event, options.values, registry);
  if (options.keep && options.every) throw new Error('--keep keeps one round: run it without --every.');
  return withCore((core) => (options.every ? runEvery(graph, trigger, options, core) : runOnce(graph, trigger, options, core)));
}

/** *work* with the graph core this command runs graphs with, let go once it is done: a core of its own process ends. */
async function withCore<T>(work: (core: GraphCore) => Promise<T>): Promise<T> {
  const core = chosenCore();
  try {
    return await work(core);
  } finally {
    await core.close();
  }
}

/**
 * The commands only the editor has -- check, test, run-node, --keep, --bundle, --mcp --
 * loaded when one is asked for. A package leaves the editor behind, and says so then.
 */
async function editorCommands(): Promise<typeof import('../editor/host/commands.ts')> {
  try {
    return await import('../editor/host/commands.ts');
  } catch (error) {
    if ((error as { code?: string })?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    throw new Error('This copy of Tell & Wire has no editor: check, test, run-node, --keep, --bundle and --mcp are the editor\'s, and a package does not carry it.');
  }
}
