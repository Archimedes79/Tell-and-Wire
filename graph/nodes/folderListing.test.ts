import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { listFolder } from './folderListing.ts';
import { nodeRuntime } from '../core/node.ts';
import { registry } from './registry.ts';
import { parseWidget, widgetElement } from '../../backend/gui-editor/widgets/page.ts';
import type { GraphNode } from '../graph.ts';

/**
 * A folder listing is the folder, its file types and its subfolders -- the
 * same for a start point that starts itself and a file-picker block. Keeping
 * only some of the files is a code node after it.
 */
let dir = '';
beforeAll(async () => {
  dir = await mkdtemp(join(process.cwd(), 'tell-and-wire-listing-'));
  await mkdir(join(dir, 'more'));
  for (const name of ['a.CSV', 'b.csv', 'c.txt', join('more', 'd.csv')]) await writeFile(join(dir, name), 'x');
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

const runtime = nodeRuntime();
const names = (files: string[]) => files.map((file) => file.slice(dir.length + 1).split('\\').join('/'));

describe('a folder listing', () => {
  it('keeps the file types it names whatever their case, looks into subfolders only when told to, and is the same for a start point that reads (a folder, or a file) and a file-picker block', async () => {
    expect(names(await listFolder(dir, { recursive: false, extensions: 'CSV' }, runtime))).toEqual(['a.CSV', 'b.csv']);
    expect(names(await listFolder(dir, { recursive: false, extensions: '' }, runtime))).toEqual(['a.CSV', 'b.csv', 'c.txt']);
    expect(names(await listFolder(dir, { recursive: true, extensions: '.csv' }, runtime))).toEqual(['a.CSV', 'b.csv', 'more/d.csv']);

    const start = (config: Record<string, unknown>) => ({ id: 'inbox', node_type: 'start', config: { started_by: 'itself', ...config } }) as unknown as GraphNode;
    const sends = async (node: GraphNode) => ((await registry.node('start')!.execute(node, {}, runtime)).data as { values: Record<string, unknown> }).values.inbox;
    const block = parseWidget({ id: 'pick', kind: 'input_picker', mode: 'directory', value: dir, extensions: 'csv' });
    const fromStart = await sends(start({ reads: 'folder', path: relative(process.cwd(), dir), extensions: 'csv' }));
    const fromBlock = await widgetElement('input_picker')!.data(block, runtime);
    expect(names(fromStart as string[])).toEqual(['a.CSV', 'b.csv']);
    expect(fromBlock).toEqual(fromStart);

    // A file is its path and what is in it; set to read nothing, it sends what it was sent.
    expect(await sends(start({ reads: 'file', path: join(relative(process.cwd(), dir), 'c.txt') }))).toEqual({ path: join(dir, 'c.txt'), content: 'x' });
    expect(await sends(start({ path: relative(process.cwd(), dir) }))).toBeUndefined();
  });
});
