// `nodes.json`: the list of a graph's nodes -- what each one is.
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
// neighbours -- that is `flow.json` --, nor where it sits -- `layout.json` --,
// nor its writing -- code and prompts, files in its own folder. Every node has
// an entry, at least `{ "kind": … }`; the rest may be left out.

import type { DataType, GraphNode, Port, PortKind } from '../../../graph/graph.ts';
import { NotAGraph } from '../../../graph/errors.ts';

export const NODES_FILE = 'nodes.json';

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

/** What `nodes.json` says for *nodes*: the writing already taken out of their settings. */
export function describeNodes(nodes: GraphNode[]): Record<string, unknown> {
  return Object.fromEntries(nodes.map((node) => [node.id, {
    kind: node.node_type,
    label: node.label,
    ...(node.description ? { description: node.description } : {}),
    ...(Object.keys(node.config).length ? { config: sorted(node.config) } : {}),
    ...(node.inputs.length ? { inputs: node.inputs.map(onDisk) } : {}),
    ...(node.outputs.length ? { outputs: node.outputs.map(onDisk) } : {}),
  }]));
}

const isObject = (value: unknown): boolean => !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * The nodes the list *raw* describes, as a graph document lists them. *path*
 * names the file in a message about what is wrong with it.
 */
export function nodesFrom(raw: unknown, path: string): Record<string, unknown>[] {
  if (!isObject(raw)) {
    throw new NotAGraph(`${path} is not a list of nodes: it must say each node by its id, { "count": { "kind": "code", … } }.`);
  }
  return Object.entries(raw as Record<string, unknown>).map(([id, entry]) => {
    const where = `${path}: node "${id}"`;
    if (!isObject(entry)) throw new NotAGraph(`${where} must be an object with its "kind".`);
    const node = entry as Record<string, unknown>;
    if (typeof node.kind !== 'string' || !node.kind) throw new NotAGraph(`${where} needs a "kind": what sort of node it is.`);
    if (node.config !== undefined && !isObject(node.config)) throw new NotAGraph(`${where}: "config" must be an object.`);
    const ports = (value: unknown, kind: PortKind): Port[] => {
      if (value === undefined) return [];
      if (!Array.isArray(value)) throw new NotAGraph(`${where}: "${kind}s" must be a list of ports.`);
      return value.map((port) => fromDisk(port, kind, where));
    };
    return {
      id, node_type: node.kind, label: node.label, description: node.description, config: node.config,
      inputs: ports(node.inputs, 'input'), outputs: ports(node.outputs, 'output'),
    };
  });
}
