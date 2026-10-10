// A path written in a graph file -- a start point's, an end point's -- is the
// graph's, and a graph may come from a stranger. It names a place below the
// folder the tool runs in, never one elsewhere. A path that comes at run time
// from the person -- a file chosen on the page, a call's values, the command
// line -- is theirs and is not held to this.
//
// Only the spelling here, so that `check` can say it and a browser can run it;
// links and the real folder are `core/confine.ts`'s.

/** Why *path*, as a graph file writes it, is refused -- or null: it is relative and stays below its folder. */
export function ownPathProblem(path: string): string | null {
  if (/^([a-zA-Z]:|[\\/])/.test(path)) return `"${path}" is an absolute path. A path written in a graph is relative to the folder the tool runs in.`;
  if (path.split(/[\\/]+/).includes('..')) return `"${path}" leaves the folder the tool runs in.`;
  return null;
}
