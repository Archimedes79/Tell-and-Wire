// The gui a graph is used through: its blocks, and how each connects itself.
//
// A gui is not a node. Nothing is wired to it, and it is in neither the
// graph's order nor its rounds: a block connects itself by name -- its data
// goes to start points (`sends_to`), its event fires one (`fires`), it shows
// an end point (`shows`) -- and the graph owns those points. What a round the
// gui starts begins with is one package, made here of the data of the blocks
// that send to the start point it fires; what the round hands back reaches the
// blocks that show its end points, settled here.
//
// The gui's own state -- what was typed or chosen, a conversation -- is kept
// by whoever uses the graph: the session (`backend/deployment/host/session.ts`), as it keeps each
// node's.

import type { Graph, RawConfig } from '../graph/graph.ts';
import type { Runtime } from '../graph/nodes/Runtime.ts';
import type { Kinds } from '../graph/nodes/NodeDefinition.ts';
import type { RuntimeRequirement, Widget, WidgetConnections, WidgetDefinition, WidgetPresentation } from './widgets/WidgetDefinition.ts';
import { WIDGETS } from './widgets/roster.ts';
import { messageOf } from '../graph/errors.ts';

const BY_KIND = new Map<string, WidgetDefinition<unknown>>(WIDGETS.map((element) => [element.widgetKind, element as WidgetDefinition<unknown>]));

/** The definition of a block of *kind*, or none for a kind nobody knows. */
export function widgetElement(kind: string): WidgetDefinition<unknown> | undefined {
  return BY_KIND.get(kind);
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

/** The gui's blocks as the gui keeps them -- none, for a graph without a gui. */
export function guiBlocks(graph: Graph): RawConfig[] {
  return graph.gui?.blocks ?? [];
}

/** The gui's blocks, read. */
export function guiWidgets(graph: Graph): Widget[] {
  return guiBlocks(graph).map(parseWidget);
}

/** The block of the gui called *id*, as the gui keeps it. */
export function guiBlock(graph: Graph, id: string): RawConfig | undefined {
  return guiBlocks(graph).find((block) => block.id === id);
}

/** The blocks whose event fires start point *name*, in the gui's order. */
export function firedBy(graph: Graph, name: string): Widget[] {
  return guiWidgets(graph).filter((widget) => widget.fires === name && !!widgetElement(widget.kind)?.event(widget));
}

/** The blocks whose data goes to start point *name*. */
export function sentBy(graph: Graph, name: string): Widget[] {
  return guiWidgets(graph).filter((widget) => widget.sends_to.includes(name) && !!widgetElement(widget.kind)?.sends(widget));
}

/**
 * What the gui sends with start point *name*: the data of each block that
 * sends to it, under the block's id -- the values of the package the start
 * point hands on. A block that cannot say what it holds -- a folder that is
 * gone -- fails the round before it starts.
 */
export async function guiSends(graph: Graph, name: string, runtime: Runtime): Promise<Record<string, unknown>> {
  const values: Record<string, unknown> = {};
  for (const widget of sentBy(graph, name)) {
    try {
      values[widget.id] = await widgetElement(widget.kind)!.data(widget, runtime);
    } catch (error) {
      throw new Error(`"${widget.label || widget.id}" could not say what it holds: ${messageOf(error)}`);
    }
  }
  return values;
}

/**
 * A run of everything -- the command line, a call that names no event --
 * counts every event as fired, the gui's too: each start point the gui
 * starts is sent what the gui holds now, as though the gui had fired it.
 * So a tool run from a terminal starts on what its gui starts on.
 */
export async function startFromGui(graph: Graph, runtime: Runtime, registry: Kinds): Promise<void> {
  if (!guiBlocks(graph).length) return;
  for (const node of graph.nodes) {
    const element = registry.node(node.node_type);
    if (!element?.takesPackage || element.startedBy(node) !== 'gui') continue;
    element.startWith(node, { by: 'gui', values: await guiSends(graph, node.id, runtime) });
  }
}

/**
 * Keep what a person set, by block id, where each block keeps it -- only a
 * block that takes a value: a heading's text is its design, whatever a caller
 * sends under its id.
 */
export function applyGuiValues(graph: Graph, values: Record<string, unknown>): void {
  for (const [id, value] of Object.entries(values)) {
    const stored = guiBlock(graph, id);
    const element = stored && widgetElement(String(stored.kind));
    if (stored && element?.takesValue(parseWidget(stored))) element.setValue(stored, value);
  }
}

/** Of the block ids *ids*, those of blocks whose value is a path this machine reads. */
export function pathBlocks(graph: Graph, ids: string[]): string[] {
  return ids.filter((id) => {
    const stored = guiBlock(graph, id);
    return !!stored && !!widgetElement(String(stored.kind))?.readsPath(parseWidget(stored));
  });
}

/** Whether *id* is a block of the gui a person sets: what a round the gui starts is sent by. */
export function takesGuiValue(graph: Graph, id: string): boolean {
  const stored = guiBlock(graph, id);
  return !!stored && !!widgetElement(String(stored.kind))?.takesValue(parseWidget(stored));
}

/**
 * What the gui's blocks hold, each under its id: what was typed or chosen, a
 * conversation, what an end point handed back. A block that keeps nothing is
 * its design.
 */
export function guiState(graph: Graph): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const stored of guiBlocks(graph)) {
    const widget = parseWidget(stored);
    if (widgetElement(widget.kind)?.keepsState(widget)) kept[widget.id] = stored.value ?? null;
  }
  return kept;
}

/** Put what `guiState` read back where the blocks keep it. */
export function setGuiState(graph: Graph, kept: Record<string, unknown>): void {
  for (const stored of guiBlocks(graph)) {
    const id = String(stored.id ?? '');
    if (!(id in kept)) continue;
    if (kept[id] === null) delete stored.value;
    else stored.value = kept[id];
  }
}

/** Empty what a block held only until a round delivered it (`clearsValueAfterRun`). *sent*: the gui's state as the round was handed it. */
export function clearDeliveredGui(graph: Graph, sent: Record<string, unknown>): void {
  for (const stored of guiBlocks(graph)) {
    const widget = parseWidget(stored);
    if (!widgetElement(widget.kind)?.clearsValueAfterRun(widget)) continue;
    if (JSON.stringify(stored.value ?? null) === JSON.stringify(sent[widget.id] ?? null)) stored.value = '';
  }
}

/**
 * Settle what the end points handed back, by name, into the blocks that show
 * them -- each block decides what arriving means (`settle`): most become it, a
 * conversation adds a turn -- and say what each now shows, as the gui draws
 * it (`displayValue`): an image's path read into the picture. A block whose
 * end point handed back nothing this round is left as it was, and out.
 */
export async function settleGui(graph: Graph, outputs: Record<string, unknown>, runtime: Runtime): Promise<Record<string, unknown>> {
  const shown: Record<string, unknown> = {};
  for (const stored of guiBlocks(graph)) {
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
 * What each block that shows a memory node shows: the whole content as it is
 * now (*state*, by the node's name), by the block's id -- there from the
 * design's values on, with no round: a round settles end points into blocks
 * (`settleGui`), never a memory node.
 */
export function shownFromState(graph: Graph, state: Record<string, unknown>): Record<string, unknown> {
  const shown: Record<string, unknown> = {};
  for (const stored of guiBlocks(graph)) {
    const widget = parseWidget(stored);
    if (widgetElement(widget.kind)?.showsEnd(widget) && widget.shows && widget.shows in state) shown[widget.id] = state[widget.shows];
  }
  return shown;
}

/**
 * What the gui asks before a round of start point *name* runs: what the blocks
 * that send to it ask -- a picker with nothing chosen --, each under its block's
 * id. None for a round the gui does not send.
 */
export function guiRequirements(graph: Graph, name: string | null): RuntimeRequirement[] {
  if (!name) return [];
  return sentBy(graph, name).flatMap((widget) => (widgetElement(widget.kind)?.runtimeRequirements(widget) ?? [])
    .map((asked) => ({ key: widget.id, ...asked })));
}
