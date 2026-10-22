// The prompt an ai node runs with, and the variables a prompt names.
//
// A node says what should happen in its heading and its text. An ai node runs with
// instructions -- its prompt.md, else the standard ones below -- that put the text
// together with what the node holds, through variables (`VARIABLES` says what each
// is filled with). The prompts that write a node are the editor's (`graph/editor/prompts.ts`).
//
// **Variables are filled by their exact names**, and nothing else in braces is
// touched: a prompt that holds JSON reaches the model as it was written. A
// variable nothing fills stays as written too -- an ai node's prompt.md is
// filled at run time with the two that mean something then.

import { textOutput } from './definition.ts';

/** What a prompt may name, and what each is filled with: what the node and the graph hold. */
const VARIABLES = {
  'Node Description': 'Its heading, id and kind as "# <heading> (ID <id>, <kind> node)", then its text',
  'Input Definition': 'input_example.js as it is, where it is written -- then each input as wired: its type, where it comes from, what arrives there',
  'Output Definition': 'output.js as it is, where it is written -- then each output as wired: where it goes, what the node there wants',
  Context: 'The graph around the node, in words: what it is for, its gui, what is wired to what',
  'Example Files': 'For ✨ Input: the files it is given -- examples, a spec -- each path and the start of it',
  'Output Files': 'For ✨ Output: the files it is given, the same way',
} as const;

export type Variable = keyof typeof VARIABLES;

const VARIABLE = new RegExp(`\\{(${Object.keys(VARIABLES).join('|')})\\}`, 'g');

/** *text* with each variable *values* has replaced by its value; every other `{…}` as it was written. */
export function fillPrompt(text: string, values: Partial<Record<Variable, string>>): string {
  // A function, not a string: a value holding "$&" is put in as it is.
  return text.replace(VARIABLE, (whole, name: Variable) => values[name] ?? whole);
}

/**
 * What a node is, as {Node Description} says it: its heading, its id and kind,
 * then its text. A node always has a heading (`check` names one without), so
 * nothing stands in for it here.
 */
export function nodeDescription(node: { id: string; label: string; description: string; node_type: string }): string {
  const heading = `# ${node.label.trim()} (ID ${node.id}, ${node.node_type} node)`;
  const text = node.description.trim();
  return text ? `${heading}\n\n${text}` : heading;
}

/**
 * Said with every output definition a model answers: a model copies figures,
 * names and claims from an example that is only there to show the form.
 */
const FORM_ONLY = 'Its example shows the form only: take no figure, name or claim from it -- each comes from the input.';

/**
 * The instructions an ai node runs with while its prompt.md says nothing of
 * its own, for its output definition *definition* ('' while it has none): its
 * description, and how to answer. In plain text without a definition, and
 * where it names one output that holds text (`textOutput`): the answer is that
 * text. Where it names several, or a value that is not text, the answer is
 * JSON keyed as its example is, which the node hands on key by key.
 */
export function standardRunPrompt(definition: string): string {
  const start = '{Node Description}\n\nDo this with the input below';
  if (!definition.trim()) return `${start}. Answer in plain text.`;
  if (textOutput(definition) !== undefined) {
    return `${start}. Answer in plain text: the text itself, as this output definition describes it -- not JSON, and not the file. ${FORM_ONLY}\n{Output Definition}`;
  }
  return `${start}, and answer with the data mapped onto this output definition: only a JSON object, keyed and shaped as its example after module.exports -- not the file itself. ${FORM_ONLY}\n{Output Definition}`;
}

/**
 * *definition* with how to answer it said first: what {Output Definition}
 * is filled with in a prompt.md of the node's own. Such a prompt names the
 * definition -- "Output format: {Output Definition}" -- without saying how to
 * answer it, and a model shown output.js and nothing else answers with the
 * file itself.
 */
export function answeredAs(definition: string): string {
  return textOutput(definition) !== undefined
    ? `Answer in plain text: the text itself, as this output definition describes it -- not JSON, and not the file. ${FORM_ONLY}\n${definition}`
    : `Answer with only a JSON object, keyed and shaped as its example after module.exports -- not the file itself. ${FORM_ONLY}\n${definition}`;
}
