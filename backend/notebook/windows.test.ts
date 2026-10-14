import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Windows } from '../../gui/notebook/windows.ts';
import { Refusal } from '../deployment/host/http.ts';
import { windowsRoutes } from './routes.ts';
import { loadGraph } from '../deployment/project/folder.ts';
import { WINDOWS_FILE, signatureOf } from './files.ts';

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
  it('is saved with its windows in the graph and the gui, and opens as they were', async () => {
    const path = await tmp();
    const { saveWindows, openWindows } = routes();

    const saved = await saveWindows({ path, windows: DOC });
    expect(saved.project).toBe(true);
    expect(saved.stale).toBe(false);
    expect(saved.graph.nodes.map((node) => node.id)).toEqual(['summarize', 'summarize_summary', 'summarize_out_summary']);
    // The windows are the graph's and the gui's: no file of their own.
    expect(existsSync(join(path, WINDOWS_FILE))).toBe(false);

    const again = await openWindows({ path });
    expect(again.windows).toEqual(DOC);
    expect(again.stale).toBe(false);
  });

  it('takes what the graph editor changed, as long as the windows can say it, and is found changed where they cannot', async () => {
    const path = await tmp();
    const { saveWindows, openWindows } = routes();
    await saveWindows({ path, windows: DOC });

    // Something else -- the graph editor, git -- words a cell differently: it is what the page says now, and nothing is written over.
    const nodes = join(path, 'graph-nodes.json');
    const original = await readFile(nodes, 'utf8');
    await writeFile(nodes, original.replace('Summarize \\"Text\\".', 'Sum up \\"Text\\".'), 'utf8');
    const reworded = await openWindows({ path });
    expect(reworded.stale).toBe(false);
    expect(reworded.windows!.windows[0].steps[0].sentence).toBe('Sum up @Text.');

    // A node the windows have no place for: the page is what can be read, and saving it would write over the rest, so it is asked.
    const parsed = JSON.parse(original) as Record<string, Record<string, unknown>>;
    parsed.extra = { ...parsed.summarize_summary, label: 'Extra' };
    await writeFile(nodes, JSON.stringify(parsed), 'utf8');
    const extra = await openWindows({ path });
    expect(extra.windows!.windows).toHaveLength(1);
    expect(extra.stale).toBe(true);
  });

  it('opens a project of an earlier version by the file it kept, as it always did, and saves it without', async () => {
    const path = await tmp();
    const { saveWindows, openWindows } = routes();
    await saveWindows({ path, windows: { ...DOC, scheme: 'office' } });
    const graph = await loadGraph(path);
    const keep = async (signature: string, windows: Windows = DOC) => writeFile(join(path, WINDOWS_FILE), JSON.stringify({ signature, windows }), 'utf8');

    await keep(signatureOf(graph));
    expect((await openWindows({ path })).stale).toBe(false);

    // Saved by another version, which made its files a little differently: the signature it kept is not the one of today,
    // nobody changed anything, and the notebook does not say so.
    await keep('0000000000000000', { ...DOC, scheme: 'office' });
    expect((await openWindows({ path })).stale).toBe(false);

    // A graph that is neither is found changed, and the page is the one that was kept.
    const nodes = join(path, 'graph-nodes.json');
    await writeFile(nodes, (await readFile(nodes, 'utf8')).replace('Summarize \\"Text\\".', 'Sum up \\"Text\\".'), 'utf8');
    const changed = await openWindows({ path });
    expect(changed.stale).toBe(true);
    expect(changed.windows!.windows[0].steps[0].sentence).toBe('Summarize @Text.');

    // Saving writes the project as it is now made, without the file.
    await saveWindows({ path, windows: changed.windows!, replace: true });
    expect(existsSync(join(path, WINDOWS_FILE))).toBe(false);
    expect((await openWindows({ path })).windows).toEqual(changed.windows);

    // A file that cannot be read says nothing; the graph does.
    await writeFile(join(path, WINDOWS_FILE), '{ not json', 'utf8');
    expect((await openWindows({ path })).windows).toEqual(changed.windows);
  });

  it('has no windows in a project the notebook did not make', async () => {
    const path = await tmp();
    const { saveWindows, openWindows } = routes();
    await saveWindows({ path, windows: DOC });
    // What the graph editor makes has start points and no window's heading in the gui.
    await rm(join(path, 'gui.json'));
    expect((await openWindows({ path })).windows).toBeNull();
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

