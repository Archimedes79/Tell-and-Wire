// The JavaScript graph core, in the wrapper's own process: the executor and
// the elements, behind the protocol (`protocol.ts`). The same core is a
// program of its own with `node engine/src/main.ts core` (`stdio.ts`).
//
// What it keeps between rounds is what makes it one per session: what every
// node made last (`execution/latch.ts`), which is meaning -- a node whose ◆
// stays shut hands it on -- and the reuse cache (`execution/reuse.ts`), which
// only saves time.

import type { Graph, GraphNode } from '../graph.ts';
import type { ProgressEvent, Runtime } from '../elements/Runtime.ts';
import { registry } from '../elements/registry.ts';
import { executeGraph, inputsFor, memoryFeedbackEdges, runNodeAlone } from '../execution/executor.ts';
import { triggeredNodes } from '../execution/triggers.ts';
import { Latch } from '../execution/latch.ts';
import { LastOutputs } from '../execution/reuse.ts';
import { runExample, testGraph } from '../authoring/examples.ts';
import { nodeRuntime } from './node.ts';
import { PROTOCOL, type CoreEvent, type GraphCore, type RoundEnded } from './protocol.ts';

export interface LocalCoreOptions {
  /** The services a request runs with, told where to say how far it is. A test hands in fakes. */
  runtime?: (report: (event: ProgressEvent) => void) => Runtime;
}

/** A model asked for in a run that asks none: what a kept round's replay and `--offline` want said. */
function offline(runtime: Runtime): Runtime {
  return {
    ...runtime,
    ai: {
      complete: async () => {
        throw new Error('This kept round asks no model: the node was not asked when the round was kept, so the graph changed since.');
      },
    },
  };
}

/** What every node of *graph* keeps now (`NodeRunner.state`), by node id. */
function statesOf(graph: Graph): Record<string, Record<string, unknown>> {
  return Object.fromEntries(graph.nodes.map((node) => [node.id, registry.node(node.node_type)?.state(node) ?? {}]));
}

export function localCore(options: LocalCoreOptions = {}): GraphCore {
  const runtimeFor = options.runtime ?? ((report) => nodeRuntime({ report }));
  let latch = new Latch();
  let reuse = new LastOutputs();
  const silent = (): void => {};

  return {
    async hello() {
      return { protocol: PROTOCOL, language: 'javascript', core: 'AI-Graph JavaScript core' };
    },

    async open(held = {}) {
      latch = new Latch();
      latch.restore(held);
      reuse = new LastOutputs();
    },

    async round(asked, report: (event: CoreEvent) => void = silent, signal) {
      const graph = structuredClone(asked.graph);
      const runtime = asked.offline ? offline(runtimeFor(report)) : runtimeFor(report);
      const trigger = asked.trigger;
      const only = trigger ? triggeredNodes(graph, trigger, memoryFeedbackEdges(graph.nodes, graph.edges, registry)) : null;
      report({ type: 'plan', total: only?.size ?? graph.nodes.length });
      // A kept round is its own: what it answers is given, and nothing it does stands for the next.
      const replay = !!asked.given;
      const round = replay ? undefined : new RoundLatch(latch);
      const result = await executeGraph(graph, {
        runtime, registry, trigger, signal, latch: round, given: asked.given, ...(replay || asked.offline ? {} : { reuse }),
      });
      // Only a round that ran to its end leaves what it made: one stopped began what is nobody's to keep.
      if (!signal?.aborted) round?.commit();
      const ended: RoundEnded = { result, nodes: statesOf(graph), held: latch.heldBy(new Set(graph.nodes.map((node) => node.id))) };
      return ended;
    },

    node(asked, signal) {
      return runNodeAlone(structuredClone(asked.graph), asked.node, asked.inputs, { runtime: runtimeFor(silent), registry, signal });
    },

    example(asked, signal) {
      return runExample(asked.graph, asked.node, { runtime: runtimeFor(silent), registry, offline: asked.offline, signal });
    },

    test(asked, signal) {
      return testGraph(asked.graph, { runtime: () => runtimeFor(silent), registry, offline: asked.offline, only: asked.only, signal });
    },

    arriving(asked, signal) {
      return inputsFor(structuredClone(asked.graph), asked.node, { runtime: runtimeFor(silent), registry, reuse, signal });
    },

    async forget() {
      latch = new Latch();
      reuse = new LastOutputs();
    },

    async close() {},
  };
}

/**
 * What a round leaves in the latch, held back until the round has run to its
 * end. Asked within the round, it answers with what the round left so far.
 */
class RoundLatch extends Latch {
  private readonly session: Latch;
  private readonly written = new Map<string, Record<string, unknown>>();

  constructor(session: Latch) {
    super();
    this.session = session;
  }

  override key(graph: Graph, node: GraphNode, keepsItsOwn: (node: GraphNode) => boolean): string {
    return this.session.key(graph, node, keepsItsOwn);
  }

  override get(key: string): Record<string, unknown> | undefined {
    return this.written.get(key) ?? this.session.get(key);
  }

  override set(key: string, outputs: Record<string, unknown>): void {
    this.written.set(key, outputs);
  }

  commit(): void {
    for (const [key, outputs] of this.written) this.session.set(key, outputs);
  }
}

