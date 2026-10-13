import { describe, it, expect } from 'vitest';
import type { ExecutionResult } from '../../../graph/graph.ts';
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

  it('tells the watchers at once when a node begins or ends, and lets how far a batch has got be throttled', async () => {
    const told: boolean[] = [];
    const rounds = new Rounds((_id, moment) => told.push(moment));
    const ran = rounds.start(1, named, async (round) => {
      round.report({ type: 'node_start', node_id: 'a' });
      round.report({ type: 'batch', node_id: 'a', done: 1, total: 3 });
      round.report({ type: 'node_done', node_id: 'a', status: 'success' });
      return done();
    });
    await ran.outcome;
    await wait(0);
    // asked, began, then the three reports, then ended
    expect(told.slice(2, 5)).toEqual([true, false, true]);
  });

  it('says which nodes work now, and none once it has ended', async () => {
    const rounds = new Rounds();
    let release = () => {};
    const gate = new Promise<void>((open) => { release = open; });
    const started = rounds.start(2, named, async (round) => {
      round.report({ type: 'node_start', node_id: 'a' });
      round.report({ type: 'node_start', node_id: 'b' });
      round.report({ type: 'node_done', node_id: 'a', status: 'success' });
      await gate;
      return done();
    });
    await wait(10);
    expect(rounds.snapshot(started.id)).toMatchObject({ running: ['b'], finished: { a: 'success' }, completed: 1 });
    release();
    await started.outcome;
    await wait(0);
    expect(rounds.snapshot(started.id)).toMatchObject({ running: [], finished: {} });
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

  it('names the round that has gone longest as the one going: the one running, not the one queued behind it', async () => {
    const rounds = new Rounds();
    expect(rounds.oldestGoing()).toBeNull();
    const work = (round: RoundWork) => new Promise<ExecutionResult>((ended) => {
      round.signal.addEventListener('abort', () => ended(done('cancelled')));
    });
    const first = rounds.start(1, named, work);
    const second = rounds.start(1, named, work);
    await wait(10);
    expect(rounds.oldestGoing()).toBe(first.id);
    rounds.stop(first.id);
    await first.outcome;
    await wait(0);
    expect(rounds.oldestGoing()).toBe(second.id);
    await rounds.stopAll();
    expect(rounds.oldestGoing()).toBeNull();
  });

  it('does not stop a round that has ended: it keeps what it was, and the answer says nothing was stopped', async () => {
    const rounds = new Rounds();
    const ended = rounds.start(1, named, async () => done());
    await ended.outcome;
    await wait(0);
    expect(rounds.stop(ended.id)).toBe(false);
    expect(rounds.snapshot(ended.id)).toMatchObject({ done: true, cancelled: false, result: { status: 'success' } });
    expect(rounds.stop('nobody')).toBe(false);
  });
});
