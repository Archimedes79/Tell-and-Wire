import { describe, it, expect } from 'vitest';
import { ButtonWidgetRunner } from './ButtonWidgetRunner.ts';
import type { Widget } from '../WidgetRunner.ts';

function widget(fires: string | null): Widget {
  return { id: 'w', kind: 'button', label: 'Confirm', w: 5, h: 2, tone: 'plain', sends_to: [], fires, shows: null, config: {} };
}

describe('a button', () => {
  it('fires on a press and sends nothing: what a round starts with is what the other blocks send', () => {
    const element = new ButtonWidgetRunner();
    expect(element.event()).toBe('press');
    expect(element.sends(widget('go'))).toBeNull();
    expect(element.takesValue(widget('go'))).toBe(false);
    expect(element.showsEnd(widget('go'))).toBe(false);
  });

  it('keeps nothing between rounds: a press is gone once it happened', () => {
    expect(new ButtonWidgetRunner().keepsState(widget('go'))).toBe(false);
  });
});
