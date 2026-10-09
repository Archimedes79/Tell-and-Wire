// Changing the page: the one way a block is added, changed, moved or removed.
//
// The page is the document's list of blocks, beside its nodes -- a graph has
// one page -- and every edit on it ends here.
//
// Each edit reads the page from the store when it lands, never from what a
// component drew. A box that grows as it is typed into changes its block twice
// in one keystroke -- the text, then the height -- and the second change,
// made on the page as it was drawn, put back the text from before the first:
// the character that made the box grow was lost. A ✨ result accepted a minute
// after it was asked for did the same to every edit made meanwhile.
//
// The designer's surface, its side panel, a block typed into on the Page tab,
// and `masterExamples.test.ts`, which builds the examples the way a person
// does, all call these functions. A block used in the running application or
// in a delivered tool never comes here: what is set there is the session's
// (`api/session.ts`).
import type { GraphNode, GuiWidget } from '../../app/graph';
import { useGraphStore } from '../../app/store/graphStore';
import { placement } from '../../app/document/placement';
import { NODE_KINDS } from '../../app/document/nodeKinds';
import { freeId, slugOf } from '../../app/document/ids';
import { blockCan, blocksAt, endPoints, pageStartPoints } from '../../app/document/page';
import { WIDGET_BUILDERS } from '../../app/elements/registry';

/**
 * The page's blocks as the store holds them now, rewritten by *edit* and
 * stored back. Nothing, when the edit changed nothing: no undo step, and no
 * "unsaved". *coalesce* names the change, as a node's panel names its own
 * (`graphStore.commit`); *add* puts nodes into the graph in the same step.
 */
function rewrite(edit: (widgets: GuiWidget[]) => GuiWidget[], coalesce?: string, add: GraphNode[] = []): void {
  const store = useGraphStore.getState();
  const widgets = edit(store.page);
  if (!add.length && JSON.stringify(widgets) === JSON.stringify(store.page)) return;
  store.setPage(widgets, { coalesce, add });
}

/**
 * Give block *widgetId* *patch*. Nothing, when the block is no longer there.
 *
 * One undo step with the change of the same fields of the same block just
 * before it: what is typed into a block, a slider drawn along, a block's edge
 * dragged -- each written as it is made, and each was a step of its own. Fifty
 * characters typed into a chat pushed everything before them out of Undo.
 * Named without ": ", so it is never taken for a node panel's change.
 *
 * A new label is the end point's too, where it is still called after the
 * block (`followLabel`), in the same step.
 */
export function patchBlock(widgetId: string, patch: Partial<GuiWidget>): void {
  const step = `block.${widgetId}.${Object.keys(patch).sort().join('+')}`;
  const before = useGraphStore.getState().page.find((w) => w.id === widgetId);
  rewrite((widgets) => widgets.map((w) => (w.id === widgetId ? { ...w, ...patch } : w)), step);
  if (before && patch.label !== undefined) followLabel(before, patch.label, step);
}

/** Whether *label* is still what a point was named after *base*: the same, or numbered apart from another ("Answer 2"). */
function namedAfter(label: string, base: string): boolean {
  return label === base || (label.startsWith(`${base} `) && /^\d+$/.test(label.slice(base.length + 1)));
}

/**
 * The end point *block* shows, called *label* where it is still called what
 * the block was -- its label, or "Result" for a block of none, as `newPoint`
 * names the one made for it: a chart relabelled "Sizes" kept showing an end
 * point called "Chart". One it was given a name of its own keeps it. Labels
 * only: the point's id is what the block and the wires find it by.
 */
function followLabel(block: GuiWidget, label: string, step: string): void {
  if (!block.shows || label === block.label) return;
  const nodes = nodesNow();
  const end = nodes.find((node) => node.id === block.shows);
  if (!end || !namedAfter(end.label, block.label || 'Result')) return;
  const others = nodes.filter((node) => node.node_type === end.node_type && node.id !== end.id).map((node) => node.label);
  useGraphStore.getState().updateNode(end.id, { label: freeId(label || 'Result', others, ' ') }, undefined, step);
}

/**
 * Put block *widgetId* at place *to* on the page -- or, *to* being a block's
 * id, where that block stands now, which is what a drag onto it means.
 * Nothing, for a place that is not there.
 */
export function moveBlock(widgetId: string, to: number | string): void {
  rewrite((widgets) => {
    const from = widgets.findIndex((w) => w.id === widgetId);
    const at = typeof to === 'string' ? widgets.findIndex((w) => w.id === to) : to;
    if (from === -1 || at < 0 || at >= widgets.length || from === at) return widgets;
    const next = [...widgets];
    const [moved] = next.splice(from, 1);
    next.splice(at, 0, moved);
    return next;
  });
}

/** Take block *widgetId* off the page. The points it connected to stay: they are the graph's. */
export function removeBlock(widgetId: string): void {
  rewrite((widgets) => widgets.filter((w) => w.id !== widgetId));
}

/** The nodes of the document now. */
function nodesNow(): GraphNode[] {
  return useGraphStore.getState().rfNodes.map((node) => node.data.graphNode as GraphNode);
}

/**
 * A new start or end point, called *label*, placed beside what is on the
 * canvas -- below *made*, the points made with it in the same step. A start
 * point is called "start", "start_2", as whoever starts it calls it; an end
 * point what it hands back is called.
 */
function newPoint(kind: 'start' | 'end', label: string, made: GraphNode[]): GraphNode {
  const placed = useGraphStore.getState().rfNodes;
  const taken = [...placed.map((node) => node.id), ...made.map((node) => node.id)];
  const id = freeId(kind === 'start' ? 'start' : slugOf(label) || 'result', taken);
  const at = placement(placed);
  // Named apart from the points of its kind there are: a second start point was "Start" beside "Start".
  const named = [...placed.map((node) => node.data.graphNode as GraphNode), ...made].filter((node) => node.node_type === kind).map((node) => node.label);
  return { ...NODE_KINDS[kind].create(id), label: freeId(label, named, ' '), position: { x: at.x, y: at.y + made.length * 140 } };
}

/**
 * *widget* connected as a new block of its kind is most often wanted, and the
 * points that takes, made in the same step: what it sends goes to the page's
 * start point -- the one there is, or one made for it --, a button or a chat
 * fires it, and so does any other block that can while nothing on the page
 * fires it yet: a picker alone on a page runs the graph when a file is
 * picked, with no setting to make. What it shows is an end point: one the
 * graph has that no block shows yet, or one made for it. With several start
 * points the page starts, which one is the person's to say.
 */
function connected(widget: GuiWidget, nodes: GraphNode[], blocks: GuiWidget[]): { block: GuiWidget; add: GraphNode[] } {
  const can = blockCan(widget);
  const add: GraphNode[] = [];
  const block: GuiWidget = { ...widget };
  const always = can.fires && !!WIDGET_BUILDERS[widget.kind]?.firesWhenMade;
  if (can.sends || always) {
    const starts = pageStartPoints(nodes);
    let start = starts.length === 1 ? starts[0].id : undefined;
    if (!starts.length) {
      const made = newPoint('start', 'Start', add);
      add.push(made);
      start = made.id;
    }
    if (start && can.sends) block.sends_to = [start];
    const firedAlready = !!start && blocks.some((other) => other.fires === start && blockCan(other).fires);
    if (start && can.fires && (always || !firedAlready)) block.fires = start;
  }
  if (can.shows) {
    const free = endPoints(nodes).find((end) => !blocksAt(blocks, end.id).show.length);
    if (free) block.shows = free.id;
    else {
      const made = newPoint('end', widget.label || 'Result', add);
      add.push(made);
      block.shows = made.id;
    }
  }
  return { block, add };
}

/**
 * Put *widget* on the page at place *at*, at the end without one -- the order
 * is the position -- connected as a new block of its kind is most often
 * wanted (`connected`), and with the start or end point that takes, in the
 * block's own undo step: one Undo takes back the block and what came with it.
 */
export function insertBlock(widget: GuiWidget, at?: number): void {
  const { block, add } = connected(widget, nodesNow(), useGraphStore.getState().page);
  rewrite((widgets) => {
    const next = [...widgets];
    next.splice(at ?? next.length, 0, block);
    return next;
  }, undefined, add);
}

/**
 * The blocks of a page drawn from the graph (`pageFromGraph`), added at the
 * end in one undo step -- with the start points a call started that the person
 * put on the page, which are then started by it.
 */
export function addBlocks(blocks: GuiWidget[], toPage: GraphNode[] = []): void {
  const step = 'page.from-graph';
  rewrite((widgets) => [...widgets, ...blocks], step);
  for (const start of toPage) useGraphStore.getState().updateNode(start.id, { config: { ...start.config, started_by: 'page' } }, undefined, step);
}

/**
 * Connect block *widgetId* to a start or end point made for it: what its
 * settings' "New start point" and "New end point" do. *as* says how: its data
 * sent there, its event firing it, or the point it shows.
 */
export function connectToNewPoint(widgetId: string, as: 'sends_to' | 'fires' | 'shows'): void {
  const widget = useGraphStore.getState().page.find((w) => w.id === widgetId);
  if (!widget) return;
  const made = newPoint(as === 'shows' ? 'end' : 'start', as === 'shows' ? widget.label || 'Result' : 'Start', []);
  const patch: Partial<GuiWidget> = as === 'sends_to'
    ? { sends_to: [...(widget.sends_to ?? []), made.id] }
    : { [as]: made.id };
  rewrite((widgets) => widgets.map((w) => (w.id === widgetId ? { ...w, ...patch } : w)), undefined, [made]);
}
