// Running a graph from a command line.
//
//     node backend/app/main.ts graph.json                     once
//     node backend/app/main.ts my_project/                    the same, for a project folder
//     node backend/app/main.ts check my_project/ other.json   what is wrong, without running
//     node backend/app/main.ts test my_project/ --offline     each node on its input.js, held to its output.js
//     node backend/app/main.ts run-node my_project/ count     one node, on its input.js (or '{"input": …}')
//     node backend/app/main.ts graph.json --event go          the round one start point starts
//     node backend/app/main.ts graph.json --event go --value name=text   ...sent a value, by name
//     node backend/app/main.ts my_project/ --event go --keep  ...and keep the round as a test, in tests/
//     node backend/app/main.ts graph.json --every 5m           again, after each run
//     node backend/app/main.ts graph.json --bundle ./out       hand it to someone else
//     node backend/app/main.ts graph.json --serve             open its page in a browser
//     node backend/app/main.ts --editor frontend/dist   the editor itself, on :8000
//     node backend/app/main.ts --mcp --mcp-root ./project     graph tools for an assistant, on stdio
//
// The same entry point a bundle uses, so what someone receives is the thing
// that was tested rather than a second launcher written for them.
//
// One rule about the two streams: **stdout is the result and nothing else.** Progress and errors go to
// stderr, so `run graph.json | jq` works.

import type { Graph } from '../../../graph/graph.ts';
import { frontendOf, loadGraph, projectFolderOf } from '../project/folder.ts';
import { keptRound, replayKeptRounds, writeKeptRound, TESTS_DIR } from '../project/keptRounds.ts';
import { checkPath } from '../project/folderCheck.ts';
import { nodeName } from '../../../graph/execution/order.ts';
import { chosenCore } from '../../../graph/core/stdio.ts';
import type { GraphCore } from '../../../graph/core/protocol.ts';
import { registry } from '../../../graph/nodes/registry.ts';
import { nodeRuntime } from '../../../graph/core/node.ts';
import { installFolder } from '../../../graph/ai/settings.ts';
import { memoryState, sendFromOutside } from '../../gui-editor/graphInterface.ts';
import { startFromPage } from '../../gui-editor/widgets/page.ts';
import { builtPage, WEB_DIR, writeBundle } from './bundle.ts';
import { isLoopbackHost, portTaken, serve } from '../serve.ts';
import { untilStopped } from '../lifecycle.ts';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { after, graphTriggers, parseInterval, type Trigger } from '../../../graph/execution/triggers.ts';

export interface CliOptions {
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
  /** Serve this graph's page instead of running it once. */
  serve?: boolean;
  /** Serve the built editor from this folder. */
  editor?: string;
  /** Bind address. Loopback unless said otherwise; `local` routes (`api.ts`) are off for any other. */
  host?: string;
  port?: number;
  /** Be an MCP server on stdio instead of running anything: see `backend/graph-editor/mcpServer.ts`. */
  mcp?: boolean;
  /** The one folder that server may touch. Where it was started, unless said otherwise. */
  mcpRoot?: string;
}

/** Where a served tool looks first. Nothing addresses it from outside, so this is a habit, not a contract. */
const DEFAULT_PORT = 8000;
/** How many in a row to try before a busy machine is the user's problem to sort out. */
const PORTS_TRIED = 10;

/** *values* with *value* put at the dotted *name*: `file.content` inside `file`. */
function put(values: Record<string, unknown>, name: string, value: string): void {
  const keys = name.split('.');
  let inner = values;
  for (const key of keys.slice(0, -1)) {
    if (!inner[key] || typeof inner[key] !== 'object') inner[key] = {};
    inner = inner[key] as Record<string, unknown>;
  }
  inner[keys[keys.length - 1]] = value;
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
  // A run of everything starts the page's start points on what the page holds.
  if (!trigger) await startFromPage(graph, nodeRuntime(), registry);
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
  if (options.keep) {
    const folder = projectFolderOf(options.graphPath);
    if (!folder) throw new Error('--keep keeps a round in a project\'s tests/ folder, and this graph is no project folder.');
    if (result.status !== 'success') throw new Error('Only a round that ran through is kept as a test: this one did not.');
    const kept = keptRound(graph, result, trigger ? { event: trigger.node_id, by: 'call' } : null, registry, before);
    process.stderr.write(`Kept as ${TESTS_DIR}/${await writeKeptRound(folder, kept)}.json -- the test command runs it again, asking no model.\n`);
  }
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
      process.stderr.write(`\nThis run failed: ${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    });
  }
  return code;
}

/** Write the graph and the code that runs it somewhere someone else can run them. */
async function makeBundle(options: CliOptions): Promise<number> {
  const graph = await loadGraph(options.graphPath);
  // A bundle without the built page still runs once on the terminal; with it,
  // the recipient gets the tool they were shown.
  const written = await writeBundle(graph, options.bundle!, { pageDir: builtPage(), frontend: frontendOf(options.graphPath) });
  process.stderr.write(
    `Wrote ${written.length} files to ${options.bundle}
`
    + `Run it there with:  ./run.sh    (run.cmd on Windows)
`,
  );
  return 0;
}

/**
 * Serve the page and wait.
 *
 * The page is the one a bundle carries beside its graph (`web/`), else the
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
async function runServer(options: CliOptions): Promise<number> {
  // No graph file is a legitimate way to run this: the editor hands the server
  // the document being edited (holdGraph), and serves one only when it is named --
  // started in a folder that happened to hold a graph.json, it shipped that
  // one and kept its clock. A bundle is the other case, and there the graph is
  // right here. A graph that was named and is not there is a mistake to say,
  // not an empty server: `serve` says it, where it reads the graph.
  const hasGraph = options.graphNamed || (!options.editor && existsSync(resolve(options.graphPath)));
  // Beside the project -- a bundle is one -- or beside a single graph file.
  const carried = resolve(projectFolderOf(options.graphPath) ?? dirname(resolve(options.graphPath)), WEB_DIR);
  const pageDir = !hasGraph ? undefined : existsSync(join(carried, 'runtime.html')) ? carried : builtPage();

  // The editor opens, saves and runs code at any path, and keeps the keys, for
  // whoever reaches it, asking nobody who they are: beyond this machine that is
  // said out loud, not left to a flag typed in passing. A container opts in
  // (its loopback is its own); a tool the editor is not serving needs no opt-in.
  if (options.editor && options.host && !isLoopbackHost(options.host) && !process.env.TW_EDITOR_ON_NETWORK) {
    throw new Error(
      `The editor runs code, writes files and keeps keys for whoever reaches it, so it is not offered on ${options.host}.`
      + ' If this port cannot be reached by anyone else (a container published on 127.0.0.1), set TW_EDITOR_ON_NETWORK=1.',
    );
  }

  const start = (port: number) => serve({
    ...(hasGraph ? { graphPath: options.graphPath } : {}),
    pageDir,
    port,
    ...(options.editor ? { editor: { dist: resolve(options.editor) } } : {}),
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
    for (let port = DEFAULT_PORT; port < DEFAULT_PORT + PORTS_TRIED; port += 1) {
      try {
        return await start(port);
      } catch (error) {
        if (!portTaken(error)) throw error;
      }
    }
    // Rather than a silent 0: a machine with ten busy ports in a row is one
    // where "it picked another" would be a guess nobody can check.
    throw new Error(
      `Ports ${DEFAULT_PORT} to ${DEFAULT_PORT + PORTS_TRIED - 1} are all in use.`
      + ' Free one, or say which to use with --port.',
    );
  })();
  process.stderr.write(`Serving on ${url}\n`);
  if (!loopback) {
    const says = options.editor ? 'run code, open and save files and use the keys' : 'run this tool';
    const local = options.editor ? 'Browsing, finding and opening files work' : 'Browsing the disk works';
    process.stderr.write(`Warning: bound to ${options.host}: anyone who can reach this port can ${says}. ${local} on this machine only.\n`);
  }
  // Only the editor: a deployed tool is configured by whoever runs it, and its
  // terminal is a log rather than something a person is sitting in front of.
  if (options.editor) {
    // Imported here for the reason `runMcp` gives: a bundle has no `graph-editor/`.
    const { setupLines } = await import('../../graph-editor/settings.ts');
    for (const line of await setupLines()) process.stderr.write(`${line}\n`);
  }
  // Opening a browser is for something a person starts -- a tool they were
  // handed, or the editor -- not for a helper another process started.
  if (hasGraph || options.editor) await open(url);
  // The server holds the process open until someone asks it to stop. Then the
  // runs in flight are ended rather than abandoned, and the code is returned so
  // the process ends by itself (see main.ts). Should something still hold it
  // open after that, it is not something worth waiting for.
  const code = await untilStopped(shutdown);
  setTimeout(() => process.exit(code), 2000).unref();
  return code;
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
 * Be an MCP server until the client hangs up.
 *
 * Imported here and not at the top: the server is authoring, it lives under
 * `graph-editor/`, and a bundle leaves that folder behind. A static import
 * would make each bundle fail on a file it was never meant to have.
 */
async function runMcp(options: CliOptions): Promise<number> {
  let server: typeof import('../../graph-editor/mcpServer.ts');
  try {
    server = await import('../../graph-editor/mcpServer.ts');
  } catch (error) {
    if ((error as { code?: string })?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    throw new Error('This copy of Tell & Wire has no MCP server: it is part of the editor, which a bundle does not carry.');
  }
  await server.runMcpServer({ root: options.mcpRoot || undefined });
  return 0;
}

/**
 * Say what is wrong with each graph or project, without running anything.
 * The result on stdout, one problem per paragraph; exit code 1 when there is
 * any, so a CI job fails on a broken graph before anyone opens it.
 */
async function runCheck(paths: string[]): Promise<number> {
  let failed = 0;
  for (const path of paths.length ? paths : ['.']) {
    const { problems, graph } = await checkPath(path);
    if (!problems.length) {
      process.stdout.write(`✓ ${path}: ${graph!.nodes.length} nodes, ${graph!.edges.length} edges\n`);
    } else {
      failed += 1;
      process.stdout.write(`✗ ${path}: ${problems.length} problem${problems.length === 1 ? '' : 's'}\n`);
      for (const { where, problem, fix } of problems) process.stdout.write(`  ${where}: ${problem}\n    → ${fix}\n`);
    }
  }
  return failed ? 1 : 0;
}

/**
 * Run every code and ai node once on the example in its input.js and hold
 * what comes out to its output.js -- or one node, with `--node`. `--offline`
 * asks no model: an ai node is skipped, which is how CI runs it. Exit code 1
 * when one fails.
 */
async function runTests(core: GraphCore, argv: string[]): Promise<number> {
  const offline = argv.includes('--offline');
  const only = argv.includes('--node') ? argv[argv.indexOf('--node') + 1] : '';
  const paths = argv.filter((arg, index) => !arg.startsWith('--') && argv[index - 1] !== '--node');
  let failed = 0;
  for (const path of paths.length ? paths : ['.']) {
    // Every depth: the graph a node holds is part of this project (`testGraph`).
    const { tested, results } = await core.test({ graph: await loadGraph(path), offline, only });
    for (const { inside, nodeId, result } of results) {
      const mark = { pass: '✓', fail: '✗', error: '✗', skipped: '·' }[result.status];
      // A failure not held to its output.js is one whose output.js cannot be read: the line under it says why.
      const said = {
        skipped: ' (skipped)', pass: result.held ? ': fits its output.js' : ': runs',
        fail: result.held ? ': does not fit its output.js' : ': is held to no output.js', error: ': fails',
      }[result.status];
      process.stdout.write(`${mark} ${path} ${inside}${nodeId}${said}\n`);
      for (const line of result.details) process.stdout.write(`    ${line}\n`);
      if (result.status === 'fail' || result.status === 'error') failed += 1;
    }
    // The rounds the project kept, run again with nothing asked of a model.
    const folder = only ? null : projectFolderOf(path);
    const kept = folder ? await replayKeptRounds(folder, () => loadGraph(path), { core, registry }) : [];
    for (const { name, status, details } of kept) {
      const said = { pass: ': hands back what it did', fail: ': hands back otherwise', error: ': cannot be run' }[status];
      process.stdout.write(`${status === 'pass' ? '✓' : '✗'} ${path} ${TESTS_DIR}/${name}${said}\n`);
      for (const line of details) if (line) process.stdout.write(`    ${line}\n`);
      if (status !== 'pass') failed += 1;
    }
    if (!tested && !kept.length) process.stdout.write(`· ${path}: ${only ? `no node "${only}"` : 'no node has an example in an input.js, and no round is kept'}\n`);
  }
  return failed ? 1 : 0;
}

/**
 * Run one node by itself and print what it returned: on the inputs given as
 * JSON, as a run hands them to it -- files read, a list fanned out -- or,
 * without them, a code or an ai node once on the example in its input.js,
 * held to its output.js: what its ▶ Try runs, with no editor anywhere. A node
 * of another kind has no example, and runs on what the nodes feeding it
 * produce, as the MCP server's `run_node` runs it.
 */
async function runNode(core: GraphCore, [path, nodeId, given]: string[]): Promise<number> {
  if (!path || !nodeId) throw new Error('Usage: run-node <graph or project> <node id> [\'{"port": value}\']');
  const graph = await loadGraph(path);
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`There is no node "${nodeId}" in ${path}. Its nodes are: ${graph.nodes.map((one) => one.id).join(', ')}.`);
  if (!given && registry.node(node.node_type)?.definitions(node) === undefined) {
    process.stderr.write(`${nodeName(node)}, on what the nodes feeding it produce\n`);
    const { result } = await core.node({ graph, node: nodeId });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.status === 'error' ? 1 : 0;
  }
  if (!given) {
    process.stderr.write(`${nodeName(node)}, on the example in its input.js\n`);
    const tried = await core.example({ graph, node: nodeId });
    process.stdout.write(`${JSON.stringify(tried, null, 2)}\n`);
    return tried.status === 'pass' ? 0 : 1;
  }
  const { result } = await core.node({ graph, node: nodeId, inputs: JSON.parse(given) as Record<string, unknown> });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.status === 'error' ? 1 : 0;
}

/**
 * Be a graph core until stdin ends: the protocol of `core/protocol.ts` on
 * stdin and stdout, for a wrapper that runs its graphs in a process of their
 * own (`TW_CORE`). stdout is the protocol's from the first line, so
 * whatever would print to it goes to stderr.
 */
async function runCore(): Promise<number> {
  console.log = console.error;
  const { localCore } = await import('../../../graph/core/localCore.ts');
  const { serveCore } = await import('../../../graph/core/stdio.ts');
  await serveCore(localCore(), process.stdin, process.stdout);
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  if (argv[0] === 'core') return runCore();
  if (argv[0] === 'check') return runCheck(argv.slice(1));
  if (argv[0] === 'test') return withCore((core) => runTests(core, argv.slice(1)));
  if (argv[0] === 'run-node') return withCore((core) => runNode(core, argv.slice(1)));
  const options = parseArgs(argv);
  // First, and needing no graph: nothing below may get the chance to write a
  // line to stdout, which from here on belongs to the protocol.
  if (options.mcp) return runMcp(options);
  if (options.bundle) return makeBundle(options);
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
