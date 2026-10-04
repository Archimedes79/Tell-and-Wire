import { describe, it, expect, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import type { Graph } from './graph.ts';
import { loadGraph } from './project/folder.ts';
import { memoryFeedbackEdges, topologicalLevels } from './execution/executor.ts';
import { registry } from './elements/registry.ts';
import { nodeFiles, nodeCode } from './core/node.ts';
import { aiService } from './ai/providers.ts';
import { lent, type ProgressEvent, type Runtime } from './elements/Runtime.ts';
import { Session } from './host/session.ts';
import { writeBundle } from './cli/bundle.ts';

/**
 * Every example, run the three ways a person runs one.
 *
 * **A click on Run** -- the whole graph, on nothing but its own defaults. An
 * example that needs a path typed in before it does anything is a puzzle, not
 * an example.
 *
 * **Its own page** -- where it has one: the start point a block fires, sent
 * what the page holds, and only what that start point is wired to.
 *
 * **Deployed** -- written as a bundle into a temporary folder and run *from
 * there*, with the repository out of reach. The files it starts on have to
 * have come along.
 *
 * The folder is read, not listed: an example added tomorrow is held to the
 * same three without anyone remembering to add it here.
 */

const REPO = resolve(__dirname, '..', '..');
const EXAMPLES = readdirSync(resolve(REPO, 'examples'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'data').map((entry) => entry.name).sort();

/**
 * An endpoint that answers with a summary of what it was sent, in plain text --
 * an ai node with one output that holds text is answered with that text -- or,
 * where its instructions ask for JSON, with the example of its output.js.
 */
function startModel(): Promise<{ url: string; server: Server; asked: string[] }> {
  const asked: string[] = [];
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const parsed = JSON.parse(body || '{}');
      const user = parsed.messages?.find((m: { role: string }) => m.role === 'user')?.content ?? '';
      asked.push(String(user));
      // The instructions, wherever they went: the system message, or the
      // message itself where a file is all that arrived.
      const said = (parsed.messages ?? []).map((m: { content: unknown }) => (Array.isArray(m.content)
        ? m.content.map((part: { text?: string }) => part.text ?? '').join('\n') : String(m.content ?? ''))).join('\n');
      const json = said.includes('only a JSON object') ? /module\.exports\s*=\s*([\s\S]*?)\s*;\s*(?:\n|$)/.exec(said)?.[1] : undefined;
      // Derived from the prompt, so a change in how one is assembled shows up
      // as different text rather than passing unnoticed.
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        choices: [{ message: { content: json ?? `summary(${String(user).length} chars)` } }],
      }));
    });
  });
  return new Promise((fulfil) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      fulfil({ url: `http://127.0.0.1:${port}/v1`, server, asked });
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
 * follow the one AI setting, which `runGraph` points at the stub.
 */
async function load(name: string): Promise<Graph> {
  const graph = await loadGraph(resolve(REPO, 'examples', name));
  const rooted = (path: unknown) => (typeof path === 'string' && path && !isAbsolute(path) ? resolve(REPO, path) : path);
  for (const node of graph.nodes) {
    if (node.node_type === 'folder') node.config.path = rooted(node.config.path);
  }
  for (const block of graph.page?.blocks ?? []) {
    if (block.kind === 'input_picker') block.value = rooted(block.value);
  }
  return graph;
}

const stub = () => aiService({ endpoints: { openai_compatible: model.url } });

// What an example saves -- a CSV, a .tex -- lands here rather than in the
// working directory a test happens to run in.
const saved = await mkdtemp(join(tmpdir(), 'ai-graph-example-saves-'));
afterAll(() => rm(saved, { recursive: true, force: true }));
const files = { ...nodeFiles, write: (path: string, content: string, mode?: 'text' | 'binary') => nodeFiles.write(isAbsolute(path) ? path : join(saved, path), content, mode) };

/** What an example's rounds run with: its files, the sandbox, and -- the one AI setting, filled in as `nodeRuntime` fills it -- the stub model. */
function runtime(report?: (event: ProgressEvent) => void): Runtime {
  return {
    files,
    code: nodeCode,
    ai: { complete: (request) => stub().complete({ ...request, ...lent(request, { provider: 'openai_compatible', model: 'stub-model' }) }) },
    ...(report ? { report } : {}),
  };
}

/** An example in use, as the App tab and a served tool use it: a session, kept in no file. */
const use = (graph: Graph) => Session.open(graph, { runtime });

/** A click on Run: every event counted as fired, the page's too. */
const runWhole = async (graph: Graph) => (await use(graph)).run(null);

/** The round block *by* starts at start point *start*, given what the page set. */
const startedBy = (session: Session, start: string, by: string, values: Record<string, unknown> = {}) =>
  session.run({ node_id: start, port_id: 'data' }, { values, by });

/**
 * A bundle's own `run`, from its own folder, reaching the stub as "Google":
 * the one AI setting, set the way a machine without the editor sets it.
 */
function runBundle(dir: string): Promise<{ code: number; out: string; err: string }> {
  return new Promise((fulfil, fail) => {
    const child = spawn(process.execPath, [join(dir, 'engine', 'main.ts'), dir, '--limit', '1'], {
      cwd: dir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        AI_GRAPH_AI_PROVIDER: 'google', AI_GRAPH_AI_MODEL: 'stub-model',
        GOOGLE_BASE_URL: model.url, GOOGLE_API_KEY: 'a-test-key',
        // This machine's own settings file must not decide what a test does.
        AI_GRAPH_SETTINGS: join(dir, 'no-settings-here.json'),
      },
    });
    let out = ''; let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('error', fail);
    child.on('close', (code) => fulfil({ code: code ?? -1, out, err }));
  });
}

describe.each(EXAMPLES)('%s', (name) => {
  it('is a graph the engine can order', async () => {
    const graph = await load(name);
    const feedback = memoryFeedbackEdges(graph.nodes, graph.edges, registry);
    expect(() => topologicalLevels(graph.nodes, graph.edges, feedback)).not.toThrow();
    expect(graph.metadata.description.length).toBeGreaterThan(20);
  });

  it('runs with a click on Run, on nothing but its own defaults', async () => {
    const result = await runWhole(await load(name));
    expect(result.node_results.filter((n) => n.status === 'error').map((n) => `${n.node_id}: ${n.error}`)).toEqual([]);
    expect(result.status).toBe('success');
  }, 120_000);

  it('can be deployed: it runs from its own folder, with the files it starts on', async () => {
    const graph = await loadGraph(resolve(REPO, 'examples', name));
    const dir = await mkdtemp(join(tmpdir(), 'ai-graph-example-'));
    try {
      await writeBundle(graph, dir, { dataFrom: REPO });
      const { code, out, err } = await runBundle(dir);
      expect(err).not.toMatch(/no such file|ENOENT/i);
      expect(code, err.slice(-1500)).toBe(0);
      expect(JSON.parse(out).status).toBe('success');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 180_000);
});

describe('what each example is there to show', () => {
  it('nested_statistics: the part runs inside the whole, and on its own', async () => {
    const whole = await runWhole(await load('nested_statistics'));
    expect(whole.status).toBe('success');
    // The value came up through the node that holds the graph doing the counting,
    // and is the run's result under the end point's name.
    expect(whole.outputs.Report).toEqual({ value: { words: 32, sentences: 2, longest: 'directions' } });

    // And the same folder is a project: the graph inside runs by itself, on
    // what its own start point is sent when nobody sends it anything. That is
    // the claim the design rests on.
    const alone = await runWhole(await loadGraph(resolve(REPO, 'examples/nested_statistics/nodes/statistics')));
    expect(alone.status).toBe('success');
    expect(alone.outputs.Numbers).toEqual({ value: { words: 8, sentences: 1, longest: 'sentence' } });
  });

  it('chat: a message starts the graph, and the turn is remembered', async () => {
    const before = model.asked.length;
    const session = await use(await load('chat'));
    expect((await startedBy(session, 'send', 'chat', { chat: 'Hello there' })).status).toBe('success');
    expect((await startedBy(session, 'send', 'chat', { chat: 'And again' })).status).toBe('success');

    // The second request carries the first turn: the block is the memory, and
    // each value goes to the model under its port id, the history first.
    const [first, second] = model.asked.slice(before);
    expect(first).toBe('history:\n\n\nmessage:\nHello there');
    expect(second).toContain('history:\nUser: Hello there\n\nAssistant: summary(');
    expect(second.endsWith('message:\nAnd again')).toBe(true);
    const chat = session.view().page.chat as { messages: unknown[]; pending: string };
    expect(chat.messages).toHaveLength(4);
    expect(chat.pending).toBe('');
  }, 60_000);

  it('chat: a click on Run with nothing typed asks nobody and changes nothing', async () => {
    const before = model.asked.length;
    const session = await use(await load('chat'));
    const result = await session.run(null);
    expect(model.asked.length).toBe(before);
    expect(result.node_results.find((n) => n.node_id === 'assistant')?.status).toBe('skipped');
    expect((session.view().page.chat as { messages: unknown[] }).messages).toEqual([]);
  }, 60_000);

  it('file_summarizer: a change of length summarizes the chosen file again, in the length chosen', async () => {
    const before = model.asked.length;
    const session = await use(await load('file_summarizer'));
    const result = await startedBy(session, 'summarize', 'length', { length: 'One sentence' });
    expect(result.status).toBe('success');
    const asked = model.asked.slice(before);
    expect(asked).toHaveLength(1);
    expect(asked[0].startsWith('text:\nThe Lighthouse')).toBe(true);
    expect(asked[0].endsWith('length:\nOne sentence')).toBe(true);
    const shown = session.view().shown;
    expect(String(shown.summary)).toMatch(/^summary\(/);
    expect(String(shown.about)).toMatch(/^01_the_lighthouse_keeper\.txt\n\d+ words/);
    expect(String(shown.content).startsWith('The Lighthouse')).toBe(true);
  }, 60_000);

  it('file_summarizer: pressing the button asks again, for the same file in the same length', async () => {
    const before = model.asked.length;
    const session = await use(await load('file_summarizer'));
    await startedBy(session, 'summarize', 'go');
    await startedBy(session, 'summarize', 'go');
    const [first, second] = model.asked.slice(before);
    expect(second).toBe(first);
    expect(first.endsWith('length:\nThree sentences')).toBe(true);
  }, 60_000);

  it('folder_summaries: choosing a folder asks once per file, with the file\'s text, and the page shows the summaries', async () => {
    const before = model.asked.length;
    const session = await use(await load('folder_summaries'));
    const result = await startedBy(session, 'chosen', 'folder');
    expect(result.status).toBe('success');
    const prompts = model.asked.slice(before);
    expect(prompts).toHaveLength(3);
    // The stories' text, not their filenames.
    expect(Math.min(...prompts.map((prompt) => prompt.length))).toBeGreaterThan(500);
    // One summary per file reaches the one box, in the round that made them.
    const shown = session.view().shown.summaries;
    const summaries = Array.isArray(shown) ? shown : String(shown).split('\n').filter(Boolean);
    expect(summaries).toHaveLength(3);
    expect(summaries.every((summary) => String(summary).startsWith('summary('))).toBe(true);
  }, 120_000);

  /**
   * What the node is responsible for, and nothing more: it says *what* to plot
   * and the chart block draws it, so what is checked here is the figure.
   * Nothing in a run knows how big the chart will be.
   */
  it('population_plotter: choosing a file is all it takes -- the figure reaches the chart', async () => {
    const session = await use(await load('population_plotter'));
    const result = await startedBy(session, 'draw', 'file');
    expect(result.status).toBe('success');
    const figure = session.view().shown.plot as { kind: string; title: string; points: { label: string; value: number }[] };
    expect(figure).toMatchObject({ kind: 'bars', title: 'Population by Country' });
    expect(figure.points).toHaveLength(20);
    expect(figure.points.slice(0, 2).map((point) => point.label)).toEqual(['India', 'China']);
  }, 120_000);

  it('population_plotter: with no file chosen the chart says so, instead of the run failing', async () => {
    const graph = await load('population_plotter');
    graph.page!.blocks.find((block) => block.id === 'file')!.value = '';
    const session = await use(graph);
    const result = await session.run(null);
    expect(result.status).toBe('success');
    expect(session.view().shown.plot).toMatchObject({ title: 'Choose a CSV file to plot.', points: [] });
  }, 120_000);
});
