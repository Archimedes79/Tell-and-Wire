import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Graph, GraphNode } from './graph';

// What ▶ Run starts: the application, as whoever gets the tool runs it -- its
// clock kept by the server's session, the document handed to it first.

const server = vi.hoisted(() => ({ asked: [] as string[], ticks: false, hold: null as Promise<void> | null, down: false }));
vi.mock('./api/client', async (actual) => ({
  ...(await actual<typeof import('./api/client')>()),
  call: vi.fn(async (route: string, _request?: unknown, options?: { keepalive?: boolean }) => {
    server.asked.push(options?.keepalive ? `${route}, as the page closes` : route);
    if (route === 'holdGraph') {
      await server.hold;
      if (server.down) throw new Error('The server did not answer.');
      return { session: 's1', dropped: [] };
    }
    if (route === 'startApplication') return { ticks: server.ticks };
    return { stopped: true };
  }),
}));
vi.mock('./api/session', async (actual) => ({
  ...(await actual<typeof import('./api/session')>()),
  watchSession: vi.fn(() => () => {}),
}));

// The window the editor runs in: who listens for what it says as it is closed or reloaded.
const listening = new Map<string, () => void>();
vi.stubGlobal('addEventListener', (type: string, listener: () => void) => { listening.set(type, listener); });
vi.stubGlobal('removeEventListener', (type: string, listener: () => void) => { if (listening.get(type) === listener) listening.delete(type); });

const { useGraphStore } = await import('./store/graphStore');
const { startApplication, stopApplication, useApplication } = await import('./application');

const node = (id: string, node_type: string, config: Record<string, unknown> = {}): GraphNode => ({
  id, node_type, label: id, description: '', position: { x: 0, y: 0 }, inputs: [], outputs: [], config,
} as unknown as GraphNode);
const graphOf = (...nodes: GraphNode[]): Graph => ({ metadata: { name: 'Tool', description: '', gui_scheme: 'night' }, nodes, edges: [] } as Graph);
/** A graph with a page of *blocks*, and the start point "go" they fire. */
const paged = (blocks: Record<string, unknown>[], ...nodes: GraphNode[]): Graph => ({
  ...graphOf(node('go', 'start'), ...nodes), page: { blocks: blocks as never },
});
const button = { id: 'press', kind: 'button', fires: 'go' };

/** The rounds ▶ Run itself started whole: what nothing else starts. */
let whole: number;
const runWhole = async () => { whole += 1; };

/** The graph open in the editor. */
const open = (graph: Graph): Graph => {
  useGraphStore.getState().loadGraph(graph);
  return useGraphStore.getState().rootGraph();
};

beforeEach(() => { whole = 0; server.asked.length = 0; server.ticks = false; server.hold = null; server.down = false; vi.useFakeTimers(); });
afterEach(async () => {
  await stopApplication();
  vi.useRealTimers();
});

describe('the application ▶ Run starts', () => {
  it('with a page, hands the document over, starts the server clock and waits: the graph runs when the page is used', async () => {
    const graph = open(paged([{ id: 'msg', kind: 'text_io', mode: 'input', value: 'hello', sends_to: ['go'] }, button], node('work', 'code')));
    await startApplication(graph, runWhole);
    expect(server.asked).toEqual(['holdGraph', 'startApplication']);
    expect(whole).toBe(0);
    expect(useApplication.getState().running).toBe(true);
  });

  it('without a page, runs whole once, as a program does -- and has then ended', async () => {
    const graph = open(graphOf(node('work', 'code'), node('shown', 'end')));
    await startApplication(graph, runWhole);
    expect(whole).toBe(1);
    expect(useApplication.getState().running).toBe(false);
    expect(server.asked[server.asked.length - 1]).toBe('stopApplication');
  });

  it('is not started by what comes after a ■ Stop pressed while the document is on its way -- and a document that cannot be handed over leaves it not running', async () => {
    const graph = open(paged([button], node('work', 'code')));
    let release!: () => void;
    server.hold = new Promise<void>((resolve) => { release = resolve; });
    const starting = startApplication(graph, runWhole);
    await vi.waitFor(() => expect(server.asked).toContain('holdGraph'));
    await stopApplication();
    release();
    await starting;
    expect(server.asked).not.toContain('startApplication');
    expect(useApplication.getState().running).toBe(false);

    server.hold = null;
    server.down = true;
    await expect(startApplication(graph, runWhole)).rejects.toThrow('did not answer');
    expect(useApplication.getState().running).toBe(false);
  });

  it('ends with the editor: closed or reloaded while it runs, the server clock is stopped', async () => {
    server.ticks = true;
    await startApplication(open(graphOf(node('clock', 'start', { started_by: 'itself', on_start: false, every: '30s' }))), runWhole);
    server.asked.length = 0;
    listening.get('pagehide')!();
    expect(server.asked).toEqual(['stopApplication, as the page closes']);
    // Stopped by ■ Stop, it has nothing left to stop as the page closes.
    await stopApplication();
    expect(listening.has('pagehide')).toBe(false);
  });
});
