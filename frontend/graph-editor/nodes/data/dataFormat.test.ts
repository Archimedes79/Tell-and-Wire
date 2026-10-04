import { describe, it, expect } from 'vitest';
import { NODE_KINDS } from '../../../app/document/nodeKinds';
import { asEditableText, dataKind, storedValue } from './dataFormat';

const holding = (value: unknown, kind: 'text' | 'structure' = 'text') => {
  const node = NODE_KINDS.data.create('memory');
  node.config.data_format = kind;
  node.config.data_value = value as never;
  return node;
};

describe('what a data node holds, as its box edits it', () => {
  it('edits an object a run left in a Text node as the object, not as a string -- and stores nothing from JSON that does not parse', () => {
    // One keystroke used to store the box's text: the next run handed the
    // code node a string, `inputs.input.count` was undefined, and a counter
    // silently started again.
    const node = holding({ count: 2 });
    expect(dataKind(node)).toBe('structure');
    const text = asEditableText(node.config.data_value, dataKind(node)).replace('2', '3');
    expect(storedValue(text, dataKind(node))).toEqual({ value: { count: 3 } });
    expect(storedValue('{"count": ', 'structure')).toEqual({ error: expect.any(String) });
    // Text is text, whatever it looks like.
    expect(storedValue('{"count": ', 'text')).toEqual({ value: '{"count": ' });
  });
});
