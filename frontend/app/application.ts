// The application ▶ Run starts, as an IDE runs the program it builds.
//
// One button, and it runs the tool the way whoever gets it will: with a page,
// the page opens -- its fields filled in as they are set -- and the graph runs
// when the page is used, a button pressed, a file picked. With a start point a
// call starts, the App tab opens as its caller, as a script would call it.
// Without either, what starts the graph starts it: a start point set to start
// when the tool starts starts, a clock keeps its time, and a graph with
// nothing that starts itself runs whole, once, as a program runs when it is
// started (`startEvents`). ■ Stop ends it.
//
// It runs until it is stopped where something is left to happen -- a page to
// use, a call to make, a clock to tick -- and ends by itself where nothing is:
// a graph that only computes, like a program that has returned.
//
// The clock is the server's, as a served tool's is (`backend/gui-editor/session.ts`): the
// document is handed to the server's session, which keeps the time of its
// start points from ▶ Run to ■ Stop, so a round comes due in the editor when
// it would in a bundle, and asks nobody anything. It is the document that
// runs: while the application runs, what is edited is handed over a moment
// after, and the next round runs that. And it ends with the editor: closed or
// reloaded while it runs, the page tells the server to stop the clock, which
// would otherwise tick on with nobody there.

import { create } from 'zustand';
import type { Graph } from './graph';
import { goingRound, useGraphStore } from './store/graphStore';
import { call } from './api/client';
import { stopRound } from './api/session';
import { startEvents } from '../../graph/execution/triggers.ts';
import { registry as runnerRegistry } from '../../graph/nodes/registry.ts';

/**
 * Whether ▶ Run opens the App tab for *graph*: it has a page to use, or a
 * start point a call starts -- the App tab is its caller then.
 */
export function opensApp(graph: Pick<Graph, 'nodes' | 'page'>): boolean {
  return !!graph.page?.blocks.length || graph.nodes.some((node) => runnerRegistry.node(node.node_type)?.startedBy(node as never) === 'call');
}

export const useApplication = create<{
  /** The application is running: its page waits to be used, its clocks tick. */
  running: boolean;
}>(() => ({ running: false }));

/** Whether ▶ Run opens the App tab for the graph at the top (`opensApp`), from whatever level is on screen. */
export function useTopOpensApp(): boolean {
  return useGraphStore((s) => opensApp(s.subgraphStack.length
    ? s.subgraphStack[0].graph
    : { nodes: s.rfNodes.map((node) => node.data.graphNode as never), page: { blocks: s.page } }));
}

/** How long after an edit, while the application runs, the document is handed over again. */
const HOLD_AFTER_EDIT_MS = 500;

/** What the running application set up, each undone when it ends. */
let whileRunning: (() => void)[] = [];

/** While the application runs, hand the server each edit of the document, a moment after it was made. */
function followEdits(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = useGraphStore.subscribe((state, before) => {
    if (state.rfNodes === before.rfNodes && state.rfEdges === before.rfEdges && state.metadata === before.metadata
      && state.page === before.page) return;
    clearTimeout(timer);
    timer = setTimeout(() => { void useGraphStore.getState().holdDocument().catch(() => {}); }, HOLD_AFTER_EDIT_MS);
  });
  return () => {
    clearTimeout(timer);
    stop();
  };
}

/** While the application runs, stop the server's clock when the editor is closed or reloaded. */
function stopWhenLeft(): () => void {
  const left = (): void => { void call('stopApplication', {}, { keepalive: true }).catch(() => {}); };
  addEventListener('pagehide', left);
  return () => removeEventListener('pagehide', left);
}

/** Which start is the current one: ■ Stop, or another ▶ Run, ends the steps of an earlier one still on their way. */
let generation = 0;

/**
 * Start the application *graph* -- stopping one that is running first -- and
 * resolve once what starting it runs has started. *runWhole* runs it whole,
 * for a graph nothing else starts: the delivered tool's steps, which ask first
 * what the graph still needs (`useRound`). A step that fails ends the
 * application and is thrown: nothing stays running that is not.
 */
export async function startApplication(graph: Graph, runWhole: () => Promise<void>): Promise<void> {
  const stopping = stopApplication();
  const mine = (generation += 1);
  const current = () => generation === mine;
  // Running from the moment ▶ Run is pressed, before the server has answered:
  // the App tab it opens is shown only while the application runs, and would
  // close again in between.
  useApplication.setState({ running: true });
  // What the graph's cards showed before is not what this run has done.
  useGraphStore.getState().setExecutionResult(null);
  try {
    // The one before is stopped in the server first, or its stop could overtake this start.
    await stopping;
    if (!current()) return;
    await useGraphStore.getState().holdDocument();
    // ■ Stop pressed while the document was on its way: nothing starts after it.
    if (!current()) return;
    whileRunning = [followEdits(), stopWhenLeft()];
    const { ticks } = await call('startApplication', {});
    if (!current()) {
      await call('stopApplication', {}).catch(() => {});
      return;
    }
    if (startEvents(graph, runnerRegistry).includes(null)) await runWhole();
    // Nothing left to happen: no page to use, no call to make, no clock to tick.
    if (current() && !opensApp(graph) && !ticks) await end();
  } catch (error) {
    if (current()) await end();
    throw error;
  }
}

/** No longer running: edits no longer handed over, and the server's clock stopped -- once it has answered. */
function end(): Promise<void> {
  generation += 1;
  for (const undo of whileRunning) undo();
  whileRunning = [];
  useApplication.setState({ running: false });
  return call('stopApplication', {}).then(() => {}, () => {});
}

/** Stop the application -- its clocks -- and the round in flight, whoever started it. */
export async function stopApplication(): Promise<void> {
  const ending = useApplication.getState().running ? end() : null;
  if (goingRound()) await stopRound().catch(() => {});
  await ending;
}
