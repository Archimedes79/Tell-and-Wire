import { describe, it, expect, vi } from 'vitest';
import type { GraphNode, GuiWidget } from '../../app/graph';
import { WIDGET_BUILDERS } from '../../app/elements/registry';
import { NODE_KINDS } from '../../app/document/nodeKinds';

// What a listing would post, caught instead of posted, and what the server answers.
const posted: { route: string; body: Record<string, unknown> }[] = [];
let answer: Record<string, unknown> = { status: 'success', outputs: {}, error: null };
vi.mock('../../app/api/client', async (original) => ({
  ...(await original<typeof import('../../app/api/client')>()),
  call: vi.fn(async (route: string, body: Record<string, unknown>) => {
    posted.push({ route, body });
    return answer;
  }),
}));

const { listAsRun, listBlockAsRun } = await import('./readAsRun');

describe('a folder listed as a run lists it', () => {
  it('hands back what a folder picker lists, listed by a folder node set as the picker is', async () => {
    answer = { status: 'success', outputs: { files: ['a.csv', 'b.csv'], count: 2 }, error: null };
    const picker = { ...WIDGET_BUILDERS.input_picker.create('pick', 'Source', 'directory'), value: 'data', extensions: '.csv', recursive: true } as GuiWidget;
    expect(await listBlockAsRun(picker)).toEqual(['a.csv', 'b.csv']);
    const listed = (posted[posted.length - 1].body.nodes as GraphNode[])[0];
    expect(listed).toMatchObject({ node_type: 'folder', config: { path: 'data', extensions: '.csv', recursive: true } });
  });

  it('hands back what a folder node hands on as its files', async () => {
    answer = { status: 'success', outputs: { files: ['x.txt'], count: 1 }, error: null };
    const node = { ...NODE_KINDS.folder.create('in'), config: { ...NODE_KINDS.folder.create('in').config, path: 'data' } } as GraphNode;
    expect(await listAsRun(node)).toEqual(['x.txt']);
  });

  it('says a failure rather than catching it, even where the node it lists by catches its failures in a run', async () => {
    // A folder picker told to catch listed a folder that does not exist as "0 files".
    answer = { status: 'error', outputs: {}, error: 'ENOENT: no such directory' };
    const picker = WIDGET_BUILDERS.input_picker.create('pick', 'Source', 'directory') as GuiWidget;
    await expect(listBlockAsRun(picker)).rejects.toThrow('ENOENT');
    const sent = posted[posted.length - 1];
    expect(sent.route).toBe('runNode');
    expect((sent.body.nodes as GraphNode[])[0].config.catch_errors).toBe(false);
  });
});
