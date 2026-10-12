import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Windows } from '../../gui/notebook/windows.ts';
import { Refusal } from '../deployment/host/http.ts';
import { windowsRoutes } from './routes.ts';
import { WINDOWS_FILE } from './files.ts';

/**
 * The notebook's routes: a project of windows is saved, opened, found changed when something else
 * changed it, and windows are made from a sentence by a model that may need telling once.
 */

const DOC: Windows = {
  name: 'Texts', description: 'Summarize a text.',
  windows: [{
    id: 'summarize', title: 'Summarize', span: 8,
    inputs: [{ name: 'Text', kind: 'text', value: 'A long text.' }],
    steps: [{ name: 'Summary', sentence: 'Summarize @Text.', how: 'ai' }],
    outputs: [{ name: 'Summary', kind: 'text', rows: 3 }],
  }],
};

/** Routes whose model answers from a list, and a transcript of what it was asked. */
function routes(answers: string[] = []) {
  const asked: string[] = [];
  const ai = { complete: async (request: { prompt: string }) => { asked.push(request.prompt); return answers.shift() ?? ''; } };
  return {
    asked,
    ...windowsRoutes({
      watched: (work) => work([]),
      ai: () => ai as never,
      target: async () => ({ provider: 'google', model: 'stub' }) as never,
    }),
  };
}

const tmp = async () => join(await mkdtemp(join(tmpdir(), 'notebook-')), 'tool');

describe('a notebook on disk', () => {
  it('is saved with its windows, opens as they were, and is found changed when the graph beside them was', async () => {
    const path = await tmp();
    const { saveWindows, openWindows } = routes();

    const saved = await saveWindows({ path, windows: DOC });
    expect(saved.project).toBe(true);
    expect(saved.stale).toBe(false);
    expect(saved.graph.nodes.map((node) => node.id)).toEqual(['summarize', 'summarize_summary', 'summarize_out_summary']);

    const again = await openWindows({ path });
    expect(again.windows).toEqual(DOC);
    expect(again.stale).toBe(false);

    // Something else -- the graph editor, git -- words a cell differently: the notebook says so, and does not write over it.
    const nodes = join(path, 'graph-nodes.json');
    await writeFile(nodes, (await readFile(nodes, 'utf8')).replace('Summarize \\"Text\\".', 'Sum up \\"Text\\".'), 'utf8');
    expect((await openWindows({ path })).stale).toBe(true);

    // A project the notebook did not make has no windows.
    const other = await tmp();
    await saveWindows({ path: other, windows: DOC });
    await writeFile(join(other, WINDOWS_FILE), '{ not json', 'utf8');
    expect((await openWindows({ path: other })).windows).toBeNull();
  });

  it('is written over only when told, and what a model wrote for a cell stays', async () => {
    const path = await tmp();
    const { saveWindows } = routes();
    await saveWindows({ path, windows: DOC });
    await expect(saveWindows({ path, windows: DOC })).rejects.toMatchObject({ status: 409 });

    await writeFile(join(path, 'nodes', 'summarize_summary', 'prompt.md'), 'Summarize the text, faithfully.\n', 'utf8');
    const reworded: Windows = { ...DOC, windows: [{ ...DOC.windows[0], steps: [{ ...DOC.windows[0].steps[0], sentence: 'Sum up @Text.' }] }] };
    await saveWindows({ path, windows: reworded, replace: true });
    expect(await readFile(join(path, 'nodes', 'summarize_summary', 'prompt.md'), 'utf8')).toContain('Summarize the text, faithfully.');
  });

  it('refuses windows that cannot be made into a tool, and a file where a folder is meant', async () => {
    const { saveWindows } = routes();
    const none: Windows = { ...DOC, windows: [{ ...DOC.windows[0], outputs: [] }] };
    await expect(saveWindows({ path: await tmp(), windows: none })).rejects.toBeInstanceOf(Refusal);
    await expect(saveWindows({ path: join(await tmp(), 'a.json'), windows: DOC })).rejects.toMatchObject({ status: 400 });
  });
});

describe('windows from a sentence', () => {
  const page = JSON.stringify({
    name: 'Texts', description: '',
    windows: [{
      id: 'Summarize it', title: 'Summarize', span: 8,
      inputs: [{ name: 'Text', kind: 'text' }],
      steps: [{ name: 'Summary', sentence: 'Summarize @Text.' }],
      outputs: [{ name: 'Summary', kind: 'text' }],
    }],
  });

  it('are read from a fenced answer, with ids made valid', async () => {
    const { describeWindows, asked } = routes([`Here it is:\n\`\`\`json\n${page}\n\`\`\`\nOne window.`]);
    const made = await describeWindows({ description: 'Summarize a text' });
    expect(made.windows.windows.map((window) => window.id)).toEqual(['summarize_it']);
    expect(made.windows.windows[0].outputs[0].rows).toBe(3);
    expect(made.explanation).toBe('One window.');
    expect(asked).toHaveLength(1);
  });

  it('are asked for once more, with what was wrong, and given up on after that', async () => {
    const bad = JSON.stringify({ windows: [{ id: 'a', title: 'A', inputs: [], steps: [{ name: 'S', sentence: 'Do @Nothing.' }], outputs: [{ name: 'S', kind: 'text' }] }] });
    const mended = routes([bad, page]);
    expect((await mended.describeWindows({ description: 'x' })).windows.windows).toHaveLength(1);
    expect(mended.asked[1]).toContain('@Nothing');

    const hopeless = routes([bad, bad]);
    await expect(hopeless.describeWindows({ description: 'x' })).rejects.toThrow(/could not be made/);
    expect(hopeless.asked).toHaveLength(2);

    await expect(routes().describeWindows({ description: '  ' })).rejects.toThrow(/Say what/);
  });
});

