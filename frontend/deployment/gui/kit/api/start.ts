// What the GUI does to its tool: begin a round, stop it, start over.
//
// The start half of the GUI port (`port.ts`). It says nothing of the answer: a round begun here comes back on the stream like any other,
// whoever began it, and is shown by what listens (`session.ts`, the return half). All it tells that side is which round it began and what
// it sent, so that what was set on the GUI is let go of once the round has run to its end.

import { port, type RoundAsk } from './port';
import { forgetEdits, roundRefused, roundStarted, sessionReset, useSession } from './session';

export type { RoundAsk } from './port';

/**
 * Start a round for *event* -- the whole graph for none -- asked with *ask*:
 * one the GUI starts is `by` the block that fired it, and sent what the
 * gui set, by block id. One the server turns down -- a name the graph does
 * not offer, another session's id -- is said where every failed round is,
 * and what was set here stays in hand.
 */
export async function startRound(event: string | null, ask: RoundAsk = {}): Promise<void> {
  let id: string;
  try {
    ({ round_id: id } = await port().start.start(event, ask));
  } catch (error) {
    roundRefused(error, event, ask.by);
    return;
  }
  roundStarted(id, ask.values ?? {});
}

/**
 * Start over: the session forgets what using the graph left behind -- what
 * its start points were sent, what its memory holds, what the GUI holds --
 * and so does this GUI, what was set on it and not sent yet.
 */
export async function startOver(): Promise<void> {
  forgetEdits();
  try {
    sessionReset(await port().start.reset());
  } catch (error) {
    roundRefused(error, null, undefined, 'It could not start over.');
  }
}

/** How many rounds one press of Stop follows down the queue: more than a person starts in a moment. */
const STOP_AT_MOST = 6;

/**
 * Stop the round going, whoever started it -- and the ones waiting behind it. The latest this page was
 * told of may only have queued, and stopping that alone leaves the one that runs going; so what the
 * server calls the round going (the one that runs) is stopped too, and asked for again until none is.
 */
export async function stopRound(): Promise<void> {
  const { round } = useSession.getState();
  const stopped = new Set<string>();
  const stop = async (id: string): Promise<void> => {
    stopped.add(id);
    // A round that ended before it was told is no failure of this press.
    await port().start.stop(id).catch(() => undefined);
  };
  // The one this page knows of is stopped at once.
  const first = round && !round.done ? stop(round.round_id) : Promise.resolve();
  for (let asked = 0; asked < STOP_AT_MOST; asked += 1) {
    let going: string | null = null;
    try {
      const { round: running } = await port().back.session();
      going = running && !running.done ? running.round_id : null;
    } catch {
      break; // The server did not answer: what this page knows of is stopped.
    }
    if (!going) break;
    // Still winding down after its stop: given a moment, not told again.
    if (stopped.has(going)) await new Promise((wait) => setTimeout(wait, 120));
    else await stop(going);
  }
  await first;
}

