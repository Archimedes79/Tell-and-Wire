// What a chat block holds: the conversation so far and the message in hand.
//
// Its own tiny module, like `text_io/role.ts`, because the GUI imports it too:
// a run reads the stored value to send the message and the history, and the
// gui reads it to draw the bubbles -- so a turn a run sent as the person's is
// drawn on the person's side.

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatValue {
  /** Everything said so far, oldest first: what the person sees, whatever the model is sent. */
  messages: ChatMessage[];
  /** What the person just sent and nobody has answered yet. */
  pending: string;
  /**
   * What the first `folded` of the messages came to, written by the model (`compact.ts`): it stands in their place in what the model is
   * sent, while the person still sees them. Both are left out of a chat nobody compacted.
   */
  summary?: string;
  folded?: number;
}

/** The block's stored value, whatever state an empty or hand-edited block left it in. */
export function chatValue(raw: unknown): ChatValue {
  const stored = (raw && typeof raw === 'object' ? raw : {}) as { messages?: unknown; pending?: unknown; summary?: unknown; folded?: unknown };
  const messages = Array.isArray(stored.messages) ? stored.messages : [];
  const kept = messages
    .map((entry) => entry as Partial<ChatMessage>)
    .filter((entry) => typeof entry?.text === 'string')
    .map((entry) => ({ role: entry.role === 'assistant' ? 'assistant' as const : 'user' as const, text: String(entry.text) }));
  const summary = typeof stored.summary === 'string' ? stored.summary.trim() : '';
  const folded = typeof stored.folded === 'number' && Number.isInteger(stored.folded) ? Math.min(stored.folded, kept.length) : 0;
  return {
    messages: kept,
    pending: typeof stored.pending === 'string' ? stored.pending : '',
    ...(summary && folded > 0 ? { summary, folded } : {}),
  };
}
