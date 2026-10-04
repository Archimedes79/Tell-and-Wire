// What a node produced last time, for a run that only needs it as context.
//
// A round runs what its event is *for* -- the nodes its start point is wired
// to and everything after them -- and, before those, whatever they need an input
// from. Running that upstream part again every time is cheap for a file that
// is read, and not for a model that is asked again because something below it
// changed.
//
// So a node that runs only as context may hand back what it produced last
// time, on one condition: nothing it depends on has changed. "Depends on" is
// the node as written (type, settings, ports), every value that arrived on
// its inputs -- with wired files already read, so a file edited since is a
// different input -- and the one AI setting, which answers every model call
// that names no model of its own: after another model is chosen, a node that
// asks one asks it. A node with no inputs at all reads the outside world
// instead (a file, a page, the clock) and is never reused; it is also what is
// cheap. Nor is a node that reads the outside world whatever arrives -- a
// folder listed at the path a start point was sent (`NodeRunner.readsOutside`).
//
// What an event is for always runs fresh: pressing "Summarize" twice means
// "again", and a whole-graph Run means everything.

import { createHash } from 'node:crypto';
import type { GraphNode } from '../graph.ts';
import type { ModelChoice } from '../nodes/Runtime.ts';

/** How many results are kept. A long session must not accumulate every one it ever saw. */
const LIMIT = 256;

export class LastOutputs {
  private readonly kept = new Map<string, Record<string, unknown>>();

  /** One key for this node, as written, receiving these inputs, with *setting* the one AI setting. */
  key(node: GraphNode, inputs: Record<string, unknown>, setting?: ModelChoice): string {
    const written = { type: node.node_type, config: node.config, inputs: node.inputs, outputs: node.outputs };
    return createHash('sha256').update(JSON.stringify([written, inputs, setting ?? null])).digest('hex');
  }

  get(key: string): Record<string, unknown> | undefined {
    const found = this.kept.get(key);
    if (found) {
      // Most recently used goes last, so the oldest is the one dropped.
      this.kept.delete(key);
      this.kept.set(key, found);
    }
    return found;
  }

  set(key: string, outputs: Record<string, unknown>): void {
    this.kept.delete(key);
    this.kept.set(key, outputs);
    if (this.kept.size > LIMIT) this.kept.delete(this.kept.keys().next().value!);
  }
}
