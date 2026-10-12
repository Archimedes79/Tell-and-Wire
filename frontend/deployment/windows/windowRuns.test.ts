import { describe, it, expect, beforeEach } from 'vitest';
import type { RoundSnapshot } from '../gui/kit/api/client';
import { useSession } from '../gui/kit/api/session';
import { windowsToGraph, type Windows } from '../../../gui/editor/windows/windows.ts';
import { afterRun, afterEdit, type Done } from '../../../gui/windows/order.ts';
import { forgetRuns, runWindows, succeeded, useWindowRuns } from './windowRuns';
import { isCurrent, isWindows, pageWindows, planFor, recorded, type RunOf } from './windowsInUse';

/**
 * A page of windows runs its windows in order, from the gui alone: the blocks of the gui a package
 * carries say which windows there are, what they take from each other and what starts them.
 */

const DOC: Windows = {
  name: 'Texts', description: '',
  windows: [
    {
      id: 'summarize', title: 'Summarize', span: 8,
      inputs: [{ name: 'Text', kind: 'text', value: 'A long text.' }],
      steps: [{ name: 'Summary', sentence: 'Summarize @Text.', how: 'ai' }],
      outputs: [{ name: 'Summary', kind: 'text', rows: 3 }],
    },
    {
      id: 'english', title: 'In English', span: 8,
      inputs: [{ name: 'Summary', kind: 'from', from: { window: 'summarize', output: 'Summary' } }],
      steps: [{ name: 'English', sentence: 'Say @Summary in English.', how: 'ai' }],
      outputs: [{ name: 'English', kind: 'text', rows: 2 }],
    },
  ],
};
const blocks = windowsToGraph(DOC).gui!.blocks as never[];
const windows = pageWindows(blocks);

/** What the page holds in each input block: the design's, unless something was set. */
let typed: Record<string, unknown> = {};
const held = (id: string): unknown => (id in typed ? typed[id] : id === 'summarize_in_text' ? 'A long text.' : undefined);

const snapshot = (id: string, over: Partial<RoundSnapshot> = {}): RoundSnapshot => ({
  round_id: id, done: true, cancelled: false, completed: 1, total: 1, current_label: '', item_done: 0, item_total: 0,
  idle_seconds: null, error: null, result: { status: 'success', node_results: [], outputs: {} }, outputs: {}, started: null, ...over,
});

beforeEach(() => {
  typed = {};
  forgetRuns();
  useSession.setState({ view: null, round: null, edits: {}, sent: {} });
});

describe('the windows of a gui', () => {
  it('are read off its blocks: what each is called, how wide, what it takes from, what it is sent and what starts it', () => {
    expect(isWindows(blocks)).toBe(true);
    expect(windows.map((one) => [one.id, one.title, one.span, one.after, one.inputs, one.starter])).toEqual([
      ['summarize', 'Summarize', 8, [], ['summarize_in_text'], 'summarize_run'],
      ['english', 'In English', 8, ['summarize'], [], 'english_run'],
    ]);
    expect(isWindows([{ id: 'x', kind: 'text', label: '', tone: 'plain' }])).toBe(false);
  });

  it('are current when they ran, nothing they hold changed since, and the ones they take from did not run again', () => {
    let runs: Record<string, RunOf> = {};
    expect(planFor(windows, runs, held, 'english')).toEqual(['summarize', 'english']);

    runs = recorded(recorded(runs, windows[0], held), windows[1], held);
    expect(planFor(windows, runs, held, 'english')).toEqual(['english']);
    expect(isCurrent(windows, runs, held, 'english')).toBe(true);

    // The text of the first changed: both answer to something that is gone.
    typed = { summarize_in_text: 'Another text.' };
    expect(planFor(windows, runs, held, 'english')).toEqual(['summarize', 'english']);
    expect(isCurrent(windows, runs, held, 'english')).toBe(false);

    // The first ran again: the second has not seen what it made.
    runs = recorded(runs, windows[0], held);
    expect(isCurrent(windows, runs, held, 'summarize')).toBe(true);
    expect(isCurrent(windows, runs, held, 'english')).toBe(false);
    expect(planFor(windows, runs, held, 'english')).toEqual(['english']);
  });

  it('are held by the page as the editor\'s model holds them: the same runs, the same order', () => {
    // The model keeps sets of what ran and what changed; the page derives them. After the same things, the same answer.
    const model: Done = { ran: new Set<string>(), changed: new Set<string>() };
    const linked = windows.map((one) => ({ id: one.id, after: one.after }));
    let runs: Record<string, RunOf> = {};
    let done = model;
    for (const id of ['summarize', 'english', 'summarize']) {
      done = afterRun(linked, done, id);
      runs = recorded(runs, windows.find((one) => one.id === id)!, held);
    }
    done = afterEdit(done, 'summarize');
    typed = { summarize_in_text: 'Another text.' };
    expect(planFor(windows, runs, held, 'english')).toEqual(['summarize', 'english']);
    expect([...done.changed].sort()).toEqual(['english', 'summarize']);
  });
});

describe('running a window', () => {
  /** A host that ends each round it is asked to start, well or badly, and says in what order. */
  function host(fail: string[] = []) {
    const started: string[] = [];
    let count = 0;
    const run = async (event: string): Promise<void> => {
      started.push(event);
      count += 1;
      const id = `r${count}`;
      queueMicrotask(() => useSession.setState({ round: snapshot(id, fail.includes(event) ? { result: { status: 'error', node_results: [], outputs: {}, error: 'no' }, error: 'no' } : {}) }));
    };
    return { started, run };
  }

  it('starts the ones before it first, each after the last has ended, and does not run a current one again', async () => {
    const { started, run } = host();
    expect(await runWindows({ windows, id: 'english', held, run })).toEqual(['summarize', 'english']);
    expect(started).toEqual(['summarize', 'english']);
    expect(Object.keys(useWindowRuns.getState().runs).sort()).toEqual(['english', 'summarize']);
    expect(useWindowRuns.getState().going).toEqual([]);

    // Everything is current: only the one asked for.
    expect(await runWindows({ windows, id: 'english', held, run })).toEqual(['english']);
    expect(started).toEqual(['summarize', 'english', 'english']);
  });

  it('stops where a round failed, and counts what did not run as not run', async () => {
    const { started, run } = host(['summarize']);
    expect(await runWindows({ windows, id: 'english', held, run })).toEqual([]);
    expect(started).toEqual(['summarize']);
    expect(useWindowRuns.getState().runs).toEqual({});
  });

  it('counts a round in which a node had nothing to do as not run: the window after it would only be handed that', async () => {
    const idle = { node_id: 'summarize_summary', status: 'skipped' as const, inputs: {}, outputs: {}, error: null };
    expect(succeeded(snapshot('a', { result: { status: 'success', node_results: [idle], outputs: {} } }), 'summarize')).toBe(false);
    expect(succeeded(snapshot('b', { result: { status: 'success', node_results: [{ ...idle, held: true }], outputs: {} } }), 'summarize')).toBe(true);
    // Another window's node idle in the same round is not this window's doing.
    expect(succeeded(snapshot('c', { result: { status: 'success', node_results: [idle], outputs: {} } }), 'english')).toBe(true);
  });

  it('stops where a question is waiting, and where no round began', async () => {
    const asked = host();
    expect(await runWindows({ windows, id: 'english', held, run: asked.run, asking: () => true })).toEqual([]);
    expect(asked.started).toEqual(['summarize']);
    expect(useWindowRuns.getState().going).toEqual([]);
  });
});
