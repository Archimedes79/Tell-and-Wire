import { describe, it, expect } from 'vitest';
import { parseGraph, type Graph } from '../../../graph/graph.ts';
import { localCore } from '../runtime/localCore.ts';
import { nodeCode } from '../runtime/services.ts';
import { quietRuntime } from '../runtime/test/fakes.ts';
import type { GraphCore } from '../runtime/protocol.ts';
import { withRoom } from './room.ts';

const port = (id: string) => ({ id, name: id });

describe('what a core is told of the GUI', () => {
  /** Code that draws one SVG, as large as the chart block that shows it; the block is *h* cells high. */
  const plot = (h: number) => parseGraph({
    nodes: [
      {
        id: 'draw', node_type: 'code', inputs: [], outputs: [port('svg')],
        config: { code: 'function run(inputs, node) { const { width, height } = node.windows[0]; return { svg: "<svg viewBox=\\"0 0 " + width + " " + height + "\\"/>" }; }' },
      },
      { id: 'plot', node_type: 'end', inputs: [port('value')], config: {} },
    ],
    edges: [{ id: 'e', source_node_id: 'draw', source_port_id: 'svg', target_node_id: 'plot', target_port_id: 'value' }],
    gui: { blocks: [{ id: 'chart', kind: 'plot_window', shows: 'plot', w: 4, h }] },
  });

  it('is the room a result is shown in: a body draws for the block that shows it as the block is now -- resized, the same code draws another size', async () => {
    const core = withRoom(localCore({ runtime: () => quietRuntime({ code: nodeCode }) }));
    const svg = async (h: number) => (await core.round({ graph: plot(h), trigger: null })).result
      .node_results.find((one) => one.node_id === 'draw')!.outputs.svg;
    // Four cells of 56 px and 3 gaps of 14; and 2 cells and 1 gap, or 3 and 2.
    expect(await svg(2)).toBe('<svg viewBox="0 0 266 126"/>');
    expect(await svg(3)).toBe('<svg viewBox="0 0 266 196"/>');
  });

  it('is asked of the GUI by the host, and the core is handed the graph without it, for every request that holds one', async () => {
    const seen: { graph: Graph; windows?: unknown }[] = [];
    const spy = (asked: { graph: Graph; windows?: unknown }) => { seen.push(asked); return Promise.reject(new Error('stop')); };
    const core = withRoom({ round: spy, node: spy, example: spy, test: spy, arriving: spy } as unknown as GraphCore);
    for (const ask of [
      () => core.round({ graph: plot(3), trigger: null }),
      () => core.node({ graph: plot(3), node: 'draw' }),
      () => core.example({ graph: plot(3), node: 'draw' }),
      () => core.test({ graph: plot(3) }),
      () => core.arriving({ graph: plot(3), node: 'plot' }),
    ]) await ask().catch(() => {});
    expect(seen).toHaveLength(5);
    for (const asked of seen) {
      expect(asked.graph.gui).toBeUndefined();
      expect(asked.graph.nodes).toHaveLength(2);
      expect(asked.windows).toEqual({ draw: [{ port: 'svg', block: 'chart', kind: 'plot_window', label: '', w: 4, h: 3, width: 266, height: 196 }] });
    }
  });
});
