import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RoundSnapshot, SessionView } from './client';

// The server: each round started gets the next id; nothing else is asked.
const server = vi.hoisted(() => ({ rounds: 0, stopped: [] as string[], running: null as unknown, next: null as unknown }));
vi.mock('./client', async (actual) => ({
  ...(await actual<typeof import('./client')>()),
  call: vi.fn(async (route: string, body?: { id?: string }) => {
    if (route === 'startRound') {
      server.rounds += 1;
      return { session: 's1', round_id: `r${server.rounds}`, total: 1 };
    }
    if (route === 'stopRound') {
      server.stopped.push(body!.id!);
      // A round stopped is no longer the one going: the one queued behind it is.
      if ((server.running as { round_id?: string } | null)?.round_id === body!.id) {
        server.running = server.next ?? null;
        server.next = null;
      }
    }
    // What the session says is going: the round that runs, where others only wait.
    if (route === 'session') return { round: server.running };
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

const { setEdit, useSession, watchSession } = await import('./session');
const { startRound, stopRound } = await import('./start');
const told = (type: 'session' | 'round', data: unknown) => streams[streams.length - 1].listeners[type]({ data: JSON.stringify(data) } as MessageEvent<string>);

/** The session as the server tells it, *gui* what each block holds. */
const view = (gui: Record<string, unknown>, session = 's1'): SessionView => ({
  session, sent: {}, gui, shown: {}, kept: { nodes: {}, gui: {} }, outputs: {}, state: {}, rounds: 0, finished_at: null, round: null, dropped: [], design_revision: 0,
  clock: { running: false, runs_by_itself: false, ticks: false, next_at: null, problem: null },
});
const round = (id: string, over: Partial<RoundSnapshot> = {}): RoundSnapshot => ({
  round_id: id, done: true, cancelled: false, completed: 1, total: 1, current_label: '', running: [], finished: {}, item_done: 0, item_total: 0,
  idle_seconds: null, error: null, result: { status: 'success', node_results: [], outputs: {} }, outputs: {}, started: { event: 'go', by: 'press' }, ...over,
});

beforeEach(() => {
  useSession.setState({ view: null, round: null, edits: {}, sent: {} });
  watchSession();
});

describe('what was set here on a GUI', () => {
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

describe('Stop', () => {
  const going = (id: string) => round(id, { done: false, result: null });

  it('stops the round this page was told of, and follows the queue: the one that runs, and the next behind it', async () => {
    server.stopped.length = 0;
    // The page was told of r3, which only queued; r1 runs, r2 waits behind it.
    server.running = going('r1');
    server.next = going('r2');
    useSession.setState({ round: going('r3') });
    await stopRound();
    expect(server.stopped).toEqual(['r3', 'r1', 'r2']);
    expect(server.running).toBeNull();
  });

  it('stops one round once, however long it takes to wind down, and nothing where nothing is going', async () => {
    server.stopped.length = 0;
    server.next = null;
    server.running = going('r1');
    useSession.setState({ round: going('r1') });
    await stopRound();
    expect(server.stopped).toEqual(['r1']);

    server.stopped.length = 0;
    server.running = null;
    useSession.setState({ round: round('r4') });
    await stopRound();
    expect(server.stopped).toEqual([]);
  });
});
