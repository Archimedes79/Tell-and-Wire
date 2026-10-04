import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseGraph, type Graph } from '../graph.ts';
import { registry } from '../nodes/registry.ts';
import { startClock } from './clock.ts';
import type { Trigger } from './triggers.ts';

// The one clock every host keeps a tool's time with: the server's schedule
// and the editor's ▶ Run. Its timing is held in backend/gui-editor/session.test.ts too,
// through the server; here what only the clock itself decides.

const trigger = (id: string, config: Record<string, unknown>) => ({ id, node_type: 'start', label: id, config: { started_by: 'itself', ...config } });
const graphOf = (...nodes: unknown[]): Graph => parseGraph({ metadata: { name: 'Clock' }, nodes, edges: [] });

let fired: string[];
const round = async (event: Trigger) => { fired.push(event.node_id); };

beforeEach(() => { fired = []; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('a tool\'s clock', () => {
  it('looks a trigger up each time it is due: deleted, its clock stops; its interval changed, the new one counts', async () => {
    let graph = graphOf(trigger('a', { started_by: 'itself', on_start: false, every: '10s' }), trigger('b', { started_by: 'itself', on_start: false, every: '10s' }));
    const clock = startClock(() => graph, registry, round);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fired).toEqual(['a', 'b']);
    graph = graphOf(trigger('b', { started_by: 'itself', on_start: false, every: '30s' }));
    await vi.advanceTimersByTimeAsync(10_000);
    // b ran on the interval it had when it was wound; a is gone and fired no round.
    expect(fired).toEqual(['a', 'b', 'b']);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fired).toEqual(['a', 'b', 'b']);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fired).toEqual(['a', 'b', 'b', 'b']);
    await clock.stop();
  });
});
