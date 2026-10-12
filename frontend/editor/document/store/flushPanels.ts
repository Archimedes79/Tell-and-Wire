// What a node panel has typed and not yet written (400 ms after the last key)
// is written before anything that saves, runs, undoes or leaves the graph.

const waiting = new Set<() => void>();

/** A panel on screen: *write* is called by `flushPanels`. Returns the end of it. */
export function whenFlushed(write: () => void): () => void {
  waiting.add(write);
  return () => { waiting.delete(write); };
}

/** Write what every panel on screen holds into the graph now. */
export function flushPanels(): void {
  for (const write of [...waiting]) write();
}
