// What a core is told of the GUI, which it is not handed.
//
// A graph core takes the graph definition -- nodes, their files, the wires; never the GUI
// (`runtime/protocol.ts`). Yet a body that draws wants the room its result is drawn in: the
// blocks of the GUI that show what its node hands on, each with its size (`node.windows`).
// The host knows the GUI, so it asks it, for every request that holds a graph, and tells the
// core the answer beside a graph without it. The GUI never goes down to the core, and a core in
// another language is told the same thing in the same words.

import type { Graph } from '../../../graph/graph.ts';
import { registry } from '../../../graph/nodes/registry.ts';
import { windowsByNode } from '../../../gui/room.ts';
import { chosenCore } from '../runtime/stdio.ts';
import type { LocalCoreOptions } from '../runtime/localCore.ts';
import type { GraphCore } from '../runtime/protocol.ts';

/** *asked* with the GUI taken out of its graph and the room each result is shown in beside it. */
function inRoom<T extends { graph: Graph }>(asked: T): T {
  const { gui: _gui, ...graph } = asked.graph;
  return { ...asked, graph: graph as Graph, windows: windowsByNode(asked.graph, registry) };
}

/** *core*, asked as the host asks: the graph without its GUI, and the windows said apart. */
export function withRoom(core: GraphCore): GraphCore {
  return {
    hello: () => core.hello(),
    open: (held) => core.open(held),
    round: (asked, report, signal) => core.round(inRoom(asked), report, signal),
    node: (asked, signal) => core.node(inRoom(asked), signal),
    example: (asked, signal) => core.example(inRoom(asked), signal),
    test: (asked, signal) => core.test(inRoom(asked), signal),
    arriving: (asked, signal) => core.arriving(inRoom(asked), signal),
    forget: () => core.forget(),
    close: () => core.close(),
  };
}

/** The graph core a host runs graphs with (`chosenCore`), asked as the host asks (`withRoom`). */
export function hostCore(options: LocalCoreOptions = {}): GraphCore {
  return withRoom(chosenCore(options));
}
