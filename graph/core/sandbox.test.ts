import { describe, it, expect } from 'vitest';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { nodeCode } from './node.ts';

/**
 * What a body may do.
 *
 * A body is often generated, and the sweep runs it to check it before anyone
 * has read it. So the policy is worth asserting rather than assuming: the
 * working directory readable, but not the settings file that holds the keys;
 * writing the temp folder only; starting other programs closed, because no
 * body has a reason to.
 *
 * The network is deliberately absent from these tests: Node has no flag for
 * it, so there is nothing here to assert and nothing to protect. See
 * `SANDBOX` in `node.ts`.
 */

describe('a code body', () => {
  it('may read the working directory but not the settings file, and write nowhere but the temp folder', async () => {
    const settings = join(process.cwd(), 'sandbox-probe-settings.json');
    const beside = join(process.cwd(), 'sandbox-probe-beside.txt');
    writeFileSync(settings, '{"api_keys":{"openai":"sk-planted"}}');
    process.env.TW_SETTINGS = settings;
    try {
      const body = `
        import { readFileSync, writeFileSync } from 'node:fs';
        import { tmpdir } from 'node:os';
        import { join } from 'node:path';
        const tried = (what) => { try { what(); return 'allowed'; } catch (error) { return error.code; } };
        export function run() {
          return {
            package: tried(() => readFileSync('package.json')),
            settings: tried(() => readFileSync(${JSON.stringify(settings)})),
            beside: tried(() => writeFileSync(${JSON.stringify(beside)}, 'x')),
            temp: tried(() => writeFileSync(join(tmpdir(), 'tell-and-wire-sandbox-probe.txt'), 'x')),
          };
        }`;
      expect(await nodeCode.run(body, {})).toEqual({ package: 'allowed', settings: 'ERR_ACCESS_DENIED', beside: 'ERR_ACCESS_DENIED', temp: 'allowed' });
    } finally {
      delete process.env.TW_SETTINGS;
      rmSync(settings, { force: true });
      rmSync(beside, { force: true });
    }
  });

  it('is ended when it runs longer than TW_BODY_TIMEOUT_MS', async () => {
    process.env.TW_BODY_TIMEOUT_MS = '300';
    try {
      await expect(nodeCode.run('export function run() { for (;;) {} }', {})).rejects.toThrow(/ran longer than 0[.]3 s/);
    } finally {
      delete process.env.TW_BODY_TIMEOUT_MS;
    }
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
