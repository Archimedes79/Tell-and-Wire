// What the nine tools say of themselves: the limits they keep, the description of each
// that a client shows its model, and the prose around them -- the guide to writing a
// graph by hand, and what the server tells a client when it connects.
//
// Prose, so that it can be read and corrected apart from the code that keeps its
// promises (`tools.ts`).

import type { ToolSpec } from '../../../graph/nodes/Runtime.ts';
import { ERROR_PORT } from '../../../graph/execution/wiring.ts';
import { RUN_PORT } from '../../../graph/execution/triggers.ts';
import { registry } from '../../../graph/nodes/registry.ts';
import { GRAPH_SYSTEM } from '../graphPrompt.ts';

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export const MAX_DESCRIPTION_CHARS = 20_000;
export const MAX_GRAPH_BYTES = 2 * 1024 * 1024;
/** How much of one value a run reports. Enough to see what it is; not enough to be it. */
export const VALUE_LIMIT = 600;
export const ERROR_LIMIT = 1_500;

// ---------------------------------------------------------------------------
// The tools
// ---------------------------------------------------------------------------

export const SPECS: ToolSpec[] = [
  {
    name: 'authoring_guide',
    description: 'How to write a Tell & Wire graph document yourself: the JSON shape, where each node type keeps what it does, '
      + 'the port names some node types derive from their settings, how a page connects to start and end points, and one complete example. Read this before writing a '
      + 'graph by hand, then use validate_graph and save_graph. No model on this machine is needed for that route.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'generate_graph',
    description: 'Have the model configured on this machine design a whole graph from a description -- or, given the path '
      + 'of a saved graph, change that graph as the description says, its ids and whatever the change does not touch kept. '
      + 'Returns the graph, the model\'s explanation and any problems validation found. With save_as, a graph without '
      + 'problems is also written there. If no model is configured, use authoring_guide and save_graph instead.',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: `What the graph should do, or what to change, in plain words. At most ${MAX_DESCRIPTION_CHARS} characters.` },
        path: { type: 'string', description: 'Optional: the saved graph to change rather than design a new one, as a .json path relative to the server\'s folder (a project: its flow.json).' },
        save_as: { type: 'string', description: 'Optional .json path, relative to the server\'s folder, to save the graph to.' },
      },
      required: ['description'],
      additionalProperties: false,
    },
  },
  {
    name: 'validate_graph',
    description: 'Check a graph without saving or running it. Give either the graph itself or the path of a saved one. '
      + 'Returns a list of problems -- unknown node types, duplicate ids, edges to nodes or ports that do not exist, cycles, '
      + 'code nodes without code, a graph that shows nothing -- each with how to fix it. An empty list means valid.',
    parameters: {
      type: 'object',
      properties: {
        graph: { type: 'object', description: 'A graph document: { metadata, nodes, edges }.' },
        path: { type: 'string', description: 'A saved graph, as a .json path relative to the server\'s folder.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'save_graph',
    description: 'Validate a graph and write it: as one pretty-printed .json file, or -- given a project\'s flow.json -- as that '
      + 'project, each node\'s files in its folder. Refuses, and returns the problems, when validation finds any. Only .json '
      + 'paths inside the server\'s folder; an existing file is replaced only if it is already a graph. Over a graph that is '
      + 'there, each node\'s history and the files its ✨ was given stay; a file changed on disk since this server last read the project '
      + 'makes the call write nothing and say which, until describe_graph has read the project again.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Where to write, as a .json path relative to the server\'s folder.' },
        graph: { type: 'object', description: 'The graph document: { metadata, nodes, edges }.' },
      },
      required: ['path', 'graph'],
      additionalProperties: false,
    },
  },
  {
    name: 'run_graph',
    description: 'Run a saved graph once and report what happened: the overall status, each node\'s status and error, '
      + `each node's outputs, and the graph's outputs by name, with every value cut to about ${VALUE_LIMIT} characters. `
      + 'Runs the graph\'s code and calls its models for real. A graph is used by name, as a page or any frontend uses it: '
      + 'event, one of its start points, runs only what that start point is wired to. It is sent values under whatever names '
      + 'you give them -- the names describe_graph says the graph reads of it, and for one the page starts, the names the page '
      + 'sends -- and hands them on in one package to the node it is wired to. Without an event the whole graph runs, the '
      + 'page\'s start points on what the page holds, and it is sent nothing. describe_graph lists the names.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The saved graph, as a .json path relative to the server\'s folder.' },
        values: { type: 'object', description: 'What the start point the round starts at is sent: values under names of your own, the ones describe_graph says the graph reads. Only with an event.' },
        event: { type: 'string', description: 'The start point to start the round at, by name. Left out: the whole graph.' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'describe_graph',
    description: 'What a saved graph offers whoever uses it, by name: its events (its start points; who starts each -- the '
      + 'page, a call, the graph itself --; what the graph reads of the values each is sent; for one the page starts, which '
      + 'blocks fire it and what the page sends with it) and the outputs it hands back (its end points). The names run_graph '
      + 'takes, and a page or any frontend uses.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The saved graph, as a .json path relative to the server\'s folder (a project: its flow.json).' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'run_node',
    description: 'Run one node of a saved graph by itself and report its outputs, each value cut to about '
      + `${VALUE_LIMIT} characters. With inputs, on those (keyed by the node's input port ids); without, on what `
      + 'the nodes feeding it produce -- those are run for that, the node\'s own successors are not. For writing '
      + 'one node at a time: change its code, run it, compare.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The saved graph, as a .json path relative to the server\'s folder (a project: its flow.json).' },
        node_id: { type: 'string', description: 'The node to run.' },
        inputs: { type: 'object', description: 'Values by input port id. Omit to use what the graph feeds the node.' },
      },
      required: ['path', 'node_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'test_graph',
    description: 'Run each code and ai node once on the example in its input definition (config.input_definition, '
      + 'input.js) and hold what comes out to its output definition (config.output_definition, output.js); report each '
      + 'as pass, fail (with what does not fit), error or skipped. Every node that has an example, or one with node_id -- '
      + 'also inside the graphs nodes hold, where a result names the way down ("part ▸ work"). '
      + 'offline: ask no model; an ai node is skipped. A project also runs again each round it kept (tests/<name>.json), '
      + 'handing in what its start points were sent, what its models answered and what its memory held, and asking no model: '
      + 'pass when its end points hand back what they did.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The saved graph, as a .json path relative to the server\'s folder (a project: its flow.json).' },
        node_id: { type: 'string', description: 'Only this node.' },
        offline: { type: 'boolean', description: 'Ask no model.' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_graphs',
    description: 'The graphs saved under the server\'s folder: path, name and description of each.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
];

// ---------------------------------------------------------------------------
// The prose around them
// ---------------------------------------------------------------------------

/** What the server says when a client connects. */
export const INSTRUCTIONS = 'Designs, checks, saves and runs Tell & Wire graphs inside one folder. To write a graph yourself, read '
  + 'authoring_guide first; to have this machine\'s model write one, use generate_graph. Validate before saving.';

/** What `authoring_guide` answers: the model's own brief for designing a graph, and how to use it through this server. */
export function authoringGuide(): string {
  return [
    GRAPH_SYSTEM,
    '---',
    'Using this through the tell-and-wire MCP server',
    '',
    'The instruction above to answer with a fenced json block is written for a model replying in a chat. Here, build the '
    + 'same document and pass it as the "graph" argument: validate_graph checks it, save_graph writes it, run_graph tries it. '
    + 'Fix what validate_graph reports before saving; save_graph refuses a graph with problems.',
    '',
    `Node types this server runs: ${registry.nodeTypes().join(', ')}.`,
    `The port every node accepts without declaring it: "${RUN_PORT}". A node with config.catch_errors = true also has an output "${ERROR_PORT}".`,
    'Paths inside a graph (what a start point reads, an end point\'s target, a picker\'s file) are relative to the server\'s folder.',
  ].join('\n');
}
