import type { GraphNode, GuiWidget } from '@/graph';
import { useGraphStore } from '@/store/graphStore';
import { connectedTo } from '@/document/page';

/**
 * Whether *key*, pressed on the canvas, deletes what is selected there: Delete
 * and Backspace, while the canvas is the view on screen (*active*). Only a key
 * pressed *on* the canvas is asked about -- a node or the empty canvas clicked
 * last. A node's panel is open beside the canvas whenever a node is selected,
 * and a key pressed in it is the panel's; so is one pressed after a button in
 * it went away under the focus -- ✨ Fix, once it has fixed -- which hands the
 * key to the page, where Backspace deleted the node the panel was open on.
 */
export function deletes(key: string, active: boolean): boolean {
  return active && (key === 'Delete' || key === 'Backspace');
}

/**
 * What to ask before *nodes* go, or null when nothing goes with them that
 * Ctrl+Z is not the place to find out about: the *wires* into and out of
 * them, and what the blocks of the page connect to them -- a start point a
 * button fires, an end point a chart shows, which the blocks lose with it.
 * One question, whichever way they go: Delete on the canvas, or a card's ✕. A
 * node with nothing wired and nothing on the page connected to it goes
 * without a word: a confirmation for that is the kind of prompt people learn
 * to click through.
 */
export function removalQuestion(nodes: GraphNode[], wires: number, page: GuiWidget[] = []): string | null {
  const blocks = connectedTo(page, nodes.map((node) => node.id)).length;
  if (!blocks && !wires) return null;
  const counted = (count: number, what: string) => `${count} ${what}${count === 1 ? '' : 's'}`;
  const many = nodes.length > 1;
  const them = many ? 'them' : 'it';
  return [
    many ? `Delete ${nodes.length} nodes?` : `Delete "${nodes[0].label}"?`,
    ...(wires ? [`${many ? 'Their' : 'Its'} ${counted(wires, 'connection')} ${wires === 1 ? 'goes' : 'go'} with ${them}.`] : []),
    ...(blocks ? [`${counted(blocks, 'block')} of the page ${blocks === 1 ? 'loses its' : 'lose their'} connection to ${them}.`] : []),
  ].join(' ');
}

/**
 * Delete nodes *nodeIds* and wires *wireIds* -- the nodes' own wires with
 * them -- once *confirm* said yes to what goes with them (`removalQuestion`):
 * one question, one undo step, and on a no nothing at all. ReactFlow took a
 * node's wires before it asked about the node, so a node kept on Cancel was
 * left with none, and a wired node cost two presses of Ctrl+Z.
 */
export function askToDelete(nodeIds: string[], wireIds: string[], confirm: (question: string) => boolean): void {
  const store = useGraphStore.getState();
  const going = new Set(nodeIds);
  const nodes = store.rfNodes.filter((node) => going.has(node.id)).map((node) => node.data.graphNode as GraphNode);
  if (!nodes.length && !wireIds.length) return;
  const wired = store.rfEdges.filter((edge) => going.has(edge.source) || going.has(edge.target)).length;
  const question = removalQuestion(nodes, wired, store.page);
  if (question && !confirm(question)) return;
  store.deleteNodes(nodes.map((node) => node.id), wireIds);
}

/** Delete what is selected on the canvas: its nodes, and the wires selected besides (`askToDelete`). */
export function deleteSelected(confirm: (question: string) => boolean): void {
  const { rfNodes, rfEdges } = useGraphStore.getState();
  askToDelete(
    rfNodes.filter((node) => node.selected).map((node) => node.id),
    rfEdges.filter((edge) => edge.selected).map((edge) => edge.id),
    confirm,
  );
}
