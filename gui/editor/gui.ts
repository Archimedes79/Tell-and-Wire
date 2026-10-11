// What only the editor asks of the gui: whether it is sound, what to tell the
// model that writes one, what a package carries. A package carries none of it;
// what a run asks is in `gui/gui.ts`.

import type { Graph } from '../../graph/graph.ts';
import { offered } from '../../graph/interface.ts';
import type { Kinds } from '../../graph/nodes/NodeDefinition.ts';
import { names, type Problem } from '../../graph/wiring.ts';
import { SENDERS } from '../../graph/nodes/start/StartNodeDefinition.ts';
import type { Widget } from '../widgets/WidgetDefinition.ts';
import { WIDGETS } from '../widgets/roster.ts';
import { guiWidgets, sentBy, widgetElement } from '../gui.ts';
import { widgetDesign } from './widgets/roster.ts';

/**
 * The block a port that takes *field* of start point *name*'s package
 * (`Port.field`) is handed the data of: the one of the field's first name
 * that sends to it -- none, when no block does.
 */
export function fieldSender(graph: Graph, name: string, field: string): Widget | undefined {
  const id = field.split('.')[0];
  return sentBy(graph, name).find((widget) => widget.id === id);
}

/** The graph's start points (and who starts each), end points and memory nodes, by name, as its nodes offer them: what a block may name. */
export function points(graph: Graph, registry: Kinds): { starts: Map<string, string>; ends: Set<string>; states: Set<string> } {
  const { event, output, state } = offered(graph, registry);
  return {
    starts: new Map([...event].map(([name, { offer }]): [string, string] => [name, offer.startedBy ?? 'gui'])),
    ends: new Set(output.keys()),
    states: new Set(state.keys()),
  };
}

/** Whether a block of the gui shows a memory node: what a person sees of the graph where it has no end point. */
export function showsMemory(graph: Graph, registry: Kinds): boolean {
  const { states } = points(graph, registry);
  return guiWidgets(graph).some((block) => !!block.shows && states.has(block.shows));
}

/**
 * What is wrong with the gui: a block without an id, with another's or with
 * one a round says of a sender that is no block (`SENDERS`), a kind nobody
 * knows, a connection to a start or end point the graph does not have -- or
 * that the block cannot make --, and a block connected to nothing at all. A
 * start point the gui starts that nothing on the gui fires: whoever uses
 * the gui cannot start it. And a node that takes a value of what such a
 * start point is sent that no block sends it: it never arrives.
 */
export function guiProblems(graph: Graph, registry: Kinds): Problem[] {
  const found: Problem[] = [];
  const blocks = guiWidgets(graph);
  if (!blocks.length) return found;
  const { starts, ends, states } = points(graph, registry);
  const seen = new Set<string>();
  for (const block of blocks) {
    const at = `the gui, block "${block.id || block.kind}"`;
    if (!block.id) {
      found.push({ where: at, problem: `A "${block.kind}" block has no id.`, fix: 'Give every block an id: it is the name its data is sent under.' });
    } else if (seen.has(block.id)) {
      found.push({ where: at, problem: `More than one block has the id "${block.id}".`, fix: 'Give every block on the gui its own id.' });
    } else if ((SENDERS as readonly string[]).includes(block.id)) {
      found.push({
        where: at,
        problem: `The id "${block.id}" is what a round no block started says started it: the first node could not tell the two apart.`,
        fix: 'Give the block another id.',
      });
    }
    seen.add(block.id);
    const element = widgetElement(block.kind);
    if (!element) {
      found.push({ where: at, problem: `Unknown block kind "${block.kind}".`, fix: `Use one of: ${WIDGETS.map((widget) => widget.widgetKind).join(', ')}.` });
      continue;
    }
    if (block.fires) {
      if (!element.event(block)) {
        found.push({ where: at, problem: `It fires "${block.fires}", but using it is no event.`, fix: 'Leave "fires" out, or let a button, a box or a choice fire it.' });
      } else if (!starts.has(block.fires)) {
        found.push({ where: at, problem: `It fires "${block.fires}", which is no start point of the graph: it starts ${names(starts.keys())}.`, fix: `Add a start point called "${block.fires}", or fire one the graph has.` });
      } else if (starts.get(block.fires) !== 'gui') {
        found.push({ where: at, problem: `It fires "${block.fires}", which is not started by the gui.`, fix: `Set "${block.fires}" to be started by the gui.` });
      }
    }
    for (const target of block.sends_to) {
      if (!element.sends(block)) {
        found.push({ where: at, problem: `It sends to "${target}", but it holds nothing to send.`, fix: 'Leave "sends_to" out: only a block a person sets sends.' });
        break;
      }
      if (!starts.has(target)) {
        found.push({ where: at, problem: `It sends to "${target}", which is no start point of the graph: it starts ${names(starts.keys())}.`, fix: `Add a start point called "${target}", or send to one the graph has.` });
      } else if (starts.get(target) !== 'gui') {
        // The gui's data goes with the rounds the gui starts, and no other.
        found.push({ where: at, problem: `It sends to "${target}", which the gui does not start: what it holds never reaches it.`, fix: `Set "${target}" to be started by the gui, or send to one it starts.` });
      }
    }
    if (block.shows) {
      if (!element.showsEnd(block)) {
        found.push({ where: at, problem: `It shows "${block.shows}", but it shows nothing.`, fix: 'Leave "shows" out, or let a chart, a table, an image, a text box or a chat show it.' });
      } else if (!ends.has(block.shows) && !states.has(block.shows)) {
        found.push({
          where: at,
          problem: `It shows "${block.shows}", which is no end point or memory node of the graph: it ends at ${names(ends)}${states.size ? ` and holds ${names(states)}` : ''}.`,
          fix: `Add an end point called "${block.shows}", or show one the graph has.`,
        });
      }
    }
    const can = [
      element.sends(block) && 'send its data to a start point ("sends_to")',
      element.event(block) && 'fire one ("fires")',
      element.showsEnd(block) && 'show an end point ("shows")',
    ].filter(Boolean);
    if (can.length && !block.sends_to.length && !block.fires && !block.shows) {
      found.push({ where: at, problem: 'It is connected to nothing: using it reaches no start point, and nothing is ever shown on it.', fix: `Let it ${can.join(', or ')}.` });
    }
  }
  for (const edge of graph.edges) {
    if (starts.get(edge.source_node_id) !== 'gui') continue;
    const target = graph.nodes.find((node) => node.id === edge.target_node_id);
    const field = target?.inputs.find((port) => port.id === edge.target_port_id)?.field;
    if (!target || !field || fieldSender(graph, edge.source_node_id, field)) continue;
    const id = field.split('.')[0];
    const sending = sentBy(graph, edge.source_node_id).map((widget) => widget.id);
    found.push({
      where: `node "${target.id}", input "${edge.target_port_id}"`,
      problem: `It takes "${field}" of what "${edge.source_node_id}" is sent, and no block of the gui sends "${id}" to it: ${sending.length ? `it is sent ${names(sending)}` : 'nothing is sent to it'}.`,
      fix: `Take one of what it is sent, or let the block "${id}" send to "${edge.source_node_id}".`,
    });
  }
  for (const [name, startedBy] of starts) {
    if (startedBy !== 'gui' || blocks.some((block) => block.fires === name)) continue;
    found.push({
      where: `start point "${name}"`,
      problem: 'It is started by the gui, and nothing on the gui fires it.',
      fix: `Let a button, a box or a choice fire "${name}", or have it started by a call or by itself.`,
    });
  }
  return found;
}

/** What the gui's blocks start on: a picker's file, which a package carries. */
export function guiReferencedPaths(graph: Graph): string[] {
  return guiWidgets(graph).flatMap((widget) => widgetDesign(widget.kind)?.referencedPaths(widget) ?? []);
}

/**
 * The gui, for the model that designs a whole graph: how a block connects,
 * and every kind with what it says of itself (`WidgetDesign.graphAuthorNote`)
 * -- a kind is listed by being registered, so the prompt cannot leave one out.
 */
export function guiAuthorNote(): string {
  const kinds = WIDGETS.map(({ widgetKind }) => {
    const note = widgetDesign(widgetKind)?.graphAuthorNote();
    return `  - ${widgetKind}${note ? `: ${note}` : ''}`;
  });
  return 'The gui is "gui": {"blocks": [...]} beside "nodes" and "edges" -- not a node, and nothing is wired to it. '
    + 'A block is {"id", "kind", "label", "w" (1-16 columns), "h" (rows), ...its settings} and connects itself by name: '
    + '"sends_to": [start point ids] (its data goes into the package of each, under the block\'s id), '
    + '"fires": a start point id (using it starts the graph there; the start point must have config.started_by "gui"), '
    + '"shows": an end point id (what arrives at that end point is shown on the block). '
    + 'A block has no code of its own: what reshapes a value before a block shows it is a code node wired in before the end point. '
    + `The kinds:\n${kinds.join('\n')}`;
}
