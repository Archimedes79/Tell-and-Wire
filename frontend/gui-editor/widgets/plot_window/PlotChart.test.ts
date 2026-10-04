import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PlotChart, { asDrawing, drawingSource, toFigure } from './PlotChart';

describe('a figure: what a node sends a chart', () => {
  /**
   * Choosing bars or a donut is a *value*, so it can come down a wire from a
   * dropdown on the page -- which a node writing finished SVG could never follow.
   */
  it('is the kind and the title of an object, a bare list of numbers, or JSON text, with the kind chosen when nobody asked', () => {
    const point = { label: 'a', value: 1 };
    expect(toFigure({ kind: 'donut', title: 'Population', points: [point] })).toEqual({ kind: 'donut', title: 'Population', points: [point] });
    expect(toFigure([1, 2, 3])).toMatchObject({ kind: 'columns', points: [{ label: '0', value: 1 }, { label: '1', value: 2 }, { label: '2', value: 3 }] });
    expect(toFigure(Array.from({ length: 30 }, (_, i) => i))?.kind).toBe('line');
    for (const kind of ['pie', 'doughnut', 'Donut']) expect(toFigure({ kind, points: [point] })?.kind).toBe('donut');
    expect(toFigure({ kind: 'bar', points: [point] })?.kind).toBe('bars');
    expect(toFigure({ kind: 'sunburst', points: [point] })?.kind).toBe('columns');
    expect(toFigure('{"kind":"bars","points":[{"label":"a","value":2}]}')?.kind).toBe('bars');
    // A number written as text, as a CSV cell arrives when nothing parsed it.
    expect(toFigure(['3', ' 1.5 ', 2])?.points.map((p) => p.value)).toEqual([3, 1.5, 2]);
  });

  it('is none when there is nothing to plot -- but a title with no points is one: what a node says before there is anything', () => {
    for (const nothing of [null, 'just a sentence', { points: [] }, [], { points: [{ label: 'a', value: 'lots' }] }, ['3', '']]) {
      expect(toFigure(nothing), JSON.stringify(nothing)).toBeNull();
    }
    expect(toFigure({ kind: 'bars', title: 'Choose a CSV file to plot.', points: [] }))
      .toEqual({ kind: 'bars', title: 'Choose a CSV file to plot.', points: [] });
  });
});

describe('a chart the model drew itself', () => {
  it('takes an SVG document as the drawing, saying it is SVG where it does not, and is not fooled by text or points', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';
    expect(asDrawing(svg)).toBe(svg);
    expect(asDrawing('<svg viewBox="0 0 10 10"></svg>')).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>');
    expect(asDrawing('just a sentence')).toBeNull();
    expect(asDrawing([{ label: 'a', value: 1 }])).toBeNull();
    expect(asDrawing('<svgnotreally>')).toBeNull();
  });

  it('is shown as a picture, never as markup in the page -- a graph can be handed on, a chart\'s value with it', () => {
    // What a pattern that strips scripts let through: a handler without
    // quotes, HTML inside foreignObject, an entity in "javascript:".
    for (const hostile of [
      '<svg><foreignObject><img src=x onerror=alert(document.domain)></foreignObject></svg>',
      '<svg><image href=x onerror=alert(1) /></svg>',
      '<svg><a href="java&#115;cript:alert(1)">x</a></svg>',
    ]) {
      const html = renderToStaticMarkup(createElement(PlotChart, { data: hostile, width: 200, height: 100 }));
      expect(html, hostile).toMatch(/^<div[^>]*><img src="data:image\/svg\+xml;charset=utf-8,[^"<>]*"[^>]*\/><\/div>$/);
      expect(html).toContain(drawingSource(asDrawing(hostile)!).replace(/&/g, '&amp;'));
    }
  });
});
