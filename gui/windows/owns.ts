// Whose a node of a round is. A window's nodes are named after it (`<window>`, `<window>_<cell>`), so a node belongs to the window whose id begins its id --
// and where one window's id begins another's (`new_window` and `new_window_2`), to the longer: the shorter would otherwise claim the other's nodes, and
// a failure or an idle node of one window would be read as the other's.

/** Whether the node *nodeId* is window *id*'s, among the windows of *ids* (which holds *id*). */
export function owns(id: string, nodeId: string, ids: readonly string[]): boolean {
  const beginsWith = (one: string): boolean => nodeId === one || nodeId.startsWith(`${one}_`);
  return beginsWith(id) && !ids.some((other) => other.length > id.length && beginsWith(other));
}
