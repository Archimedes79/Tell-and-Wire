// The prompts a node is written with: the standard texts of each chat, and what every one sends.
//
// A node says what should happen in its heading and its text; everything else
// is generated. Each chat -- the node's input definition, its output definition,
// its body -- is sent a prompt that puts the text together with what the node
// and the graph already hold, through variables (`graph/files/prompts.ts`, `VARIABLES`).
//
// **Every standard prompt names the same four** (`SENT_WITH`): the node's text,
// its input, its output and the graph around it. That is what each chat tells
// a person it sends, so a node of any kind is written from the same facts.
// After the prompt the backend adds what the person said to the chat and its
// own frame, which is not the person's to edit: the file format and how to
// answer (`backend/editor/graph/generate.ts`).

import type { Variable } from '../files/prompts.ts';
import type { GenerationKind } from './generation.ts';

/** What every chat sends with what the person says, by the variable that carries it (`STANDARD_PROMPTS`). */
export const SENT_WITH = {
  'Node Description': 'its text',
  'Input Definition': 'input',
  'Output Definition': 'output',
  Context: 'the graph around',
} as const satisfies Partial<Record<Variable, string>>;

/**
 * What a ✨ writes: a node's input definition, its output definition, or its
 * body -- code, an ai node's prompt, a data node's data -- each with a
 * standard prompt of its own.
 */
export type PromptKind = 'input' | 'output' | GenerationKind;

const DESCRIBED = 'This is the user\'s node description:\n{Node Description}';

export const STANDARD_PROMPTS: Record<PromptKind, string> = {
  input: `${DESCRIBED}

Its input definition, and what the graph hands it:
{Input Definition}

Its output definition, and what the nodes it feeds want:
{Output Definition}

Context:
{Context}

Example files:
{Example Files}

Task: write this node's input definition -- what arrives on each of its inputs, in general: the format any such input has, not only these examples -- and one small, realistic example of it, drawn from the example files where there are some. Follow what is wired where it says what arrives: an input fed by a node that holds a list of records is handed those records, keyed exactly as they are.`,

  output: `${DESCRIBED}

Input definition:
{Input Definition}

Its output definition, and what the nodes it feeds want:
{Output Definition}

Context:
{Context}

Output files:
{Output Files}

Task: write this node's output definition -- what goes out on each of its outputs -- and one example of it: what this node gives for the example input. Follow what is wired where it says what the node there wants: a chart that wants a figure {kind, title, points} gets exactly that. Fit the context too, and the output files where there are some.`,

  code: `${DESCRIBED}

Input definition:
{Input Definition}

Output definition:
{Output Definition}

Context:
{Context}

Task: write the code from the description, following the input example and the output definition.`,

  prompt: `${DESCRIBED}

Input definition:
{Input Definition}

Output definition:
{Output Definition}

Context:
{Context}

Task: write the instructions a model is given to do this task with the input it is sent, and to map the data onto the output definition.`,

  data: `${DESCRIBED}

What feeds it:
{Input Definition}

What it feeds:
{Output Definition}

Context:
{Context}

Task: write the fields this node holds, as one JSON object: each field's name and its starting value -- empty, as before any round -- and then the same fields as rounds would have filled them, one realistic value each. Shape both as what feeds it and the nodes it feeds want it. The node counts its rounds by itself: no field for that.`,
};
