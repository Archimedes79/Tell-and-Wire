import { registry as runnerRegistry } from '../../../graph/nodes/registry.ts';

/** What `placement` reads of a node on the canvas (an `rfNode` has all of it). */
interface Placed {
  position: { x: number; y: number };
  width?: number | null;
  height?: number | null;
  selected?: boolean;
  data: { graphNode: { node_type: string } };
}

/** A card is 260 wide at most; one not measured yet is taken to be that and 160 high. */
const CARD = { width: 260, height: 160 };
/** The room a wire needs between two cards, and half of it between two in a column. */
const GAP = 80;
/** Where the first node goes: in sight of the canvas of an empty graph (`GraphCanvas`). */
const FIRST = { x: 200, y: 120 };

const right = (node: Placed): number => node.position.x + (node.width ?? CARD.width);
const bottom = (node: Placed): number => node.position.y + (node.height ?? CARD.height);

/**
 * Where a node that nobody put anywhere goes -- a palette click, the start
 * point a block on the page makes: to the right of the selected node, else of
 * the rightmost one that is not an end point (where a graph ends: what is
 * added is not after it) -- and never on a card: where one is, below it. An
 * end point is not such a card: it makes room (`makeRoom`).
 */
export function placement(nodes: Placed[]): { x: number; y: number } {
  const selected = nodes.filter((node) => node.selected && !isResult(node));
  const rest = nodes.filter((node) => !isResult(node));
  const beside = (selected.length ? selected : rest).reduce<Placed | undefined>((far, node) => (!far || right(node) > right(far) ? node : far), undefined);
  let at = beside ? { x: right(beside) + GAP, y: beside.position.y } : FIRST;
  const room = GAP / 2;
  const covered = (): Placed | undefined => nodes.find((node) => !isResult(node)
    && at.x < right(node) + room && at.x + CARD.width > node.position.x - room
    && at.y < bottom(node) + room && at.y + CARD.height > node.position.y - room);
  for (let on = covered(); on; on = covered()) at = { x: at.x, y: bottom(on) + room };
  return at;
}

/** What a graph ends in is the runner's to say (`isResult`): an end point. */
const isResult = (node: Placed): boolean => !!runnerRegistry.node(node.data.graphNode.node_type)?.isResult;

/**
 * The end points a node put at *at* would stand on or crowd, and the column
 * they move to, right of it: a graph reads left to right, and a wire that ran
 * back to an end point left of what feeds it would cross the node it leaves.
 */
export function makeRoom(nodes: (Placed & { id: string })[], at: { x: number }): { id: string; x: number }[] {
  const column = at.x + CARD.width + GAP;
  return nodes.filter((node) => isResult(node) && node.position.x < column && right(node) > at.x - GAP / 2).map((node) => ({ id: node.id, x: column }));
}
