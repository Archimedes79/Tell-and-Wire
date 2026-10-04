import { describe, it, expect } from 'vitest';
import { SliderWidgetRunner } from './SliderWidgetRunner.ts';
import type { Widget } from '../WidgetRunner.ts';

function widget(config: Record<string, unknown>): Widget {
  return { id: 'w', kind: 'slider', label: 'Amount', w: 8, h: 2, tone: 'sunken', sends_to: [], fires: null, shows: null, config };
}

describe('a slider', () => {
  it('defaults to 0..100 in steps of 1', () => {
    const element = new SliderWidgetRunner();
    expect(element.config(widget({}))).toEqual({ value: 0, min: 0, max: 100, step: 1 });
  });

  it('clamps a stored value to the current range', () => {
    const element = new SliderWidgetRunner();
    expect(element.config(widget({ value: 500, min: 0, max: 10 })).value).toBe(10);
    expect(element.config(widget({ value: -5, min: 0, max: 10 })).value).toBe(0);
  });

  it('refuses a max at or below min, widening it by one instead', () => {
    const element = new SliderWidgetRunner();
    expect(element.config(widget({ min: 5, max: 5 })).max).toBe(6);
  });

  it('sends its current value as a number, and fires when it is let go', async () => {
    const element = new SliderWidgetRunner();
    const w = widget({ value: 42, min: 0, max: 100 });
    expect(element.sends(w)).toMatchObject({ type: 'number' });
    expect(element.event()).toBe('change');
    expect(await element.data(w)).toBe(42);
  });

  it('says what it sends: the range that can arrive, as the round clamps it', async () => {
    const element = new SliderWidgetRunner();
    expect(element.sends(widget({ min: 1, max: 5, step: 0.5 })).description).toBe('a number from 1 to 5 in steps of 0.5');
    expect(element.sends(widget({ min: 5, max: 5 })).description).toBe('a number from 5 to 6 in steps of 1');
    expect(await element.data(widget({ value: 9, min: 5, max: 5 }))).toBe(6);
  });
});
