import { describe, expect, it } from 'vitest';
import { labelStep } from './Chart';
import { drawingAspect, tableHeight } from './Widgets';

describe('the names under a chart and the height of a table', () => {
  it('thin the names to every other one where they would touch, and keep all of them where they do not', () => {
    const months = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
    expect(labelStep(months, 30)).toBe(2);
    expect(labelStep(months, 60)).toBe(1);
    expect(labelStep(['a', 'b'], 20)).toBe(1);
    expect(labelStep(['a long name of a month'], 20)).toBe(4);
  });

  it('give a table room for its header and every row it has', () => {
    expect(tableHeight(4)).toBeGreaterThan(5 * 30 + 12);
    expect(tableHeight(0)).toBeLessThan(tableHeight(1));
  });
});

describe('a finished drawing', () => {
  it('is shown in the shape it was drawn for: from its viewBox, or its width and height, or from nothing', () => {
    expect(drawingAspect('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 364"><rect/></svg>')).toBeCloseTo(640 / 364);
    expect(drawingAspect(['<svg width="300px" height="100"></svg>'])).toBe(3);
    expect(drawingAspect('<svg><rect/></svg>')).toBeNull();
    expect(drawingAspect('just words')).toBeNull();
    expect(drawingAspect([{ label: 'a', value: 1 }])).toBeNull();
  });
});
