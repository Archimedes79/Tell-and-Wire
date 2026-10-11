// Windows read from JSON: a file, or a model's answer.
//
// Forgiving about shape and strict about identity, as `parseGraph` is: a field left out means its
// default, a kind nobody knows means the plainest, a number out of range is brought into it. What
// cannot be read at all is thrown as a `NotWindows`, saying what is wrong where.

import { SIZES, idOf, type InKind, type OutKind, type Step, type Trigger, type Window, type WindowIn, type WindowOut, type Windows } from './windows.ts';

export class NotWindows extends Error {}

const IN_KINDS: readonly InKind[] = ['file', 'folder', 'text', 'number', 'choice', 'from'];
const OUT_KINDS: readonly OutKind[] = ['text', 'list', 'table', 'chart', 'image'];

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const clamp = (value: unknown, low: number, high: number, fallback: number): number => {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(high, Math.max(low, number));
};

function inputOf(raw: unknown, where: string): WindowIn {
  if (!isObject(raw) || !text(raw.name).trim()) throw new NotWindows(`${where}: every input needs a "name".`);
  const kind = IN_KINDS.includes(raw.kind as InKind) ? raw.kind as InKind : 'text';
  const from = isObject(raw.from) && text(raw.from.window) && text(raw.from.output) ? { window: text(raw.from.window), output: text(raw.from.output) } : undefined;
  const options = list(raw.options).filter((one): one is string => typeof one === 'string');
  return {
    name: text(raw.name).trim(), kind: from ? 'from' : kind === 'from' ? 'text' : kind,
    ...(options.length ? { options } : {}),
    ...(text(raw.extensions) ? { extensions: text(raw.extensions) } : {}),
    ...(typeof raw.min === 'number' ? { min: raw.min } : {}), ...(typeof raw.max === 'number' ? { max: raw.max } : {}), ...(typeof raw.step === 'number' ? { step: raw.step } : {}),
    ...(typeof raw.value === 'string' || typeof raw.value === 'number' ? { value: raw.value } : {}),
    ...(from ? { from } : {}),
    ...(typeof raw.width === 'number' ? { width: clamp(raw.width, 0.1, 1, 1) } : {}),
    ...(typeof raw.rows === 'number' ? { rows: Math.round(clamp(raw.rows, 1, 9, 1)) } : {}),
  };
}

function stepOf(raw: unknown, where: string): Step {
  if (!isObject(raw) || !text(raw.name).trim()) throw new NotWindows(`${where}: every cell that does something needs a "name".`);
  const results = list(raw.results).filter((one): one is string => typeof one === 'string' && !!one.trim());
  return {
    name: text(raw.name).trim(), sentence: text(raw.sentence), how: raw.how === 'code' ? 'code' : 'ai',
    ...(text(raw.code) ? { code: text(raw.code) } : {}),
    ...(raw.each === true ? { each: true } : {}),
    ...(results.length ? { results } : {}),
  };
}

function outputOf(raw: unknown, where: string): WindowOut {
  if (!isObject(raw) || !text(raw.name).trim()) throw new NotWindows(`${where}: every output needs a "name".`);
  const kind = OUT_KINDS.includes(raw.kind as OutKind) ? raw.kind as OutKind : 'text';
  return {
    name: text(raw.name).trim(), kind, rows: Math.round(clamp(raw.rows, 1, 9, SIZES[kind].M)),
    ...(typeof raw.width === 'number' ? { width: clamp(raw.width, 0.1, 1, 1) } : {}),
    ...(text(raw.of) ? { of: text(raw.of) } : {}),
  };
}

function triggerOf(raw: unknown): Trigger | undefined {
  if (!isObject(raw)) return undefined;
  return {
    ...(raw.button === false ? { button: false } : {}),
    ...(text(raw.label).trim() ? { label: text(raw.label).trim() } : {}),
    ...(raw.onChange === true ? { onChange: true } : {}),
  };
}

/** The windows a JSON document says. */
export function parseWindows(raw: unknown): Windows {
  if (!isObject(raw)) throw new NotWindows('Not windows: expected an object with "windows".');
  const windows = list(raw.windows).map((one, at): Window => {
    const where = `window ${at + 1}`;
    if (!isObject(one)) throw new NotWindows(`${where} is not an object.`);
    const title = text(one.title).trim() || text(one.id).trim() || `Window ${at + 1}`;
    const trigger = triggerOf(one.trigger);
    return {
      id: text(one.id).trim() || idOf(title), title, span: Math.round(clamp(one.span, 1, 16, 8)),
      inputs: list(one.inputs).map((input) => inputOf(input, `${where}, input`)),
      steps: list(one.steps).map((step) => stepOf(step, `${where}, cell`)),
      outputs: list(one.outputs).map((output) => outputOf(output, `${where}, output`)),
      ...(trigger && Object.keys(trigger).length ? { trigger } : {}),
    };
  });
  return {
    name: text(raw.name, 'Untitled tool'), description: text(raw.description),
    ...(text(raw.scheme) ? { scheme: text(raw.scheme) } : {}),
    windows,
  };
}
