import { describe, expect, it } from 'vitest';
import { parseGraph } from '../../../graph/graph.ts';
import { guiPart } from './hooks.ts';

const node = (id: string, node_type: string, config: Record<string, unknown> = {}) => ({
  id, node_type, label: id, description: '', inputs: [], outputs: [], config,
});

describe('the GUI a tool shows says whether the tool asks a model', () => {
  const view = (nodes: ReturnType<typeof node>[]) => guiPart.view({ id: 's', designRevision: 0, graph: parseGraph({ nodes, edges: [], metadata: { name: 'T', description: 'Does it.' } }) });

  it('does for a tool with an AI node, so its AI settings are offered -- and not for one without', () => {
    expect(view([node('a', 'ai')]).uses_model).toBe(true);
    expect(view([node('c', 'code', { code: 'function run() { return {}; }' })]).uses_model).toBe(false);
    expect(view([node('c', 'code', { code: 'async function run(i, node) { return { t: await node.llm({ prompt: "x" }) }; }' })]).uses_model).toBe(true);
  });

  it('carries the description as it was written, for whoever uses the tool', () => {
    expect(view([node('a', 'ai')])).toMatchObject({ name: 'T', description: 'Does it.' });
  });
});
