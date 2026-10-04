import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RoundSnapshot, SessionView } from './client';

// The server: each round started gets the next id; nothing else is asked.
const server = vi.hoisted(() => ({ rounds: 0, asked: [] as unknown[], refusal: null as string | null }));
vi.mock('./client', async (actual) => ({
  ...(await actual<typeof import('./client')>()),
  call: vi.fn(async (route: string, body?: unknown) => {
    server.asked.push([route, body]);
    if (route === 'startRound') {
      if (server.refusal) throw new Error(server.refusal);
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

const { forgetSession, heldValue, setEdit, startRound, useSession, watchSession } = await import('./session');
const told = (type: 'session' | 'round', data: unknown) => streams[streams.length - 1].listeners[type]({ data: JSON.stringify(data) } as MessageEvent<string>);

/** The session as the server tells it, *page* what each block holds. */
const view = (page: Record<string, unknown>, session = 's1'): SessionView => ({
  session, sent: {}, page, shown: {}, kept: { nodes: {}, page: {} }, outputs: {}, rounds: 0, finished_at: null, round: null, dropped: [], design_revision: 0,
  clock: { running: false, runs_by_itself: false, ticks: false, next_at: null, problem: null },
});
const round = (id: string, over: Partial<RoundSnapshot> = {}): RoundSnapshot => ({
  round_id: id, done: true, cancelled: false, completed: 1, total: 1, current_label: '', item_done: 0, item_total: 0,
  idle_seconds: null, error: null, result: { status: 'success', node_results: [], outputs: {} }, outputs: {}, started: { event: 'go', by: 'press' }, ...over,
});

beforeEach(() => {
  server.refusal = null;
  useSession.setState({ view: null, round: null, edits: {}, sent: {} });
  watchSession();
});

describe('what a page shows a block holding', () => {
  it('is what was set here, else what the session keeps, else its design', () => {
    told('session', view({ length: 'long' }));
    const state = () => useSession.getState();
    expect(heldValue(state(), 'title', 'design')).toBe('design');
    expect(heldValue(state(), 'length', 'short')).toBe('long');
    setEdit('length', 'medium');
    expect(heldValue(state(), 'length', 'short')).toBe('medium');
  });
});

describe('what was set here', () => {
  it('goes with a round, and is let go of once the round has run to its end and the session keeps it', async () => {
    told('session', view({}));
    setEdit('say', 'hello');
    await startRound('send', { values: { say: 'hello' }, by: 'say' });
    expect(useSession.getState().edits).toEqual({ say: 'hello' });
    told('round', round('r1'));
    expect(useSession.getState().edits).toEqual({});
  });

  it('stays where it was when the round was stopped: the message is still in hand', async () => {
    told('session', view({}));
    setEdit('say', 'hello');
    await startRound('send', { values: { say: 'hello' }, by: 'say' });
    told('round', round('r1', { cancelled: true, result: null }));
    expect(useSession.getState().edits).toEqual({ say: 'hello' });
  });

  it('keeps what was typed while the round was on its way: only what was sent is let go of (B34)', async () => {
    told('session', view({}));
    setEdit('say', 'first');
    await startRound('send', { values: { say: 'first' }, by: 'say' });
    setEdit('say', 'second');
    told('round', round('r1'));
    expect(useSession.getState().edits).toEqual({ say: 'second' });
  });

  it('is let go of all the same when the round ended before the page heard which round it was', async () => {
    told('session', view({}));
    setEdit('say', 'quick');
    told('round', round(`r${server.rounds + 1}`));
    await startRound('send', { values: { say: 'quick' }, by: 'say' });
    expect(useSession.getState().edits).toEqual({});
  });

  it('is another session\'s no more once the server holds another', () => {
    told('session', view({}, 's1'));
    setEdit('say', 'hello');
    told('session', view({}, 's2'));
    expect(useSession.getState().edits).toEqual({});
  });

  it('is, with what the session showed, the one of the document before once another is open', () => {
    // File ▸ New: the new page's text output showed the summary the one before had made.
    told('session', { ...view({ say: 'hello' }), shown: { text_io: 'A summary.' } });
    setEdit('say', 'more');
    forgetSession();
    expect(useSession.getState()).toMatchObject({ view: null, round: null, edits: {}, sent: {} });
  });
});

describe('a round the server turns down', () => {
  it('is said as one that ended before it began, for the server\'s reason -- and what was set stays in hand', async () => {
    told('session', view({}));
    setEdit('say', 'hello');
    server.refusal = 'The block "say" does not fire "go"; it is fired by "send".';
    await startRound('go', { values: { say: 'hello' }, by: 'say' });
    expect(useSession.getState().round).toMatchObject({ done: true, cancelled: false, result: null, error: server.refusal });
    expect(useSession.getState().edits).toEqual({ say: 'hello' });
  });
});
