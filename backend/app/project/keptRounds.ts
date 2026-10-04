// A round kept as a test: what it was started with and what it handed back,
// run again without asking a model.
//
// A round that did what it should is the best test a graph can have -- real
// input, real wiring, a real answer -- and it is already there, in the run's
// result, when it ends. Kept, it is a file in the project's `tests/` folder;
// run again (`test`, the MCP server's `test_graph`, CI), the nodes whose
// outcome came from outside the graph or from before it are handed what they
// made then instead of being run: a start point's package, what a model
// answered, what memory held, what stood still. Everything else -- the code,
// the wiring, which part of a package an input takes, what reaches an end
// point -- runs again, and what the end points hand back must be what they
// handed back then.
//
// So a kept round asks no model and needs no key: it is offline by what it
// is. A node that would ask one, because the graph changed since and it was
// not asked then, fails it -- the round is not the one that was kept.

import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ExecutionResult, Graph } from '../../../graph/graph.ts';
import type { Runners } from '../../../graph/nodes/NodeRunner.ts';
import type { GraphCore } from '../../../graph/core/protocol.ts';
import { eventOf, outputsOf } from '../../gui-editor/graphInterface.ts';

/** Where a project keeps its rounds: `tests/<name>.json`, beside `flow.json`. */
export const TESTS_DIR = 'tests';

/** A round, kept: what began it, what was handed in, and what it handed back. */
export interface KeptRound {
  /** The start point it began at, by name -- none: a round of the whole graph. */
  event: string | null;
  /** Who sent what began it: a block of the page by its id, or one of `SENDERS`. Said, for whoever reads the file. */
  by?: string;
  /**
   * What these nodes made in it, by node id: handed in again instead of run.
   * Its start points' packages, what its models answered, what its memory
   * held, and what stood still with what it made before.
   */
  given: Record<string, Record<string, unknown>>;
  /** What it handed back, by end point name: what running it again must hand back. */
  outputs: Record<string, unknown>;
}

/** How a kept round did when it was run again. */
export interface ReplayedRound {
  /** `pass`: it handed back what it did; `fail`: it handed back otherwise; `error`: it could not be run. */
  status: 'pass' | 'fail' | 'error';
  details: string[];
  outputs: Record<string, unknown>;
}

/**
 * *result*, a round that ran to its end, kept: *started* says what began it.
 * A node is handed in when what it made did not come from the graph alone --
 * a start point, a node that asks a model, memory -- or it stood still, with
 * what it made before.
 */
export function keptRound(graph: Graph, result: ExecutionResult, started: { event: string; by: string } | null, registry: Runners): KeptRound {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const given: KeptRound['given'] = {};
  for (const ran of result.node_results) {
    const node = byId.get(ran.node_id);
    const element = node && registry.node(node.node_type);
    if (!node || !element) continue;
    const outside = element.takesPackage || element.isMemory || element.asksModel(node) || ran.held === true;
    if (outside && (ran.status === 'success' || ran.status === 'partial' || ran.held)) given[node.id] = ran.outputs;
  }
  return {
    event: started?.event ?? null,
    ...(started ? { by: started.by } : {}),
    given,
    outputs: outputsOf(graph, result, registry),
  };
}

/** *value*, said short: what a detail shows of what came back. */
const brief = (value: unknown): string => {
  const said = JSON.stringify(value) ?? 'nothing';
  return said.length > 200 ? `${said.slice(0, 200)}…` : said;
};

/**
 * Run *kept* again on *graph*: its event, with what it handed in, and no
 * model asked -- a node that would ask one fails the round -- and hold what
 * the end points hand back to what they handed back then.
 */
export async function replayRound(graph: Graph, kept: KeptRound, options: { core: GraphCore; registry: Runners }): Promise<ReplayedRound> {
  let result: ExecutionResult;
  try {
    const trigger = eventOf(graph, kept.event, options.registry);
    ({ result } = await options.core.round({ graph, trigger, given: kept.given, offline: true }));
  } catch (error) {
    return { status: 'error', details: [error instanceof Error ? error.message : String(error)], outputs: {} };
  }
  const outputs = outputsOf(graph, result, options.registry);
  if (result.status === 'error' || result.status === 'cancelled') {
    return { status: 'error', details: [result.error ?? 'It did not run through.'], outputs };
  }
  const details: string[] = [];
  for (const [name, expected] of Object.entries(kept.outputs)) {
    if (!(name in outputs)) details.push(`"${name}" handed back nothing; the kept round, ${brief(expected)}.`);
    else if (JSON.stringify(outputs[name]) !== JSON.stringify(expected)) {
      details.push(`"${name}" handed back ${brief(outputs[name])}; the kept round, ${brief(expected)}.`);
    }
  }
  for (const name of Object.keys(outputs)) {
    if (!(name in kept.outputs)) details.push(`"${name}" handed back ${brief(outputs[name])}, which the kept round did not.`);
  }
  if (result.error) details.unshift(result.error);
  return { status: details.length ? 'fail' : 'pass', details, outputs };
}

/** The rounds kept in the project *folder*, by name -- none, where it keeps none. A file that cannot be read is said, under its name. */
export async function readKeptRounds(folder: string): Promise<{ name: string; round: KeptRound | null; problem?: string }[]> {
  const dir = join(folder, TESTS_DIR);
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((file) => file.endsWith('.json')).sort();
  return Promise.all(files.map(async (file) => {
    const name = file.slice(0, -'.json'.length);
    try {
      const read = JSON.parse(await readFile(join(dir, file), 'utf8')) as KeptRound;
      if (!read || typeof read !== 'object' || typeof read.given !== 'object' || typeof read.outputs !== 'object') {
        return { name, round: null, problem: 'It is not a kept round: it needs "event", "given" and "outputs".' };
      }
      return { name, round: { ...read, event: read.event ?? null } };
    } catch (error) {
      return { name, round: null, problem: `It cannot be read: ${error instanceof Error ? error.message : String(error)}` };
    }
  }));
}

/** How one kept round did when it was run again, by its name. */
export interface ReplayedKept {
  name: string;
  status: ReplayedRound['status'];
  details: string[];
}

/**
 * Every round the project *folder* kept, run again one after another, each on
 * the graph *graph* hands it. One that cannot be read is an `error` that says
 * why.
 */
export async function replayKeptRounds(
  folder: string,
  graph: () => Graph | Promise<Graph>,
  options: { core: GraphCore; registry: Runners },
): Promise<ReplayedKept[]> {
  const replayed: ReplayedKept[] = [];
  for (const { name, round, problem } of await readKeptRounds(folder)) {
    const ran = round ? await replayRound(await graph(), round, options) : null;
    replayed.push({ name, status: ran?.status ?? 'error', details: ran?.details ?? [problem ?? ''] });
  }
  return replayed;
}

/** Keep *round* in the project *folder*, under a name of its event's that no kept round has yet: `send-1`, `send-2`. Returns the name. */
export async function writeKeptRound(folder: string, round: KeptRound): Promise<string> {
  const dir = join(folder, TESTS_DIR);
  await mkdir(dir, { recursive: true });
  const stem = round.event ?? 'whole';
  let name = '';
  for (let n = 1; !name || existsSync(join(dir, `${name}.json`)); n += 1) name = `${stem}-${n}`;
  await writeFile(join(dir, `${name}.json`), `${JSON.stringify(round, null, 2)}\n`);
  return name;
}
