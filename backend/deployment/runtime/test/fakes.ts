// What tests stand a run on when the world it runs in is not what they are about.
//
// In `test/`, which a deploy bundle and the downloadable package leave out:
// they copy every other file of `graph/`, `gui/` and `backend/` that is not a test, and
// a helper for tests elsewhere would ship with them. Nothing here is a test of its own either --
// vitest only runs `*.test.ts` -- so it is imported, and that is all.
import type { Graph, GraphEdge, GraphNode } from '../../../../graph/graph.ts';
import type { Runtime } from '../../../../graph/nodes/Runtime.ts';

/**
 * A runtime with no world attached: an empty disk on which every path reads as nothing, a body that hands back what it was
 * given, and a model that says nothing.
 *
 * *over* replaces what a test is about, member by member -- and inside
 * `files` file operation by file operation, so a disk that fails
 * is `{ files: { read: async () => { throw new Error('no'); } } }`. Each call is a new object.
 */
export function quietRuntime(over: Partial<Omit<Runtime, 'files'>> & { files?: Partial<Runtime['files']> } = {}): Runtime {
  const { files, ...rest } = over;
  return {
    files: {
      read: async () => '', write: async () => {}, list: async () => [], resolve: (path) => path, inProject: (path) => path,
      size: async () => 0,
      ...files,
    },
    code: { run: async (_body, inputs) => inputs },
    ai: { complete: async () => '' },
    ...rest,
  };
}

/** A wire from port *fromPort* of node *from* to port *toPort* of node *to*. */
export function edge(id: string, from: string, fromPort: string, to: string, toPort: string): GraphEdge {
  return { id, source_node_id: from, source_port_id: fromPort, target_node_id: to, target_port_id: toPort };
}

/** A port, by name; `name:field` takes that one value of what arrives (`Port.field`). */
function port(spec: string, kind: 'input' | 'output') {
  const [name, field] = spec.split(':');
  return { id: name, name, kind, data_type: 'any' as const, multi: false, required: false, description: '', ...(field ? { field } : {}) };
}

/** A node of *type* with the ports named in *ports*; a code node without code of its own hands its inputs on. */
export function node(id: string, type = 'code', config: Record<string, unknown> = {}, ports: { in?: string[]; out?: string[] } = {}): GraphNode {
  return {
    id, node_type: type as GraphNode['node_type'], label: id, description: '', position: { x: 0, y: 0 },
    config: type === 'code' ? { code: 'function run(inputs) { return inputs; }', ...config } : config,
    inputs: (ports.in ?? []).map((name) => port(name, 'input')),
    outputs: (ports.out ?? []).map((name) => port(name, 'output')),
  };
}

/** *nodes* and *edges* as a graph with the settings a new one has. */
export function graphOf(nodes: GraphNode[], edges: GraphEdge[] = []): Graph {
  return {
    metadata: { name: 't', description: '', gui_scheme: 'night' },
    nodes, edges,
  };
}
