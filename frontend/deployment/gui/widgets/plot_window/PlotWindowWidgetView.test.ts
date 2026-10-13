import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PlotWindowWidgetView from './PlotWindowWidgetView';

describe('a chart block', () => {
  /**
   * A chart drawn in the flow is held open by the size it was last drawn at: a block made smaller kept its
   * old height -- and, being a row of the grid, the blocks beside it theirs -- until the page was loaded again.
   */
  it('draws its chart out of the flow, so the cells decide how large the block is -- and a smaller block is smaller', () => {
    const html = renderToStaticMarkup(createElement(PlotWindowWidgetView, {
      widget: { id: 'chart', kind: 'plot_window', label: '', w: 8, h: 4 }, value: [3, 1, 2],
    } as never));
    const drawn = /<div class="absolute inset-0[^"]*">(<svg|<div)/.exec(html);
    expect(drawn).not.toBeNull();
    // Nothing of the chart is outside it: the box it is measured by holds nothing but the drawing's place.
    expect(html.indexOf('<svg')).toBeGreaterThan(html.indexOf('absolute inset-0'));
  });
});
