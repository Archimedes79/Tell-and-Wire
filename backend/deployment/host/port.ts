// The GUI port: the connection points a page has to the tool it shows.
//
// A tool's page -- the built-in GUI, a hand-written `frontend/index.html` in the project, a more sophisticated site, a test, a phone app --
// is a different program from the tool, and meets it at these points and nowhere else. They are routes of the runtime API
// (`api.ts`), sorted by what a page does there:
//
//   describe  what the tool offers, by name: its start points, end points and memory, the GUI as designed
//   start     what a page does to the tool: begin a round, stop it, start over
//   return    what the tool tells the page: the session, every round as it goes, the answer
//   state     what a page may keep for later: states saved under a name
//   files     what a page needs to name a file on the machine the tool runs on
//
// *Start* and *return* are apart on purpose: a page that starts a round does not wait for its answer where it started it -- the answer is
// a round on the stream, whoever began it (this page, another tab, the clock) -- so a page can be built as two halves that know nothing
// of each other. Every route of the runtime API is placed here (the compiler holds it), and the server tells a page what they are
// (`GET /api/runtime/port`), so that a page does not hard-code a path. `docs/architecture.md`, "The GUI port".

import { API, GUI_API, type PortView } from './api.ts';

/** What a page does at a connection point. */
export type Role = 'describe' | 'start' | 'return' | 'state' | 'files';

/** The version of the port a page may rely on: raised when a point changes in a way an old page would not survive. */
export const PORT_VERSION = 1;

const ROUTES = { ...API, ...GUI_API };

interface Point {
  role: Role;
  summary: string;
}

/** Every route of the runtime API but the one that tells this, by name: what it is for. */
export const GUI_PORT = {
  interface: { role: 'describe', summary: 'what the graph offers by name: start points, end points, memory nodes' },
  gui: { role: 'describe', summary: 'the GUI as designed: its blocks, and how they connect to the start and end points by name' },
  toolAiSettings: { role: 'describe', summary: 'which model the tool calls (read-only: no key)' },
  requirements: { role: 'start', summary: 'what a round for this event still needs before it runs' },
  startRound: { role: 'start', summary: 'begin a round at a start point with values; answers its id at once' },
  runRound: { role: 'start', summary: 'begin a round and wait for what it hands back: a function call' },
  stopRound: { role: 'start', summary: 'stop a round' },
  reset: { role: 'start', summary: 'start over: forget what using the graph left behind' },
  session: { role: 'return', summary: 'the session now: what was sent, what the end points handed back, what is kept' },
  stream: { role: 'return', summary: 'server-sent events: the session on connect and after every change, each round as it goes' },
  round: { role: 'return', summary: 'one round as it goes, and what it handed back once it ended' },
  states: { role: 'state', summary: 'the states saved under a name' },
  saveState: { role: 'state', summary: 'save what is kept under a name (the person at the keyboard only)' },
  loadState: { role: 'state', summary: 'take a saved state back (the person at the keyboard only)' },
  browse: { role: 'files', summary: 'the entries of a folder, for a picker (the person at the keyboard only)' },
  findFile: { role: 'files', summary: 'where a dropped file of this name and size is (the person at the keyboard only)' },
} as const satisfies Record<Exclude<keyof typeof ROUTES, 'port'>, Point>;

/** The port as a page is told it: each connection point by name, with its role, its method and path. *withGui*: the tool has a GUI to describe. */
export function portView(withGui: boolean): PortView {
  const points: PortView['points'] = {};
  for (const [name, point] of Object.entries(GUI_PORT) as [keyof typeof GUI_PORT, Point][]) {
    if (name === 'gui' && !withGui) continue;
    const route = ROUTES[name];
    points[name] = { role: point.role, method: route.method, path: route.path, summary: point.summary, local: !!route.local };
  }
  return { version: PORT_VERSION, points };
}
