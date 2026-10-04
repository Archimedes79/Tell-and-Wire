import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InputPickerWidgetRunner } from './InputPickerWidgetRunner.ts';
import { parseWidget } from '../page.ts';
import { nodeFiles } from '../../../../graph/core/node.ts';
import type { Runtime } from '../../../../graph/nodes/Runtime.ts';
import type { RawConfig } from '../../../../graph/graph.ts';

/**
 * Exercised through `parseWidget`, the one place a real `Widget` is built,
 * rather than a hand-built object -- so this is what a stored block actually
 * produces, not a shape the test assumes.
 */

const runtime: Runtime = {
  files: nodeFiles,
  code: { run: async (_body, inputs) => inputs },
  ai: { complete: async () => '' },
};

let dir = '';
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ai-graph-picker-'));
  await writeFile(join(dir, 'x.csv'), 'year,people\n2020,5');
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const element = new InputPickerWidgetRunner();

describe('a file picker', () => {
  it('reads its settings out of the stored record', () => {
    const widget = parseWidget({ id: 'w1', kind: 'input_picker', label: 'Pick', value: '/data/x.csv' });
    expect(element.config(widget)).toMatchObject({ path: '/data/x.csv', directory: false, content: true });
  });

  it('sends the chosen file as where it is and what is in it', async () => {
    const path = join(dir, 'x.csv');
    const sent = await element.data(parseWidget({ id: 'w1', kind: 'input_picker', value: path }), runtime);
    expect(sent).toEqual({ path, content: 'year,people\n2020,5' });
  });

  it('sends only the path when told to: a node that copies or writes beside it needs no content', async () => {
    const widget = parseWidget({ id: 'w1', kind: 'input_picker', value: join(dir, 'x.csv'), send: 'path' });
    expect(element.sends(widget)).toMatchObject({ type: 'file_path' });
    expect(String(await element.data(widget, runtime))).toContain('x.csv');
  });

  it('sends nothing while nothing is chosen, and an empty list for a folder', async () => {
    expect(await element.data(parseWidget({ id: 'w1', kind: 'input_picker' }), runtime)).toBeNull();
    expect(await element.data(parseWidget({ id: 'w1', kind: 'input_picker', mode: 'directory' }), runtime)).toEqual([]);
  });

  it('is a question while nothing is chosen, and keeps the answer as what it holds', () => {
    const unchosen = parseWidget({ id: 'w1', kind: 'input_picker', label: 'Folder', mode: 'directory' });
    expect(element.runtimeRequirements(unchosen)).toEqual([{ label: 'Folder', kind: 'directory', current: '' }]);
    expect(element.runtimeRequirements(parseWidget({ id: 'w1', kind: 'input_picker', value: 'a.csv' }))).toEqual([]);
    const stored: RawConfig = { id: 'w1', kind: 'input_picker' };
    element.setValue(stored, '/data');
    expect(stored.value).toBe('/data');
  });

  it('names the file it starts on, for a bundle to carry', () => {
    expect(element.referencedPaths(parseWidget({ id: 'w1', kind: 'input_picker', value: 'data.csv' }))).toEqual(['data.csv']);
    expect(element.referencedPaths(parseWidget({ id: 'w1', kind: 'input_picker' }))).toEqual([]);
  });
});
