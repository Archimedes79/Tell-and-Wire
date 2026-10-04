// The page a graph is used through: its blocks, and how each connects itself.
//
// A page is not a node. Nothing is wired to it, and it is in neither the
// graph's order nor its rounds: a block connects itself by name -- its data
// goes to start points (`sends_to`), its event fires one (`fires`), it shows
// an end point (`shows`) -- and the graph owns those points. What a round the
// page starts begins with is one package, made here of the data of the blocks
// that send to the start point it fires; what the round hands back reaches the
// blocks that show its end points, settled here.
//
// The page's own state -- what was typed or chosen, a conversation -- is kept
// by whoever uses the graph: the session (`host/session.ts`), as it keeps each
// node's.

import type { Graph, RawConfig, WidgetKind } from '../graph.ts';
import type { Runtime } from './Runtime.ts';
import type { Runners } from './NodeRunner.ts';
import { names, type Problem } from '../execution/wiring.ts';
import type { RuntimeRequirement, Widget, WidgetConnections, WidgetPresentation, WidgetRunner } from './WidgetRunner.ts';
import { WIDGETS } from './widgets/roster.ts';
import { SENDERS } from './nodes/start/StartNodeRunner.ts';

const BY_KIND = new Map(WIDGETS.map((element) => [element.widgetKind, element as WidgetRunner<unknown>]));

/** The element a block of *kind* is, or none for a kind nobody knows. */
export function widgetElement(kind: WidgetKind | string): WidgetRunner<unknown> | undefined {
  return BY_KIND.get(kind as WidgetKind);
}

/** Who a block is. Typed against `Widget`, so a misspelt name here does not compile. */
const IDENTITY: (keyof Widget)[] = ['id', 'kind', 'label'];
/** How it is drawn. Typed against `WidgetPresentation`, for the same reason. */
const PRESENTATION: (keyof WidgetPresentation)[] = ['w', 'h', 'tone', 'border', 'background'];
/** How it connects to the graph, by name. */
const CONNECTIONS: (keyof WidgetConnections)[] = ['sends_to', 'fires', 'shows'];
/** Everything else in the stored record is the element's settings. */
const OWN = new Set<string>([...IDENTITY, ...PRESENTATION, ...CONNECTIONS]);

/**
 * Read one block out of stored JSON.
 *
 * Its settings are the record itself minus identity, presentation and
 * connections: the element picks what it knows and ignores the rest.
 */
export function parseWidget(raw: unknown): Widget {
  const w = (raw ?? {}) as RawConfig;
  const config: RawConfig = {};
  for (const [key, value] of Object.entries(w)) {
    if (!OWN.has(key)) config[key] = value;
  }
  return {
    id: String(w.id ?? ''),
    kind: String(w.kind ?? 'text') as Widget['kind'],
    label: String(w.label ?? ''),
    w: Number(w.w ?? 8),
    h: Number(w.h ?? 4),
    tone: String(w.tone ?? 'plain'),
    ...(typeof w.border === 'boolean' ? { border: w.border } : {}),
    ...(w.background ? { background: String(w.background) } : {}),
    sends_to: Array.isArray(w.sends_to) ? w.sends_to.map(String).filter(Boolean) : [],
    fires: w.fires ? String(w.fires) : null,
    shows: w.shows ? String(w.shows) : null,
    config,
  };
}

/** The page's blocks as the page keeps them -- none, for a graph without a page. */
export function pageBlocks(graph: Graph): RawConfig[] {
  return graph.page?.blocks ?? [];
}

/** The page's blocks, read. */
function pageWidgets(graph: Graph): Widget[] {
  return pageBlocks(graph).map(parseWidget);
}

/** The block of the page called *id*, as the page keeps it. */
export function pageBlock(graph: Graph, id: string): RawConfig | undefined {
  return pageBlocks(graph).find((block) => block.id === id);
}

/** The blocks whose event fires start point *name*, in the page's order. */
export function firedBy(graph: Graph, name: string): Widget[] {
  return pageWidgets(graph).filter((widget) => widget.fires === name && !!widgetElement(widget.kind)?.event(widget));
}

/** The blocks whose data goes to start point *name*. */
export function sentBy(graph: Graph, name: string): Widget[] {
  return pageWidgets(graph).filter((widget) => widget.sends_to.includes(name) && !!widgetElement(widget.kind)?.sends(widget));
}

/**
 * The block a port that takes *field* of start point *name*'s package
 * (`Port.field`) is handed the data of: the one of the field's first name
 * that sends to it -- none, when no block does.
 */
export function fieldSender(graph: Graph, name: string, field: string): Widget | undefined {
  const id = field.split('.')[0];
  return sentBy(graph, name).find((widget) => widget.id === id);
}

/**
 * What the page sends with start point *name*: the data of each block that
 * sends to it, under the block's id -- the values of the package the start
 * point hands on. A block that cannot say what it holds -- a folder that is
 * gone -- fails the round before it starts.
 */
export async function pageSends(graph: Graph, name: string, runtime: Runtime): Promise<Record<string, unknown>> {
  const values: Record<string, unknown> = {};
  for (const widget of sentBy(graph, name)) {
    try {
      values[widget.id] = await widgetElement(widget.kind)!.data(widget, runtime);
    } catch (error) {
      throw new Error(`"${widget.label || widget.id}" could not say what it holds: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return values;
}

/**
 * A run of everything -- the command line, a call that names no event --
 * counts every event as fired, the page's too: each start point the page
 * starts is sent what the page holds now, as though the page had fired it.
 * So a tool run from a terminal starts on what its page starts on.
 */
export async function startFromPage(graph: Graph, runtime: Runtime, registry: Runners): Promise<void> {
  if (!pageBlocks(graph).length) return;
  for (const node of graph.nodes) {
    const element = registry.node(node.node_type);
    if (!element?.takesPackage || element.startedBy(node) !== 'page') continue;
    element.startWith(node, { by: 'page', values: await pageSends(graph, node.id, runtime) });
  }
}

/**
 * Keep what a person set, by block id, where each block keeps it -- only a
 * block that takes a value: a heading's text is its design, whatever a caller
 * sends under its id.
 */
export function applyPageValues(graph: Graph, values: Record<string, unknown>): void {
  for (const [id, value] of Object.entries(values)) {
    const stored = pageBlock(graph, id);
    const element = stored && widgetElement(String(stored.kind));
    if (stored && element?.takesValue(parseWidget(stored))) element.setValue(stored, value);
  }
}

/** Whether *id* is a block of the page a person sets: what a round the page starts is sent by. */
export function takesPageValue(graph: Graph, id: string): boolean {
  const stored = pageBlock(graph, id);
  return !!stored && !!widgetElement(String(stored.kind))?.takesValue(parseWidget(stored));
}

/**
 * What the page's blocks hold, each under its id: what was typed or chosen, a
 * conversation, what an end point handed back. A block that keeps nothing is
 * its design.
 */
export function pageState(graph: Graph): Record<string, unknown> {
  const slots: Record<string, unknown> = {};
  for (const stored of pageBlocks(graph)) {
    const widget = parseWidget(stored);
    if (widgetElement(widget.kind)?.keepsState(widget)) slots[widget.id] = stored.value ?? null;
  }
  return slots;
}

/** Put slots `pageState` read back where the blocks keep them. */
export function setPageState(graph: Graph, slots: Record<string, unknown>): void {
  for (const stored of pageBlocks(graph)) {
    const id = String(stored.id ?? '');
    if (!(id in slots)) continue;
    if (slots[id] === null) delete stored.value;
    else stored.value = slots[id];
  }
}

/** Empty what a block held only until a round delivered it (`clearsValueAfterRun`). *sent*: the page's state as the round was handed it. */
export function clearDeliveredPage(graph: Graph, sent: Record<string, unknown>): void {
  for (const stored of pageBlocks(graph)) {
    const widget = parseWidget(stored);
    if (!widgetElement(widget.kind)?.clearsValueAfterRun(widget)) continue;
    if (JSON.stringify(stored.value ?? null) === JSON.stringify(sent[widget.id] ?? null)) stored.value = '';
  }
}

/**
 * Settle what the end points handed back, by name, into the blocks that show
 * them -- each block decides what arriving means (`settle`): most become it, a
 * conversation adds a turn -- and say what each now shows, as the page draws
 * it (`displayValue`): an image's path read into the picture. A block whose
 * end point handed back nothing this round is left as it was, and out.
 */
export async function settlePage(graph: Graph, outputs: Record<string, unknown>, runtime: Runtime): Promise<Record<string, unknown>> {
  const shown: Record<string, unknown> = {};
  for (const stored of pageBlocks(graph)) {
    const widget = parseWidget(stored);
    const element = widgetElement(widget.kind);
    if (!element?.showsEnd(widget) || !widget.shows || !(widget.shows in outputs)) continue;
    const value = outputs[widget.shows];
    element.settle(stored, value);
    shown[widget.id] = await element.displayValue(widget, value, runtime);
  }
  return shown;
}

/**
 * What the page asks before a round of start point *name* runs: what the blocks
 * that send to it ask -- a picker with nothing chosen --, each under its block's
 * id. None for a round the page does not send.
 */
export function pageRequirements(graph: Graph, name: string | null): RuntimeRequirement[] {
  if (!name) return [];
  return sentBy(graph, name).flatMap((widget) => (widgetElement(widget.kind)?.runtimeRequirements(widget) ?? [])
    .map((asked) => ({ key: widget.id, ...asked })));
}

/** The graph's start points and end points, by name, as its nodes offer them: what a block may name. */
function points(graph: Graph, registry: Runners): { starts: Map<string, string>; ends: Set<string> } {
  const starts = new Map<string, string>();
  const ends = new Set<string>();
  for (const node of graph.nodes) {
    const element = registry.node(node.node_type);
    for (const offer of element?.offers(node) ?? []) {
      if (offer.kind === 'event') starts.set(offer.name, offer.startedBy ?? 'page');
      if (offer.kind === 'output') ends.add(offer.name);
    }
  }
  return { starts, ends };
}

/**
 * What is wrong with the page: a block without an id, with another's or with
 * one a round says of a sender that is no block (`SENDERS`), a kind nobody
 * knows, a connection to a start or end point the graph does not have -- or
 * that the block cannot make --, and a block connected to nothing at all. A
 * start point the page starts that nothing on the page fires: whoever uses
 * the page cannot start it. And a node that takes a value of what such a
 * start point is sent that no block sends it: it never arrives.
 */
export function pageProblems(graph: Graph, registry: Runners, where = 'the page'): Problem[] {
  const found: Problem[] = [];
  const blocks = pageWidgets(graph);
  if (!blocks.length) return found;
  const { starts, ends } = points(graph, registry);
  const seen = new Set<string>();
  for (const block of blocks) {
    const at = `${where}, block "${block.id || block.kind}"`;
    if (!block.id) {
      found.push({ where: at, problem: `A "${block.kind}" block has no id.`, fix: 'Give every block an id: it is the name its data is sent under.' });
    } else if (seen.has(block.id)) {
      found.push({ where: at, problem: `More than one block has the id "${block.id}".`, fix: 'Give every block on the page its own id.' });
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
      found.push({ where: at, problem: `Unknown block kind "${block.kind}".`, fix: `Use one of: ${[...BY_KIND.keys()].join(', ')}.` });
      continue;
    }
    if (block.fires) {
      if (!element.event(block)) {
        found.push({ where: at, problem: `It fires "${block.fires}", but using it is no event.`, fix: 'Leave "fires" out, or let a button, a box or a choice fire it.' });
      } else if (!starts.has(block.fires)) {
        found.push({ where: at, problem: `It fires "${block.fires}", which is no start point of the graph: it starts ${names(starts.keys())}.`, fix: `Add a start point called "${block.fires}", or fire one the graph has.` });
      } else if (starts.get(block.fires) !== 'page') {
        found.push({ where: at, problem: `It fires "${block.fires}", which is not started by the page.`, fix: `Set "${block.fires}" to be started by the page.` });
      }
    }
    for (const target of block.sends_to) {
      if (!element.sends(block)) {
        found.push({ where: at, problem: `It sends to "${target}", but it holds nothing to send.`, fix: 'Leave "sends_to" out: only a block a person sets sends.' });
        break;
      }
      if (!starts.has(target)) {
        found.push({ where: at, problem: `It sends to "${target}", which is no start point of the graph: it starts ${names(starts.keys())}.`, fix: `Add a start point called "${target}", or send to one the graph has.` });
      } else if (starts.get(target) !== 'page') {
        // The page's data goes with the rounds the page starts, and no other.
        found.push({ where: at, problem: `It sends to "${target}", which the page does not start: what it holds never reaches it.`, fix: `Set "${target}" to be started by the page, or send to one it starts.` });
      }
    }
    if (block.shows) {
      if (!element.showsEnd(block)) {
        found.push({ where: at, problem: `It shows "${block.shows}", but it shows nothing.`, fix: 'Leave "shows" out, or let a chart, a table, an image, a text box or a chat show it.' });
      } else if (!ends.has(block.shows)) {
        found.push({ where: at, problem: `It shows "${block.shows}", which is no end point of the graph: it ends at ${names(ends)}.`, fix: `Add an end point called "${block.shows}", or show one the graph has.` });
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
    if (starts.get(edge.source_node_id) !== 'page') continue;
    const target = graph.nodes.find((node) => node.id === edge.target_node_id);
    const field = target?.inputs.find((port) => port.id === edge.target_port_id)?.field;
    if (!target || !field || fieldSender(graph, edge.source_node_id, field)) continue;
    const id = field.split('.')[0];
    const sending = sentBy(graph, edge.source_node_id).map((widget) => widget.id);
    found.push({
      where: `node "${target.id}", input "${edge.target_port_id}"`,
      problem: `It takes "${field}" of what "${edge.source_node_id}" is sent, and no block of the page sends "${id}" to it: ${sending.length ? `it is sent ${names(sending)}` : 'nothing is sent to it'}.`,
      fix: `Take one of what it is sent, or let the block "${id}" send to "${edge.source_node_id}".`,
    });
  }
  for (const [name, startedBy] of starts) {
    if (startedBy !== 'page' || blocks.some((block) => block.fires === name)) continue;
    found.push({
      where: `start point "${name}"`,
      problem: 'It is started by the page, and nothing on the page fires it.',
      fix: `Let a button, a box or a choice fire "${name}", or have it started by a call or by itself.`,
    });
  }
  return found;
}

/** What the page's blocks start on: a picker's file, which a bundle carries. */
export function pageReferencedPaths(graph: Graph): string[] {
  return pageWidgets(graph).flatMap((widget) => widgetElement(widget.kind)?.referencedPaths(widget) ?? []);
}

/**
 * The page, for the model that designs a whole graph: how a block connects,
 * and every kind with what it says of itself (`WidgetRunner.graphAuthorNote`)
 * -- a kind is listed by being registered, so the prompt cannot leave one out.
 */
export function pageAuthorNote(): string {
  const kinds = WIDGETS.map((element) => {
    const note = element.graphAuthorNote();
    return `  - ${element.widgetKind}${note ? `: ${note}` : ''}`;
  });
  return 'The page is "page": {"blocks": [...]} beside "nodes" and "edges" -- not a node, and nothing is wired to it. '
    + 'A block is {"id", "kind", "label", "w" (1-16 columns), "h" (rows), ...its settings} and connects itself by name: '
    + '"sends_to": [start point ids] (its data goes into the package of each, under the block\'s id), '
    + '"fires": a start point id (using it starts the graph there; the start point must have config.started_by "page"), '
    + '"shows": an end point id (what arrives at that end point is shown on the block). '
    + 'A block has no code of its own: what reshapes a value before a block shows it is a code node wired in before the end point. '
    + `The kinds:\n${kinds.join('\n')}`;
}
