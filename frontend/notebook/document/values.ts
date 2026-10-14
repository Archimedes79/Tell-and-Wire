// What a window's inputs hold to begin with, and the ids the page and the graph share.

import { inBlock, mentionOf, outEnd, type Window, type WindowIn, type WindowOut } from '../../../gui/notebook/windows.ts';

export { inBlock, outEnd };

/** What an input holds before anyone has set it: what the window says, else what its kind starts at. */
export function startValue(one: WindowIn): string | number {
  if (one.kind === 'number') return typeof one.value === 'number' ? one.value : one.min ?? 0;
  if (one.kind === 'choice') return one.value !== undefined ? String(one.value) : one.options?.[0] ?? '';
  return one.value === undefined ? '' : String(one.value);
}

/** The window an input block belongs to, by its id (`<window>_in_<name>`): the one with the longest id that begins it, where one id begins another's. */
export function windowOfBlock(windows: readonly Window[], blockId: string): Window | undefined {
  return windows.filter((window) => blockId.startsWith(`${window.id}_in_`)).sort((a, b) => b.id.length - a.id.length)[0];
}

/** The chats of a window: outputs that are also where a message is typed. */
export const chatsOf = (window: Window): WindowOut[] => window.outputs.filter((one) => one.kind === 'chat');

/** What a chat holds before anything was said. */
export const NO_CHAT = { messages: [], pending: '' };

/** What a window is sent when it runs: each input that is not from another window, and each chat, by block id. */
export function sentBy(window: Window, held: (blockId: string) => unknown): Record<string, unknown> {
  return Object.fromEntries([
    ...window.inputs.filter((one) => one.kind !== 'from').map((one) => [inBlock(window, one), held(inBlock(window, one))]),
    ...chatsOf(window).map((one) => [outEnd(window, one), held(outEnd(window, one))]),
  ]);
}

/** The block that starts a window as the page starts it: its chat, which sends a message, else its button. */
export const starterOf = (window: Window): string => {
  const chat = chatsOf(window)[0];
  return chat ? outEnd(window, chat) : `${window.id}_run`;
};

/** The number an element of the window is drawn with, and its cell is listed with: the inputs first, then the outputs. */
export function numbering(window: Window): Map<string, number> {
  const numbers = new Map<string, number>();
  window.inputs.forEach((one) => numbers.set(inBlock(window, one), numbers.size + 1));
  window.outputs.forEach((one) => numbers.set(outEnd(window, one), numbers.size + 1));
  return numbers;
}

/** The name a sentence points at *name* by: a mention has no spaces. */
export const tag = (name: string): string => mentionOf(name);

/** What a sentence says to the model it is done by: each `@Name` as the name in quotes -- the one made from the windows (`gui/notebook/windows.ts`), so what is shown here is what is sent. */
export { spoken } from '../../../gui/notebook/windows.ts';

/** A folder name from a tool's name: "Expense overview" is expense_overview. */
export const folderName = (name: string): string => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
