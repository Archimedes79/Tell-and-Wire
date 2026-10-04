// The language a code node's body is written in, as whoever writes and tries
// it needs it said: JavaScript, run by the Node the engine runs on.
//
// Everything that is JavaScript about writing a body is here, declared by the
// code node (`CodeNodeRunner.generation`), so the writer (`host/editor/
// generate.ts`) names no language: a node for another one declares its own.

import type { Language } from '../../../authoring/generation.ts';
import { runBody } from '../../body.ts';

/**
 * A port id as a local variable name. Port ids come from the wiring and may
 * hold what an identifier cannot: a dash, a space, a leading digit.
 */
function identifier(port: string): string {
  const cleaned = port.replace(/[^A-Za-z0-9_]/g, '_');
  return !cleaned || /^\d/.test(cleaned) ? `_${cleaned}` : cleaned;
}

/**
 * The empty `run` ✨ Code completes: the signature, typed by the node's
 * definitions -- JSDoc, which is plain JavaScript at run time and leads an IDE
 * from code.js to input.js and output.js -- and nothing else. Rendered from the
 * ports, never parsed back: a text allowed to rename a port would detach wires.
 */
export function renderSkeleton(inputs: string[], outputs: string[]): string {
  const lines: string[] = [];
  if (inputs.length || outputs.length) {
    lines.push('/**');
    if (inputs.length) lines.push(" * @param {import('./input.js').Input} inputs");
    if (outputs.length) lines.push(" * @returns {import('./output.js').Output}");
    lines.push(' */');
  }
  lines.push('function run(inputs) {');
  for (const port of inputs) lines.push(`  const ${identifier(port)} = inputs["${port}"];`);
  if (inputs.length) lines.push('');
  lines.push(outputs.length ? `  return {${outputs.map((port) => `"${port}": null`).join(', ')}};` : '  return {};');
  lines.push('}');
  return `${lines.join('\n')}\n`;
}

export const JAVASCRIPT: Language = {
  file: 'code.js',
  fence: 'js',
  system: 'You are an expert software engineer. When asked to generate code, output ONLY valid code '
    + 'inside a markdown code block, followed by a brief explanation outside the block. Do not add '
    + 'extra prose before the code block. The returned object\'s keys must exactly match the '
    + 'requested output names - downstream nodes look up values by these exact keys. '
    // Every body may ask (`elements/body.ts`), and a generator that is not told so
    // writes a word list where a question was wanted -- or guesses at an API.
    + 'When the task needs the judgement of a model -- classifying, summarising, extracting meaning -- declare '
    + 'the function as "async function run(inputs, node)" and ask with '
    + '"await node.llm({ prompt: "..." })", which resolves to the answer as text; never call a model API '
    + 'yourself and never use a key. For everything else, plain code.',
  skeleton: renderSkeleton,
  limits: 'Use only what Node has built in. There is no package manager and no `npm install`: `require` '
    + "and `import` of anything outside Node's own standard library will fail at run time. "
    // Without a locale, toLocaleString() takes the machine's: "1.831 characters"
    // on a German one, in a tool whose every other word is English.
    + "Numbers and dates are read in English: format them with the 'en' locale -- `n.toLocaleString('en')` -- "
    + 'never with none, which takes the language of whatever machine runs it.',
  run: runBody,
};
