import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoundSnapshot, SessionView } from './client';
import { httpPort, port, setPort, type GuiPort } from './port';
import { forgetSession, useSession, watchSession } from './session';
import { startOver, startRound } from './start';

/**
 * The GUI's end of the GUI port: start and return are two halves with nothing between them but the store, and the wire is reached only
 * through `port.ts`. A port of its own -- a site embedding the GUI, a recording -- plugs in with `setPort`.
 */

const view = (session: string): SessionView => ({ session, gui: {}, round: null } as unknown as SessionView);
const round = (id: string, done: boolean): RoundSnapshot => ({ round_id: id, done, cancelled: false, result: done ? { status: 'success', node_results: [] } : null } as unknown as RoundSnapshot);

/** A port that records what the GUI does to it, and lets the test speak for the tool. */
function fake() {
  const calls: string[] = [];
  let on: Parameters<GuiPort['back']['watch']>[0] | null = null;
  const plugged: GuiPort = {
    start: {
      requirements: async () => [],
      start: async (event) => { calls.push(`start ${event}`); return { round_id: 'r1' }; },
      stop: async (id) => { calls.push(`stop ${id}`); },
      reset: async () => { calls.push('reset'); return view('s2'); },
    },
    back: {
      session: async () => view('s1'),
      watch(listeners) { on = listeners; calls.push('watch'); return () => { calls.push('unwatch'); on = null; }; },
    },
  };
  return { plugged, calls, tell: () => on! };
}

afterEach(() => { setPort(); forgetSession(); });

describe('the GUI port of the built-in GUI', () => {
  it('is the HTTP one until another is plugged in, and the one replaced is handed back', () => {
    expect(port()).toBe(httpPort);
    const { plugged } = fake();
    expect(setPort(plugged)).toBe(httpPort);
    expect(port()).toBe(plugged);
    expect(setPort()).toBe(plugged);
  });

  it('starts, hears and starts over through the port alone: the halves meet only in the store', async () => {
    const { plugged, calls, tell } = fake();
    setPort(plugged);
    const stop = watchSession();
    tell().session(view('s1'));
    expect(useSession.getState().view?.session).toBe('s1');

    await startRound('picked', { values: { pick: 'b' }, by: 'pick' });
    expect(calls).toEqual(['watch', 'start picked']);
    // What the round was sent is let go of once the tool says the round ran to its end.
    useSession.setState({ edits: { pick: 'b' } });
    tell().round(round('r1', false));
    tell().round(round('r1', true));
    expect(useSession.getState().round?.done).toBe(true);

    await startOver();
    expect(calls.slice(-1)).toEqual(['reset']);
    expect(useSession.getState().view?.session).toBe('s2');
    stop();
    expect(calls.slice(-1)).toEqual(['unwatch']);
  });

  it('says a start the port refuses as a round that did not begin, with its own words', async () => {
    const { plugged } = fake();
    plugged.start.start = vi.fn(async () => { throw new Error('No event called "x".'); });
    setPort(plugged);
    await startRound('x');
    expect(useSession.getState().round).toMatchObject({ done: true, error: 'No event called "x".' });
  });
});

// Nothing else reaches the wire for a round: the routes of the start and return halves are called in `port.ts` and nowhere else of the GUI.
const SOURCES = import.meta.glob('/deployment/gui/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const PORT_ROUTES = /call\(\s*'(requirements|startRound|stopRound|reset|session|runRound)'|new EventSource\(/;

describe('the wire of a round', () => {
  it('is reached only through port.ts', () => {
    const outside = Object.entries(SOURCES)
      .filter(([path]) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx') && !path.endsWith('/kit/api/port.ts'))
      .filter(([, source]) => PORT_ROUTES.test(source))
      .map(([path]) => path);
    expect(outside).toEqual([]);
  });
});
