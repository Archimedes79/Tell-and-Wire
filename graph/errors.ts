// Two answers that more than one layer gives, said once.
//
// A project folder says them when it reads, a directory listing when it lists,
// and the server turns both into a status.

/** What was asked for is not there. */
export class NotFound extends Error {}

/** What is there is not a graph: a folder without a flow.json, a file that is something else. */
export class NotAGraph extends Error {}
