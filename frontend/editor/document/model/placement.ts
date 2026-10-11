import { registry } from '../../../../graph/nodes/registry.ts';
import { columnsOf, type Table } from '../../../../graph/schedule.ts';
import type { Target } from '../../../../graph/editor/scheduleEdit.ts';

/** What `placement` reads of a node on the canvas (an `rfNode` has all of it). */
interface Placed {
  id: string;
  selected?: boolean;
  data: { graphNode: { node_type: string } };
}

/**
 * Where a node that nobody put anywhere goes -- a palette click: in a column of its own
 * right of the selected node, else of the last one that is not an end point (where a graph
 * ends: what is added is not after it), in the row that node stands in. The columns after
 * it, an end point's among them, make room by moving over.
 */
export function placement(table: Table, nodes: Placed[]): Target {
  const isResult = (node: Placed): boolean => !!registry.node(node.data.graphNode.node_type)?.isResult;
  const column = columnsOf(table);
  const selected = nodes.filter((node) => node.selected && !isResult(node));
  const rest = nodes.filter((node) => !isResult(node));
  const beside = (selected.length ? selected : rest).filter((node) => column.has(node.id))
    .reduce<Placed | undefined>((far, node) => (!far || column.get(node.id)! > column.get(far.id)! ? node : far), undefined);
  if (!beside) return { kind: 'gap', k: 0, r: 0 };
  const row = table.findIndex((cells) => cells.includes(beside.id));
  return { kind: 'gap', k: column.get(beside.id)! + 1, r: row };
}
