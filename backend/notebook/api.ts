// The wire between the notebook and its server: the routes only the notebook's server answers, and what travels.
//
// The notebook's table, beside the host's (`backend/deployment/host/api.ts`, which holds the machinery every table is made
// with, and the routes a run needs: rounds, the session, the file picker). A package does not carry this file.

import type { Graph } from '../../graph/graph.ts';
import type { Windows } from '../../gui/notebook/windows.ts';
import { route } from '../deployment/host/api.ts';

/** The page being made, handed to the server's session: what its rounds run (`holdGraph`). */
interface HeldGraph {
  graph: Graph;
  /** Where it is kept, if anywhere: its session keeps its state beside it. */
  path?: string | null;
  /** The session the page holds for it, as the hand-over before answered; none for one not handed over yet. */
  session?: string | null;
}

/**
 * A project made of windows, as Open and Save return it: the graph on disk, the windows it was made from (none for
 * a project that was not), and whether the graph is still what they made.
 */
export interface WindowsFile {
  path: string;
  graph: Graph;
  /** The path is a project folder, whose code and prompts are files of their own. */
  project: boolean;
  windows: Windows | null;
  /** The graph was changed since the windows made it, by something else: saving the windows would write over that. */
  stale: boolean;
}

/** What only the notebook's server answers. */
export const NOTEBOOK_API = {
  /** A project folder, with the windows it was made from. */
  openWindows: route<{ path: string }, WindowsFile>('POST', '/api/windows/load'),

  /**
   * The windows saved as a project folder: the graph, the schedule and the gui they make, and the windows beside them.
   * One that is already there is written over only when *replace* says so (409, `Failure.taken`).
   */
  saveWindows: route<{ path: string; windows: Windows; replace?: boolean }, WindowsFile>('POST', '/api/windows/save'),

  /** Windows from a description -- or, given the windows there are, those changed as it says. Nothing is written. */
  describeWindows: route<{ description: string; windows?: Windows }, { windows: Windows; explanation: string }>('POST', '/api/windows/describe'),

  /**
   * Hand the server's session the graph the windows make: what its rounds run, whoever starts them. Answers with the
   * session, and what it dropped of what it kept.
   */
  holdGraph: route<HeldGraph, { session: string; dropped: string[] }>('POST', '/api/runtime/hold'),
} as const;

