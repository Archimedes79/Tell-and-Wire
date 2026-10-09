// What a node of each type *is* when it is made, and what a file keeps of it.
//
// Not drawing, and therefore not `NodeGuiBuilder`. These facts are asked while a
// graph is *loaded* and *saved*: `normalizeGraphNode` fills a node read from a
// file back out from `baseNodeConfig`, and `exportGraph` strips it back down
// with `savedNode` before it is handed to the server.
//
// On a builder, loading a graph would reach into the editor's element
// registry -- the whole builder, panels and ✨ generation contracts included.
//
// Their natural home is graph/, beside `NodeRunner.config`: what a node
// stores is the element's business, and graph/ already owns reading it.
// What keeps them here is `NodeConfig`, the one spelled-out settings shape,
// which lives in the editor's `graph.ts`.

import type { GraphNode, NodeType } from '../graph';
import { derivedNodePorts } from './ports';
import { SubgraphNodeRunner } from '../../../graph/nodes/subgraph/SubgraphNodeRunner.ts';
import { StartNodeRunner } from '../../../graph/nodes/start/StartNodeRunner.ts';
import { registry as runnerRegistry } from '../../../graph/nodes/registry.ts';
import { baseNodeConfig } from './baseNodeConfig';
import { numberedHeading } from './heading';
import { freeId } from './ids';

const SUBGRAPH = new SubgraphNodeRunner();
const START = new StartNodeRunner();

// A new node's description starts empty: on an ai or code node it is the text
// ✨ writes the body from, and a blurb there -- "Send a prompt to an AI model"
// -- would be written as code. What the type is for is the field's placeholder
// (`NodeGuiBuilder.hint`). Its heading is never empty: its kind and a number,
// the lowest one no node beside it has (`numbered`).

/** A node of a kind whose heading is its kind and a number: the lowest one *others* leave free. */
const numbered = (kind: string) => (node: GraphNode, others: GraphNode[]): GraphNode => (
  { ...node, label: numberedHeading(kind, others.map((other) => other.label)) }
);

export interface NodeKind {
  /**
   * What a new node of this type is called, where that is not its type: the
   * id `freeId` starts from, numbered only when it is taken.
   */
  idBase?: string;
  /**
   * A node of this type as it is made here: its ports, and the settings
   * (`baseNodeConfig`) with what a new one of the kind starts with that the
   * defaults do not say -- which is what its file then carries.
   */
  create(id: string): GraphNode;
  /**
   * A node just made, beside *others* already in the graph: what it starts as
   * where that depends on what is there. `create` alone must not depend on
   * its neighbours.
   */
  placedAmong?(node: GraphNode, others: GraphNode[]): GraphNode;
  /** What *node* is when it is made inside a graph a node holds, where that differs. */
  placedInside?(node: GraphNode): GraphNode;
}

export const NODE_KINDS: Record<NodeType, NodeKind> = {
  // Its id is its name, which whoever starts it calls it by: "start", then "start_2".
  start: {
    create: (id) => ({
      id,
      node_type: 'start',
      label: 'Start',
      description: '',
      position: { x: 0, y: 0 },
      inputs: [],
      outputs: START.derivedPorts().outputs as GraphNode['outputs'],
      config: baseNodeConfig(),
    }),
    // In there, the graph above starts it: it is sent what reaches the port
    // of its name, under its name -- the one part an input wired from it
    // then takes (`defaultField`).
    placedInside: (node) => ({ ...node, config: { ...node.config, started_by: 'call', values: { [node.id]: '' } } }),
    // "Start 2" beside a "Start": the page and the App tab name start points by their labels.
    placedAmong: (node, others) => ({ ...node, label: freeId('Start', others.filter((other) => other.node_type === node.node_type).map((other) => other.label), ' ') }),
  },

  folder: {
    create(id) {
      // Its ports follow from its settings -- asked of its runner rather than
      // listed again here.
      const node: GraphNode = {
        id,
        node_type: 'folder',
        label: 'Folder',
        description: '',
        position: { x: 0, y: 0 },
        inputs: [],
        outputs: [],
        config: baseNodeConfig(),
      };
      return { ...node, ...(derivedNodePorts(node) ?? {}) };
    },
  },

  // A new ai or code node runs once, on what arrives -- a list whole -- and
  // hands on one value: single ports and the default `batch_mode`, which is
  // `withPerItem(node, false)` (`perItem.test.ts` holds them to it). Made to
  // run once per item, a node split what it was handed: a chart block got a
  // one-item list, and a sort sorted one item per call. "Run once per item"
  // is one tick away, asked when a list arrives (`RunOncePerItem`).
  ai: {
    create: (id) => ({
      id,
      node_type: 'ai',
      label: 'AI 1',
      description: '',
      position: { x: 0, y: 0 },
      // One input, one output: a second port on every new node, which most
      // never wire, would look like it had to be. A second input is one click
      // on the node when it is wanted, and the message template is where it
      // then gets its place.
      inputs: [
        // `any`, not `text`: nobody has said what this carries yet, and that is the
        // difference that decides whether a wired file is read (`execution/fileInputs.ts`).
        // Created `text`, an AI node wired to a folder picker was handed the file
        // *names* -- the box ticked, the rule looking at a word nobody had said.
        { id: 'prompt', name: 'Prompt', kind: 'input', data_type: 'any', multi: false, required: false, description: 'What to ask.' },
      ],
      outputs: [{ id: 'output', name: 'Output', kind: 'output', data_type: 'text', multi: false, required: false, description: 'The answer.' }],
      config: baseNodeConfig(),
    }),
    placedAmong: numbered('AI'),
  },

  code: {
    create: (id) => ({
      id,
      node_type: 'code',
      label: 'Code 1',
      description: '',
      position: { x: 0, y: 0 },
      inputs: [{ id: 'input', name: 'Input', kind: 'input', data_type: 'any', multi: false, required: false, description: '' }],
      outputs: [{ id: 'output', name: 'Output', kind: 'output', data_type: 'any', multi: false, required: false, description: '' }],
      // No code: its code.js is the stub until ✨ Code writes it from the text.
      config: baseNodeConfig(),
    }),
    placedAmong: numbered('Code'),
  },

  data: {
    create(id) {
      // Its ports follow the fields it holds -- asked of its runner, as a
      // folder's are: with none yet, it has `all` and nothing else.
      const node: GraphNode = {
        id,
        node_type: 'data',
        label: 'Data 1',
        description: '',
        position: { x: 0, y: 0 },
        inputs: [],
        outputs: [],
        config: baseNodeConfig(),
      };
      return { ...node, ...(derivedNodePorts(node) ?? {}) };
    },
    placedAmong: numbered('Data'),
  },

  end: {
    create: (id) => ({
      id,
      node_type: 'end',
      // What it is called is what the run's result calls its value.
      label: 'Result',
      description: '',
      position: { x: 0, y: 0 },
      inputs: [
        // One value, until a list is wired into it (`connect`): what it hands back, as the interface says it.
        { id: 'value', name: 'Value', kind: 'input', data_type: 'any', multi: false, required: false, description: '' },
        { id: 'path', name: 'Path', kind: 'input', data_type: 'file_path', multi: false, required: false, description: 'Optional: a wired file or folder path, used instead of the one set above.' },
      ],
      outputs: [],
      config: baseNodeConfig(),
    }),
    // Its own label, "Result 2" beside a "Result": two results that share one
    // are a problem `check` names, and only the first keeps it in the run's result.
    // The labels taken are asked the way `check` asks them, of every element
    // that is a result.
    placedAmong(node, others) {
      const taken = others.flatMap((other) => {
        const element = runnerRegistry.node(other.node_type);
        return element?.isResult ? [element.resultLabel(other)] : [];
      });
      return { ...node, label: freeId('Result', taken, ' ') };
    },
  },

  subgraph: {
    create: (id) => ({
      id,
      node_type: 'subgraph',
      label: 'Subgraph',
      description: '',
      position: { x: 0, y: 0 },
      // None to start with: a port here is a node in there, and there is
      // nothing in there yet.
      inputs: [],
      outputs: [],
      // The runner's own idea of an empty graph, rather than a second copy
      // of what a graph's metadata starts as.
      config: { ...baseNodeConfig(), subgraph: SUBGRAPH.nestedGraph({ config: {} } as never) },
    }),
  },
};

/**
 * The node as a graph file keeps it: every setting that is not its default
 * (`baseNodeConfig`), and none that is -- a run reads a key left out as
 * that default, and loading fills it back in, so nothing is lost either way.
 */
export function savedNode(node: GraphNode): GraphNode {
  // A type this editor does not know was never filled in: it is saved as it came.
  if (!NODE_KINDS[node.node_type]) return node;
  const defaults: Record<string, unknown> = baseNodeConfig();
  const config = Object.fromEntries(Object.entries(node.config)
    .filter(([key, value]) => value !== undefined && JSON.stringify(value) !== JSON.stringify(defaults[key])));
  return { ...node, config: config as GraphNode['config'] };
}
