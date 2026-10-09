import { useGraphStore } from '../../app/store/graphStore';

/**
 * Whether *key*, pressed on the canvas, deletes what is selected there: Delete
 * and Backspace, while the canvas is the view on screen (*active*). Only a key
 * pressed *on* the canvas is asked about -- a node or the empty canvas clicked
 * last. A node opened takes the canvas's place, and a key pressed in it is the
 * node view's; so is one pressed after a button in it went away under the focus
 * -- ✨ Fix, once it has fixed -- which hands the key to the page, where
 * Backspace deleted the node that was open.
 */
export function deletes(key: string, active: boolean): boolean {
  return active && (key === 'Delete' || key === 'Backspace');
}

/**
 * Delete what is selected on the canvas: its nodes with their wires, and the
 * wires selected besides. Nothing is asked -- it is one undo step, however
 * much goes.
 */
export function deleteSelected(): void {
  const { rfNodes, rfEdges, deleteNodes } = useGraphStore.getState();
  const nodes = rfNodes.filter((node) => node.selected).map((node) => node.id);
  const wires = rfEdges.filter((edge) => edge.selected).map((edge) => edge.id);
  if (nodes.length || wires.length) deleteNodes(nodes, wires);
}
