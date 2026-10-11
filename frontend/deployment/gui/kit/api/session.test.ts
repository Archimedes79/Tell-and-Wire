import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RoundSnapshot, SessionView } from './client';

// The server: each round started gets the next id; nothing else is asked.
const server = vi.hoisted(() => ({ rounds: 0 }));
vi.mock('./client', async (actual) => ({
  ...(await actual<typeof import('./client')>()),
  call: vi.fn(async (route: string) => {
    if (route === 'startRound') {
      server.rounds += 1;
      return { session: 's1', round_id: `r${server.rounds}`, total: 1 };
    }
    return {};
  }),
}));

// A stream the test speaks for: the events the server would send.
const streams: { listeners: Record<string, (event: MessageEvent<string>) => void> }[] = [];
class FakeStream {
  listeners: Record<string, (event: MessageEvent<string>) => void> = {};
  constructor() { streams.push(this); }
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) { this.listeners[type] = listener; }
  close() {}
}
vi.stubGlobal('EventSource', FakeStream);

const { setEdit, startRound, useSession, watchSession } = await import('./session');
const told = (type: 'session' | 'round', data: unknown) => streams[streams.length - 1].listeners[type]({ data: JSON.stringify(data) } as MessageEvent<string>);

/** The session as the server tells it, *page* what each block holds. */
const view = (page: Record<string, unknown>, session = 's1'): SessionView => ({
  session, sent: {}, page, shown: {}, kept: { nodes: {}, page: {} }, outputs: {}, state: {}, rounds: 0, finished_at: null, round: null, dropped: [], design_revision: 0,
  clock: { running: false, runs_by_itself: false, ticks: false, next_at: null, problem: null },
});
const round = (id: string, over: Partial<RoundSnapshot> = {}): RoundSnapshot => ({
  round_id: id, done: true, cancelled: false, completed: 1, total: 1, current_label: '', item_done: 0, item_total: 0,
  idle_seconds: null, error: null, result: { status: 'success', node_results: [], outputs: {} }, outputs: {}, started: { event: 'go', by: 'press' }, ...over,
});

beforeEach(() => {
  useSession.setState({ view: null, round: null, edits: {}, sent: {} });
  watchSession();
});

describe('what was set here on a page', () => {
  const edits = () => useSession.getState().edits;

  it('goes with a round, and is let go of once the round has run to its end -- not when it was stopped, and not what was typed since', async () => {
    told('session', view({}));
    setEdit('say', 'hello');
    await startRound('send', { values: { say: 'hello' }, by: 'say' });
    expect(edits()).toEqual({ say: 'hello' });
    told('round', round('r1'));
    expect(edits()).toEqual({});

    // Stopped, the message is still in hand.
    setEdit('say', 'again');
    await startRound('send', { values: { say: 'again' }, by: 'say' });
    told('round', round('r2', { cancelled: true, result: null }));
    expect(edits()).toEqual({ say: 'again' });

    // Typed while the round was on its way: only what was sent is let go of.
    await startRound('send', { values: { say: 'again' }, by: 'say' });
    setEdit('say', 'next');
    told('round', round('r3'));
    expect(edits()).toEqual({ say: 'next' });
  });
});
