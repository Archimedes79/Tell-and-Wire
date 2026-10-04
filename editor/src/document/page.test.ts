import { describe, it, expect } from 'vitest';
import type { GraphNode, GuiWidget, Port } from '@/graph';
import { NODE_KINDS } from '@/document/nodeKinds';
import { defaultField, fieldChoices, takenAs } from './page';

/**
 * What an input wired from a start point takes of its package: a part of what
 * a block of the page sends, or of what a call sends it -- for which the start
 * point holds an example, since nobody on the page says.
 */

const called = (values: Record<string, unknown>): GraphNode =>
  ({ ...NODE_KINDS.start.create('ask'), config: { ...NODE_KINDS.start.create('ask').config, started_by: 'call', values } });
const input = (id: string): Port => ({ id, name: id, kind: 'input', data_type: 'any', multi: false, required: false, description: '' });

describe('what an input can take of what a call sends a start point', () => {
  it('is each part of its example, and each part inside one -- typed as the example is', () => {
    const start = called({ topic: 'cats', size: 3, file: { path: 'a.md', content: '# A' }, tags: ['x'] });
    expect(fieldChoices([], start)).toEqual([
      { value: 'topic', label: 'topic', type: 'text' },
      { value: 'size', label: 'size', type: 'number' },
      { value: 'file', label: 'file', type: 'json' },
      { value: 'file.path', label: 'file · path', type: 'text' },
      { value: 'file.content', label: 'file · content', type: 'text' },
      { value: 'tags', label: 'tags', type: 'text', list: true },
    ]);
    expect(fieldChoices([], called({}))).toEqual([]);
  });

  it('is, when nobody said, the part the input is named after -- or the one part there is', () => {
    expect(defaultField([], called({ topic: 'cats', size: 3 }), input('topic'))?.choice.value).toBe('topic');
    expect(defaultField([], called({ topic: 'cats', size: 3 }), input('other'))).toBeUndefined();
    // What the graph above sends a start point in there: one part, under its own name.
    expect(defaultField([], called({ ask: '' }), input('text'))?.choice).toEqual({ value: 'ask', label: 'ask', type: 'text' });
  });

  it('follows the page where a block sends to the start point, as before', () => {
    const page: GuiWidget[] = [{ id: 'chat', kind: 'chat', label: 'Chat', sends_to: ['ask'], fires: 'ask' } as GuiWidget];
    const start = { ...called({}), config: { ...called({}).config, started_by: 'page' as const } };
    expect(defaultField(page, start, input('message'))?.choice.value).toBe('chat.message');
  });
});

describe('an input taking a part', () => {
  const choice = { value: 'topic', label: 'topic', type: 'text' as const };

  it('is typed as the part is, where its type is its own -- and takes the whole package again, as json, with none', () => {
    const taken = takenAs(input('in'), choice);
    expect(taken).toMatchObject({ field: 'topic', data_type: 'text' });
    expect(takenAs(taken, undefined)).toEqual({ ...input('in'), data_type: 'json' });
  });

  it('reads the files where it takes a part that is file paths, whenever it came to take it -- and is a list only of a list', () => {
    // Rebuilt by hand: "Read the file at this path" seemed ticked in one
    // rebuild and not in another, after the takes choice was changed. It is
    // ticked by the type the part has (`file_path`), the wire's or a later
    // choice's alike; and a text taken after a folder stayed "a list".
    const page: GuiWidget[] = [
      { id: 'folder', kind: 'input_picker', label: 'Folder', mode: 'directory', sends_to: ['ask'] } as GuiWidget,
      { id: 'file', kind: 'input_picker', label: 'File', mode: 'file', send: 'path', sends_to: ['ask'] } as GuiWidget,
      { id: 'note', kind: 'text_io', label: 'Note', mode: 'input', sends_to: ['ask'] } as GuiWidget,
    ];
    const start = { ...called({}), config: { ...called({}).config, started_by: 'page' as const } };
    const [folder, file, note] = fieldChoices(page, start);
    let port = takenAs(input('in'), folder);
    expect(port).toMatchObject({ field: 'folder', data_type: 'file_path', multi: true });
    port = takenAs(port, note);
    expect(port).toMatchObject({ field: 'note', data_type: 'text', multi: false });
    port = takenAs(takenAs(port, undefined), file);
    expect(port).toMatchObject({ field: 'file', data_type: 'file_path', multi: false });
  });

  it('keeps its type where it follows from its node\'s settings: a folder\'s path, a subgraph\'s port', () => {
    const path = { ...input('path'), data_type: 'file_path' as const };
    expect(takenAs(path, choice, false)).toEqual({ ...path, field: 'topic' });
    expect(takenAs({ ...path, field: 'topic' }, undefined, false)).toEqual(path);
  });
});
