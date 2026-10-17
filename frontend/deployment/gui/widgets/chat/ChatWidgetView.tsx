import React, { useEffect, useRef, useState } from 'react';
import type { WidgetViewProps } from '../WidgetView';
import Markdown from '../../kit/ui/Markdown';
import Button from '../../kit/ui/Button';
import { ACCENT_FILL, DANGER_TEXT, DIMMER, FIELD, LINE, MUTED, SUNKEN, TEXT, WARNING_TEXT } from '../../kit/ui/theme';
import { errorText } from '../../kit/api/errorText';
import { port } from '../../kit/api/port';
import type { ChatContext } from '../../kit/api/client';
import { chatValue, type ChatMessage, type ChatValue } from '../../../../../gui/widgets/chat/value.ts';
import { compacted, sentTokens, toFold } from '../../../../../gui/widgets/chat/compact.ts';

/** From what share of the window the counter says so: the point at which compacting is worth a call. */
const WARN_AT = 0.7;

/** The window of the tool's model, asked once for all chats of the page. */
let modelWindow: Promise<ChatContext> | null = null;
const windowOfModel = (): Promise<ChatContext> => (modelWindow ??= port().model.context().catch((error: unknown) => { modelWindow = null; throw error; }));

const count = (tokens: number): string => (tokens >= 10_000 ? `${Math.round(tokens / 1000)}k` : tokens >= 1000 ? `${(tokens / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(tokens));

const SOURCES: Record<ChatContext['source'], string> = {
  set: 'The window was set in the settings file.',
  provider: 'The window is what the provider says of this model.',
  assumed: 'The window is a guess: set context_tokens in ai-settings.json (or TW_CONTEXT_TOKENS) to the real one.',
};

/**
 * A chat: the conversation, and the box that continues it.
 *
 * **What is typed is the block's value**, as it is for every other box on a
 * gui -- `pending`, the message nobody has answered yet. So every way of
 * running -- Send, ▶ Run, the graph's clock, a button wired elsewhere -- sends
 * what is there.
 *
 * The turn is written into the transcript when the answer arrives
 * (`ChatWidgetDefinition.settle`), which also empties `pending`. A run that
 * fails leaves it, so the message is still in the box to send again.
 */
export default function ChatWidgetView({ value, onChange, onTrigger, busy, controlId }: WidgetViewProps) {
  const chat = chatValue(value);
  const { messages, pending } = chat;
  const foldable = toFold(chat);
  const [model, setModel] = useState<ChatContext | null>(null);
  const [compacting, setCompacting] = useState(false);
  const [problem, setProblem] = useState('');
  const end = useRef<HTMLDivElement | null>(null);
  // While its answer is on the way the message is shown as said, not as being typed.
  const sending = busy === true && pending.trim() !== '';

  // Follow the conversation as it grows -- not on first draw, which would scroll the whole page to the chat.
  const drawn = useRef(false);
  useEffect(() => {
    if (drawn.current) end.current?.scrollIntoView({ block: 'nearest' });
    drawn.current = true;
  }, [messages.length, sending]);

  // The counter needs the window; a tool that cannot say it gets a counter of tokens alone.
  useEffect(() => {
    let alive = true;
    windowOfModel().then((got) => { if (alive) setModel(got); }, () => undefined);
    return () => { alive = false; };
  }, []);

  const compact = async (): Promise<void> => {
    if (!foldable || compacting || busy) return;
    setCompacting(true);
    setProblem('');
    try {
      const summary = await port().model.compact(chat.summary ?? '', foldable.fold);
      onChange(compacted(chat, summary, foldable.upTo));
    } catch (error) {
      setProblem(errorText(error, 'The conversation could not be shortened.'));
    } finally {
      setCompacting(false);
    }
  };

  const send = () => {
    if (busy || !pending.trim()) return;
    setProblem('');
    const next: ChatValue = { ...chat, pending: pending.trim() };
    onTrigger(next);
  };

  const bubble = (message: ChatMessage, key: React.Key) => (
    <div key={key} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className="rounded-2xl px-3 py-2 text-sm max-w-[85%] min-w-0"
        style={message.role === 'user'
          ? { background: ACCENT_FILL, color: TEXT, borderBottomRightRadius: 4 }
          : { ...FIELD, borderBottomLeftRadius: 4 }}
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
        {messages.map((message, index) => (
          <React.Fragment key={index}>
            {bubble(message, index)}
            {index + 1 === chat.folded && (
              <details className="text-xs" style={{ color: MUTED }}>
                <summary className="cursor-pointer" title="The turns above are shown in full, but the model is sent this instead of them">Shortened for the model, from here up</summary>
                <div className="whitespace-pre-wrap pt-1">{chat.summary}</div>
              </details>
            )}
          </React.Fragment>
        ))}
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

      <Meter tokens={sentTokens(chat)} model={model} problem={problem} />

      <div className="flex items-end gap-2 flex-shrink-0">
        <textarea
          id={controlId}
          className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm resize-none"
          style={{ ...FIELD, height: 40 }}
          value={sending ? '' : pending}
          readOnly={sending}
          aria-busy={sending}
          onChange={(e) => onChange({ ...chat, pending: e.target.value })}
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
        {foldable && (
          <Button
            size="sm"
            className="h-10 shrink-0"
            onClick={() => void compact()}
            disabled={busy || compacting}
            title="Have the model write the oldest turns down shorter, so less of the model's window is used. Costs one call; the turns stay on screen."
          >
            {compacting ? 'Compacting…' : 'Compact'}
          </Button>
        )}
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

/** How much of the model's window the next message sends, said small: in tokens, and as a share once the window is known. */
function Meter({ tokens, model, problem }: { tokens: number; model: ChatContext | null; problem: string }) {
  if (tokens === 0 && !problem) return null;
  const share = model ? tokens / model.tokens : 0;
  const near = share >= WARN_AT;
  return (
    <div className="text-xs flex-shrink-0" style={{ color: problem ? DANGER_TEXT : near ? WARNING_TEXT : DIMMER }} title={model ? SOURCES[model.source] : undefined}>
      {problem || (model
        ? `About ${count(tokens)} of ${count(model.tokens)} tokens${model.source === 'assumed' ? ' (window assumed)' : ''}${near ? ': Compact shortens the oldest turns' : ''}`
        : `About ${count(tokens)} tokens`)}
    </div>
  );
}
