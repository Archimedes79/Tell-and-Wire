import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecutionResult } from '../graph';
import type { RoundSnapshot } from '../../api/client';

// The server, as far as a document's session goes: it goes on with the session a
// document is handed over as, and any other is a new one.
const server = vi.hoisted(() => {
  const state = { sessions: 0, stopped: [] as string[] };
  const call = async (route: string, body?: { session?: string | null }) => {
    if (route === 'holdGraph') {
      if (!body?.session || body.session !== `s${state.sessions}`) state.sessions += 1;
      return { session: `s${state.sessions}`, dropped: [] };
    }
    if (route === 'stopRound') {
      state.stopped.push((body as unknown as { id: string }).id);
      return {};
    }
    throw new Error(`not expected here: ${route}`);
  };
  return Object.assign(state, { call });
});
// The editor's client and the one a gui has (the session helpers call that one) both reach this server.
vi.mock('../../api/client', async (actual) => ({ ...(await actual<typeof import('../../api/client')>()), call: server.call }));
vi.mock('../../../deployment/gui/kit/api/client', async (actual) => ({ ...(await actual<typeof import('../../../deployment/gui/kit/api/client')>()), call: server.call }));
// Listening to a session is the stream's; here, rounds are told by hand.
vi.mock('../../../deployment/gui/kit/api/session', async (actual) => ({
  ...(await actual<typeof import('../../../deployment/gui/kit/api/session')>()),
  watchSession: vi.fn(() => () => {}),
}));

const { useGraphStore, goingRound } = await import('./graphStore');
const { useSession } = await import('../../../deployment/gui/kit/api/session');
const store = () => useGraphStore.getState();

const round = (over: Partial<RoundSnapshot> = {}): RoundSnapshot => ({
  round_id: 'r1', done: true, cancelled: false, completed: 1, total: 1, current_label: '', running: [], finished: {},
  item_done: 0, item_total: 0, idle_seconds: null, error: null, result: null, outputs: null, started: { event: 'go', by: 'press' }, ...over,
});
const made = (node_id: string, outputs: Record<string, unknown>): ExecutionResult => ({
  status: 'success', outputs: {}, node_results: [{ node_id, status: 'success', outputs, inputs: {} }],
});

beforeEach(() => {
  server.sessions = 0;
  server.stopped.length = 0;
  store().newGraph();
});

describe('a round of the session', () => {
  it('is followed while it goes, and shows what it made once it has ended', async () => {
    store().addNode('code', { x: 0, y: 0 });
    await store().holdDocument();
    // As the stream tells it: the session holds the round, and the store follows it.
    useSession.setState({ round: round({ done: false, completed: 0, total: 2, current_label: 'Count' }) });
    expect(goingRound()).toMatchObject({ completed: 0, total: 2, current_label: 'Count' });
    useSession.setState({ round: round({ result: made('code', { output: 3 }) }) });
    expect(goingRound()).toBeNull();
    expect(store().executionResult?.node_results[0].outputs).toEqual({ output: 3 });
  });

  it('is stopped when another graph is opened -- a drop, pasted JSON, ✨ -- and writes nothing, and shows nothing, there', async () => {
    store().addNode('code', { x: 0, y: 0 });
    await store().holdDocument();
    useSession.setState({ round: round({ done: false }) });
    // While it runs: another graph, whose code node is called "code" too.
    store().loadGraph({
      metadata: store().metadata,
      nodes: [{ id: 'code', node_type: 'code', label: 'B', description: '', position: { x: 0, y: 0 }, inputs: [], outputs: [], config: { code: 'function run() { return { output: 1 }; }' } } as never],
      edges: [],
    });
    // Nothing is going any more, so no Stop is left behind; the server was told to end it.
    expect(goingRound()).toBeNull();
    expect(server.stopped).toEqual(['r1']);
    store().followRound(round({ result: made('code', { output: { rows: [1, 2] } }) }));
    expect(store().executionResult).toBeNull();
    expect(store().isDirty()).toBe(false);
  });

  it('shows nothing inside a node it is not the round of, and nothing of a node that was deleted on the next one of its id', async () => {
    const part = store().addNode('subgraph', { x: 0, y: 0 });
    const code = store().addNode('code', { x: 0, y: 0 });
    await store().holdDocument();
    store().openSubgraph(part);
    store().followRound(round({ result: made(code, { output: 1 }) }));
    expect(store().executionResult).toBeNull();
    store().closeSubgraph();

    store().followRound(round({ result: made(code, { output: 1 }) }));
    expect(store().executionResult?.node_results).toHaveLength(1);
    store().deleteNodes([code]);
    expect(store().executionResult?.node_results).toEqual([]);
  });
});
