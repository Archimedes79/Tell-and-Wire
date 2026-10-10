import { describe, it, expect, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import type { Graph } from '../../graph/graph.ts';
import { loadGraph } from './project/folder.ts';
import { nodeFiles, nodeCode } from '../../graph/core/node.ts';
import { aiService } from '../../graph/ai/providers.ts';
import { lent, type Runtime } from '../../graph/nodes/Runtime.ts';
import { Session } from '../gui-editor/session.ts';
import { writeBundle } from './cli/bundle.ts';

/**
 * Every example, run the two ways that `check` and `test --offline` (CI runs
 * both over every example) do not: a model is asked, and a bundle is carried
 * elsewhere.
 *
 * **A click on Run** -- the whole graph, on nothing but its own defaults. An
 * example that needs a path typed in before it does anything is a puzzle, not
 * an example.
 *
 * **Deployed** -- written as a bundle into a temporary folder and run *from
 * there*, with the repository out of reach. The files it starts on have to
 * have come along.
 *
 * The folder is read, not listed: an example added tomorrow is held to the
 * same two without anyone remembering to add it here.
 */

const REPO = resolve(__dirname, '..', '..');
const EXAMPLES = readdirSync(resolve(REPO, 'examples'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'data').map((entry) => entry.name).sort();

/**
 * An endpoint that answers with a summary of what it was sent, in plain text --
 * an ai node with one output that holds text is answered with that text -- or,
 * where its instructions ask for JSON, with the example of its output.js.
 */
function startModel(): Promise<{ url: string; server: Server }> {
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const parsed = JSON.parse(body || '{}');
      const user = parsed.messages?.find((m: { role: string }) => m.role === 'user')?.content ?? '';
      // The instructions, wherever they went: the system message, or the
      // message itself where a file is all that arrived.
      const said = (parsed.messages ?? []).map((m: { content: unknown }) => (Array.isArray(m.content)
        ? m.content.map((part: { text?: string }) => part.text ?? '').join('\n') : String(m.content ?? ''))).join('\n');
      const json = said.includes('only a JSON object') ? /module\.exports\s*=\s*([\s\S]*?)\s*;\s*(?:\n|$)/.exec(said)?.[1] : undefined;
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        choices: [{ message: { content: json ?? `summary(${String(user).length} chars)` } }],
      }));
    });
  });
  return new Promise((fulfil) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      fulfil({ url: `http://127.0.0.1:${port}/v1`, server });
    });
  });
}

const model = await startModel();
afterAll(() => { model.server.close(); });

/**
 * An example as a graph in hand.
 *
 * Its paths are made absolute, because they are relative to the repository
 * root and a test does not run from there. Nothing else is: its AI nodes
 * follow the one AI setting, which `runtime` points at the stub.
 */
async function load(name: string): Promise<Graph> {
  const graph = await loadGraph(resolve(REPO, 'examples', name));
  const rooted = (path: unknown) => (typeof path === 'string' && path && !isAbsolute(path) ? resolve(REPO, path) : path);
  for (const node of graph.nodes) {
    if (node.node_type === 'start' && node.config.reads) node.config.path = rooted(node.config.path);
  }
  for (const block of graph.page?.blocks ?? []) {
    if (block.kind === 'input_picker') block.value = rooted(block.value);
  }
  return graph;
}

const stub = () => aiService({ endpoints: { openai_compatible: model.url } });

// What an example saves -- a CSV, a .tex -- lands here rather than in the
// working directory a test happens to run in.
const saved = await mkdtemp(join(tmpdir(), 'tell-and-wire-example-saves-'));
afterAll(() => rm(saved, { recursive: true, force: true }));
const files = { ...nodeFiles, write: (path: string, content: string, mode?: 'text' | 'binary') => nodeFiles.write(isAbsolute(path) ? path : join(saved, path), content, mode) };

/** What an example's rounds run with: its files, the sandbox, and -- the one AI setting, filled in as `nodeRuntime` fills it -- the stub model. */
function runtime(): Runtime {
  return {
    files,
    code: nodeCode,
    ai: { complete: (request) => stub().complete({ ...request, ...lent(request, { provider: 'openai_compatible', model: 'stub-model' }) }) },
  };
}

/**
 * A bundle's own `run`, from its own folder, reaching the stub as "Google":
 * the one AI setting, set the way a machine without the editor sets it.
 */
function runBundle(dir: string): Promise<{ code: number; out: string; err: string }> {
  return new Promise((fulfil, fail) => {
    const child = spawn(process.execPath, [join(dir, 'backend', 'app', 'main.ts'), dir, '--limit', '1'], {
      cwd: dir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        TW_AI_PROVIDER: 'google', TW_AI_MODEL: 'stub-model',
        GOOGLE_BASE_URL: model.url, GOOGLE_API_KEY: 'a-test-key',
        // This machine's own settings file must not decide what a test does.
        TW_SETTINGS: join(dir, 'no-settings-here.json'),
      },
    });
    let out = ''; let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('error', fail);
    child.on('close', (code) => fulfil({ code: code ?? -1, out, err }));
  });
}

describe('every example', () => {
  it('runs with a click on Run, on nothing but its own defaults', async () => {
    for (const name of EXAMPLES) {
      const result = await (await Session.open(await load(name), { runtime })).run(null);
      expect(result.node_results.filter((n) => n.status === 'error').map((n) => `${n.node_id}: ${n.error}`), name).toEqual([]);
      expect(result.status, name).toBe('success');
    }
  }, 600_000);

  it('can be deployed: it runs from its own folder, with the files it starts on', async () => {
    for (const name of EXAMPLES) {
      const dir = await mkdtemp(join(tmpdir(), 'tell-and-wire-example-'));
      try {
        await writeBundle(await loadGraph(resolve(REPO, 'examples', name)), dir, { dataFrom: REPO });
        const { code, out, err } = await runBundle(dir);
        expect(err, name).not.toMatch(/no such file|ENOENT/i);
        expect(code, `${name}: ${err.slice(-1500)}`).toBe(0);
        expect(JSON.parse(out).status, name).toBe('success');
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
  }, 600_000);
});
