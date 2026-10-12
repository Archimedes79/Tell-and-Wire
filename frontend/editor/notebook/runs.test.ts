import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Windows } from '../../../gui/editor/windows/windows.ts';
import type { NodeResult } from '../../../graph/graph.ts';
import type { RoundSnapshot } from '../../../backend/deployment/host/api.ts';

// The host, as far as a run goes: it answers each route with what the test says, and keeps what it was asked.
const asked: { route: string; body: Record<string, unknown> }[] = [];
let rounds: Record<string, Partial<RoundSnapshot>> = {};
let nodesOf: (event: string) => NodeResult[] = () => [];
let started = 0;
vi.mock('./api', async (actual) => ({
  ...(await actual<typeof import('./api')>()),
  call: vi.fn(async (route: string, body: Record<string, unknown>) => {
    asked.push({ route, body });
    if (route === 'holdGraph') return { session: 'held', dropped: [] };
    if (route === 'startRound') {
      const id = `round-${++started}`;
      rounds[id] = { round_id: id, done: true, cancelled: false, completed: 1, total: 1, error: null, result: { status: 'success', node_results: nodesOf(String(body.event)), outputs: {} } as never };
      return { session: 'held', round_id: id, total: 1 };
    }
    if (route === 'round') return rounds[String(body.id)];
    if (route === 'session') return { shown: { second_out_result: 'made by second', first_out_result: 'made by first' } };
    if (route === 'reset') return {};
    throw new Error(`not expected here: ${route}`);
  }),
}));

const { useNotebook } = await import('./store');
const { runWindow, runAll, forgetRuns } = await import('./runs');

const ok = (id: string): NodeResult => ({ node_id: id, status: 'success', inputs: {}, outputs: {} });
const idle = (id: string): NodeResult => ({ node_id: id, status: 'skipped', inputs: {}, outputs: {}, messages: ['Nothing arrived on any of its inputs, so there was nothing to ask.'] });

/** Two windows, the second taking from the first. */
const twoWindows = (): Windows => ({
  name: 'Tool', description: '',
  windows: [
    {
      id: 'first', title: 'First', span: 8, inputs: [{ name: 'Text', kind: 'text', value: 'start' }],
      steps: [{ name: 'Result', sentence: 'Do @Text.', how: 'ai' }], outputs: [{ name: 'Result', kind: 'text', rows: 3 }],
    },
    {
      id: 'second', title: 'Second', span: 8, inputs: [{ name: 'Prior', kind: 'from', from: { window: 'first', output: 'Result' } }],
      steps: [{ name: 'Result', sentence: 'Do @Prior.', how: 'ai' }], outputs: [{ name: 'Result', kind: 'text', rows: 3 }],
    },
  ],
});

describe('running windows', () => {
  beforeEach(() => {
    asked.length = 0; rounds = {}; started = 0;
    nodesOf = (event) => [ok(event), ok(`${event}_result`)];
    useNotebook.getState().start(twoWindows());
  });

  const events = () => asked.filter((one) => one.route === 'startRound').map((one) => one.body.event);

  it('runs the window before first, each as a round of its own, and says what each made', async () => {
    await runWindow('second');
    expect(events()).toEqual(['first', 'second']);
    expect(asked[0].route).toBe('holdGraph');
    const { results, done, going, log } = useNotebook.getState();
    expect(results.first.outcome).toBe('done');
    expect(results.second.shown).toEqual({ second_out_result: 'made by second' });
    expect([...done.ran].sort()).toEqual(['first', 'second']);
    expect(going).toEqual([]);
    expect(log.map((one) => one.window)).toEqual(['second', 'first']);

    // Everything is current: only the one asked for.
    await runWindow('second');
    expect(events()).toEqual(['first', 'second', 'second']);
  });

  it('sends a window what its inputs hold: what was set on the page, else what the window says', async () => {
    useNotebook.getState().setValue('first_in_text', 'typed on the page');
    await runWindow('first');
    const sent = asked.find((one) => one.route === 'startRound')!.body;
    expect(sent).toMatchObject({ event: 'first', by: 'first_run', values: { first_in_text: 'typed on the page' } });
  });

  it('is not put off by another window standing idle in the same round, and is by its own nodes having nothing to do', async () => {
    nodesOf = (event) => [ok(event), ok(`${event}_result`), idle('second_result')];
    await runWindow('first');
    expect(useNotebook.getState().results.first.outcome).toBe('done');

    nodesOf = (event) => [ok(event), idle(`${event}_result`)];
    useNotebook.getState().start(twoWindows());
    await runWindow('second');
    // The first came to nothing, so the second is not run on what it did not make.
    expect(events().slice(-1)).toEqual(['first']);
    expect(useNotebook.getState().results.first).toMatchObject({ outcome: 'empty' });
    expect(useNotebook.getState().results.first.message).toMatch(/nothing to ask/);
    expect(useNotebook.getState().results.second).toBeUndefined();
  });

  it('says why a round failed, on the window, and stops there', async () => {
    nodesOf = (event) => [ok(event), { node_id: `${event}_result`, status: 'error', inputs: {}, outputs: {}, error: 'Could not reach the model.' }];
    await runWindow('second');
    expect(events()).toEqual(['first']);
    expect(useNotebook.getState().results.first).toMatchObject({ outcome: 'failed', message: 'Could not reach the model.' });
  });

  it('says so when the host could not be reached at all', async () => {
    const { call } = await import('./api');
    vi.mocked(call).mockRejectedValueOnce(new Error('Failed to fetch'));
    await runWindow('first');
    expect(useNotebook.getState().results.first).toMatchObject({ outcome: 'failed', message: 'Failed to fetch' });
    expect(useNotebook.getState().going).toEqual([]);
  });

  it('runs all that are not current, in the order of the page, and forgets them when asked', async () => {
    await runAll();
    expect(events()).toEqual(['first', 'second']);
    await runAll();
    expect(events()).toEqual(['first', 'second']);
    await forgetRuns();
    expect(useNotebook.getState().results).toEqual({});
    expect(asked.some((one) => one.route === 'reset')).toBe(true);
  });
});
