import { describe, it, expect } from 'vitest';
import { nodeCode } from './node.ts';

/**
 * What a body may do.
 *
 * A body is often generated, and the sweep runs it to check it before anyone
 * has read it. So the policy is worth asserting rather than assuming: files
 * open, because reading and writing them is the job; starting other programs
 * closed, because no body has a reason to.
 *
 * The network is deliberately absent from these tests: Node has no flag for
 * it, so there is nothing here to assert and nothing to protect. See
 * `SANDBOX` in `node.ts`.
 */

describe('a code body', () => {
  it('may read and write files, and be written with import, require or CommonJS exports', async () => {
    const body = `
      import { writeFileSync, readFileSync } from 'node:fs';
      import { join } from 'node:path';
      import { tmpdir } from 'node:os';
      export function run() {
        const path = join(tmpdir(), 'tell-and-wire-sandbox-probe.txt');
        writeFileSync(path, 'written');
        return { value: readFileSync(path, 'utf8') };
      }
    `;
    expect(await nodeCode.run(body, {})).toEqual({ value: 'written' });

    // Both styles come out of a model, and both are ordinary JavaScript.
    const required = `export function run() { const { tmpdir } = require('node:os'); return { value: typeof tmpdir() }; }`;
    expect(await nodeCode.run(required, {})).toEqual({ value: 'string' });
    const exported = `function run(inputs) { return { words: inputs.text.split(' ').length }; } module.exports = { run };`;
    expect(await nodeCode.run(exported, { text: 'a b c' })).toEqual({ words: 3 });
  });

  it('may not start another program, and is handed no key of the process that runs it: it asks through node.llm', async () => {
    const body = `
      export function run() {
        const { execSync } = require('node:child_process');
        execSync('echo x');
        return { value: 'ran' };
      }
    `;
    await expect(nodeCode.run(body, {})).rejects.toThrow(/ERR_ACCESS_DENIED|not allowed|ERR_REQUIRE|Error/);

    // Fake values, set for this test only: what matters is which names arrive.
    const planted = { OPENAI_API_KEY: 'sk-planted', GITHUB_TOKEN: 'ghp-planted', SERVICE_PASSWORD: 'planted', TW_PLAIN: 'kept' };
    Object.assign(process.env, planted);
    try {
      const names = `export function run() { return { names: Object.keys(process.env).filter((name) => ${JSON.stringify(Object.keys(planted))}.includes(name)) }; }`;
      expect(await nodeCode.run(names, {})).toEqual({ names: ['TW_PLAIN'] });
    } finally {
      for (const name of Object.keys(planted)) delete process.env[name];
    }
  });
});
