import { describe, it, expect } from 'vitest';
import type { ExecutionResult } from '../../graph/graph.ts';
import { Rounds, type RoundWork } from './rounds.ts';

const wait = (ms: number) => new Promise((wake) => setTimeout(wake, ms));
const done = (status: ExecutionResult['status'] = 'success'): ExecutionResult => ({ status, node_results: [], outputs: {} });
const named = (id: string) => id;

describe('Rounds', () => {
  it('runs one round after the other, in the order they were asked for, and goes on after a round that could not run, saying why', async () => {
    const rounds = new Rounds();
    const seen: string[] = [];
    const round = (label: string, ms: number) => rounds.start(1, named, async () => {
      seen.push(`${label} starts`);
      await wait(ms);
      seen.push(`${label} ends`);
      return done();
    }).outcome;
    await Promise.all([round('first', 40), round('second', 5)]);
    expect(seen).toEqual(['first starts', 'first ends', 'second starts', 'second ends']);

    const failed = rounds.start(1, named, async () => { throw new Error('Graph contains a cycle'); });
    await expect(failed.outcome).rejects.toThrow('cycle');
    await wait(0);
    expect(rounds.snapshot(failed.id)).toMatchObject({ done: true, error: 'Graph contains a cycle', result: null });
    expect(await rounds.start(1, named, async () => done()).outcome).toMatchObject({ status: 'success' });
  });

  it('stops a round in flight through the signal it handed the work, and stops everything still going at once', async () => {
    const rounds = new Rounds();
    const work = (round: RoundWork) => new Promise<ExecutionResult>((ended) => {
      round.signal.addEventListener('abort', () => ended(done('cancelled')));
    });
    const first = rounds.start(1, named, work);
    const second = rounds.start(1, named, work);
    await wait(10);
    expect(await rounds.stopAll()).toBe(2);
    expect(rounds.snapshot(first.id)).toMatchObject({ done: true, cancelled: true, result: { status: 'cancelled' } });
    expect(rounds.snapshot(second.id)).toMatchObject({ done: true, cancelled: true });
    expect(await rounds.stopAll()).toBe(0);
  });
});
