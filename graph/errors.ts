// What more than one layer says, said once: two answers and what an error says.
//
// A project folder says the answers when it reads, a directory listing when it lists,
// and the server turns both into a status.

/** What was asked for is not there. */
export class NotFound extends Error {}

/** What is there is not a graph: a folder without a graph-flow.json, a file that is something else. */
export class NotAGraph extends Error {}

/** What a caught error says: its message, or what was thrown if it was not an Error. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
