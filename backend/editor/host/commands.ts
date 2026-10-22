// The commands only the editor has: what is wrong with a graph, its nodes' examples and kept rounds as tests,
// one node by itself, a package written, an MCP server for an assistant.
//
// Loaded by `backend/cli/cli.ts` with a dynamic import when one of them is asked for, and never
// otherwise: a package does not carry this file, so it cannot be asked for one by mistake.

import type { Graph, ExecutionResult } from '../../../graph/graph.ts';
import { registry } from '../../../graph/nodes/registry.ts';
import { nodeName } from '../../../graph/order.ts';
import type { Trigger } from '../../../graph/triggers.ts';
import type { GraphCore } from '../../deployment/runtime/protocol.ts';
import { frontendOf, loadGraph, projectFolderOf } from '../../deployment/project/folder.ts';
import { keptRound, replayKeptRounds, writeKeptRound, TESTS_DIR } from '../project/keptRounds.ts';
import { checkPath } from '../project/folderCheck.ts';
import { writeBundle } from '../project/deploy/bundle.ts';
import { builtGui } from '../../deployment/project/layout.ts';
import { runMcpServer } from '../assistant/server.ts';

/**
 * Keep a round that ran through as a test of the project it came from: `tests/<name>.json`, which `test` runs again
 * asking no model. `before` is where the memory stood when the round began (`memoryState`).
 */
export async function keepRun(
  graph: Graph,
  result: ExecutionResult,
  trigger: Trigger | null,
  graphPath: string,
  before: Parameters<typeof keptRound>[4],
): Promise<void> {
  const folder = projectFolderOf(graphPath);
  if (!folder) throw new Error('--keep keeps a round in a project\'s tests/ folder, and this graph is no project folder.');
  if (result.status !== 'success') throw new Error('Only a round that ran through is kept as a test: this one did not.');
  const kept = keptRound(graph, result, trigger ? { event: trigger.node_id, by: 'call' } : null, registry, before);
  process.stderr.write(`Kept as ${TESTS_DIR}/${await writeKeptRound(folder, kept)}.json -- the test command runs it again, asking no model.\n`);
}

/** Write the graph and the code that runs it somewhere someone else can run them. */
export async function makeBundle(graphPath: string, target: string): Promise<number> {
  const graph = await loadGraph(graphPath);
  // A bundle without the built gui still runs once on the terminal; with it,
  // the recipient gets the tool they were shown.
  const written = await writeBundle(graph, target, { guiDir: builtGui(), frontend: frontendOf(graphPath) });
  process.stderr.write(
    `Wrote ${written.length} files to ${target}\n`
    + 'Run it there with:  ./run.sh    (run.cmd on Windows)\n',
  );
  return 0;
}

/** Be an MCP server until the client hangs up. */
export async function runMcp(root: string | undefined): Promise<number> {
  await runMcpServer(root);
  return 0;
}

/**
 * Say what is wrong with each graph or project, without running anything.
 * The result on stdout, one problem per paragraph; exit code 1 when there is
 * any, so a CI job fails on a broken graph before anyone opens it.
 */
export async function runCheck(paths: string[]): Promise<number> {
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
 * Run every code and ai node once on the example in its input_example.js and hold
 * what comes out to its output.js -- or one node, with `--node`. `--offline`
 * asks no model: an ai node is skipped, which is how CI runs it. Exit code 1
 * when one fails.
 */
export async function runTests(core: GraphCore, argv: string[]): Promise<number> {
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
    if (!tested && !kept.length) process.stdout.write(`· ${path}: ${only ? `no node "${only}"` : 'no node has an example in an input_example.js, and no round is kept'}\n`);
  }
  return failed ? 1 : 0;
}

/**
 * Run one node by itself and print what it returned: on the inputs given as
 * JSON, as a run hands them to it -- files read, a list fanned out -- or,
 * without them, a code or an ai node once on the example in its input_example.js,
 * held to its output.js: what its ▶ Try runs, with no editor anywhere. A node
 * of another kind has no example, and runs on what the nodes feeding it
 * produce, as the MCP server's `run_node` runs it.
 */
export async function runNode(core: GraphCore, [path, nodeId, given]: string[]): Promise<number> {
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
    process.stderr.write(`${nodeName(node)}, on the example in its input_example.js\n`);
    const tried = await core.example({ graph, node: nodeId });
    process.stdout.write(`${JSON.stringify(tried, null, 2)}\n`);
    return tried.status === 'pass' ? 0 : 1;
  }
  const { result } = await core.node({ graph, node: nodeId, inputs: JSON.parse(given) as Record<string, unknown> });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.status === 'error' ? 1 : 0;
}

