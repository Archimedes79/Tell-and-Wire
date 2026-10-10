// The nine tools, over one folder: what each does, and nothing of how it is reached.
//
// What a tool may touch and say is `confine.ts`; what it says of itself, `spec.ts`;
// how a client calls it, `transport.ts`.

import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import type { AiService, Runtime, ToolSpec } from '../../../graph/nodes/Runtime.ts';
import { parseGraph, type Graph } from '../../../graph/graph.ts';
import { names } from '../../../graph/execution/wiring.ts';
import { everyGraphIn } from '../../../graph/authoring/examples.ts';
import { localCore } from '../../../graph/core/localCore.ts';
import type { GraphCore } from '../../../graph/core/protocol.ts';
import { replayKeptRounds, TESTS_DIR } from '../../app/project/keptRounds.ts';
import type { Trigger } from '../../../graph/execution/triggers.ts';
import { registry } from '../../../graph/nodes/registry.ts';
import { NotOffered, interfaceOf, outputsOf, sendFromOutside } from '../../gui-editor/graphInterface.ts';
import { startFromPage } from '../../gui-editor/widgets/page.ts';
import { message } from '../../app/http.ts';
import { clip } from '../brief.ts';
import { generateGraph } from '../generate.ts';
import { AUTHORING_KEYS, withoutAuthoring } from '../../../graph/authoring/handedOn.ts';
import {
  FLOW_FILE, FileChanged, LAYOUT_FILE, NODES_DIR, NODES_FILE, PAGE_FILE, STATE_FILE, isProjectFolder, loadGraph as loadProject, looksLikeGraph, nestedGraphs,
  projectFolderOf, projectTexts, readStructure, saveGraph as saveToDisk, type Guard,
} from '../../app/project/folder.ts';
import { problemsIn, type Problem } from '../../app/project/check.ts';
import { folderProblems } from '../../app/project/folderCheck.ts';
import { BadDocument, Refused, SKIPPED_FOLDERS, confinement, scrubber } from './confine.ts';
import { ERROR_LIMIT, MAX_DESCRIPTION_CHARS, MAX_GRAPH_BYTES, SPECS, VALUE_LIMIT, authoringGuide } from './spec.ts';

export type { Problem };

const LIST_DEPTH = 4;
const LIST_LIMIT = 200;
/** How many `.json` files a listing opens before it stops looking. */
const LIST_EXAMINED = 1_000;

export interface GraphToolsOptions {
  /** The one folder the tools may touch. */
  root: string;
  /** The model `generate_graph` asks. */
  ai: AiService;
  /** What a run runs on; asked for per run, so a settings change is picked up. */
  runtime: () => Runtime;
  /** What runs graphs, one per call; the JavaScript core on *runtime* when none is said (`runMcpServer` says `chosenCore`). */
  core?: () => GraphCore;
  /** Which model generation uses. Empty provider or model means none is configured. */
  target: () => Promise<{ provider: string; model: string }>;
  /** Strings that must never appear in a result, whatever produced it. */
  secrets?: () => string[];
}

export interface ToolResult {
  text: string;
  isError?: boolean;
}

export interface GraphTools {
  specs: ToolSpec[];
  /** Never throws: a failure is a result with `isError`, because it is a turn in a conversation. */
  call(name: string, args: Record<string, unknown>): Promise<ToolResult>;
}

const briefAll = (values: Record<string, unknown> | undefined): Record<string, unknown> =>
  Object.fromEntries(Object.entries(values ?? {}).map(([key, value]) => [key, clip(value, VALUE_LIMIT)]));

const json = (value: unknown): string => JSON.stringify(value, null, 2);

/**
 * *graph* with what it says nothing of put back from *kept*, the graph it is to
 * replace: each node's history and the files ✨ was given (`AUTHORING_KEYS`), by node
 * id, in the graphs nodes hold too. A document written by a model has none of them, and
 * a save would delete them.
 */
function withAuthoringOf(graph: Graph, kept: Graph): Graph {
  const before = new Map(kept.nodes.map((node) => [node.id, node]));
  const copy = JSON.parse(JSON.stringify(graph)) as Graph;
  for (const node of copy.nodes) {
    const was = before.get(node.id);
    if (!was) continue;
    const config = node.config as Record<string, unknown>;
    for (const key of AUTHORING_KEYS) if (config[key] === undefined && was.config[key] !== undefined) config[key] = was.config[key];
    const element = registry.node(node.node_type);
    const inside = element?.nestedGraph(node);
    const wasInside = registry.node(was.node_type)?.nestedGraph(was);
    if (inside && wasInside) element!.setNestedGraph(node, withAuthoringOf(inside, wasInside));
  }
  return copy;
}

/**
 * What the project in *folder* keeps only for writing it -- each node's history and the
 * files ✨ was given (`AUTHORING_KEYS`) -- in the graphs nodes hold too. Read without being
 * *read*: `loadProject` records every file as seen, and a save would then find nothing
 * changed since.
 */
async function authoringOf(folder: string, guard: Guard): Promise<Graph> {
  const { graph } = await readStructure(folder, guard);
  for (const text of projectTexts(graph)) {
    const path = join(folder, text.path);
    if (!text.node_id || !(AUTHORING_KEYS as readonly string[]).includes(text.field) || !existsSync(path)) continue;
    await guard(path);
    // As `readProject` reads a text with no footer: one newline was added on the way out.
    text.holder[text.field] = (await readFile(path, 'utf8')).replace(/\r\n/g, '\n').replace(/\n$/, '');
  }
  for (const nested of nestedGraphs(graph)) {
    const inside = join(folder, nested.folder);
    if (isProjectFolder(inside)) registry.node(nested.node.node_type)?.setNestedGraph(nested.node, await authoringOf(inside, guard));
  }
  return graph;
}

/**
 * The nine tools, over one folder.
 *
 * Everything a tool needs from the machine arrives in *options*; nothing here
 * reads the environment, the settings file or the process. That is what makes
 * the confinement testable: the rules of `confine.ts` are this function's, and a
 * test can hold the rest of the world still.
 */
export function createGraphTools(options: GraphToolsOptions): GraphTools {
  /** *work* with a graph core of its own, let go once it is done: a core of its own process ends. */
  const withCore = async <T>(work: (core: GraphCore) => Promise<T>): Promise<T> => {
    const core = options.core?.() ?? localCore({ runtime: () => options.runtime() });
    try {
      return await work(core);
    } finally {
      await core.close();
    }
  };
  const root = resolve(options.root);
  const { confine, insideRoot, shown } = confinement(root);
  const scrub = scrubber(options.secrets);

  /** A graph argument, bounded and parsed. */
  const graphFrom = (raw: unknown, argument: string): Graph => {
    if (!looksLikeGraph(raw)) {
      throw new BadDocument(`"${argument}" must be a graph document: an object with a "nodes" array and an "edges" array. authoring_guide shows the shape.`);
    }
    if (JSON.stringify(raw).length > MAX_GRAPH_BYTES) {
      throw new BadDocument(`"${argument}" is larger than ${MAX_GRAPH_BYTES / 1024 / 1024} MB. A graph holds wiring and code, not data: keep the data in a file, and have a node read it -- an input typed "file_path" is handed the file's text.`);
    }
    let graph: Graph;
    try {
      graph = parseGraph(raw);
    } catch (error) {
      throw new BadDocument(`"${argument}" is not a graph: ${message(error)}`);
    }
    // `parseGraph` is forgiving about shape on purpose; the code below it is
    // not, and "Cannot read properties of null" is not something a model can fix.
    for (const node of graph.nodes) {
      if (!Array.isArray(node.inputs) || !Array.isArray(node.outputs)) {
        throw new BadDocument(`Node "${node.id}" in "${argument}": "inputs" and "outputs" must be arrays of ports, even when empty.`);
      }
      if (!node.config || typeof node.config !== 'object' || Array.isArray(node.config)) {
        throw new BadDocument(`Node "${node.id}" in "${argument}": "config" must be an object.`);
      }
    }
    const blocks = graph.page?.blocks ?? [];
    if (blocks.some((block) => !block || typeof block !== 'object' || Array.isArray(block))) {
      throw new BadDocument(`The page in "${argument}": every entry of page.blocks must be a block object.`);
    }
    return graph;
  };

  /** A graph file's JSON, or the refusal -- including "that is JSON, but not a graph". */
  const readGraphFile = async (full: string, given: string): Promise<Graph> => {
    let text: string;
    try {
      if ((await stat(full)).size > MAX_GRAPH_BYTES) throw new BadDocument(`"${given}" is larger than ${MAX_GRAPH_BYTES / 1024 / 1024} MB, which no graph is.`);
      text = await readFile(full, 'utf8');
    } catch (error) {
      if (error instanceof Refused) throw error;
      throw new Refused(`There is no graph at "${given}". list_graphs shows what is saved.`);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      throw new BadDocument(`"${given}" is not valid JSON: ${message(error)}`);
    }
    if (!looksLikeGraph(raw)) throw new BadDocument(`"${given}" is JSON but not a graph: it has no "nodes" array.`);
    return graphFrom(raw, given);
  };

  /** A graph file, or a project -- its `flow.json` -- with everything in it read in from its files. */
  const loadGraph = async (given: unknown): Promise<{ graph: Graph; full: string }> => {
    const full = await confine(given, 'path');
    if (!projectFolderOf(full)) return { graph: await readGraphFile(full, String(given)), full };
    try {
      return { graph: await loadProject(full, insideRoot), full };
    } catch (error) {
      if (error instanceof Refused) throw error;
      throw new BadDocument(`"${String(given)}" could not be read as a project: ${message(error)}`);
    }
  };

  /**
   * Validate, then write. Returns the problems instead of writing when there
   * are any: a graph saved broken is a graph somebody opens later and blames
   * the editor for.
   */
  const saveGraph = async (given: unknown, argument: string, graph: Graph): Promise<{ saved?: string; problems: Problem[] }> => {
    const full = await confine(given, argument);
    const folder = projectFolderOf(full);
    /** The graph this save replaces, for what a document cannot carry. */
    let kept: Graph | undefined;
    // Rule 3. Looked at before anything is written, and by reading it: a name
    // says nothing about what a file is.
    if (existsSync(full) && !folder) {
      try {
        kept = await readGraphFile(full, String(given));
      } catch {
        throw new Refused(`"${String(given)}" already exists and is not a graph, so it is not overwritten. Choose another name.`);
      }
    }

    const problems = problemsIn(parseGraph(JSON.parse(JSON.stringify(graph))));
    if (problems.length) return { problems };

    // As the editor saves: into a project, the wiring to `flow.json` and each
    // node to its own folder; anywhere else, one file (`confine` lets only a
    // `.json` path through). The guard holds for the one file too. Over a graph that
    // is there, what the document says nothing of stays: the history and the files ✨ was
    // given are the project's. A file changed on disk since this process read the project is not
    // written over (`FileChanged`); the read for what stays is not that read (`authoringOf`).
    if (folder) kept = await authoringOf(folder, insideRoot);
    try {
      await saveToDisk(full, kept ? withAuthoringOf(graph, kept) : graph, insideRoot);
    } catch (error) {
      if (error instanceof FileChanged) {
        throw new Refused(`"${error.fileName}" of "${String(given)}" was changed on disk since this server last read the project, so nothing was written. `
          + 'describe_graph reads it again; then save.');
      }
      throw error;
    }
    return { saved: shown(full), problems };
  };

  const tools: Record<string, (args: Record<string, unknown>) => Promise<string>> = {
    async authoring_guide() {
      return authoringGuide();
    },

    async generate_graph(args) {
      const description = args.description;
      if (typeof description !== 'string' || !description.trim()) throw new Refused('"description" must say what the graph should do.');
      if (description.length > MAX_DESCRIPTION_CHARS) {
        throw new Refused(`"description" is ${description.length} characters; the limit is ${MAX_DESCRIPTION_CHARS}. Describe the graph, and leave the data it will read in a file.`);
      }
      // Before the model is asked, not after: a minute of generation that ends
      // in "you cannot save there" is a minute nobody gets back.
      if (args.save_as !== undefined) await confine(args.save_as, 'save_as');
      // The graph to change, as the editor's bar sends the one it holds: its
      // ids and what the change does not touch are kept, each node's history too.
      const current = args.path !== undefined ? (await loadGraph(args.path)).graph : undefined;

      const otherwise = 'The other way needs no model here: call authoring_guide, write the graph yourself, then validate_graph and save_graph.';
      const target = await options.target();
      if (!target.provider || !target.model) {
        throw new Refused(`No model is configured on this machine (⚙ Settings in the Tell & Wire editor, or TW_AI_PROVIDER and TW_AI_MODEL). ${otherwise}`);
      }

      let generated: { graph: unknown; explanation: string };
      try {
        generated = await generateGraph(description, { ai: options.ai, target }, current);
      } catch (error) {
        throw new Refused(`Generation with ${target.provider} / ${target.model} failed: ${message(error).slice(0, ERROR_LIMIT)}\n`
          + `If that model is not set up or not running, configure one in the Tell & Wire editor's Settings. ${otherwise}`);
      }

      const graph = graphFrom(generated.graph, 'the generated document');
      const report: Record<string, unknown> = { model: `${target.provider} / ${target.model}` };
      if (args.save_as !== undefined) {
        const { saved, problems } = await saveGraph(args.save_as, 'save_as', graph);
        Object.assign(report, saved
          ? { saved, problems }
          : { saved: false, why: 'The generated graph has problems, so it was not written. Fix them and hand the result to save_graph.', problems });
      } else {
        Object.assign(report, { problems: problemsIn(graph) });
      }
      // How each node was written stays in the project it is saved to: the caller is handed what runs.
      return json({ ...report, explanation: generated.explanation, graph: withoutAuthoring(graph) });
    },

    async validate_graph(args) {
      if ((args.graph === undefined) === (args.path === undefined)) {
        throw new Refused('Give exactly one of "graph" (the document itself) or "path" (a saved one).');
      }
      let graph: Graph;
      try {
        graph = args.path !== undefined ? (await loadGraph(args.path)).graph : graphFrom(args.graph, 'graph');
      } catch (error) {
        // A path that may not be opened is a refusal. A document that is not a
        // graph is an answer to the question that was asked -- told apart by
        // the class it was thrown as, not by what its message says.
        if (!(error instanceof BadDocument)) throw error;
        return json({ valid: false, problems: [{ where: 'graph', problem: error.message, fix: 'A graph is { "metadata": {...}, "nodes": [...], "edges": [...] }; authoring_guide shows a complete one.' }] });
      }
      const problems = problemsIn(graph);
      // A project also has its folder to be wrong about: files nothing reads, folders no node owns.
      if (args.path !== undefined) {
        const folder = projectFolderOf(await confine(args.path, 'path'));
        if (folder) problems.push(...await folderProblems(folder));
      }
      return json({ valid: problems.length === 0, problems });
    },

    async run_node(args) {
      const { graph } = await loadGraph(args.path);
      const nodeId = String(args.node_id ?? '');
      if (!graph.nodes.some((node) => node.id === nodeId)) {
        throw new Refused(`"node_id" must name a node of this graph: ${names(graph.nodes.map((node) => node.id))}.`);
      }
      if (args.inputs !== undefined && (!args.inputs || typeof args.inputs !== 'object' || Array.isArray(args.inputs))) {
        throw new Refused('"inputs" must be an object of values by input port id.');
      }
      const { inputs, result } = await withCore((core) => core.node({ graph, node: nodeId, inputs: args.inputs as Record<string, unknown> | undefined }));
      return json({
        status: result.status,
        ...(result.error ? { error: clip(result.error, ERROR_LIMIT) } : {}),
        inputs: briefAll(inputs),
        outputs: briefAll(result.outputs),
      });
    },

    async test_graph(args) {
      const { graph, full } = await loadGraph(args.path);
      const only = args.node_id === undefined ? '' : String(args.node_id);
      // Every depth, as `test` on the command line: the graph a node holds is part of this one.
      return withCore(async (core) => {
        const { tested, results: ran } = await core.test({ graph, offline: args.offline === true, only });
        if (only && !tested) {
          const ids = everyGraphIn(graph, registry).flatMap((level) => level.graph.nodes.map((node) => node.id));
          throw new Refused(`"node_id" must name a node of this graph, or of a graph one of its nodes holds: ${names(new Set(ids))}.`);
        }
        // A node inside another is named with the way down to it: ids are unique only within one graph.
        const results = ran.map(({ inside, nodeId, result }) => ({
          node: `${inside}${nodeId}`, status: result.status,
          ...(result.details.length ? { details: result.details.map((line) => clip(line, ERROR_LIMIT)) } : {}),
        }));
        // The rounds the project kept, run again with nothing asked of a model.
        const folder = only ? null : projectFolderOf(full);
        const kept = folder ? await replayKeptRounds(folder, () => graph, { core, registry }) : [];
        const rounds = kept.map(({ name, status, details }) => (
          { round: `${TESTS_DIR}/${name}`, status, ...(details.length ? { details: details.map((line) => clip(line, ERROR_LIMIT)) } : {}) }
        ));
        const failed = [...results, ...rounds].filter((result) => result.status === 'fail' || result.status === 'error').length;
        return json({
          passed: failed === 0, results, ...(rounds.length ? { rounds } : {}),
          ...(tested || rounds.length ? {} : { note: 'No node of this graph has an example in an input definition, and it keeps no round.' }),
        });
      });
    },

    async save_graph(args) {
      const graph = graphFrom(args.graph, 'graph');
      const { saved, problems } = await saveGraph(args.path, 'path', graph);
      if (!saved) throw new Refused(json({ saved: false, why: 'The graph has problems, so nothing was written.', problems }));
      return json({ saved, nodes: graph.nodes.length, edges: graph.edges.length });
    },

    async run_graph(args) {
      const { graph } = await loadGraph(args.path);

      const given = args.values ?? {};
      if (!given || typeof given !== 'object' || Array.isArray(given)) throw new Refused('"values" must be an object of values by name.');
      if (args.event !== undefined && args.event !== null && typeof args.event !== 'string') throw new Refused('"event" must be the name of an event.');

      let trigger: Trigger | null;
      try {
        trigger = sendFromOutside(graph, args.event as string | null | undefined, given as Record<string, unknown>, registry);
      } catch (error) {
        if (error instanceof NotOffered) throw new Refused(`${error.message} describe_graph lists the names.`);
        throw error;
      }

      const runtime = options.runtime();
      // A run of everything starts the page's start points on what the page holds.
      if (!trigger) await startFromPage(graph, runtime, registry);
      const { result } = await withCore((core) => core.round({ graph, trigger }));
      return json({
        status: result.status,
        ...(result.error ? { error: clip(result.error, ERROR_LIMIT) } : {}),
        nodes: result.node_results.map((node) => ({
          id: node.node_id,
          status: node.status,
          ...(node.error ? { error: clip(node.error, ERROR_LIMIT) } : {}),
          outputs: briefAll(node.outputs),
        })),
        // By name, as a page or any frontend reads them (`graphInterface.ts`).
        outputs: briefAll(outputsOf(graph, result, registry)),
      });
    },

    async describe_graph(args) {
      const { graph } = await loadGraph(args.path);
      return json({
        name: graph.metadata.name,
        description: graph.metadata.description,
        ...interfaceOf(graph, registry),
      });
    },

    async list_graphs() {
      const graphs: { path: string; name: string; description: string; nodes: number }[] = [];
      let examined = 0;
      let cut = false;

      const walk = async (dir: string, depth: number): Promise<void> => {
        let entries;
        try {
          entries = await readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }
        // A project's `nodes/` holds its subgraphs, which are parts of it, not graphs to save over.
        const project = entries.some((entry) => entry.isFile() && entry.name === FLOW_FILE);
        // Sorted, so the same folder lists the same way twice.
        for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
          if (graphs.length >= LIST_LIMIT || examined >= LIST_EXAMINED) { cut = true; return; }
          const full = join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name.startsWith('.') || SKIPPED_FOLDERS.has(entry.name.toLowerCase())) continue;
            if (project && entry.name === NODES_DIR) continue;
            if (depth < LIST_DEPTH) await walk(full, depth + 1);
            continue;
          }
          if (!entry.isFile() || extname(entry.name).toLowerCase() !== '.json') continue;
          // A project's own parts: its flow.json stands for all of them. What a
          // session of a graph keeps beside it is no graph either.
          if ([NODES_FILE, LAYOUT_FILE, PAGE_FILE, STATE_FILE].includes(entry.name) || entry.name.endsWith(`.${STATE_FILE}`)) continue;
          try {
            // The same door as every other read, so the same files stay shut.
            await confine(full, 'path');
            examined += 1;
            const graph = entry.name === FLOW_FILE ? (await loadGraph(full)).graph : await readGraphFile(full, entry.name);
            graphs.push({
              path: shown(full),
              name: graph.metadata.name,
              description: graph.metadata.description,
              nodes: graph.nodes.length,
            });
          } catch {
            // Not a graph, or not ours to open. Either way, not in the list.
          }
        }
      };

      await walk(root, 1);
      return json({ graphs, ...(cut ? { truncated: `Stopped after ${graphs.length} graphs; there may be more.` } : {}) });
    },
  };

  return {
    specs: SPECS,

    async call(name, args) {
      const tool = Object.prototype.hasOwnProperty.call(tools, name) ? tools[name] : undefined;
      if (!tool) return { text: `There is no tool named "${name}". The tools are: ${SPECS.map((spec) => spec.name).join(', ')}.`, isError: true };
      try {
        const given = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
        return { text: scrub(await tool(given)) };
      } catch (error) {
        // A refusal is already a sentence for the caller. Anything else is a
        // bug or the machine, and is said briefly: a stack trace is a map of
        // this computer, and nobody asked for one.
        const text = error instanceof Refused ? error.message : `${name} failed: ${message(error).slice(0, ERROR_LIMIT)}`;
        return { text: scrub(text), isError: true };
      }
    },
  };
}
