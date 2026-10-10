// The document handed to the server's session, and the rounds of that session
// shown on the canvas: the store's two actions for it, and what they remember.

import type { ExecutionResult } from '../graph';
import { call, type RoundSnapshot } from '../api/client';
import { useSession, watchSession } from '../api/session';
import { mergeResults } from '../../../graph/graph.ts';
import { withoutAuthoring } from '../../../graph/authoring/handedOn.ts';
import type { GraphStore } from './graphStore';
import { flushPanels } from './flushPanels';

/**
 * Which document the server's session holds -- the `opened` count when it was
 * handed over -- and which session that is: a round is shown only on the
 * document it ran, and another session is listened to anew.
 */
let heldOpened: number | null = null;
let heldSession: string | null = null;
/** While a document is being handed over: the session the server tells meanwhile is the one this asks for. */
let handing = false;

/** Whether the session the server says it holds is another than the one this editor's document was handed to. */
export const serverHoldsAnother = (): boolean => {
  const told = useSession.getState().view?.session;
  return !!told && !!heldSession && told !== heldSession;
};

/** Whether a document is being handed over now. */
export const isHanding = (): boolean => handing;

/**
 * The round going in this document, or null. Only the session says whether one
 * goes (`useSession`), so a stop button cannot outlive the round it stops --
 * unless the server holds another editor's document now (*elsewhere*), whose
 * round is not this one's.
 */
export function goingIn(elsewhere: boolean): RoundSnapshot | null {
  const { round } = useSession.getState();
  return round && !round.done && !elsewhere ? round : null;
}

/** The store's actions that hand the document over and follow its rounds. */
export function handoffActions(
  set: (recipe: (state: GraphStore) => void) => void,
  get: () => GraphStore,
): Pick<GraphStore, 'holdDocument' | 'followRound'> {
  return {
    holdDocument: async () => {
      flushPanels();
      const { opened, currentFilePath, rootGraph } = get();
      // Another document: none of the sessions held for the one before is its.
      if (heldOpened !== opened) heldSession = null;
      handing = true;
      let session: string;
      try {
        ({ session } = await call('holdGraph', { graph: withoutAuthoring(rootGraph()), path: currentFilePath, session: heldSession }));
      } finally {
        handing = false;
      }
      heldOpened = opened;
      if (get().heldElsewhere) set((state) => { state.heldElsewhere = false; });
      if (session !== heldSession) {
        heldSession = session;
        watchSession();
      }
    },

    followRound: (round) => {
      // Another document is open now. Its nodes may share that one's ids, and
      // what that round made is not theirs.
      if (heldOpened !== get().opened) return;
      // Another tab's document: the server holds one session, and that round is of its graph.
      if (serverHoldsAnother()) return;
      if (!round.done) return;
      set((state) => {
        const made: ExecutionResult = round.result ?? {
          status: round.cancelled ? 'cancelled' : 'error',
          node_results: [],
          outputs: {},
          error: round.error ?? 'The run ended without a result.',
        };
        // A round an event started ran part of the graph, so what the rest of
        // the page shows is still true and stays: pressing "Plot" must not
        // blank the summary beside it. A whole round starts from a clean slate.
        const shown = state.executionResult as ExecutionResult | null;
        state.executionResult = (shown && round.started ? mergeResults(shown, made) : made) as never;
      });
    },
  };
}
