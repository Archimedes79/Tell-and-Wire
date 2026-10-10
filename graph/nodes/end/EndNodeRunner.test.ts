import { describe, it, expect } from 'vitest';
import { EndNodeRunner } from './EndNodeRunner.ts';
import type { Runtime } from '../Runtime.ts';
import { quietRuntime } from '../../test/fakes.ts';
import type { GraphNode } from '../../graph.ts';

/**
 * Where a result goes when it is written: one file, or a folder with a file
 * per value. An option that does nothing is worse than no option, so each is
 * held to doing what it says.
 */

function outputNode(config: Record<string, unknown>): GraphNode {
  return {
    id: 'out', node_type: 'end', label: 'Out', description: '',
    position: { x: 0, y: 0 }, inputs: [], outputs: [], config,
  };
}

/** A runtime whose files are a map: what was written, and where. */
function withFiles(initial: [string, string][] = []) {
  const files = new Map<string, string>(initial);
  const runtime: Runtime = quietRuntime({
    files: {
      resolve: (path) => path,
      inProject: (path) => path,
      read: async (path) => files.get(path) ?? '',
      write: async (path, content) => { files.set(path, content); },
      list: async (folder) => [...files.keys()].filter((path) => path.startsWith(`${folder}/`)).sort(),
      remove: async (path) => { files.delete(path); },
    },
  });
  return { runtime, files };
}

const element = new EndNodeRunner();

describe('an end point', () => {
  it('writes one file, or each value to a file of its own, a list item by item numbered by its place, with no earlier run\'s item left behind -- or nothing', async () => {
    const single = withFiles();
    const written = await element.execute(outputNode({ write_mode: 'file', path: '/tmp/out.txt' }), { value: 'alpha' }, single.runtime);
    expect([...single.files]).toEqual([['/tmp/out.txt', 'alpha']]);
    expect(written.written_path).toBe('/tmp/out.txt');

    for (const write_mode of ['none', undefined]) {
      const quiet = withFiles();
      await element.execute(outputNode({ write_mode, path: '/tmp/out' }), { value: 'alpha' }, quiet.runtime);
      expect(quiet.files.size).toBe(0);
    }


    const { runtime, files } = withFiles([['/tmp/out/notes.md', 'mine'], ['/tmp/out/value_x.txt', 'mine too']]);
    const result = await element.execute(
      outputNode({ write_mode: 'directory', path: '/tmp/values' }),
      { summary: 'alpha', table: { rows: 2 } },
      runtime,
    );
    expect([...files]).toEqual([
      ['/tmp/out/notes.md', 'mine'],
      ['/tmp/out/value_x.txt', 'mine too'],
      ['/tmp/values/summary.txt', 'alpha'],
      ['/tmp/values/table.json', JSON.stringify({ rows: 2 }, null, 2)],
    ]);
    expect(result.written_paths).toEqual(['/tmp/values/summary.txt', '/tmp/values/table.json']);
    // Still a passthrough: the run's result says what arrived.
    expect(result).toMatchObject({ summary: 'alpha', table: { rows: 2 } });

    // What a node run once per item hands on; a failed item is a null that writes nothing.
    const node = outputNode({ write_mode: 'directory', path: '/tmp/out' });
    await element.execute(node, { value: Array.from({ length: 10 }, (_, index) => `old ${index + 1}`) }, runtime);
    expect(files.has('/tmp/out/value_01.txt') && files.has('/tmp/out/value_10.txt')).toBe(true);

    // The next run leaves its own values and no earlier run's; nothing else of the folder's goes.
    await element.execute(node, { value: ['new 1', null, 'new 3'] }, runtime);
    expect([...files.keys()].filter((path) => path.startsWith('/tmp/out/')).sort())
      .toEqual(['/tmp/out/notes.md', '/tmp/out/value_1.txt', '/tmp/out/value_3.txt', '/tmp/out/value_x.txt']);

    // A port called "../../x" stays in the folder; and a path written in the graph that is absolute or climbs out is a problem for check.
    const strange = withFiles();
    const stays = await element.execute(outputNode({ write_mode: 'directory', path: 'out' }), { '../../x': 'a' }, strange.runtime);
    expect(stays.written_paths).toEqual(['out/____x.txt']);
    for (const path of ['/etc/cron.d/x', '..\\x']) {
      expect(element.problems(outputNode({ write_mode: 'file', path }), {} as never, 'end')).toHaveLength(1);
    }
  });
});
