// The clock of a tool that runs by itself: what its start points start by themselves, one
// round after another.
//
// Kept by the server's session (`backend/gui-editor/session.ts`) -- for the tool it serves,
// and for the application the editor's ▶ Run starts -- so there is one clock,
// and it goes on whether or not a page is open: a second one, in the browser,
// would come to disagree with it about when a round is due.
//
// What starting runs is `startEvents`'s to say: each start point set to start
// at start fires first. Each one with an interval then keeps its own time,
// counted from the end of its last round to the start of the next -- the rule
// `--every` follows on the command line -- so a round slower than its interval
// is followed by the next rather than overtaken by it. Rounds share one queue
// and never overlap.
//
// A start point is looked up again each time it is due, in the graph as it is
// then: deleted since, its clock stops rather than start a round for a node
// that is not there; its interval changed, the new one counts from then on. One
// that had no interval when the clock started keeps no time until the clock is
// started again: nothing is due for it to look up.

import type { Graph } from '../graph.ts';
import type { Runners } from '../nodes/NodeRunner.ts';
import { after, graphTriggers, parseInterval, startEvents, type GraphTrigger, type Trigger } from './triggers.ts';

export interface Clock {
  /** Whether it runs anything by itself: a start point starts when the tool starts, or keeps time. */
  readonly runsByItself: boolean;
  /** Whether a start point keeps time: a tool with one has something left to happen once it has started. */
  readonly ticks: boolean;
  /** Why an interval could not be read, while one cannot: that start point keeps no time. */
  problem(): string | null;
  /** When the next round is due, or null while none is. */
  nextAt(): number | null;
  /** Settles once the rounds starting the tool began have run. */
  readonly started: Promise<void>;
  /** No round starts afterwards; settles once the round in flight has ended. */
  stop(): Promise<void>;
}

interface Hand {
  event: Trigger;
  ms: number;
  /** Why its interval cannot be read, while it cannot. */
  problem: string | null;
  next_at: number | null;
  cancel?: () => void;
}

const same = (a: Trigger, b: Trigger): boolean => a.node_id === b.node_id && (a.port_id ?? null) === (b.port_id ?? null);

/**
 * Start the clock of *graph* -- asked again each time a start point is due -- and
 * hand each round to *round*, one at a time. A round's failure is the host's
 * to report; a round that throws does not stop the clock.
 */
export function startClock(graph: () => Graph, elements: Runners, round: (event: Trigger) => Promise<void>): Clock {
  let stopped = false;
  let inFlight: Promise<void> = Promise.resolve();

  /** Its interval in milliseconds, 0 for none -- or for one nobody can read, which `problem` says. */
  const timing = (trigger: GraphTrigger): { ms: number; problem: string | null } => {
    if (!trigger.every) return { ms: 0, problem: null };
    try {
      return { ms: parseInterval(trigger.every) * 1000, problem: null };
    } catch (error) {
      return { ms: 0, problem: error instanceof Error ? error.message : String(error) };
    }
  };

  const hands: Hand[] = graphTriggers(graph(), elements).map((trigger) => ({ event: trigger.event, ...timing(trigger), next_at: null }));

  const wind = (hand: Hand): void => {
    if (stopped || hand.ms <= 0) return;
    hand.next_at = Date.now() + hand.ms;
    // Whoever holds the clock is what keeps a process alive, not a round due.
    hand.cancel = after(hand.ms, () => begin(hand), false);
  };

  const tick = async (hand: Hand): Promise<void> => {
    hand.next_at = null;
    if (stopped) return;
    const now = graphTriggers(graph(), elements).find((trigger) => same(trigger.event, hand.event));
    if (!now) return;
    Object.assign(hand, timing(now));
    try {
      await round(hand.event);
    } catch {
      // The host says what went wrong with a round; the next one may be fine.
    }
    wind(hand);
  };

  const begin = (hand: Hand): void => { inFlight = inFlight.then(() => tick(hand)); };

  const starting = startEvents(graph(), elements);
  const firesAtStart = (hand: Hand): boolean => starting.some((event) => event !== null && same(event, hand.event));
  for (const hand of hands) {
    if (firesAtStart(hand)) begin(hand);
    else wind(hand);
  }
  const started = inFlight;

  return {
    runsByItself: hands.some((hand) => hand.ms > 0 || firesAtStart(hand)),
    ticks: hands.some((hand) => hand.ms > 0),
    problem: () => hands.find((hand) => hand.problem)?.problem ?? null,
    nextAt: () => {
      const due = hands.map((hand) => hand.next_at).filter((at): at is number => at !== null);
      return due.length ? Math.min(...due) : null;
    },
    started,
    stop: () => {
      stopped = true;
      for (const hand of hands) {
        hand.cancel?.();
        hand.next_at = null;
      }
      return inFlight;
    },
  };
}
