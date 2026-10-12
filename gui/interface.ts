// What a GUI adds to what a graph offers (`graph/interface.ts`): for a start
// point a GUI starts, which blocks fire it and what the GUI sends with it --
// so a script that starts it in the GUI's place knows what to send.

import type { Graph } from '../graph/graph.ts';
import { interfaceOf, type GraphInterface, type InterfaceEntry } from '../graph/interface.ts';
import type { Kinds } from '../graph/nodes/NodeDefinition.ts';
import { firedBy, sentBy, widgetElement } from './gui.ts';

/** What the GUI sends with start point *name*, as a caller is told it: each block's data, by the block's id. */
function guiSent(graph: Graph, name: string): InterfaceEntry[] {
  return sentBy(graph, name).map((widget) => {
    const sent = widgetElement(widget.kind)!.sends(widget)!;
    return { name: widget.id, label: widget.label || widget.id, type: sent.type, ...(sent.list ? { list: true } : {}), description: sent.description };
  });
}

/** What *graph* offers, with each start point told which blocks of its GUI fire it and what the GUI sends with it. */
export function interfaceWithGui(graph: Graph, kinds: Kinds): GraphInterface {
  const offered = interfaceOf(graph, kinds);
  const events = offered.events.map((event) => {
    const fired = firedBy(graph, event.name).map((widget) => widget.id);
    const sends = guiSent(graph, event.name);
    return { ...event, ...(fired.length ? { fired_by: fired } : {}), ...(sends.length ? { sends } : {}) };
  });
  return { ...offered, events };
}
