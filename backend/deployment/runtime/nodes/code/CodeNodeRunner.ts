import { NodeRunner } from '../NodeRunner.ts';
import { runBody } from '../body.ts';
import type { Runtime } from '../../../../../graph/nodes/Runtime.ts';
import type { GraphNode } from '../../../../../graph/graph.ts';
import type { CodeNodeDefinition } from '../../../../../graph/nodes/code/CodeNodeDefinition.ts';

/** Runs a code node's body, sandboxed: `run(inputs, node)` in code.js. */
export class CodeNodeRunner extends NodeRunner<CodeNodeDefinition> {
  async execute(
    node: GraphNode,
    inputs: Record<string, unknown>,
    runtime: Runtime,
  ): Promise<Record<string, unknown>> {
    const logic = this.kind.logic(node);
    if (logic.isEmpty) {
      throw new Error(`${node.label || node.id}: its code.js holds no code yet -- press Auto generate in the node, or write run(inputs) in code.js.`);
    }

    // Once, for whatever it was handed. Fanning out and reading wired files
    // into their content are the executor's business (see `batchMode` and
    // `readsFileInputs`), so this stays one call.
    //
    // It may ask a model: `await node.llm({ prompt })`, answered by the
    // process that holds the keys, on the one AI setting's model.
    //
    // A node of a window is told the window (`node.window`): what it was made with, in its settings beside its code
    // (`windowFacts` in `gui/notebook/windows.ts`).
    const window = node.config.window;
    return runBody(logic.body, inputs, runtime, window && typeof window === 'object' ? { facts: { window } } : {});
  }
}
