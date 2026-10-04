import { describe, it, expect } from 'vitest';
import { SelectWidgetRunner } from './SelectWidgetRunner.ts';
import type { Widget } from '../WidgetRunner.ts';

function widget(config: Record<string, unknown>): Widget {
  return { id: 'w', kind: 'select', label: 'Size', w: 6, h: 2, tone: 'sunken', sends_to: [], fires: null, shows: null, config };
}

describe('a dropdown', () => {
  it('parses one option per line, dropping blanks', () => {
    const element = new SelectWidgetRunner();
    expect(element.config(widget({ options: 'A\n\nB\nC ' })).options).toEqual(['A', 'B', 'C']);
  });

  it('defaults to the first option', () => {
    const element = new SelectWidgetRunner();
    expect(element.config(widget({ options: 'A\nB' })).value).toBe('A');
  });

  it('keeps a stored choice that is still in the list', () => {
    const element = new SelectWidgetRunner();
    expect(element.config(widget({ options: 'A\nB', value: 'B' })).value).toBe('B');
  });

  it('falls back to the first option when the stored one was retired', () => {
    const element = new SelectWidgetRunner();
    expect(element.config(widget({ options: 'A\nB', value: 'C' })).value).toBe('A');
  });

  it('sends the choice made, fires on a choice, and shows nothing', async () => {
    const element = new SelectWidgetRunner();
    const w = widget({ options: 'A\nB', value: 'B' });
    expect(element.sends(w)).toMatchObject({ type: 'text' });
    expect(element.event()).toBe('change');
    expect(element.showsEnd(w)).toBe(false);
    expect(await element.data(w)).toBe('B');
  });

  it('says which choices it can send, so the node that reads it is told', () => {
    const element = new SelectWidgetRunner();
    expect(element.sends(widget({ options: 'Small\n\nMedium\nLarge' })).description).toBe('one of: Small, Medium, Large');
    expect(element.sends(widget({ options: '' })).description).toBe('the choice made');
  });
});
