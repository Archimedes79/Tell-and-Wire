import { describe, expect, it } from 'vitest';
import { KEEP_MESSAGES, SUMMARY_HEAD, compactRequest, compacted, forModel, sentTokens, tokensOf, toFold } from '../../../gui/widgets/chat/compact.ts';
import { chatValue, type ChatMessage } from '../../../gui/widgets/chat/value.ts';

/** A conversation of *exchanges* questions and answers. */
function talk(exchanges: number): ChatMessage[] {
  return Array.from({ length: exchanges }, (_, at) => [
    { role: 'user' as const, text: `question ${at + 1}` },
    { role: 'assistant' as const, text: `answer ${at + 1}` },
  ]).flat();
}

describe('a chat shortened by the model', () => {
  it('sends a conversation nobody compacted as it always did', () => {
    const chat = { messages: talk(2), pending: 'next' };
    expect(forModel(chat)).toBe('User: question 1\n\nAssistant: answer 1\n\nUser: question 2\n\nAssistant: answer 2');
    // Nothing is added to a value that has no summary: it is stored as before.
    expect(chatValue(chat)).toEqual(chat);
  });

  it('sends the summary in place of the folded turns, and the rest word for word', () => {
    const chat = compacted({ messages: talk(4), pending: '' }, 'They asked four things.', 4);
    expect(forModel(chat)).toBe(`${SUMMARY_HEAD}\nThey asked four things.\n\nUser: question 3\n\nAssistant: answer 3\n\nUser: question 4\n\nAssistant: answer 4`);
    // Every turn is still there to show.
    expect(chat.messages).toHaveLength(8);
    expect(chatValue(chat)).toEqual(chat);
  });

  it('ignores a summary that covers nothing, and keeps one from covering more than there is', () => {
    expect(chatValue({ messages: talk(1), pending: '', summary: 'x', folded: 0 })).toEqual({ messages: talk(1), pending: '' });
    expect(chatValue({ messages: talk(1), pending: '', summary: '  ', folded: 2 })).toEqual({ messages: talk(1), pending: '' });
    expect(chatValue({ messages: talk(1), pending: '', summary: 'x', folded: 9 }).folded).toBe(2);
  });

  it('folds all but the newest turns, and nothing while that is less than an exchange', () => {
    expect(toFold({ messages: talk(2), pending: '' })).toBeNull();
    const three = toFold({ messages: talk(3), pending: '' });
    expect(three?.upTo).toBe(2);
    expect(three?.fold).toEqual(talk(1));
    const long = { messages: talk(10), pending: '' };
    expect(toFold(long)?.upTo).toBe(20 - KEEP_MESSAGES);
    // Folded again, it takes the turns since the last time, and the summary goes in with them.
    const once = compacted(long, 'first', 16);
    expect(toFold(once)).toBeNull();
    const more = { ...once, messages: [...once.messages, ...talk(2)] };
    expect(toFold(more)?.fold).toEqual(more.messages.slice(16, 20));
    expect(compactRequest('first', toFold(more)!.fold).prompt).toContain('first');
  });

  it('counts what the next message sends, the summary and the message in hand included', () => {
    const long = { messages: talk(40), pending: 'and now?' };
    const before = sentTokens(long);
    expect(before).toBeGreaterThan(tokensOf('and now?'));
    const after = sentTokens(compacted(long, 'short', toFold(long)!.upTo));
    expect(after).toBeLessThan(before / 3);
  });

  it('asks for the summary with every turn to fold in the prompt', () => {
    const { system, prompt } = compactRequest('', talk(1));
    expect(system).toMatch(/shorten/i);
    expect(prompt).toContain('User: question 1');
    expect(prompt).toContain('Assistant: answer 1');
    expect(prompt).not.toContain('already shortened');
  });
});
