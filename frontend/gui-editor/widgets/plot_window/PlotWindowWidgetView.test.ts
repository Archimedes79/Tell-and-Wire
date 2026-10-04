import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WIDGET_BUILDERS } from '../../../app/elements/registry';
import PlotWindowWidgetView from './PlotWindowWidgetView';

const widget = WIDGET_BUILDERS.plot_window.create('temperature', 'Temperature');
const onPage = (value: unknown, incoming?: unknown) => renderToStaticMarkup(createElement(PlotWindowWidgetView, {
  widget, value, incoming, onChange: () => {},
}));

/** A chart draws what arrives: it has no code of its own that could draw something else. */
describe('a chart on the page', () => {
  it('draws a figure that arrives, with its title', () => {
    const html = onPage('', { kind: 'bars', title: 'People', points: [{ label: 'Oslo', value: 700 }, { label: 'Bergen', value: 290 }] });
    expect(html).toContain('bars chart of 2 points');
    expect(html).toContain('Oslo');
  });

  it('draws a list of numbers or of {label, value} points', () => {
    expect(onPage('', [3, 1, 2])).toContain('chart of 3 points');
    expect(onPage('', [{ label: 'Mon', value: 3 }])).toContain('Mon');
  });

  it('shows a string of SVG as a picture, where nothing in it runs', () => {
    const html = onPage('', '<svg viewBox="0 0 10 10"><script>alert(1)</script><circle cx="5" cy="5" r="4"/></svg>');
    expect(html).toContain('<img src="data:image/svg+xml;charset=utf-8,%3Csvg');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<circle');
  });

  it('draws an empty chart before anything has arrived, and the last value it kept after', () => {
    expect(onPage('')).toContain('Empty chart, waiting for data');
    expect(onPage([5, 6])).toContain('chart of 2 points');
  });

  it('offers to save what it draws, and nothing while it only says something', () => {
    const save = 'Save this chart as an SVG file';
    expect(onPage('', [3, 1, 2])).toContain(save);
    expect(onPage('', '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>')).toContain(save);
    expect(onPage('')).not.toContain(save);
    expect(onPage('', { kind: 'bars', title: 'Choose a CSV file to plot.', points: [] })).not.toContain(save);
  });
});

