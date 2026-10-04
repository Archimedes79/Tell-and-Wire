import { describe, it, expect } from 'vitest';
import { PlotWindowWidgetRunner } from './PlotWindowWidgetRunner.ts';
import { parseGraph } from '../../../../graph/graph.ts';
import { settlePage } from '../page.ts';
import { quietRuntime } from '../../../../graph/test/fakes.ts';

/**
 * A chart draws what arrives: a figure or points, which the page draws at the
 * block's real size, or a string of SVG. It has no code of its own; a code
 * node before its end point shapes what it is handed.
 */
const element = new PlotWindowWidgetRunner();

describe('a chart, from the backend', () => {
  it('says what it takes, for the node wired into its end point and for the graph designer alike', () => {
    for (const said of [element.receives(), element.graphAuthorNote()]) {
      expect(said).toContain('{"label": string, "value": number}');
      expect(said).toContain('"kind": "bars"|"columns"|"line"|"donut"');
      expect(said).toContain('<svg');
    }
    expect(element.showsEnd()).toBe(true);
  });

  it('is shown what its end point handed back, untouched, and runs no code', async () => {
    const graph = parseGraph({ nodes: [], page: { blocks: [{ id: 'chart', kind: 'plot_window', shows: 'plot' }] } });
    const figure = { kind: 'line', title: 'T', points: [{ label: 'a', value: 1 }] };
    const refusing = quietRuntime({ code: { run: async () => { throw new Error('no body runs for a block'); } } });
    await expect(settlePage(graph, { plot: figure }, refusing)).resolves.toEqual({ chart: figure });
  });
});
