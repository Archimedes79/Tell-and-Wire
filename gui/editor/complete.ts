// A gui written whole, with the start and end points its blocks need.
//
// The designer connects each block as it is added (`frontend/editor/gui/guiWrite.ts`):
// what a block sends goes to the gui's start point, one a person uses fires it,
// what it shows is an end point -- and a point the graph lacks is made. A model
// that writes a gui and a graph in one piece leaves out the same things, more
// often than anything else: the input field with no start point to send to, the
// output with no end point to show. `completeGui` gives that gui what the
// designer would have, so a tool said in words has its start and its end.

import type { Graph, GraphNode } from '../../graph/graph.ts';
import type { Kinds } from '../../graph/nodes/NodeDefinition.ts';
import { guiBlocks, parseWidget, widgetElement } from '../gui.ts';
import { points } from './gui.ts';

/** The first of *base*, *base*_2, *base*_3 ... that is not in *taken*. */
function free(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let n = 1; ; n += 1) {
    const id = n === 1 ? base : `${base}_${n}`;
    if (!used.has(id)) return id;
  }
}

const words = (id: string): string => {
  const spaced = id.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/**
 * Give the gui of *graph* what it lacks, in place:
 * - a connection a block cannot make is taken off: a button "sends" to the start point it
 *   means to fire -- that is what it then fires --, a text that shows nothing "shows" nothing;
 * - a start or end point a block names (`sends_to`, `fires`, `shows`) that is no node of
 *   the graph is made, under that name;
 * - an input that sends nowhere sends to the start point the gui starts -- or to the one it
 *   fires, or to one made for it -- and an output that shows nothing shows an end point no
 *   block shows yet, or one made for it;
 * - a start point the gui starts that nothing fires is fired by the one block that sends to
 *   it, where that block can (with several, a button is the person's to add).
 * Points are made unwired and beside the graph; wiring them is the graph's author's.
 */
export function completeGui(graph: Graph, registry: Kinds): void {
  for (const stored of guiBlocks(graph)) {
    const widget = parseWidget(stored);
    const element = widgetElement(widget.kind);
    if (!element) continue;
    if (widget.sends_to.length && !element.sends(widget)) {
      if (element.event(widget) && !widget.fires) stored.fires = widget.sends_to[0];
      delete stored.sends_to;
    }
    if (widget.fires && !element.event(widget)) delete stored.fires;
    if (widget.shows && !element.showsEnd(widget)) delete stored.shows;
  }
  const blocks = guiBlocks(graph).flatMap((stored) => {
    const widget = parseWidget(stored);
    const element = widgetElement(widget.kind);
    return element ? [{ stored, widget, element }] : [];
  });
  if (!blocks.length) return;

  /** A start point or an end point, made beside the graph. */
  const make = (kind: 'start' | 'end', id: string, label: string): string => {
    const others = graph.nodes.filter((node) => node.node_type !== kind).map((node) => node.position.x);
    const x = kind === 'start' ? (others.length ? Math.min(...others) - 340 : 80) : (others.length ? Math.max(...others) + 340 : 420);
    const here = graph.nodes.filter((node) => node.node_type === kind).length;
    const node: GraphNode = {
      id, node_type: kind, label, description: '', position: { x, y: 120 + 140 * here },
      inputs: kind === 'end' ? [{ id: 'value', name: 'Value', kind: 'input', data_type: 'any', multi: false, required: false, description: '' }] : [],
      outputs: [], config: kind === 'start' ? { started_by: 'gui' } : {},
    };
    const derived = registry.node(kind)?.derivedPorts(node, registry);
    graph.nodes.push(derived ? { ...node, ...derived } : node);
    return id;
  };
  const ids = () => graph.nodes.map((node) => node.id);

  // What a block names that the graph does not have.
  for (const { widget, element } of blocks) {
    for (const name of new Set([...widget.sends_to, ...(widget.fires ? [widget.fires] : [])])) {
      if (!ids().includes(name) && (element.sends(widget) || element.event(widget))) make('start', name, words(name));
    }
    if (widget.shows && !ids().includes(widget.shows) && element.showsEnd(widget)) make('end', widget.shows, widget.label || words(widget.shows));
  }

  // What a block leaves unsaid.
  for (const { stored, widget, element } of blocks) {
    const { starts, ends } = points(graph, registry);
    if (element.sends(widget) && !widget.sends_to.length) {
      const guiStarts = [...starts].filter(([, by]) => by === 'gui').map(([name]) => name);
      let target: string | undefined = widget.fires && starts.has(widget.fires) ? widget.fires : undefined;
      if (!target && guiStarts.length <= 1) target = guiStarts[0] ?? make('start', free('start', ids()), 'Start');
      if (target) stored.sends_to = [target];
    }
    if (element.showsEnd(widget) && !widget.shows) {
      const shown = new Set(guiBlocks(graph).map((one) => one.shows));
      stored.shows = [...ends].find((end) => !shown.has(end)) ?? make('end', free('result', ids()), widget.label || 'Result');
    }
  }

  // What starts the graph: a start point the gui starts, and nobody fires.
  const { starts } = points(graph, registry);
  for (const [name, by] of starts) {
    if (by !== 'gui' || guiBlocks(graph).some((stored) => stored.fires === name)) continue;
    const senders = blocks.filter(({ stored, element, widget }) => (stored.sends_to as unknown[] | undefined)?.includes(name) && !stored.fires && element.event(widget));
    if (senders.length === 1) senders[0].stored.fires = name;
  }
}
