import React, { useEffect, useRef } from 'react';
import type { WidgetViewProps } from '../WidgetView';
import Markdown from '../../../app/ui/Markdown';
import Button from '../../../app/ui/Button';
import { ACCENT_FILL, DIMMER, FIELD, LINE, MUTED, SUNKEN, TEXT } from '../../../app/ui/theme';
import { chatValue, type ChatMessage, type ChatValue } from '../../../../backend/gui-editor/widgets/chat/value.ts';

/**
 * Runtime chat widget: the conversation, and the box that continues it.
 *
 * **What is typed is the block's value**, as it is for every other box on a
 * page -- `pending`, the message nobody has answered yet. So every way of
 * running -- Send, ▶ Run, the graph's clock, a button wired elsewhere -- sends
 * what is there.
 *
 * The turn is written into the transcript when the answer arrives (the
 * backend's `ChatWidgetRunner.settle`), which also empties `pending`. A run that
 * fails leaves it, so the message is still in the box to send again.
 */
export default function ChatWidgetView({ value, onChange, onTrigger, busy, controlId }: WidgetViewProps) {
  const { messages, pending } = chatValue(value);
  const end = useRef<HTMLDivElement | null>(null);
  // While its answer is on the way the message is shown as said, not as being typed.
  const sending = busy === true && pending.trim() !== '';

  // Follow the conversation as it grows -- not on first draw, which would scroll the whole page to the chat.
  const drawn = useRef(false);
  useEffect(() => {
    if (drawn.current) end.current?.scrollIntoView({ block: 'nearest' });
    drawn.current = true;
  }, [messages.length, sending]);

  const send = () => {
    if (busy || !pending.trim()) return;
    const next: ChatValue = { messages, pending: pending.trim() };
    onTrigger(next);
  };

  const bubble = (message: ChatMessage, key: React.Key) => (
    <div key={key} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className="rounded-2xl px-3 py-2 text-sm max-w-[85%] min-w-0"
        style={message.role === 'user'
          ? { background: ACCENT_FILL, color: TEXT, borderBottomRightRadius: 4 }
          : { background: SUNKEN, color: TEXT, border: `1px solid ${LINE}`, borderBottomLeftRadius: 4 }}
      >
        {message.role === 'user'
          ? <span className="whitespace-pre-wrap">{message.text}</span>
          : <Markdown source={message.text} />}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-auto flex flex-col gap-2 pr-1" style={{ minHeight: 60 }}>
        {messages.length === 0 && !sending && (
          <div className="m-auto text-sm" style={{ color: DIMMER }}>Say something to start.</div>
        )}
        {messages.map((message, index) => bubble(message, index))}
        {sending && bubble({ role: 'user', text: pending }, 'pending')}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-3 py-2 text-sm" style={{ background: SUNKEN, color: MUTED, border: `1px solid ${LINE}` }}>
              <span className="chat-typing">●●●</span>
            </div>
          </div>
        )}
        <div ref={end} />
      </div>

      <div className="flex items-end gap-2 flex-shrink-0">
        <textarea
          id={controlId}
          className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm resize-none"
          style={{ ...FIELD, height: 40 }}
          value={sending ? '' : pending}
          readOnly={sending}
          aria-busy={sending}
          onChange={(e) => onChange({ messages, pending: e.target.value })}
          onKeyDown={(e) => {
            // Enter that ends an input method's composition is not Enter.
            if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
            e.preventDefault();
            send();
          }}
          placeholder="Message…  (Enter sends, Shift+Enter for a new line)"
          aria-label="Message"
        />
        <Button variant="primary" className="h-10 shrink-0" onClick={send} disabled={busy || !pending.trim()}>
          Send
        </Button>
        {messages.length > 0 && (
          <Button
            size="sm"
            className="h-10 shrink-0"
            onClick={() => onChange({ messages: [], pending })}
            disabled={busy}
            title="Forget this conversation and start a new one"
          >
            New chat
          </Button>
        )}
      </div>
    </div>
  );
}
