import { describe, it, expect } from 'vitest';
import type { AiRequest, AiService, CodeService } from '../../graph/nodes/Runtime.ts';
import { registry } from '../../graph/nodes/registry.ts';
import { parseGraph, type GraphNode } from '../../graph/graph.ts';
import { GenerationFailed, GenerationRefused, firstCodeBlock, generate, generateGraph } from './generate.ts';
import { nodeCode } from '../../graph/core/node.ts';
import type { GenerateRequest } from '../app/api.ts';

/**
 * Writing a node's files with a model, without a model.
 *
 * The model is a script here: it answers each call in turn, so a test can say
 * exactly what the first and the second pass returned. The runner is the real
 * sandbox for the probes that matter, and a fake where only the verdict does.
 */

function scripted(replies: string[]): AiService & { asked: AiRequest[] } {
  const asked: AiRequest[] = [];
  return {
    asked,
    async complete(request) {
      asked.push(request);
      const reply = replies.shift();
      if (reply === undefined) throw new Error('the model was asked more than it was scripted for');
      return reply;
    },
  };
}

const runner = (outcome: (body: string) => Record<string, unknown>): CodeService => ({
  run: async (body) => outcome(body),
});

const target = { provider: 'test', model: 'm' };
const deps = (ai: AiService, code: CodeService = runner(() => ({}))) => ({ ai, code, elements: registry, target });

const port = (id: string, kind: 'input' | 'output', extra: Record<string, unknown> = {}) =>
  ({ id, name: id, kind, data_type: 'any', multi: false, required: false, description: '', ...extra });

/** A node as the editor sends it: its kind, heading and text, its ports, its definitions and body in *config*. */
function node(type: string, config: Record<string, unknown> = {}, ports: { inputs?: string[]; outputs?: string[] } = {}): GraphNode {
  return parseGraph({
    metadata: { name: 't' },
    nodes: [{
      id: 'n', node_type: type, label: 'Count', description: 'Count the lines of the text.',
      inputs: (ports.inputs ?? ['text']).map((id) => port(id, 'input')),
      outputs: (ports.outputs ?? ['lines']).map((id) => port(id, 'output')),
      config,
    }],
    edges: [],
  }).nodes[0];
}

const INPUT = 'module.exports = { "text": "a\\nb" };';
const OUTPUT = 'module.exports = { "lines": 2 };';
const js = (body: string) => `\`\`\`js\n${body}\n\`\`\``;

describe('✨ writes a node\'s files', () => {
  it('writes code from the fence, tries it on the example in input.js, and repairs it once, with the evidence, when it does not fit output.js', async () => {
    const ai = scripted([
      js('function run(i) { return { lines: String(i.text.split("\\n").length) }; }'),
      js('function run(i) { return { lines: i.text.split("\\n").length }; }'),
    ]);
    const reply = await generate({ node: node('code', { input_definition: INPUT, output_definition: OUTPUT }) }, deps(ai, nodeCode));
    expect(reply.probe.status).toBe('repaired');
    expect(ai.asked).toHaveLength(2);
    expect(ai.asked[1].prompt).toContain('- output "lines" is text; output.js says a number');
    expect(reply.result).toContain('i.text.split("\\n").length }');
    expect(reply.calls).toHaveLength(2);
  }, 30_000);

  it('changes a body as said, from the function there is, and restates the node\'s text', async () => {
    const ai = scripted([`${js('function run(i) { return { lines: i.text.split("\\n").length + 1 }; }')}\n<description>Count the lines, plus one.</description>`]);
    const reply = await generate({
      node: node('code', { input_definition: INPUT, code: 'function run(i) { return { lines: 2 }; }' }),
      refine: { change: 'Add one.', outcome: '{"lines": 2}' },
    }, deps(ai, nodeCode));
    expect(ai.asked[0].prompt).toContain('function run(i) { return { lines: 2 }; }');
    expect(ai.asked[0].prompt).toContain('Add one.');
    expect(reply.description).toBe('Count the lines, plus one.');
    expect(reply.result).not.toContain('<description>');
  }, 30_000);

  it('writes a definition with what was said to its chat, and changes the one there is as said, whole', async () => {
    const wider = 'module.exports = { "lines": 2, "words": 4 };';
    const ai = scripted([js(OUTPUT), js(wider)]);
    const first = await generate({ node: node('code'), write: 'output', ask: 'Also the words.' }, deps(ai));
    expect(first.result).toBe(OUTPUT);
    expect(ai.asked[0].prompt).toContain('## What is asked of it\nAlso the words.');
    const changed = await generate({ node: node('code', { output_definition: OUTPUT }), write: 'output', refine: { change: 'Also the words.' } }, deps(ai));
    expect(changed.result).toBe(wider);
    expect(ai.asked[1].prompt).toContain(`## output.js as it is now\n\n${OUTPUT}\n\n## What to change\n\nAlso the words.`);
  });

  it('refuses what ✨ does not write, and hands the transcript back with a failure', async () => {
    const quiet = deps(scripted([]));
    await expect(generate({ node: node('end') }, quiet)).rejects.toBeInstanceOf(GenerationRefused);
    await expect(generate({ node: node('data'), write: 'input' }, quiet)).rejects.toBeInstanceOf(GenerationRefused);
    // What arrives over the wire is not held to the type: a request without a node.
    await expect(generate({} as GenerateRequest, quiet)).rejects.toBeInstanceOf(GenerationRefused);
    // A data node's answer that is not JSON is refused, not saved.
    const held = node('data', {}, { inputs: ['note'], outputs: ['note'] });
    await expect(generate({ node: held }, deps(scripted(['```json\n{count: 0}\n```'])))).rejects.toThrow(/not JSON/);
    // Its answer is two blocks: how it starts, and how rounds would fill it -- the second left out where it is not an object. The wired fields are said to be kept.
    const both = await generate({ node: held, input_sources: { note: 'Writer' }, output_targets: { note: 'Reader' } }, deps(scripted(['```json\n{"note": ""}\n```\n```json\n{"note": "hello"}\n```'])));
    expect([both.result, both.example]).toEqual(['{"note": ""}', '{"note": "hello"}']);
    expect((await generate({ node: held }, deps(scripted(['```json\n{"note": ""}\n```\n```json\n[1]\n```'])))).example).toBeUndefined();
    expect(await generate({ node: held, preview: true, output_targets: { note: 'Reader' } }, deps(scripted([]))).then((one) => one.calls[0].prompt)).toContain('Keep "note"');

    const ai: AiService = { complete: async () => { throw new Error('no content'); } };
    const failure = await generate({ node: node('code') }, deps(ai)).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(GenerationFailed);
    expect((failure as GenerationFailed).calls[0]).toMatchObject({ error: 'no content', reply: null });
  });
});

describe('the code in a model\'s answer', () => {
  const fence = '```';
  it('is found behind any info string and Windows line ends, and does not end at a fence written inside it', () => {
    expect(firstCodeBlock(`Here:\n${fence}javascript \nfunction run() {}\n${fence}\nDone.`)).toBe('function run() {}');
    expect(firstCodeBlock(`${fence}js title="code.js"\r\nfunction run() {}\r\n${fence}`)).toBe('function run() {}');

    const code = 'function run() {\n  return { md: "' + fence + 'json\\n{}\\n' + fence + '" };\n}';
    expect(firstCodeBlock(`${fence}js\n${code}\n${fence}`)).toBe(code);

    // Instructions fenced with four hold an example fenced with three.
    const instructions = `Answer with the figure, like this:\n${fence}json\n{ "kind": "bars" }\n${fence}\nNothing else.`;
    expect(firstCodeBlock(`${fence}\`md\n${instructions}\n${fence}\`\nDone.`)).toBe(instructions);
  });
});

describe('a whole graph', () => {
  it('parses the fenced document, keeps the explanation, and fails with the transcript when the answer was cut off', async () => {
    const document = { metadata: { name: 'g' }, nodes: [{ id: 'c', node_type: 'code', config: { code: 'const md = "```js";' } }], edges: [] };
    const ai = scripted([`\`\`\`json\n${JSON.stringify(document, null, 2)}\n\`\`\`\nDone.`]);
    const reply = await generateGraph('anything', { ai, target });
    expect(reply.graph).toEqual(document);
    expect(reply.explanation).toBe('Done.');

    const failure = await generateGraph('x', { ai: scripted(['```json\n{"nodes": [{"id": "a", "config": {"history": "## 2026']), target })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(GenerationFailed);
    expect((failure as GenerationFailed).calls).toHaveLength(1);
  });
});

describe('a whole graph, changed as said', () => {
  const current = parseGraph({
    metadata: { name: 'Word tool', description: 'Counts words.', gui_scheme: 'paper' },
    nodes: [
      { id: 'count', node_type: 'code', label: 'Count', position: { x: 420, y: 120 }, config: { code: 'function run() { return {}; }' } },
      { id: 'notes', node_type: 'data', label: 'Notes', position: { x: 40, y: 80 }, width: 340, height: 300 },
    ],
    edges: [],
    page: { blocks: [{ id: 'text', kind: 'text_io', mode: 'input', sends_to: ['count'] }] },
  });

  it('keeps what the answer leaves out: the graph\'s name and scheme, where each node stands, its size, the page', async () => {
    // An answer that says nothing of the metadata, of positions, of a size or of the page.
    const answer = {
      nodes: [
        { id: 'count', node_type: 'code', label: 'Count words' },
        { id: 'notes', node_type: 'data', label: 'Notes' },
        { id: 'shown', node_type: 'end', label: 'Words', position: { x: 800, y: 120 } },
      ],
      edges: [],
    };
    const reply = await generateGraph('Show the count.', { ai: scripted([`\`\`\`json\n${JSON.stringify(answer)}\n\`\`\``]), target }, current);
    const graph = parseGraph(reply.graph);
    expect(graph.metadata).toMatchObject({ name: 'Word tool', description: 'Counts words.', gui_scheme: 'paper' });
    expect(graph.nodes.map((node) => [node.id, node.label, node.position])).toEqual([
      ['count', 'Count words', { x: 420, y: 120 }], ['notes', 'Notes', { x: 40, y: 80 }], ['shown', 'Words', { x: 800, y: 120 }],
    ]);
    expect(graph.nodes[1]).toMatchObject({ width: 340, height: 300 });
    expect(graph.page).toEqual(current.page);
    // What the answer does say is what it says: a new name is a change.
    const renamed = await generateGraph('Rename it.', {
      ai: scripted(['```json\n{"metadata":{"name":"Counter"},"nodes":[],"edges":[]}\n```']), target,
    }, current);
    expect(parseGraph(renamed.graph).metadata).toMatchObject({ name: 'Counter', gui_scheme: 'paper' });
  });

  it('is not sent how each node was written, and loses none of it: a kept node\'s history comes back from the graph that was sent', async () => {
    const written = parseGraph({
      metadata: { name: 'Words' },
      nodes: [
        { id: 'count', node_type: 'code', label: 'Count', description: 'Counts the words.', config: {
          code: 'function run() { return {}; }', input_files: ['data/accounts.csv'],
          history: '## 2026-09-27 10:00 · ✨ Code\n\nPrompt:\n\n```\nIBAN DE00 1234\n```',
        } },
        { id: 'say', node_type: 'ai', label: 'Say', description: 'Says the count.', config: {
          prompt: 'Say it.', history: '## 2026-09-27 11:00 · ✨ Prompt\n\nNothing was sent.',
        } },
      ],
      edges: [],
    });
    // "say" changed, "note" new -- and a history the model made up for "count", which is not the node's.
    const answer = {
      nodes: [
        { id: 'count', node_type: 'code', label: 'Count', description: 'Counts the words.', config: { code: 'function run() { return {}; }', history: 'made up' } },
        { id: 'say', node_type: 'ai', label: 'Say', description: 'Says the count kindly.', config: { prompt: 'Say it kindly.' } },
        { id: 'note', node_type: 'data', label: 'Note', description: 'Keeps a note.', config: { data_value: { note: 'hi' } } },
      ],
      edges: [],
    };
    const ai = scripted([`\`\`\`json\n${JSON.stringify(answer)}\n\`\`\``]);
    const reply = await generateGraph('Say it kindly, and keep a note.', { ai, target }, written);
    expect(ai.asked[0].prompt).not.toMatch(/IBAN|accounts\.csv|✨ Prompt/);
    const [count, say, note] = parseGraph(reply.graph).nodes;
    // Kept and untouched: its history and the files its chats were given, as they were sent.
    expect(count.config).toMatchObject({ history: written.nodes[0].config.history, input_files: ['data/accounts.csv'] });
    // Touched: the exchange at the end of its history, as after every ✨; new: its history begins with it.
    expect(String(say.config.history)).toMatch(/^## 2026-09-27 11:00 · ✨ Prompt\n\nNothing was sent\.\n\n## \d{4}-\d\d-\d\d \d\d:\d\d · Change of the graph: Say it kindly/);
    expect(String(note.config.history)).toMatch(/^## \d{4}-\d\d-\d\d \d\d:\d\d · Change of the graph: Say it kindly/);
  });
});
