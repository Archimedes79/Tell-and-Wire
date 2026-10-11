// history.md: the whole conversation with the model about one node.
//
// Every exchange -- each ✨ (input, output, body), each change asked for and
// each fix -- is appended as it happened: a heading with the date, the time and
// which it was, then, for every model call it made, what was sent and what came
// back. Oldest first, newest last, and beyond `HISTORY_LIMIT` the oldest are
// dropped whole, so a node written a hundred times does not carry a book.
//
// graph/ owns the format; the editor appends after each exchange, and the
// file is the node's like its code: read, diffed and opened as what it is.

/** One request to a model, as it happened: for looking at when an answer is wrong or missing. */
export interface AICall {
  provider: string;
  model: string;
  system: string;
  prompt: string;
  /** Counted on the server, so the number has one source. */
  sent_chars: number;
  reply: string | null;
  reply_chars: number;
  seconds: number;
  error: string | null;
}

/** How much history a node keeps: about 500 KB of text. */
const HISTORY_LIMIT = 500 * 1024;

/** Where an exchange begins: its heading, with the date and the time it happened. */
const ENTRY = /^## \d{4}-\d{2}-\d{2} \d{2}:\d{2} · /m;

const pad = (n: number): string => String(n).padStart(2, '0');

/** *text* in a fence longer than any run of backticks inside it, so what it holds cannot close it. */
function fenced(text: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((run) => run[0].length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}\n${text.replace(/\r\n/g, '\n').replace(/\n+$/, '')}\n${fence}`;
}

/** One call as the history tells it: where it was sent, what, and what came back or how it failed. */
function told(call: AICall, n: number, of: number): string {
  const to = [call.provider, call.model].filter(Boolean).join(' ') || 'the model';
  const parts = [`### ${of > 1 ? `Call ${n} of ${of}, sent` : 'Sent'} to ${to}`];
  if (call.system.trim()) parts.push('System:', fenced(call.system));
  parts.push('Prompt:', fenced(call.prompt));
  if (call.error) parts.push(`### Failed after ${call.seconds} s`, fenced(call.error));
  else parts.push(`### Came back after ${call.seconds} s`, fenced(call.reply ?? ''));
  return parts.join('\n\n');
}

/**
 * What an exchange is called in its heading: its *part* ("Output"), then the
 * words said to that part's chat after a colon -- or, with none, that it was
 * written from the node's text; `fix`: a repair of the body, not said at all.
 * `partExchanges` reads it back, so the two are written together.
 */
export function exchangeLabel(part: string, said?: string, how: { fix?: boolean; failed?: boolean } = {}): string {
  const words = said?.replace(/\s+/g, ' ').trim();
  const label = how.fix ? `${part} (fix)` : words ? `${part}: ${words}` : part;
  return how.failed ? `${label} (failed)` : label;
}

/** One exchange of a part, as its chat lists it. */
export interface PartExchange {
  /** Local date and time: "2026-10-09 14:05". */
  at: string;
  /** The words said to the chat; '' for a part written from the node's text, or a repair. */
  said: string;
  fix: boolean;
  failed: boolean;
}

/** The exchanges of *part* in *history*, oldest first (`exchangeLabel`). Anything else in it -- a change of the whole graph, an older heading -- is not the part's. */
export function partExchanges(history: string, part: string): PartExchange[] {
  const found: PartExchange[] = [];
  for (const [, at, heading] of history.matchAll(/^## (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) · (.+)$/gm)) {
    const failed = heading.endsWith(' (failed)');
    const label = failed ? heading.slice(0, -' (failed)'.length) : heading;
    if (label === `${part} (fix)`) found.push({ at, said: '', fix: true, failed });
    else if (label === part) found.push({ at, said: '', fix: false, failed });
    else if (label.startsWith(`${part}: `)) found.push({ at, said: label.slice(part.length + 2), fix: false, failed });
  }
  return found;
}

/**
 * One exchange as history.md keeps it: *which* it was (`exchangeLabel`) at
 * *at*, local time, and each of its *calls*.
 */
export function exchangeEntry(which: string, calls: AICall[], at: Date): string {
  const when = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const heading = `## ${when} · ${which.replace(/\s+/g, ' ').trim()}`;
  if (!calls.length) return `${heading}\n\nNothing was sent.`;
  return [heading, ...calls.map((call, index) => told(call, index + 1, calls.length))].join('\n\n');
}

/**
 * *history* with *entry* appended, and as many of the oldest entries dropped
 * as it takes to stay within *limit* characters -- never the new one.
 */
export function withExchange(history: string, entry: string, limit = HISTORY_LIMIT): string {
  const before = history.replace(/\s+$/, '');
  let text = before ? `${before}\n\n${entry}` : entry;
  while (text.length > limit) {
    // Where the next entry after the first begins: everything before it goes.
    const next = ENTRY.exec(text.slice(1));
    const at = next ? next.index + 1 : -1;
    // Only what came before the new entry: it stays, however long it is.
    if (at <= 0 || at > text.length - entry.length) break;
    text = text.slice(at);
  }
  return text;
}
