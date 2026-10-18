import { describe, it, expect } from 'vitest';
import { nodeCode } from './services.ts';

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

describe('a body that is told something', () => {
  it('finds it on node, beside the questions it may put -- and a question of the same name is the question', async () => {
    const out = await nodeCode.run(
      `async function run(inputs, node) { return { size: node.window.shows[0].width, same: typeof node.llm, keys: Object.keys(node).sort() }; }`,
      {},
      undefined,
      { calls: { llm: async () => 'asked' }, facts: { window: { shows: [{ width: 266 }] }, llm: 'a fact that loses' } },
    );
    expect(out).toEqual({ size: 266, same: 'function', keys: ['llm', 'window', 'windows'] });
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
    // The stack frame keeps its own brackets: "at run (line 2, column 9)".
    expect((failed as Error).message).toMatch(/\(line 2, column \d+\)/);

    const body = 'function run() { console.log("\\u001etell-and-wire:result {not json"); return { ok: 1 }; }';
    await expect(nodeCode.run(body, {})).rejects.toThrow(/only Tell & Wire may write/);
    await expect(nodeCode.run('function run() { return new Promise(() => {}); }', {}, undefined, { calls: { llm: async () => 'x' } })).rejects.toThrow();
  });
});

describe('a body that draws', () => {
  it('is told the blocks that show its result as node.windows -- none, as a list, when nobody says', async () => {
    const windows = [{ port: 'out', block: 'chart', kind: 'plot_window', label: '', w: 6, h: 3, width: 406, height: 196 }];
    const body = 'function run(inputs, node) { return { windows: node.windows }; }';
    expect(await nodeCode.run(body, {}, undefined, { windows })).toEqual({ windows });
    expect(await nodeCode.run(body, {})).toEqual({ windows: [] });
  });
});

describe('a body with files beside it', () => {
  it('loads them as code.js does -- require, import, a table it reads -- and names an error in one by the file, not by a folder that is gone', async () => {
    const files = {
      'tax.js': 'module.exports = { net: (gross) => gross * 0.75 };',
      'rates.json': '{ "bonus": 100 }',
      'steps.mjs': 'export const double = (n) => n * 2;',
      'table.csv': 'a,b\n1,2\n',
      'broken.js': 'module.exports = {\n  fail() { throw new Error("no rate"); },\n};',
    };
    const out = await nodeCode.run(
      `import { double } from './steps.mjs';
      import { readFileSync } from 'node:fs';
      function run(inputs) {
        const tax = require('./tax.js'), rates = require('./rates.json');
        return { net: tax.net(inputs.gross) + rates.bonus, twice: double(2), csv: readFileSync(new URL('./table.csv', import.meta.url), 'utf8').trim().split('\\n').length };
      }`,
      { gross: 200 }, undefined, { files },
    );
    expect(out).toEqual({ net: 250, twice: 4, csv: 2 });

    const failed = await nodeCode.run('function run() { return require("./broken.js").fail(); }', {}, undefined, { files }).catch((error: Error) => error);
    expect((failed as Error).message).toMatch(/no rate/);
    expect((failed as Error).message).toMatch(/broken\.js:2/);
    expect((failed as Error).message).not.toMatch(/tell-and-wire-/);

    await expect(nodeCode.run('function run() { return {}; }', {}, undefined, { files: { '../evil.js': '' } })).rejects.toThrow(/not a file a body may load/);
  });
});
