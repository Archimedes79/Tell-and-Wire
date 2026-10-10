import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AiNodeRunner } from './AiNodeRunner.ts';
import { nodeFiles } from '../../core/node.ts';
import type { AiRequest, ProgressEvent, Runtime } from '../Runtime.ts';
import type { GraphNode, Port } from '../../graph.ts';

/**
 * What an AI node sends, and what it makes of the answer.
 *
 * Two things it is easy to get wrong and impossible to notice: a picture sent
 * as its filename (the model dutifully talks about the filename) and a list
 * sent as a serialised list (the model reads around brackets and quotes to
 * find the text).
 */

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function aiNode(config: Record<string, unknown> = {}): GraphNode {
  return {
    id: 'ai', node_type: 'ai', label: 'Ask', description: '',
    position: { x: 0, y: 0 }, inputs: [], outputs: [],
    config: { prompt: 'be brief', ...config },
  };
}

/** A runtime that records the request instead of making it. */
function recording(): { runtime: Runtime; asked: AiRequest[] } {
  const asked: AiRequest[] = [];
  return {
    asked,
    runtime: {
      files: nodeFiles,
      code: { run: async (_body, inputs) => inputs },
      ai: { complete: async (request) => { asked.push(request); return 'answered'; } },
    },
  };
}

const element = new AiNodeRunner();

describe('what an AI node sends', () => {
  it('sends everything wired in under its port id, a list as paragraphs, its instructions as the message when nothing is wired', async () => {
    const { runtime, asked } = recording();
    // Not a port called `prompt`: naming one would drop the other in silence.
    await element.execute(aiNode(), { first: 'one', second: 'two' }, runtime);
    expect(asked[0].prompt).toBe('first:\none\n\nsecond:\ntwo');
    expect(asked[0].system).toBe('be brief');
    expect(asked[0]).not.toHaveProperty('temperature');

    await element.execute(aiNode({ temperature: 0.3 }), { summaries: ['first', 'second'] }, runtime);
    expect(asked[1].prompt).toBe('first\n\nsecond');
    expect(asked[1].temperature).toBe(0.3);

    await element.execute(aiNode({ prompt: 'Write a haiku about autumn.' }), {}, runtime);
    expect(asked[2]).toMatchObject({ prompt: 'Write a haiku about autumn.', system: '' });

    // Without instructions of its own it runs on its description, and hands on its output definition.
    const node = { ...aiNode({ prompt: '', output_definition: 'module.exports = { "n": 1 };' }), description: 'Say it in capitals.' };
    await element.execute(node, { text: 'hello' }, runtime).catch(() => undefined);
    expect(asked[3].prompt).toBe('hello');
    expect(asked[3].system).toContain('Say it in capitals.');
    expect(asked[3].system).toContain('module.exports = { "n": 1 };');
  });

  it('sends images as images, a PDF as the file it is, and an unreadable or switched-off image as its text', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tell-and-wire-ai-'));
    try {
      const path = join(dir, 'cat.png');
      await writeFile(path, PNG);
      const { runtime, asked } = recording();

      // Every image of a list, the path kept out of the prompt, a caption that is no image kept in it.
      await element.execute(aiNode({ send_images: true }), { photos: [path, path, 'caption: a red barn'] }, runtime);
      expect(asked[0].files).toHaveLength(2);
      expect(asked[0].files?.[0]?.startsWith('data:image/png;base64,')).toBe(true);
      expect(asked[0].prompt).toBe('caption: a red barn');

      await element.execute(aiNode(), { picture: path }, runtime);
      expect(asked[1]).toMatchObject({ prompt: path });
      expect(asked[1].files).toBeUndefined();

      // Sending the picture was optional: failing the node over one that has gone is not what was asked.
      await element.execute(aiNode({ send_images: true }), { picture: 'gone.png' }, runtime);
      expect(asked[2].prompt).toBe('gone.png');
      expect(asked[2].files).toBeUndefined();

      // A statement a file port read: the model reads it as it came, toggle or not.
      await element.execute(aiNode(), { statement: 'data:application/pdf;base64,JVBE', note: 'the total' }, runtime);
      expect(asked[3].files).toEqual(['data:application/pdf;base64,JVBE']);
      expect(asked[3].prompt).toBe('the total');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

/**
 * A node that maps whatever arrives onto a fixed format: with an output
 * definition that names several outputs, or a value that is not text, the
 * answer is the JSON it defines, and each key goes out on its own port -- not
 * a text of it. One output that holds text is the answer itself.
 */
describe('an answer mapped onto an output definition', () => {
  const answering = (reply: string): Runtime => ({
    files: nodeFiles,
    code: { run: async (_body, inputs) => inputs },
    ai: { complete: async () => reply },
  });
  const defined = (): GraphNode => aiNode({ output_definition: 'module.exports = { "rows": [1], "count": 1 };' });

  it('is handed on key by key, from a fence, from a file like output.js or from a sentence around it, and refused without JSON; a text output is the answer itself', async () => {
    const answer = (reply: string) => element.execute(defined(), {}, answering(reply));
    expect(await answer('{"rows": [1, 2], "count": 2}')).toEqual({ rows: [1, 2], count: 2 });
    expect(await answer('```json\n{"rows": [], "count": 0}\n```')).toEqual({ rows: [], count: 0 });
    // A small model shown the definition file answers with a file like it.
    expect(await answer('```js\n/** @typedef {Object} Output */\nmodule.exports = {\n  "rows": [3],\n  "count": 1\n};\n```')).toEqual({ rows: [3], count: 1 });
    expect(await answer('Sure! Here are the rows: {"rows": [4], "count": 1} -- hope it helps.')).toEqual({ rows: [4], count: 1 });
    await expect(answer('Sure! There are no rows.')).rejects.toThrow(/not the JSON object this node's output\.js asks for/);

    // Without a definition, or with one output that holds text, the answer is the text as it came.
    expect(await element.execute(aiNode(), {}, answering('{"rows": []}'))).toEqual({ output: '{"rows": []}' });
    const summary = aiNode({ output_definition: 'module.exports = { "summary": "Two sentences." };' });
    // Nothing is parsed: an answer that looks like JSON is the text it is.
    expect(await element.execute(summary, {}, answering('{"summary": "x"}'))).toEqual({ summary: '{"summary": "x"}' });
  });
});

/**
 * A cheap or small model gets the format wrong now and then. An answer that cannot be used is not
 * handed on, to fail somewhere else: the model is asked again, shown what it said and what was wrong.
 */
describe('an answer that cannot be used', () => {
  const port = (id: string, data_type: Port['data_type'] = 'text', multi = false): Port =>
    ({ id, name: id, kind: 'output', data_type, multi, required: false, description: '' });
  const keyed = (config: Record<string, unknown> = {}): GraphNode => ({
    ...aiNode({ output_definition: 'module.exports = { "rows": [1], "count": 1 };', ...config }),
    outputs: [port('rows', 'list'), port('count', 'number')],
  });

  /** A model that says these things, one after the other, the last for ever; an Error is thrown. */
  function saying(replies: Array<string | Error>, extra: Partial<Runtime> = {}) {
    const asked: AiRequest[] = [];
    const reports: ProgressEvent[] = [];
    const runtime: Runtime = {
      files: nodeFiles,
      code: { run: async (_body, inputs) => inputs },
      ai: {
        complete: async (request) => {
          asked.push(request);
          const reply = replies[Math.min(asked.length - 1, replies.length - 1)];
          if (reply instanceof Error) throw reply;
          return reply;
        },
      },
      report: (event) => reports.push(event),
      ...extra,
    };
    return { runtime, asked, reports };
  }

  it('asks again with what it said and what was wrong, takes the repaired answer, and makes a number of text a number', async () => {
    const { runtime, asked, reports } = saying(['Sorry, I cannot do that.', '{"rows": "a, b", "count": 2}', '{"rows": ["a", "b"], "count": "2"}']);
    expect(await element.execute(keyed(), { text: 'x' }, runtime)).toEqual({ rows: ['a', 'b'], count: 2 });
    expect(asked).toHaveLength(3);
    expect(asked[1].prompt).toContain('Your previous answer could not be used: it was not a JSON object');
    expect(asked[1].prompt).toContain('Sorry, I cannot do that.');
    expect(asked[1].prompt).toContain('with these keys: rows, count');
    expect(asked[1].prompt.startsWith('x')).toBe(true);
    expect(asked[2].prompt).toContain('rows must be a list');
    expect(reports.map((event) => (event as { message: string }).message)).toEqual([
      'asked again (1 of 3): it was not a JSON object',
      'asked again (2 of 3): rows must be a list',
    ]);
  });

  it('keeps an answer that is an object but still lacks a key; gives up on one that is none, saying how often it asked', async () => {
    const partial = saying(['{"rows": [1]}']);
    expect(await element.execute(keyed(), {}, partial.runtime)).toEqual({ rows: [1] });
    expect(partial.asked).toHaveLength(3);
    expect(partial.reports.at(-1)).toMatchObject({ message: 'kept the last answer after 3 tries: the key count is missing' });

    await expect(element.execute(keyed({ repairs: 1 }), {}, saying(['no json here']).runtime)).rejects.toThrow(/not the JSON object.*It was asked 2 times\./);
  });

  it('asks again as often as the node says, else as the machine says, and not at all for 0', async () => {
    const node = saying(['nope']);
    await expect(element.execute(keyed({ repairs: 0 }), {}, node.runtime)).rejects.toThrow(/not the JSON object/);
    expect(node.asked).toHaveLength(1);
    expect((await element.execute(keyed({ repairs: 0 }), {}, saying(['nope']).runtime).catch((e: Error) => e.message))).not.toMatch(/asked/);

    const machine = saying(['nope'], { aiRepairs: 4 });
    await expect(element.execute(keyed(), {}, machine.runtime)).rejects.toThrow(/asked 5 times/);
    expect(machine.asked).toHaveLength(5);
    // The node's own number wins over the machine's.
    const own = saying(['nope'], { aiRepairs: 4 });
    await expect(element.execute(keyed({ repairs: 1 }), {}, own.runtime)).rejects.toThrow(/asked 2 times/);
  });

  it('asks a node that answered too long for a shorter answer, and lets any other failure through at once', async () => {
    const cutOff = Object.assign(new Error('cut off'), { name: 'OutOfBudgetError' });
    const text = saying([cutOff, 'Short enough.']);
    expect(await element.execute(aiNode(), { text: 'x' }, text.runtime)).toEqual({ output: 'Short enough.' });
    expect(text.asked[1].prompt).toContain('it ran past the length limit and was cut off');
    expect(text.asked[1].prompt).toContain('much shorter');

    const broken = saying([new Error('boom')]);
    await expect(element.execute(aiNode(), {}, broken.runtime)).rejects.toThrow('boom');
    expect(broken.asked).toHaveLength(1);
  });
});
