import { describe, it, expect } from 'vitest';
import { parseWidget, widgetElement } from './page.ts';

/**
 * What each block can do with the graph, spelled out: send its data to start
 * points, fire one with its event, show an end point.
 *
 * A block connects itself by name, and these are the connections it can make:
 * the page's settings offer them, and the check refuses a block that names
 * one it cannot make (`pageProblems`). Two answers to "what can this block
 * do" would be the editor offering a connection the run then ignores.
 */
function can(kind: string, config: Record<string, unknown> = {}) {
  const widget = parseWidget({ id: 'w', kind, label: 'W', ...config });
  const element = widgetElement(kind)!;
  return { sends: element.sends(widget)?.type ?? null, event: element.event(widget), shows: element.showsEnd(widget) };
}

describe('what each block can do with the graph', () => {
  it('lets a picker send a file with its content, only its path, or the files of a folder, and fire on a choice', () => {
    expect(can('input_picker')).toEqual({ sends: 'json', event: 'change', shows: false });
    expect(can('input_picker', { send: 'path' }).sends).toBe('file_path');
    expect(widgetElement('input_picker')!.sends(parseWidget({ id: 'w', kind: 'input_picker', mode: 'directory' })))
      .toMatchObject({ type: 'file_path', list: true });
  });

  it('lets a text box do what its mode says', () => {
    expect(can('text_io', { mode: 'both' })).toEqual({ sends: 'text', event: 'enter', shows: true });
    expect(can('text_io', { mode: 'input' })).toEqual({ sends: 'text', event: 'enter', shows: false });
    expect(can('text_io', { mode: 'output' })).toEqual({ sends: null, event: null, shows: true });
  });

  it('lets a choice send what was chosen and fire when it is made', () => {
    expect(can('select')).toEqual({ sends: 'text', event: 'change', shows: false });
    expect(can('slider')).toEqual({ sends: 'number', event: 'change', shows: false });
  });

  it('lets a button only fire, and a chat send, fire and show', () => {
    expect(can('button')).toEqual({ sends: null, event: 'press', shows: false });
    expect(can('chat')).toEqual({ sends: 'json', event: 'send', shows: true });
  });

  it('lets every display only show', () => {
    for (const kind of ['plot_window', 'image_view', 'table']) {
      expect(can(kind), kind).toEqual({ sends: null, event: null, shows: true });
    }
  });

  it('lets page furniture do nothing at all', () => {
    // A heading is part of the page, not part of the graph.
    for (const kind of ['text', 'divider', 'spacer']) {
      expect(can(kind), kind).toEqual({ sends: null, event: null, shows: false });
    }
  });
});
