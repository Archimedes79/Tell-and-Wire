// A chat block's two asks of the model besides a round: the window it has, and a long conversation shortened.
//
// Neither is a node's: the block counts its conversation against the window (`gui/widgets/chat/compact.ts`) and, when a person asks,
// has the oldest turns written down shorter -- one call to the model the tool runs on, with the summary there is already and the turns
// after it. Nothing here keeps anything: the block's value does (`ChatValue.summary`).

import { compactRequest } from '../../../gui/widgets/chat/compact.ts';
import type { ChatMessage } from '../../../gui/widgets/chat/value.ts';
import { aiSetting } from '../runtime/ai/settings.ts';
import { contextWindow } from '../runtime/ai/window.ts';
import type { ChatContext } from './api.ts';
import type { Session } from './session.ts';

/** More than a conversation a person had: what is refused rather than sent to a model as it is. */
const MAX_CHARS = 2_000_000;

export class BadChat extends Error {}

/** The model the tool's nodes run on, and its window. */
export async function chatContext(session: Session): Promise<ChatContext> {
  const ai = session.ai();
  const model = await (ai.setting?.() ?? aiSetting());
  const { provider, model: name, tokens, source } = await contextWindow(model);
  return { provider, model: name, tokens, source };
}

/** The turns, as the route got them: what is not a turn is refused. */
function turnsOf(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw) || !raw.length) throw new BadChat('"messages" must list the turns to shorten.');
  const turns = raw.map((one) => one as Partial<ChatMessage>);
  if (turns.some((turn) => typeof turn?.text !== 'string' || (turn.role !== 'user' && turn.role !== 'assistant'))) {
    throw new BadChat('Each of the "messages" is a turn: its "role" is user or assistant and its "text" is text.');
  }
  return turns as ChatMessage[];
}

/** The one summary of the one there was and the turns after it, written by the model. */
export async function compactChat(session: Session, asked: { summary?: unknown; messages?: unknown }): Promise<{ summary: string }> {
  const messages = turnsOf(asked.messages);
  const summary = typeof asked.summary === 'string' ? asked.summary : '';
  if (summary.length + messages.reduce((sum, turn) => sum + turn.text.length, 0) > MAX_CHARS) throw new BadChat('That is more than a model could shorten in one go.');
  const request = compactRequest(summary, messages);
  const written = (await session.ai().complete(request)).trim();
  if (!written) throw new BadChat('The model answered with nothing, so nothing was shortened.');
  return { summary: written };
}
