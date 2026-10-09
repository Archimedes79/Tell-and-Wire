import type { ReactNode } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
import Button from '../../app/ui/Button';
import Chip from '../../app/ui/Chip';
import { DANGER_TEXT, DIMMER, FIELD, LINE, MUTED, RAISE, SUCCESS_TEXT, TEXT } from '../../app/ui/theme';

/** One exchange of the chat: the words said, and what came of them. */
export interface ChatLine {
  key: string;
  /** What the person said; '' for a file written from the node's text. */
  said: string;
  /** What came of it, in a few words. */
  note: string;
  failed: boolean;
}

/**
 * A conversation about one file: what has been said and done, what is sent
 * along with the next words, and the line to say them in. Drawing only -- it
 * is told the lines, the words typed so far (*text*, kept by whoever shows it:
 * they outlast a look at the file) and what was said (`onSend`), and knows
 * nothing of the model or the file.
 */
export default function ChatPane({ lines, sentWith, placeholder, empty, busy, text, onText, onSend, children }: {
  lines: ChatLine[];
  /** What goes with the words, in a few words each: the node's text, its input, its output, the graph around it. */
  sentWith: readonly string[];
  placeholder: string;
  /** Said while there is nothing yet. */
  empty: string;
  busy: boolean;
  /** The words typed and not sent. */
  text: string;
  onText: (text: string) => void;
  /** Resolves to whether it went through: then the line is emptied; else the words stay, to be sent again. */
  onSend: (text: string) => Promise<boolean>;
  children?: ReactNode;
}) {
  const send = async () => {
    const words = text.trim();
    if (!words || busy) return;
    if (await onSend(words)) onText('');
  };
  return (
    <div className="flex flex-col gap-3">
      {lines.length === 0 && <p className="text-sm" style={{ color: DIMMER }}>{empty}</p>}
      {lines.map((line) => (
        <div key={line.key} className="flex flex-col gap-1.5">
          {line.said && (
            <div className="self-start rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap" style={{ maxWidth: '80%', background: RAISE, border: `1px solid ${LINE}`, color: TEXT }}>
              {line.said}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs" style={{ color: line.failed ? DANGER_TEXT : SUCCESS_TEXT }}>
            {line.failed ? <X size={13} strokeWidth={2.4} aria-hidden="true" /> : <Check size={13} strokeWidth={2.4} aria-hidden="true" />}
            {line.note}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: DIMMER }}>
        Sent with it:
        {sentWith.map((one) => <Chip key={one}>{one}</Chip>)}
      </div>
      <div className="flex items-end gap-2 rounded-xl px-3 py-2" style={{ ...FIELD }}>
        <Sparkles size={15} strokeWidth={2} aria-hidden="true" style={{ color: MUTED, marginBottom: 7, flexShrink: 0 }} />
        <textarea
          className="flex-1 min-w-0 bg-transparent text-sm outline-none resize-none py-1"
          style={{ color: TEXT }}
          rows={2}
          value={text}
          // Not disabled: the box would lose the keyboard at every send.
          readOnly={busy}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(event) => onText(event.target.value)}
          onKeyDown={(event) => {
            // Esc closes the view, and words typed are not meant to go with it.
            if (event.key === 'Escape' && text) event.preventDefault();
            // Not the Enter that ends a composition (a Japanese or Chinese input).
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            void send();
          }}
        />
        <Button variant="primary" size="sm" disabled={busy || !text.trim()} onClick={() => void send()} title="Send (Enter). Shift+Enter starts a new line.">Send</Button>
      </div>
      {children}
    </div>
  );
}
