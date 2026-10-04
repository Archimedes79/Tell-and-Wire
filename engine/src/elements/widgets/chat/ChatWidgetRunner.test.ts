import { describe, it, expect } from 'vitest';
import { ChatWidgetRunner, transcript } from './ChatWidgetRunner.ts';
import { parseWidget } from '../../page.ts';

const chat = new ChatWidgetRunner();

describe('ChatWidgetRunner', () => {
  it('sends the pending message and what was said before it, in one value', async () => {
    const widget = parseWidget({
      id: 'c', kind: 'chat',
      value: { messages: [{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'hello' }], pending: 'how are you?' },
    });
    expect(await chat.data(widget)).toEqual({ message: 'how are you?', history: 'User: hi\n\nAssistant: hello' });
  });

  it('writes the turn down only when the answer arrives', () => {
    const stored = { id: 'c', kind: 'chat', value: { messages: [], pending: 'hi' } };
    chat.settle(stored, 'hello');
    expect(stored.value).toEqual({
      messages: [{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'hello' }],
      pending: '',
    });
  });

  it('leaves the conversation alone when nothing came back', () => {
    const stored = { id: 'c', kind: 'chat', value: { messages: [], pending: 'hi' } };
    chat.settle(stored, '');
    expect(stored.value).toEqual({ messages: [], pending: 'hi' });
  });

  it('starts from nothing on a block nobody has used', async () => {
    expect(await chat.data(parseWidget({ id: 'c', kind: 'chat', value: '' }))).toEqual({ message: '', history: '' });
  });

  it('takes a message as the one in hand, keeping what was said before', () => {
    const stored: Record<string, unknown> = { id: 'c', kind: 'chat', value: { messages: [{ role: 'user', text: 'hi' }], pending: '' } };
    chat.setValue(stored, 'and now?');
    expect(stored.value).toEqual({ messages: [{ role: 'user', text: 'hi' }], pending: 'and now?' });
  });

  it('sends, fires as it sends, and shows its answer: one block for one conversation', () => {
    const widget = parseWidget({ id: 'c', kind: 'chat' });
    expect(chat.sends()).toMatchObject({ type: 'json' });
    expect(chat.event()).toBe('send');
    expect(chat.showsEnd()).toBe(true);
    // What was said is the session's, never a page's design.
    expect(chat.valueIsDesign()).toBe(false);
    expect(chat.keepsState(widget)).toBe(true);
  });

  it('labels each turn for the model', () => {
    expect(transcript([{ role: 'user', text: 'a' }, { role: 'assistant', text: 'b' }])).toBe('User: a\n\nAssistant: b');
  });
});
