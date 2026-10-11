import { NodeRunner } from '../NodeRunner.ts';
import type { Runtime } from '../../../../../graph/nodes/Runtime.ts';
import type { ExecutionResult, GraphNode } from '../../../../../graph/graph.ts';
import { boundaryInputs, boundaryOutputs, handedDown, handedUp } from '../../../../../graph/nodes/subgraph/boundary.ts';
import type { SubgraphNodeDefinition } from '../../../../../graph/nodes/subgraph/SubgraphNodeDefinition.ts';

/**
 * Runs the graph a node holds, whole, with the same executor that runs every
 * graph: handing the values across the boundary is all that is its own.
 */
export class SubgraphNodeRunner extends NodeRunner<SubgraphNodeDefinition> {
  /** One run of the graph this node holds, on *inputs* keyed by its start points: what reached its end points. */
  async execute(node: GraphNode, inputs: Record<string, unknown>, runtime: Runtime): Promise<Record<string, unknown>> {
    const graph = this.kind.nestedGraph(node);
    if (!graph) throw new Error('This node holds no graph that can be read.');
    if (!runtime.subgraph) throw new Error('A graph inside a node can only be run as part of a graph run.');
    const elements = runtime.subgraph.elements;

    const given: Record<string, Record<string, unknown>> = {};
    for (const boundary of boundaryInputs(graph, elements)) {
      // A port nothing is wired to is not answered, and the start point inside
      // runs as it is designed.
      if (!(boundary.id in inputs)) continue;
      given[boundary.id] = handedDown(boundary, inputs[boundary.id], elements);
    }

    const run = await runtime.subgraph.run(graph, given);
    // Anything short of a clean run inside is this node's failure.
    //
    // From out here this is one node, and "half of it worked" is not something
    // a port can carry: what it would carry is a null nobody can explain,
    // while the reason stays in a report nobody is looking at. A `partial` run
    // counts -- an item of a fan-out that failed, a node that caught its own
    // failure and passed nothing on. To let the graph above carry on anyway,
    // tick this node's own catch-errors: then the reason arrives on its error
    // port, which is the one place a caught failure belongs.
    if (run.status !== 'success') {
      throw new Error(`Inside "${node.label || node.id}": ${trouble(run)}`);
    }

    const produced: Record<string, unknown> = {};
    for (const boundary of boundaryOutputs(graph, elements)) {
      const arrived = run.node_results.find((result) => result.node_id === boundary.id)?.inputs ?? {};
      produced[boundary.id] = handedUp(boundary, arrived, elements);
    }
    return produced;
  }
}

/**
 * What went wrong in there, in one sentence.
 *
 * The run's own summary when it has one -- it names the node already -- and
 * otherwise the first node that has something to say, which is where a caught
 * failure and a partly failed fan-out leave their reason.
 */
function trouble(run: ExecutionResult): string {
  if (run.error) return run.error;
  const said = run.node_results.find((result) => result.error);
  if (said) return `${said.node_id}: ${said.error}`;
  const idle = run.node_results.filter((result) => result.status === 'skipped').length;
  return idle ? `${idle} of its nodes had nothing to do.` : 'it did not finish.';
}
