import { describe, it, expect } from 'vitest';
import { GRAPH_SYSTEM } from './graphPrompt.ts';
import { parseGraph } from '../../graph/graph.ts';
import { registry } from '../../graph/nodes/registry.ts';
import { problemsIn } from '../app/project/check.ts';

describe('the graph prompt', () => {
  it('teaches an example that is itself a valid graph, wired only to ports its elements really emit', () => {
    // If the document handed to the model as correct is wrong, every graph copied from it is wrong in the same way.
    const fenced = /```json\n([\s\S]*?)```/.exec(GRAPH_SYSTEM);
    expect(fenced, 'the prompt should carry one fenced example').toBeTruthy();
    const graph = parseGraph(JSON.parse(fenced![1]));
    expect(problemsIn(graph)).toEqual([]);

    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    for (const edge of graph.edges) {
      const source = byId.get(edge.source_node_id)!;
      // A derived-port element ignores what the document declares, so its real ports are the ones to check against.
      const derived = registry.node(source.node_type)!.derivedPorts(source, registry);
      const emitted = (derived ?? { outputs: source.outputs }).outputs.map((p) => p.id);
      expect(emitted, `${source.id} must really emit ${edge.source_port_id}`).toContain(edge.source_port_id);
    }
  });
});
