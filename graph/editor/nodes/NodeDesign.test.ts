import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { GraphNode } from '../../graph.ts';
import { registry } from '../../nodes/registry.ts';
import { designs } from './registry.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const node = (type: GraphNode['node_type'], config: Record<string, unknown> = {}): GraphNode => ({
  id: type, node_type: type, label: type, description: '', position: { x: 0, y: 0 }, inputs: [], outputs: [], config,
});
const problems = (n: GraphNode) => designs.node(n.node_type)!.problems(n, registry, n.id);

describe('what only a kind can say about a node', () => {
  it('names a data field a port cannot be, a data file that is no object, a path that leaves the folder, and a body that asks a model', () => {
    const data = (value: unknown, more: Record<string, unknown> = {}) => node('data', { data_value: value, ...more });
    expect(problems(data({ all: 1, 'two words': 2, __run: 3, round: 4, before: 5, fine: 6 }))).toHaveLength(5);
    expect(problems(data('hello'))).toHaveLength(1);
    expect(problems(data({}, { data_example: [1] }))).toHaveLength(1);
    expect(problems(data(null))).toEqual([]);

    for (const path of ['/etc/cron.d/x', '..\\x']) expect(problems(node('end', { write_mode: 'file', path }))).toHaveLength(1);
    expect(problems(node('end', { write_mode: 'file', path: 'out.txt' }))).toEqual([]);

    const code = designs.node('code')!;
    expect(code.deployNeeds(node('code', { code: 'async function run(i, node) { return { a: await node.llm({ prompt: "x" }) }; }' })).asksAi).toBe(true);
    expect(code.deployNeeds(node('code', { code: 'function run() { return { a: 1 }; }' })).asksAi).toBe(false);
  });

  it('says for every kind what runs and where: its runner\'s execute, or a body file the node keeps -- never from a class\'s name, which the editor\'s bundle shortens', () => {
    for (const type of registry.nodeTypes()) {
      const subject = node(type as GraphNode['node_type'], { started_by: 'itself', reads: 'folder', path: 'docs' });
      const runs = designs.node(type)!.whatRuns(subject);
      expect(runs.does.length, type).toBeGreaterThan(20);
      if (runs.by === 'graph') {
        const [file, method] = runs.where.split(' › ');
        expect(existsSync(ROOT + file), `${type}: ${file} does not exist`).toBe(true);
        expect(readFileSync(ROOT + file, 'utf8'), type).toMatch(new RegExp(`\\b${method}\\(`));
        // A runner's own code, not a body: it names only files the node keeps.
        const kept = registry.node(type)!.texts(subject).map((text) => text.file);
        for (const named of runs.does.match(/\b[\w.-]+\.(?:js|md|json)\b/g) ?? []) expect(kept, type).toContain(named);
      } else {
        expect(registry.node(type)!.texts(subject).map((text) => text.file), type).toContain(runs.where);
      }
    }
    expect(readFileSync(new URL('./NodeDesign.ts', import.meta.url), 'utf8')).not.toMatch(/constructor\.name\b(?!`)/);
  });
});
