import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localCore } from './localCore.ts';
import { processCore, serveCore, commandParts } from './stdio.ts';
import { PROTOCOL, type CoreAnswer, type CoreEvent } from './protocol.ts';
import { loadGraph } from '../../backend/app/project/folder.ts';
import { readKeptRounds } from '../../backend/app/project/keptRounds.ts';
import { eventOf } from '../../backend/gui-editor/graphInterface.ts';
import { registry } from '../nodes/registry.ts';
import type { GraphNode } from '../graph.ts';
import { edge, graphOf, quietRuntime } from '../test/fakes.ts';

/**
 * The graph core: what the wrapper asks of whatever runs its graphs, in its
 * own process or as a program of its own -- the same answers either way.
 */

const node = (id: string, type: string, config: Record<string, unknown> = {}, inputs: string[] = [], outputs: string[] = []): GraphNode => ({
  id, node_type: type as GraphNode['node_type'], label: id, description: '', position: { x: 0, y: 0 }, config,
  inputs: inputs.map((port) => ({ id: port, name: port, kind: 'input', data_type: 'any', multi: false, required: false, description: '' })),
  outputs: outputs.map((port) => ({ id: port, name: port, kind: 'output', data_type: 'any', multi: false, required: false, description: '' })),
});

/** A start point a call starts, a code node that counts, an end point: what one round goes through. */
const counting = graphOf([
  node('go', 'start', { started_by: 'call', values: { text: 'a b c' } }),
  node('count', 'code', { code: 'count' }, ['text'], ['words']),
  node('result', 'end', {}, ['value']),
], [edge('e1', 'go', 'data', 'count', 'text'), edge('e2', 'count', 'words', 'result', 'value')]);
counting.nodes[1].inputs[0].field = 'text';

const counter = localCore({
  runtime: (report) => quietRuntime({
    report,
    code: { run: async (_body, inputs) => ({ words: String(inputs.text).split(' ').length }) },
  }),
});

const ENGINE_MAIN = fileURLToPath(new URL('../../backend/app/main.ts', import.meta.url));

describe('a graph core', () => {
  it('says who it is and which protocol it speaks', async () => {
    expect(await counter.hello()).toEqual({ protocol: PROTOCOL, language: 'javascript', core: 'Tell-and-Wire JavaScript core' });
  });

  it('runs a round: says first how many nodes it runs, and hands back what every node keeps and was left holding', async () => {
    const events: CoreEvent[] = [];
    const ended = await counter.round({ graph: counting, trigger: { node_id: 'go', port_id: 'data' } }, (event) => events.push(event));
    expect(events[0]).toEqual({ type: 'plan', total: 3 });
    expect(ended.result.status).toBe('success');
    expect(ended.result.node_results.find((one) => one.node_id === 'count')?.outputs).toEqual({ words: 3 });
    expect(ended.nodes.go).toEqual({ values: { text: 'a b c' } });
    expect(Object.keys(ended.held)).toEqual(expect.arrayContaining(['count']));
    // The graph it was handed is not changed: it ran a copy.
    expect(counting.nodes[0].config.values).toEqual({ text: 'a b c' });
  });

  it('keeps nothing of a round that was stopped', async () => {
    const stop = new AbortController();
    stop.abort();
    const slow = localCore({ runtime: (report) => quietRuntime({ report, code: { run: async () => ({ words: 1 }) } }) });
    const ended = await slow.round({ graph: counting, trigger: null }, undefined, stop.signal);
    expect(ended.result.status).toBe('cancelled');
    expect(ended.held).toEqual({});
  });
});

describe('a graph core as a program of its own', () => {
  it('answers over two streams, one JSON object a line: events, then the reply -- or the error', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const served = serveCore(counter, input, output);
    const answers: CoreAnswer[] = [];
    output.on('data', (chunk: Buffer) => { for (const line of chunk.toString().split('\n').filter(Boolean)) answers.push(JSON.parse(line) as CoreAnswer); });
    input.write(`${JSON.stringify({ id: 1, op: 'round', graph: counting, trigger: { node_id: 'go', port_id: 'data' } })}\n`);
    input.write(`${JSON.stringify({ id: 2, op: 'nonsense' })}\n`);
    await new Promise((settle) => { setTimeout(settle, 200); });
    input.end();
    await served;
    expect(answers.find((one) => one.id === 1 && 'event' in one)).toEqual({ id: 1, event: { type: 'plan', total: 3 } });
    const reply = answers.find((one) => one.id === 1 && 'reply' in one) as { reply: { result: { status: string } } };
    expect(reply.reply.result.status).toBe('success');
    expect(answers.find((one) => one.id === 2)).toMatchObject({ id: 2, error: expect.stringMatching(/^No operation "nonsense"/) });
  });

  it('replays a kept round as the core in this process does: `node backend/app/main.ts core`', async () => {
    const project = fileURLToPath(new URL('../../examples/nested_statistics', import.meta.url));
    const [{ round: kept }] = await readKeptRounds(project);
    const graph = await loadGraph(project);
    const trigger = eventOf(graph, kept!.event, registry);
    const asked = { graph, trigger, given: kept!.given, offline: true };
    const own = await localCore().round(asked);
    const program = processCore(process.execPath, [ENGINE_MAIN, 'core']);
    try {
      expect((await program.hello()).language).toBe('javascript');
      const there = await program.round(asked);
      expect(there.result.status).toBe(own.result.status);
      expect(there.result.node_results.map((one) => [one.node_id, one.status, one.outputs]))
        .toEqual(own.result.node_results.map((one) => [one.node_id, one.status, one.outputs]));
    } finally {
      await program.close();
    }
  }, 30_000);

  it('is named by a command line: a program and its arguments, a quoted part kept whole', () => {
    expect(commandParts('node backend/app/main.ts core')).toEqual(['node', 'backend/app/main.ts', 'core']);
    expect(commandParts('"C:/Program Files/core.exe" --fast')).toEqual(['C:/Program Files/core.exe', '--fast']);
  });
});

describe('the wrapper\'s half of a core program', () => {
  /** A core of a few lines, for what the real one never does: *answer* says what it replies to each request. */
  const fake = (answer: string) => {
    const script = join(mkdtempSync(join(tmpdir(), 'core-')), 'core.cjs');
    writeFileSync(script, `require('node:readline').createInterface({ input: process.stdin }).on('line', (line) => {
  const request = JSON.parse(line);
  ${answer}
});
`);
    return processCore(process.execPath, [script], { helloMs: 1500 });
  };

  const slow = graphOf([
    node('go', 'start', { started_by: 'call', values: {} }),
    node('wait', 'code', { code: 'async function run() { await new Promise((done) => setTimeout(done, 20000)); return { words: 1 }; }' }, ['in'], ['words']),
  ], [edge('e', 'go', 'data', 'wait', 'in')]);

  it('stops a round going in the program, and one stopped before it was even asked', async () => {
    const program = processCore(process.execPath, [ENGINE_MAIN, 'core']);
    try {
      const stop = new AbortController();
      const began = Date.now();
      setTimeout(() => stop.abort(), 800);
      const stopped = await program.round({ graph: slow, trigger: { node_id: 'go', port_id: 'data' } }, undefined, stop.signal);
      expect(stopped.result.status).toBe('cancelled');
      expect(Date.now() - began).toBeLessThan(10_000);
      const already = new AbortController();
      already.abort();
      expect((await program.round({ graph: slow, trigger: { node_id: 'go', port_id: 'data' } }, undefined, already.signal)).result.status).toBe('cancelled');
    } finally {
      await program.close();
    }
  }, 30_000);

  it('answers two requests at once, each with its own reply', async () => {
    const program = processCore(process.execPath, [ENGINE_MAIN, 'core']);
    try {
      const project = fileURLToPath(new URL('../../examples/population_plotter', import.meta.url));
      const graph = await loadGraph(project);
      const [tested, tried] = await Promise.all([program.test({ graph, offline: true }), program.example({ graph, node: 'chart' })]);
      expect(tested.tested).toBeGreaterThan(0);
      expect(tried.status).toBe('pass');
    } finally {
      await program.close();
    }
  }, 30_000);

  it('refuses a program that speaks another protocol, or does not answer at all', async () => {
    const other = fake("process.stdout.write(JSON.stringify({ id: request.id, reply: { protocol: 99, language: 'x', core: 'x' } }) + '\\n');");
    await expect(other.hello()).rejects.toThrow(/speaks protocol 99; this wrapper speaks 1/);
    await other.close();
    const silent = fake('');
    await expect(silent.forget()).rejects.toThrow(/did not answer "hello" within 1.5 s/);
    await silent.close();
  }, 20_000);

  it('says a program that ended under a request, and starts it again for the next', async () => {
    const dies = fake(`
      if (request.op === 'hello') process.stdout.write(JSON.stringify({ id: request.id, reply: { protocol: 1, language: 'x', core: 'dies' } }) + '\\n');
      else if (request.op === 'forget') process.exit(3);
      else process.stdout.write(JSON.stringify({ id: request.id, reply: null }) + '\\n');`);
    await expect(dies.forget()).rejects.toThrow(/ended \(exit code 3\)/);
    expect((await dies.hello()).core).toBe('dies');
    await dies.close();
  }, 20_000);
});
