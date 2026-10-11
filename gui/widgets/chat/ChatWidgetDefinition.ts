import { WidgetDefinition, partsSaid, type Sent, type Widget } from '../WidgetDefinition.ts';
import type { RawConfig } from '../../../graph/graph.ts';
import { chatValue, type ChatMessage, type ChatValue } from './value.ts';

/** What a chat sends as it sends: the message, and what was said before it. */
const CHAT_PARTS: NonNullable<Sent['keys']> = {
  message: { type: 'text', description: 'what the person just said' },
  history: { type: 'text', description: 'everything said before it, one turn per paragraph' },
};

/** The conversation as a model reads it: one turn per paragraph, who said it in front. */
export function transcript(messages: ChatMessage[]): string {
  return messages
    .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.text}`)
    .join('\n\n');
}

/**
 * A conversation: what was said, a box to say the next thing, and the answer
 * coming back into it.
 *
 * One block for what everyone means by one word, not a text box, a data node
 * and two code nodes: the transcript is this block's own value. It sends the message and what was said before
 * it, fires a start point as it sends, and shows the end point its answer
 * arrives at -- the answer joining the conversation.
 *
 * The turn is only written down **when the answer arrives**. Until then the
 * message is `pending`: a model call that fails leaves the conversation
 * exactly as it was, with the message still in hand to send again, rather
 * than a transcript ending in a question nobody answered.
 */
export class ChatWidgetDefinition extends WidgetDefinition<ChatValue> {
  readonly widgetKind = 'chat' as const;

  config(widget: Widget): ChatValue {
    return chatValue(widget.config.value);
  }

  override sends(): Sent {
    return { type: 'json', keys: CHAT_PARTS, description: partsSaid(CHAT_PARTS) };
  }

  /** Sending is the event. A chat that waited for someone to press Run would not be one. */
  override event(): 'send' {
    return 'send';
  }

  /** Its answer: what the end point it shows hands back joins the conversation (`settle`). */
  override showsEnd(): boolean {
    return true;
  }

  override async data(widget: Widget): Promise<unknown> {
    const { messages, pending } = this.config(widget);
    return { message: pending, history: transcript(messages) };
  }

  /**
   * Given a message, it is the one in hand, and what was said before stays:
   * what a gui or a script sends a chat. Given a whole conversation, it is
   * that conversation.
   */
  override setValue(stored: RawConfig, value: unknown): void {
    if (value && typeof value === 'object') {
      stored.value = chatValue(value);
      return;
    }
    stored.value = { messages: chatValue(stored.value).messages, pending: String(value ?? '') };
  }

  /** The reply closes the turn: question and answer go into the transcript together. */
  override settle(stored: RawConfig, value: unknown): void {
    const { messages, pending } = chatValue(stored.value);
    const reply = Array.isArray(value) ? value.map(String).join('\n\n') : String(value ?? '');
    if (!reply.trim()) return;
    stored.value = {
      messages: [
        ...messages,
        ...(pending ? [{ role: 'user', text: pending }] : []),
        { role: 'assistant', text: reply },
      ],
      pending: '',
    };
  }
}
