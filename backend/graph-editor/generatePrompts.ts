// What the model is told when ✨ writes a node's files, and when it designs or changes
// a whole graph: the prose around what the node and the graph hold.
//
// Its own file because it is prose, and prose has to be readable to be corrected.
// The prompt a person may change (`authoring/prompts.ts`) and its variables (`brief.ts`)
// are elsewhere; what is here is what the backend adds -- who the model is told it is,
// how to answer, and what a change or a repair is shown.

import type { PromptKind } from '../../graph/authoring/prompts.ts';
import type { Language } from '../../graph/authoring/generation.ts';
import { textOutput, type Definitions } from '../../graph/authoring/definition.ts';
import { names } from '../../graph/execution/wiring.ts';
import type { Graph } from '../../graph/graph.ts';
import { withoutAuthoring } from '../../graph/authoring/handedOn.ts';
import { BUDGET, clip } from './brief.ts';
import type { Refine } from '../app/api.ts';

/** Who the model is told it is, for each thing it writes -- for code, the node's language says (`Language.system`). */
export const SYSTEMS: Record<Exclude<PromptKind, 'code'>, string> = {
  input: 'You write one file of a node in a graph tool: its input definition, input.js -- a JSDoc typedef of what one call '
    + 'of the node is handed, then one example of it as plain JSON. Output only the file, in one ```js block.',
  output: 'You write one file of a node in a graph tool: its output definition, output.js -- a JSDoc typedef of what one '
    + 'call of the node returns, then one example of it as plain JSON. Output only the file, in one ```js block.',
  // Not "only the block": a change asks for the node's text restated after it (`RESTATE`), and the frame says which.
  prompt: 'You are an expert prompt engineer. You write the instructions one node of a graph tool gives a model every time '
    + 'it runs: concise, effective, and about the task. Output the instructions in one ```md block, and nothing the request does not ask for.',
  data: 'You write the data one node of a graph tool holds between runs: realistic, and shaped as the nodes it feeds want '
    + 'it. Output the data in one fenced block, and nothing the request does not ask for.',
};

/**
 * Said last in a request to change a body, so the node's text changes with it.
 * Asked to restate it "in one or two sentences", a model cut a description
 * that listed the themes and fields a node is written from down to a summary.
 */
const RESTATE = 'After that, write the node description again, inside <description></description> tags, with the change worked in: '
  + 'keep every sentence, name, list and number of it the change does not touch, word for word -- ✨ writes the node\'s files from it. '
  + 'It replaces the node description above.';

/** What the node is, as far as how to answer depends on it. */
export interface Shape {
  inputs: string[];
  /** Without the executor's error port: filled when the body fails, never returned by it. */
  outputs: string[];
  /** The outputs wired to other nodes: their ids are what the wires use. */
  wired: string[];
  /** The inputs that are handed a file's text. */
  reads: string[];
  /** A list arrives one item at a time. */
  perItem: boolean;
  definitions: Definitions | undefined;
  /** The body is kept as JSON, the element says (`TextFile.json`): a data node holding structure. */
  json: boolean;
  /** For a body of code, the language the node declares it is written in. */
  language?: Language;
}

/** Said of every definition's example: what Tell & Wire reads without running it. */
const PLAIN_JSON = 'plain JSON: double-quoted keys and strings, no comments, no trailing commas';

/**
 * The two lines a definition is shaped as, keyed by *ids*: its JSDoc, then its
 * example with the keys in double quotes. Shown, not only said -- told "plain
 * JSON", a model still wrote `{ input: … }` in three presses of four, and each
 * cost a second call to correct.
 */
function definitionSkeleton(type: 'Input' | 'Output', ids: string[]): string {
  // No id to keep is no id to show: shown "output", a model wrapped the two
  // outputs it named in one key of that name.
  const keys = ids.length ? ids : ['<id>'];
  return `/** @typedef {Object} ${type} ${keys.map((id) => `@property {…} ${id} …`).join(' ')} */\n`
    + `module.exports = { ${keys.map((id) => `"${id}": …`).join(', ')} };`;
}

/**
 * What a change or a fix of a body may bring back after it, besides the body:
 * `new`, the output.js a change needs where it outgrows the one there is;
 * `mended`, output.js corrected where it cannot be read -- which no body can
 * mend. Written with the body (`GenerateResponse.output_definition`).
 */
export type OutputAsked = 'new' | 'mended' | undefined;

/** Asked in a change: the output.js it outgrows comes back after *body*, whole. */
const newOutput = (body: string): string => 'If the change needs other outputs than output.js describes -- other keys, or another shape -- or is about output.js itself, '
  + `return the new output.js, the whole file, in a second \`\`\`js block after ${body}.`;

/**
 * What a body is told about the empty window as well as the full one: a page
 * is drawn before anything was chosen, and a node that fails on nothing shows
 * an error where a person should see what to do.
 */
const EMPTY_INPUT = 'Handle an input that is missing or empty as well as a full one: then the output says what to do instead of failing -- '
  + 'a chart gets a figure with no points and a title saying what to choose, a text says what it waits for.';

/**
 * The frame after the prompt: the file's format and how to answer. The
 * backend's, not the person's to edit. *restating*: a change was asked, and
 * the node's text comes back restated after the block (`RESTATE`) -- which a
 * frame that said "and nothing else" would forbid; *asked*: an output.js may
 * come back after the body too (`OutputAsked`).
 */
export function frame(kind: PromptKind, shape: Shape, restating: boolean, asked: OutputAsked): string {
  const { inputs, outputs, wired, reads, perItem } = shape;
  const lines = ['## How to answer'];
  switch (kind) {
    case 'input': {
      if (!inputs.length) {
        lines.push('Answer with the whole file input.js, in one ```js block and nothing else. It has no inputs: `/** @typedef {Object} Input */` and `module.exports = {};`.');
        break;
      }
      lines.push('Answer with the whole file input.js, in one ```js block and nothing else, shaped like this:', '', definitionSkeleton('Input', inputs), '',
        `- the JSDoc: \`@typedef {Object} Input\`, then one \`@property {type} <id> <what it is>\` for each input -- ${names(inputs)} -- saying its general format, as any value it may be handed has it;`,
        `- after \`module.exports =\`: one small, realistic example of what one call is handed, keyed by exactly those input ids, as ${PLAIN_JSON}.`,
        // A model names an input by what it holds -- "text" -- where the node's is "input", and the example then names nothing that arrives.
        `Those ids are the node's inputs as they are named, and what is wired in arrives under them: keep each as it is -- ${names(inputs)} -- even where another name would say more.`);
      if (reads.length) lines.push(`An input that reads a file (${names(reads)}) is handed the file's text: its example is text in that file's format -- a few lines of it -- never a path.`);
      if (perItem) lines.push('A list arrives one item at a time: the example is one item.');
      break;
    }
    case 'output': {
      lines.push('Answer with the whole file output.js, in one ```js block and nothing else, shaped like this:', '', definitionSkeleton('Output', wired), '',
        '- the JSDoc: `@typedef {Object} Output`, then one `@property {type} <id> <what it holds>` for each output;',
        `- after \`module.exports =\`: what one call returns for the example input, keyed by the outputs, as ${PLAIN_JSON}.`,
        // Kept to the ids there were, a model answered "its mood, and the reason" on one output "output".
        'Its keys are the node\'s outputs: one for each thing the description asks it to hand on -- "its mood, and the reason" are two outputs, "mood" and "reason".');
      if (outputs.length) {
        lines.push(wired.length
          ? `Now it has ${names(outputs)}. Keep ${names(wired)}: ${wired.length > 1 ? 'they are' : 'it is'} wired to other nodes, which read ${wired.length > 1 ? 'them' : 'it'} by that id.`
          // Told "now it has 'output'", a model kept it over the "'optimisation'" its description named.
          : `Nothing is wired to its outputs yet, so ${names(outputs)} ${outputs.length > 1 ? 'are' : 'is'} only a placeholder: name each output as the description names it, else by what it holds.`);
      }
      if (perItem) lines.push('It is what one call returns: the calls\' answers are collected into lists by themselves.');
      break;
    }
    case 'code': {
      const language = shape.language!;
      lines.push(`Answer with the whole file ${language.file}, in one \`\`\`${language.fence} block: this function, completed. ${asked === 'new'
        ? 'Keep its name and its `inputs` exactly as they are:' : 'Keep its name, its `inputs` and the returned keys exactly as they are:'}`,
      '', language.skeleton(inputs, outputs));
      if (outputs.length) {
        lines.push(`The returned object's keys must be exactly: ${JSON.stringify(outputs)}${asked === 'new' ? ' -- or the new output.js\'s, where the change brings one' : ''}. Downstream nodes look values up `
          + 'by these exact strings - do not rename, abbreviate, reorder, or invent additional keys, and include every one of them.');
      }
      if (asked === 'new') lines.push('Where the change needs other outputs than output.js describes, the new output.js follows the function, whole, in a second ```js block.');
      if (asked === 'mended') lines.push('Then output.js, corrected, in a second ```js block.');
      if (reads.length) lines.push(`${names(reads)} ${reads.length > 1 ? 'are' : 'is'} handed the file's text, already read: read no files yourself.`);
      if (perItem) lines.push('`run` is called once per item: `inputs` holds one item, as in the example; what the calls return is collected into lists by themselves.');
      if (inputs.length) lines.push(EMPTY_INPUT);
      lines.push(language.limits);
      break;
    }
    case 'prompt': {
      // As the node runs: text on its one output, JSON only where the definition names more than one text (`textOutput`).
      const output = shape.definitions?.output.trim() ?? '';
      const text = output ? textOutput(output) : 'output';
      const after = [
        ...(asked === 'new' ? ['then -- where the change needs other outputs -- the new output.js in a ```js block'] : []),
        ...(asked === 'mended' ? ['then output.js, corrected, in a ```js block'] : []),
        ...(restating ? ['then the node\'s text restated as asked above'] : []),
      ];
      const nothingElse = after.length ? `, ${after.join(', ')}, and nothing else` : ' and nothing else';
      lines.push(`Answer with the whole file prompt.md, in one \`\`\`md block${nothingElse}: the instructions the model is given every time this node runs.`,
        inputs.length > 1 ? `What arrives is sent after them, each input under its port id: ${names(inputs)}.`
          : inputs.length ? 'What arrives is sent after them, as it is.' : 'Nothing is wired in: the instructions are the whole question.',
        'Put {Node Description} and {Output Definition} where they belong in the instructions: they are filled in when the node runs -- '
          + `the node description as above, and ${output ? 'its output definition, output.js, as above' : '"None: answer in plain text."'}.`,
        text === undefined
          ? 'The answer is parsed as a JSON object keyed as the output definition\'s example is, and each key handed on its own output: ask for that JSON object and nothing else -- not the file around the example.'
          : `The answer is plain text, handed on as it is on "${text}": ask for the text itself${output ? ', as the output definition describes it -- not JSON, and not the file' : ''}.`);
      if (inputs.length) lines.push(`Say in the instructions how to answer an input that is missing or empty. ${EMPTY_INPUT}`);
      break;
    }
    case 'data': {
      const after = restating ? ' -- then, after the block, the node\'s text restated as asked above, and nothing else' : ', and nothing else';
      lines.push(shape.json
        ? `Answer with what the node holds, in one \`\`\`json block, as plain JSON${after}.`
        : `Answer with what the node holds, in one \`\`\`text block, the text itself${after}.`);
      break;
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Changing what there is
// ---------------------------------------------------------------------------

/**
 * Each input as a repair is shown it: as JSON, so a string's line breaks are
 * visible, and a list with its length. A single value is named by its type too:
 * "string", said outright, is what turns a body written for a list back into
 * one written for an item.
 */
function describeInputs(sample: Record<string, unknown>): string {
  return Object.entries(sample).map(([key, value]) => {
    const kind = Array.isArray(value) ? `a list of ${value.length}: ` : `${value === null ? 'null' : typeof value} = `;
    return `  inputs["${key}"]: ${kind}${clip(JSON.stringify(value), BUDGET.preview)}`;
  }).join('\n');
}

/**
 * The evidence handed to the second pass. *change* is what the attempt was
 * written to change, in the person's words: a repair of a change that does not
 * say so is a repair of the body from before it, and turned it back.
 */
export function repairPrompt(body: string, sample: Record<string, unknown>, error: string, problems: string[], change = ''): string {
  const parts = [
    'Your previous attempt was executed on the example in input.js and did not work. Fix it. Return the complete corrected function, not a patch.',
    '', '--- your previous attempt ---', body,
  ];
  if (change) parts.push('', '--- the change it was written to make, which the fix keeps ---', change);
  parts.push('', '--- the inputs it actually received ---', describeInputs(sample) || '  (no inputs)');
  if (error) parts.push('', '--- the error it raised ---', error);
  if (problems.length) {
    parts.push('', '--- what is wrong with what it returned ---',
      'It ran, but what it returned does not fit the output definition (output.js) -- downstream nodes look values up by exactly its keys, in its shape:',
      ...problems.map((problem) => `- ${problem}`));
  }
  return parts.join('\n');
}

/**
 * What changing a function is written from: the function as it is, the
 * output.js it returns now, what it did on its example, and what to change --
 * with the new output.js asked for after it, where the change outgrows the one
 * there is (`newOutput`). Or, with nothing to change, how it failed, in the
 * repair step's own words (`repairPrompt`): ✨ Fix is the repair a generation
 * makes of its own first attempt, made of the body there is.
 */
export function codeChange(refine: Refine, body: string, sample: Record<string, unknown> | undefined, output: string): string {
  const change = refine.change?.trim();
  if (!change) return repairPrompt(body, sample ?? {}, refine.error?.trim() ?? '', refine.problems ?? []);
  const parts = ['You are changing an existing function, not writing a new one.', '', '--- the function as it is now ---', body.trim() || '(none yet)',
    '', '--- output.js, the output definition it returns now ---', output.trim() || 'None yet.'];
  if (refine.outcome?.trim()) parts.push('', '--- what it returned on its example ---', clip(refine.outcome, BUDGET.preview));
  if (refine.error?.trim()) parts.push('', '--- the error it raised on its example ---', refine.error.trim());
  if (refine.problems?.length) parts.push('', '--- what does not fit its output definition ---', ...refine.problems.map((problem) => `- ${problem}`));
  parts.push('', '--- what to change ---', change, '',
    `Change the function that way and keep everything else it does. Return the complete function, not a patch. ${newOutput('the function')} ${RESTATE}`);
  return parts.join('\n');
}

/**
 * The same for instructions or data, written again whole with the change --
 * an ai node's instructions with its output.js shown, and asked for anew where
 * the change outgrows it (*output*; a data node keeps none).
 */
export function bodyChange(refine: Refine, body: string, what: string, output?: string): string {
  const change = refine.change?.trim();
  const shows = output !== undefined && !!change;
  const parts = [`## ${what} as it is now`, body.trim() || '(none yet)'];
  if (shows) parts.push('## output.js, what it answers with now', output.trim() || 'None yet: it answers in plain text.');
  if (refine.outcome?.trim()) parts.push('## What came of it on its example', clip(refine.outcome, BUDGET.preview));
  if (refine.error?.trim()) parts.push('## How it failed on its example', refine.error.trim());
  if (refine.problems?.length) parts.push('## What does not fit its output definition', refine.problems.map((problem) => `- ${problem}`).join('\n'));
  parts.push('## What to change', change || 'Only what makes it fail, or fall short, as said above.');
  parts.push(`Write it again whole, with that change, keeping what the change does not touch.${change ? `${shows ? ` ${newOutput('the instructions')}` : ''} ${RESTATE}` : ''}`);
  return parts.join('\n\n');
}

/**
 * ✨ Fix where output.js cannot be read (*why*, `unreadableOutput`): no body
 * mends that, so the file is shown and asked for corrected after the body --
 * told only to repair the body, a model rewrote a function that was right.
 * *what* is the body ("function", "instructions").
 */
export function mendPrompt(what: string, body: string, output: string, why: string, refine: Refine): string {
  const parts = [`The output definition ${what === 'function' ? 'this function is' : 'these instructions are'} held to cannot be read -- ${why}.`,
    '', '--- output.js as it is ---', output.trim(), '', `--- the ${what} ---`, body.trim() || '(none yet)'];
  if (refine.error?.trim()) parts.push('', '--- the error it raised on its example ---', refine.error.trim());
  const other = (refine.problems ?? []).filter((line) => line !== why);
  if (other.length) parts.push('', '--- what else does not fit ---', ...other.map((problem) => `- ${problem}`));
  parts.push('', `Return the ${what} -- as ${what === 'function' ? 'it is' : 'they are'}, or fixed where ${what === 'function' ? 'it fails' : 'they fall short'} -- `
    + `then output.js corrected: the whole file, its example as ${PLAIN_JSON}, in a second \`\`\`js block.`);
  return parts.join('\n');
}

/** Said where a change does not fit the output.js from before it, and brought none of its own. */
export const OUTGROWN = 'if the change needs other outputs, ✨ Output writes output.js for it from the node\'s text';

// A whole graph: its system prompt is `graphPrompt.ts`.

/**
 * What a change to *current* is asked with: the graph as the document the
 * model writes, and the whole document back. Asked for a patch, a model makes
 * up a format of its own; asked for the document it knows, it keeps what it
 * was shown. Shown what runs, not how each node was written
 * (`withoutAuthoring`): a node's history is up to half a megabyte of earlier
 * prompts, and none of it is the model's to change.
 */
export function changePrompt(current: Graph, description: string): string {
  return [
    `This is the graph as it is now:\n\`\`\`json\n${JSON.stringify(withoutAuthoring(current), null, 2)}\n\`\`\``,
    `Change it as follows:\n${description}`,
    'Answer with the whole graph after the change, as one complete document of the same shape. Keep every '
      + 'node\'s id, and keep everything the change does not touch -- nodes, wires, positions, labels, settings, '
      + 'code and prompts -- exactly as it is. A new node gets an id no other node has.',
  ].join('\n\n');
}
