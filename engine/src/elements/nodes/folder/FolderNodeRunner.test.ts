import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FolderNodeRunner } from './FolderNodeRunner.ts';
import type { Runtime } from '../../Runtime.ts';
import { quietRuntime } from '../../../../test/fakes.ts';
import { parseGraph, type Graph, type GraphNode } from '../../../graph.ts';
import { forgetSeen, writeProject } from '../../../project/folder.ts';
import { interfaceOf } from '../../../execution/graphInterface.ts';
import { registry } from '../../registry.ts';

function folderNode(config: Record<string, unknown>): GraphNode {
  return {
    id: 'src', node_type: 'folder', label: 'Source', description: '',
    position: { x: 0, y: 0 }, inputs: [], outputs: [], config,
  };
}

const broken = quietRuntime({
  files: {
    exists: async () => false,
    read: async () => { throw new Error('ENOENT: no such file'); },
    list: async () => { throw new Error('ENOENT: no such directory'); },
  },
});

const element = new FolderNodeRunner();

/**
 * A listing that fails: a folder that is not there.
 *
 * Off by default, the node fails the way it always did. On, the failure
 * becomes an `error` port instead -- declared only then, so a graph that never
 * asked for one is not handed a port nobody wired.
 */
describe('an error port', () => {
  it('is not declared when catch_errors is off', () => {
    const ports = element.derivedPorts(folderNode({ path: '/x' }));
    expect(ports.outputs.map((p) => p.id)).not.toContain('error');
  });

  it('is declared when catch_errors is on', () => {
    expect(element.derivedPorts(folderNode({ catch_errors: true })).outputs.map((p) => p.id)).toContain('error');
  });
});

describe('where it lists', () => {
  const lists: Runtime = {
    ...broken,
    files: { ...broken.files, list: async (folder: string) => [`${folder}/a.txt`] },
  };

  it('takes the wired path over the configured one, as the port promises', async () => {
    const result = await element.execute(folderNode({ path: '/configured' }), { path: '/wired' }, lists);
    expect(result).toEqual({ files: ['/wired/a.txt'], count: 1 });
  });

  it('falls back to the configured path when the wire brought nothing', async () => {
    for (const arrived of [{}, { path: '' }, { path: '   ' }, { path: null }]) {
      const result = await element.execute(folderNode({ path: '/configured' }), arrived, lists);
      expect(result).toMatchObject({ files: ['/configured/a.txt'] });
    }
  });

  it('lists nothing, and fails at nothing, where no folder is named', async () => {
    expect(await element.execute(folderNode({ catch_errors: true }), {}, broken))
      .toEqual({ files: [], count: 0, error: '' });
  });
});

describe('a folder that cannot be listed', () => {
  // It throws either way; the executor decides what that costs. See executor.test.ts.
  it('throws, whatever catch_errors says', async () => {
    await expect(element.execute(folderNode({ path: '/gone' }), {}, broken)).rejects.toThrow('ENOENT');
    await expect(element.execute(folderNode({ path: '/gone', catch_errors: true }), {}, broken)).rejects.toThrow('ENOENT');
  });
});

describe('a folder it lists', () => {
  /** Nothing is written beside a listing: no body chooses its files, a code node after it does. */
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ai-graph-folder-'));
    forgetSeen();
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('keeps no file of its own in a project folder: it is its settings', async () => {
    const folder = { path: 'data' };
    expect(element.texts(folderNode(folder))).toEqual([]);
    expect(element.logic(folderNode(folder))).toBeUndefined();
    const graph: Graph = parseGraph({ nodes: [{ ...folderNode(folder), id: 'source' }], edges: [] });
    await writeProject(dir, graph);
    expect(readdirSync(join(dir, 'nodes', 'source')).sort()).toEqual(['interface.json', 'node.json']);
  });
});

describe('what it hands on', () => {
  it('counts a folder\'s files as a number, and says so on its port', async () => {
    const listing: Runtime = { ...broken, files: { ...broken.files, list: async () => ['/d/a.txt', '/d/b.txt'] } };
    const result = await element.execute(folderNode({ path: '/d' }), {}, listing);
    expect(result).toMatchObject({ files: ['/d/a.txt', '/d/b.txt'], count: 2 });
    const count = element.derivedPorts(folderNode({})).outputs.find((port) => port.id === 'count');
    expect(count?.data_type).toBe('number');
  });

  it('is no way into the graph: a caller names no folder of it, and nothing is asked for it when a round starts', () => {
    // It was an input node, which a caller could hand a folder by its id and a
    // run could ask for one. What comes from outside comes through a start
    // point now, and a folder somebody chooses is a path in its package.
    const graph = parseGraph({ nodes: [folderNode({ path: '/d' })], edges: [] });
    expect(interfaceOf(graph, registry)).toEqual({ events: [], outputs: [] });
    expect(element.boundaryRole(folderNode({}))).toBeNull();
  });
});
