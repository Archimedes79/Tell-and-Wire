import { describe, it, expect } from 'vitest';
import { nodeCode } from './node.ts';

describe('a body that asks the process holding the graph', () => {
  it('is handed its node, gets each of several questions its own answer, and a refusal as an error it can catch -- whatever it prints', async () => {
    const asked: unknown[] = [];
    const calls = {
      add: async (args: unknown) => { asked.push(args); const { a, b } = args as { a: number; b: number }; return a + b; },
      slow: async (args: unknown) => { const n = Number(args); await new Promise((r) => setTimeout(r, 30 - n * 10)); return n * 10; },
      llm: async () => { throw new Error('no key configured'); },
    };
    const out = await nodeCode.run(
      `async function run(inputs, node) {
        // Only the marked line is the result; an unfinished line before a question must not swallow it.
        console.log('{"not": "this"}'); process.stdout.write('asking...');
        const sum = await node.add({ a: inputs.a, b: 40 });
        const all = await Promise.all([node.slow(1), node.slow(2)]);
        try { await node.llm({}); } catch (e) { return { sum, all, said: e.message }; }
      }`,
      { a: 2 },
      undefined,
      { calls },
    );
    expect(out).toEqual({ sum: 42, all: [10, 20], said: 'no key configured' });
    expect(asked).toEqual([{ a: 2, b: 40 }]);
  });
});

/** What a body that does not run says: one sentence a person can act on. */
describe('a body that does not run', () => {
  it('is named by its syntax error, its thrown error and the line as the body was written; fails, and only itself, when it writes Tell & Wire\'s mark; ends when its run never settles', async () => {
    await expect(nodeCode.run('def run(inputs):\n    return {}', {})).rejects.toThrow(/SyntaxError/);
    // The traceback names a temp file that is deleted before anyone reads the
    // message, at a line the wrapper above the body moved.
    const failed = await nodeCode.run('function run() {\n  throw new Error("boom");\n}', {}).catch((error: Error) => error);
    expect((failed as Error).message).toMatch(/boom/);
    expect((failed as Error).message).not.toMatch(/body\.mjs/);
    expect((failed as Error).message).toMatch(/line 2/);

    const body = 'function run() { console.log("\\u001etell-and-wire:result {not json"); return { ok: 1 }; }';
    await expect(nodeCode.run(body, {})).rejects.toThrow(/only Tell & Wire may write/);
    await expect(nodeCode.run('function run() { return new Promise(() => {}); }', {}, undefined, { calls: { llm: async () => 'x' } })).rejects.toThrow();
  });
});
