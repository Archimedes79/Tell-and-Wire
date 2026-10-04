import { describe, it, expect, afterAll } from 'vitest';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { serve, type Served } from './serve.ts';
import { API } from './api.ts';

/**
 * A page of a project's own, written by hand against the runtime API: served
 * in place of the built page -- and, in the example that has one, calling
 * nothing but what any frontend may call.
 */

const EXAMPLE = resolve(__dirname, '..', '..', 'examples', 'nested_statistics');
const served: Served[] = [];
afterAll(async () => { for (const one of served) await one.shutdown(); });

describe('a project\'s own frontend', () => {
  it('is served at / and beside it in place of the built page, and the example\'s calls nothing but the runtime API', async () => {
    // A copy of the example: a served project keeps its state beside its flow.json.
    const dir = join(await mkdtemp(join(tmpdir(), 'frontend-')), 'nested_statistics');
    await cp(EXAMPLE, dir, { recursive: true });
    await writeFile(join(dir, 'frontend', 'style.css'), 'body { color: red }');
    const pageDir = await mkdtemp(join(tmpdir(), 'built-'));
    await writeFile(join(pageDir, 'runtime.html'), '<title>built</title>');
    const one = await serve({ graphPath: dir, pageDir, port: 0 });
    served.push(one);
    expect(await (await fetch(`${one.url}/`)).text()).toContain('<title>Nested statistics</title>');
    expect(await (await fetch(`${one.url}/style.css`)).text()).toBe('body { color: red }');

    const page = await readFile(join(EXAMPLE, 'frontend', 'index.html'), 'utf8');
    const called = new Set([
      ...[...page.matchAll(/\bapi\('([a-z]+)'/g)].map((match) => `/api/runtime/${match[1]}`),
      ...[...page.matchAll(/`?(\/api\/[a-z/]+)/g)].map((match) => match[1].replace(/\/$/, '')).filter((path) => path !== '/api/runtime'),
    ]);
    expect(called.size).toBeGreaterThan(2);
    const tool = Object.values(API).filter((route) => route.for === 'tool' && route.path.startsWith('/api/runtime/')).map((route) => route.path);
    for (const path of called) expect(tool, path).toContain(path);
  });
});
