// A long conversation, shortened by the model: what a chat block sends of it, how much that is, and what is asked to shorten it.
//
// The block keeps every turn to show. What goes to the model is a summary of the oldest turns (`ChatValue.summary`) and the turns after
// them, word for word. Compacting is one more call to the model the tool runs on, made when a person asks for it -- nothing here decides
// that a conversation is too long, the counter only says how long it is. Pure and shared: the definition sends it, the GUI counts it,
// the server asks for the summary.

import { chatValue, type ChatMessage, type ChatValue } from './value.ts';

/** The newest turns compacting leaves word for word: two exchanges, the ones a next question is most likely about. */
export const KEEP_MESSAGES = 4;

/** What stands in front of the summary in what the model is sent. */
export const SUMMARY_HEAD = 'The conversation so far, shortened (the turns before those below):';

/** One turn per paragraph, who said it in front. */
function turns(messages: ChatMessage[]): string {
  return messages.map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.text}`).join('\n\n');
}

/** The conversation as a model reads it: the summary of what was folded, then every turn since. */
export function forModel(chat: ChatValue): string {
  const { messages, summary, folded = 0 } = chatValue(chat);
  const rest = turns(messages.slice(folded));
  return summary ? [`${SUMMARY_HEAD}\n${summary}`, rest].filter(Boolean).join('\n\n') : rest;
}

/** About how many tokens a text is: a fourth of its characters, rounded up. An estimate, said as one. */
export const tokensOf = (text: string): number => Math.ceil(text.length / 4);

/** About how many tokens the next message sends of the conversation: what `forModel` gives, and the message in hand. */
export const sentTokens = (chat: ChatValue): number => tokensOf(forModel(chat)) + tokensOf(chatValue(chat).pending);

/** What compacting would fold now: the turns not yet folded but the newest `KEEP_MESSAGES`. Nothing when that is less than an exchange. */
export function toFold(chat: ChatValue): { fold: ChatMessage[]; upTo: number } | null {
  const { messages, folded = 0 } = chatValue(chat);
  const upTo = messages.length - KEEP_MESSAGES;
  return upTo - folded >= 2 ? { fold: messages.slice(folded, upTo), upTo } : null;
}

/** What the model is asked to shorten *fold* into, given the summary there is already. */
export function compactRequest(summary: string, fold: ChatMessage[]): { system: string; prompt: string } {
  return {
    system: 'You shorten conversations. You answer with the shortened conversation and nothing else: no greeting, no comment on what you did.',
    prompt: [
      summary ? `This is what was said before, already shortened:\n${summary}\n` : '',
      `These are the turns after it:\n${turns(fold)}\n`,
      'Write one summary of all of it, for the assistant to carry on from. Keep what was asked and what was answered, every name, number, '
        + 'date, decision and open question, and what the user wants. Leave out greetings and repetition. Write it as plain notes, '
        + 'no longer than a fifth of the text you were given, in the language of the conversation.',
    ].filter(Boolean).join('\n'),
  };
}

/** *chat* with the first *upTo* turns folded into *summary*. */
export function compacted(chat: ChatValue, summary: string, upTo: number): ChatValue {
  return { ...chatValue(chat), summary: summary.trim(), folded: upTo };
}
