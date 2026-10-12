// What a window's inputs hold to begin with, and the ids the page and the graph share.

import { inBlock, outEnd, type Window, type WindowIn } from '../../../gui/editor/windows/windows.ts';

export { inBlock, outEnd };

/** What an input holds before anyone has set it: what the window says, else what its kind starts at. */
export function startValue(one: WindowIn): string | number {
  if (one.kind === 'number') return typeof one.value === 'number' ? one.value : one.min ?? 0;
  if (one.kind === 'choice') return one.value !== undefined ? String(one.value) : one.options?.[0] ?? '';
  return one.value === undefined ? '' : String(one.value);
}

/** The window an input block belongs to, by its id (`<window>_in_<name>`). */
export function windowOfBlock(windows: readonly Window[], blockId: string): Window | undefined {
  return windows.find((window) => blockId.startsWith(`${window.id}_in_`));
}

/** What a window is sent when it runs: each input that is not from another window, by block id. */
export function sentBy(window: Window, held: (blockId: string) => unknown): Record<string, unknown> {
  return Object.fromEntries(window.inputs.filter((one) => one.kind !== 'from').map((one) => [inBlock(window, one), held(inBlock(window, one))]));
}

/** The number an element of the window is drawn with, and its cell is listed with: the inputs first, then the outputs. */
export function numbering(window: Window): Map<string, number> {
  const numbers = new Map<string, number>();
  window.inputs.forEach((one) => numbers.set(inBlock(window, one), numbers.size + 1));
  window.outputs.forEach((one) => numbers.set(outEnd(window, one), numbers.size + 1));
  return numbers;
}

/** The name a sentence points at *name* by: a mention has no spaces. */
export const tag = (name: string): string => name.trim().replace(/\s+/g, '_');

/** What a sentence says to the model it is done by: each `@Name` as the name in quotes. */
export const spoken = (sentence: string): string => sentence.replace(/@([\p{L}\p{N}_-]+)(?:\.(path|content))?/gu, (_, name: string, part?: string) => `“${name.replace(/_/g, ' ')}${part === 'path' ? ' path' : ''}”`);
