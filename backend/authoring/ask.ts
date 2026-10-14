// What writing with a model has in common wherever it is done -- a node's file in the editor, a page of windows in the notebook: the
// transcript of the calls made, how an answer's fenced block is read, and the two ways a writing can end badly.
//
// Not the editor's and not the notebook's: both import it, neither the other.

import type { AiRequest, AiService } from '../../graph/nodes/Runtime.ts';
import type { AICall } from '../../graph/authoring/history.ts';
import { messageOf } from '../../graph/errors.ts';

export type { AICall };

/** A model, already resolved: which provider, which of its models. */
export interface Target { provider: string; model: string }

export class GenerationRefused extends Error {}

// ---------------------------------------------------------------------------
// The transcript
// ---------------------------------------------------------------------------

/** An AI service that writes down every call it makes, for one generation. */
export function recording(ai: AiService, calls: AICall[]): AiService {
  return {
    async complete(request: AiRequest): Promise<string> {
      const entry: AICall = {
        provider: request.provider ?? '',
        model: request.model ?? '',
        system: request.system ?? '',
        prompt: request.prompt,
        // Counted here rather than in the browser: "how much did I send" is
        // the question a context-window error raises.
        sent_chars: (request.system ?? '').length + request.prompt.length,
        reply: null, reply_chars: 0, seconds: 0, error: null,
      };
      calls.push(entry);
      const started = Date.now();
      try {
        const reply = await ai.complete(request);
        entry.reply = reply;
        entry.reply_chars = reply.length;
        return reply;
      } catch (error) {
        entry.error = messageOf(error);
        throw error;
      } finally {
        entry.seconds = Math.round((Date.now() - started) / 10) / 100;
      }
    },
  };
}

/**
 * A fenced block after any info string (`javascript `, `js title="x"`, `c++`),
 * closed at the start of a line by a fence at least as long as the one that
 * opened it: code that writes "```" into a string does not end its own block
 * there, and a ```json example in instructions fenced with four backticks does
 * not end theirs.
 */
export const FENCED = /(?<!`)(`{3,})[^\n`]*\n([\s\S]*?)\n[ \t]*\1`*/;
/** The same closed mid-line: only where no block is closed at the start of one. */
const FENCED_MID_LINE = /(?<!`)(`{3,})[^\n`]*\n([\s\S]*?)\1`*/;

/** An answer's first fenced block, Windows line ends and all, and what the answer says after it. */
export function firstBlock(text: string): { code: string; after: string } | undefined {
  const plain = text.replace(/\r\n/g, '\n');
  const block = FENCED.exec(plain) ?? FENCED_MID_LINE.exec(plain);
  return block ? { code: block[2].trim(), after: plain.slice(block.index + block[0].length).trim() } : undefined;
}


export class GenerationFailed extends Error {
  readonly calls: AICall[];
  constructor(message: string, calls: AICall[]) {
    super(message);
    this.calls = calls;
  }
}
