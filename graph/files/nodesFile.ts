// `graph-nodes.json`: the list of a graph's nodes -- what each one is.
//
//     {
//       "chart": {
//         "kind": "code",
//         "label": "Chart",
//         "description": "Draws the population as a line chart.",
//         "config": { "batch_mode": "whole_list" },
//         "inputs": [ { "port": "request", "type": "json" } ],
//         "outputs": [ { "port": "figure", "type": "json" } ]
//       }
//     }
//
// By id, in the order the graph lists them. A node's kind, its heading and its
// text, its settings and its ports: all it is, and nothing about its
// neighbours -- that is `graph-flow.json` --, nor where it sits -- `graph-schedule.json` --,
// nor its writing -- code and prompts, files in its own folder. Every node has
// an entry, at least `{ "kind": … }`; the rest may be left out.
//
// **Only what a person said.** A setting that holds its default is not
// written (`withoutDefaults`), and neither are ports that follow from the
// node's settings -- a start point's, a data node's from its fields, a
// subgraph's from the graph it holds: they are worked out again when it is
// read, so the file never holds a copy that can disagree. What a person chose
// for those inputs stays, as a stub: which part of a package one takes
// (`field`), and that it takes a list (`list`). An end point's ports are not
// written while they are the standard ones of its kind (`defaultPorts`): a
// node that lists none is read with them.

import { isStruct, withoutDefaults, type DataType, type GraphNode, type Port, type PortKind } from '../graph.ts';
import { NotAGraph } from '../errors.ts';

export const NODES_FILE = 'graph-nodes.json';

/** Keys in one order, so saving an unchanged graph changes nothing in the file. */
export function sorted<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, record[key]])) as T;
}

/** One port as a person reads it: its id, and only what is not the plain default. */
interface PortOnDisk {
  port: string;
  name?: string;
  type: DataType;
  list?: true;
  required?: true;
  description?: string;
  /** What of the package arriving it takes: see `Port.field`. */
  field?: string;
}

function onDisk(port: Port): PortOnDisk {
  return {
    port: port.id,
    ...(port.name && port.name !== port.id ? { name: port.name } : {}),
    type: port.data_type,
    ...(port.multi ? { list: true as const } : {}),
    ...(port.required ? { required: true as const } : {}),
    ...(port.description ? { description: port.description } : {}),
    ...(port.field ? { field: port.field } : {}),
  };
}

function fromDisk(raw: unknown, kind: PortKind, where: string): Port {
  const p = (raw ?? {}) as Record<string, unknown>;
  if (typeof p.port !== 'string' || !p.port) throw new NotAGraph(`${where}: every ${kind} needs a "port" id.`);
  return {
    id: p.port,
    name: typeof p.name === 'string' && p.name ? p.name : p.port,
    kind,
    data_type: (typeof p.type === 'string' ? p.type : 'any') as DataType,
    multi: p.list === true,
    required: p.required === true,
    description: typeof p.description === 'string' ? p.description : '',
    ...(typeof p.field === 'string' && p.field.trim() ? { field: p.field.trim() } : {}),
  };
}

/** What a person chose for an input whose port follows from the node's settings: all there is to keep of it. */
function stubOnDisk(port: Port): { port: string; list?: true; field?: string } {
  return { port: port.id, ...(port.multi ? { list: true as const } : {}), ...(port.field ? { field: port.field } : {}) };
}

/** The standard ports of each kind, when it has a set of its own (`NodeDefinition.defaultPorts`). */
export type DefaultPorts = (kind: string) => readonly Port[] | null;

/** Whether two lists of ports are what a file would say of each, port for port. */
function sameAs(one: readonly Port[], two: readonly Port[]): boolean {
  return JSON.stringify(one.map(onDisk)) === JSON.stringify(two.map(onDisk));
}

/**
 * What `graph-nodes.json` says for *nodes*: the writing already taken out of their
 * settings. *derived* is the ids of the nodes whose ports follow from their
 * settings: of those, only the choices a person made are kept. A node whose
 * inputs are the standard ones of its kind is written without them.
 */
export function describeNodes(nodes: GraphNode[], derived: ReadonlySet<string>, defaults: DefaultPorts): Record<string, unknown> {
  return Object.fromEntries(nodes.map((node) => {
    const config = withoutDefaults(node.config);
    const follows = derived.has(node.id);
    const standard = defaults(node.node_type);
    const standardInputs = !follows && standard !== null && sameAs(node.inputs, standard);
    const inputs = follows ? node.inputs.filter((port) => port.multi || port.field).map(stubOnDisk) : node.inputs.map(onDisk);
    // Where the standard ones would come back when read, an empty list is written: it says there are none.
    const writeInputs = follows ? inputs.length > 0 : !standardInputs && (standard !== null || inputs.length > 0);
    const outputs = follows ? [] : node.outputs.map(onDisk);
    return [node.id, {
      kind: node.node_type,
      label: node.label,
      ...(node.description ? { description: node.description } : {}),
      ...(Object.keys(config).length ? { config: sorted(config) } : {}),
      ...(writeInputs ? { inputs } : {}),
      ...(outputs.length ? { outputs } : {}),
    }];
  }));
}

/**
 * The nodes the list *raw* describes, as a graph document lists them. *path*
 * names the file in a message about what is wrong with it.
 */
export function nodesFrom(raw: unknown, path: string, defaults: DefaultPorts = () => null): Record<string, unknown>[] {
  if (!isStruct(raw)) {
    throw new NotAGraph(`${path} is not a list of nodes: it must say each node by its id, { "count": { "kind": "code", … } }.`);
  }
  return Object.entries(raw).map(([id, node]) => {
    const where = `${path}: node "${id}"`;
    if (!isStruct(node)) throw new NotAGraph(`${where} must be an object with its "kind".`);
    if (typeof node.kind !== 'string' || !node.kind) throw new NotAGraph(`${where} needs a "kind": what sort of node it is.`);
    if (node.config !== undefined && !isStruct(node.config)) throw new NotAGraph(`${where}: "config" must be an object.`);
    const ports = (value: unknown, kind: PortKind): Port[] => {
      if (value === undefined) return [];
      if (!Array.isArray(value)) throw new NotAGraph(`${where}: "${kind}s" must be a list of ports.`);
      return value.map((port) => fromDisk(port, kind, where));
    };
    // A node that lists no inputs has the standard ones of its kind: the file leaves them out of one that has them.
    const standard = defaults(node.kind);
    return {
      id, node_type: node.kind, label: node.label, description: node.description, config: node.config,
      inputs: node.inputs === undefined && standard !== null ? standard : ports(node.inputs, 'input'),
      outputs: ports(node.outputs, 'output'),
    };
  });
}
