// The report of a run: what happened, node by node, in words a person who did not build the tool
// can read -- and as plain text that can be sent to whoever can help.
//
// A run's result says, for each node, how it went and, if it failed, the error the node gave: a
// JavaScript message, a model's refusal, a refused connection. Said as it came it is for the one
// who wrote the code; said as `explain` has it, it says what to look at. The error itself stays
// beside it, whole, since the help may need it.
//
// What went in and out of a node is data of the person's and is left out of the text unless asked
// for: a report is meant to be shared.

import type { ExecutionResult, GraphNode, NodeResult } from '../document/graph';
import { registry } from '../../../graph/nodes/registry.ts';

export type ReportStatus = 'success' | 'partial' | 'error' | 'skipped' | 'held';

export interface ReportNode {
  id: string;
  label: string;
  status: ReportStatus;
  /** What it comes to, in words; absent for a node that went well. */
  plain?: string;
  /** The error as the node gave it, cut at a screenful. */
  error?: string;
  /** What the run said of it besides. */
  messages: string[];
  inputs: string;
  outputs: string;
}

export interface RunReport {
  status: ExecutionResult['status'];
  /** One sentence: how the run went, and where it stopped when it did. */
  summary: string;
  nodes: ReportNode[];
  /** The first node that failed, where there is one: where to look first. */
  failed?: ReportNode;
  /** Every node ran and nothing is to be remarked: a run that ended in success with an empty table is not this. */
  well: boolean;
}

/** How much of an error, or of a value, a report carries. */
const ERROR_LIMIT = 1500;
const VALUE_LIMIT = 240;

/**
 * The errors people meet, as what to do about them. The first that matches speaks:
 * the AI that cannot be reached, then what is wrong with the answer or with the
 * code, and only then the words that turn up in anything -- "quota", "permission",
 * a "403" -- which a mistake in the code that names them must not be taken for.
 */
const KNOWN: { when: RegExp; plain: string }[] = [
  { when: /not running at|could not reach|cannot connect|connection refused|ECONNREFUSED|fetch failed|ENOTFOUND|EHOSTUNREACH/i, plain: 'The AI could not be reached. Is its server running, and is the address in ⚙ Settings right?' },
  { when: /is not valid JSON|JSON at position|unexpected (token|end).*JSON|JSON.*unexpected (token|end)|not (in )?JSON/i, plain: 'The answer was not in the form the next step expects (JSON). Open the node and press ✨ Fix, or ask for plain text.' },
  { when: /is not defined|is not a function|cannot read prop|unexpected token|syntax ?error|reference ?error|type ?error/i, plain: 'The code of this node has a mistake. Open the node and press ▶ Try, or ✨ Fix.' },
  // A number that is a position in the code ("line 403", "x.js:403:5") is not a status.
  { when: /(?<!line\s|column\s|:)\b(401|403)\b|invalid api key|unauthori[sz]ed|incorrect api key|permission denied.*key/i, plain: 'The AI turned the key down. Check the key in ⚙ Settings.' },
  { when: /(?<!line\s|column\s|:)\b429\b|rate limit|quota|too many requests/i, plain: 'The AI says there were too many requests, or the free allowance is used up. Wait a little, or choose another AI in ⚙ Settings.' },
  { when: /model.*(not found|does not exist|unknown)|no such model|pull the model/i, plain: 'The AI does not know that model. Check its name in ⚙ Settings, or pull it first if it is a local one.' },
  { when: /TW_MAX_TOKENS|cut off|max.?tokens|context length/i, plain: 'The answer was too long for what the AI may write, or the question for what it can read. Ask for a shorter answer, or use another model.' },
  { when: /ENOENT|no such file|file or folder.*not found|path.*not found/i, plain: 'A file or folder was not found. Check the path it was given.' },
  { when: /EACCES|EPERM|permission denied|operation not permitted/i, plain: 'A file could not be read or written: no permission.' },
  { when: /time.?out|timed out|ETIMEDOUT/i, plain: 'It took too long and was stopped.' },
];

/** What an error comes to, in a sentence. */
export function explain(error: string): string {
  return KNOWN.find((known) => known.when.test(error))?.plain ?? 'The node reported an error. The text below says which.';
}

function cut(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}… (${text.length - limit} more characters)` : text;
}

/** A value as one short line, for a glance. */
function glance(values: Record<string, unknown> | undefined): string {
  const entries = Object.entries(values ?? {});
  if (!entries.length) return '';
  return entries.map(([name, value]) => {
    const said = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value);
    return `${name}: ${cut(said.replace(/\s+/g, ' '), VALUE_LIMIT)}`;
  }).join('\n');
}

function reportNode(result: NodeResult, label: string): ReportNode {
  const status: ReportStatus = result.held ? 'held' : result.status;
  const messages = (result.messages ?? []).filter(Boolean);
  const error = result.error ? cut(result.error, ERROR_LIMIT) : undefined;
  let plain: string | undefined;
  if (error) plain = explain(error);
  else if (status === 'skipped') plain = messages[0] ?? 'It did not run: something it needs failed, or the run was stopped.';
  else if (status === 'held') plain = 'It did not run this time. What it made in an earlier run stands.';
  else if (status === 'partial') plain = 'Some items failed; the others were delivered.';
  return { id: result.node_id, label, status, plain, error, messages, inputs: glance(result.inputs), outputs: glance(result.outputs) };
}

/** The report of *result*, for the nodes of the graph it was a run of. */
export function runReport(result: ExecutionResult, nodes: (Pick<GraphNode, 'id' | 'label'> & { node_type?: string })[]): RunReport {
  const labelOf = (id: string) => nodes.find((node) => node.id === id)?.label || id;
  const reported = result.node_results.map((one) => reportNode(one, labelOf(one.node_id)));
  // An end point that was handed nothing: every node ran, and the table the person looks at is empty.
  const shows = (id: string) => registry.node(nodes.find((node) => node.id === id)?.node_type ?? '')?.isResult === true;
  const bare = reported.filter((node, at) => node.status === 'success' && shows(node.id) && Object.values(result.node_results[at].inputs ?? {}).every(isEmpty));
  for (const node of bare) node.plain = 'Nothing arrived here: what it shows is empty.';
  const failed = reported.find((node) => node.status === 'error');
  const done = reported.filter((node) => node.status === 'success' || node.status === 'partial').length;
  const partly = reported.filter((node) => node.status === 'partial');
  // A node that ran and handed on something other than what its output.js says: what comes after it reads keys that are not there,
  // and the table is empty -- a run that "went well" is then a lie of the kind nobody finds.
  // The same of what a node was handed and its input.js: it was written for other keys than arrived.
  const unfit = (file: string) => reported.filter((node) => node.status === 'success' && node.messages.some((message) => message.startsWith(`Does not fit its ${file}`)));
  const off = unfit('output.js');
  const fed = unfit('input.js');
  for (const node of off) node.plain ??= 'It ran, but what it handed on does not fit its output.js: the nodes after it may get nothing they can use.';
  for (const node of fed) node.plain ??= 'It ran, but what it was handed does not fit its input.js: what it made of it may be empty or wrong.';
  const named = (some: ReportNode[]) => some.map((node) => `"${node.label}"`).join(', ');
  let summary: string;
  if (result.status === 'success' && off.length) {
    summary = `It ran, but ${named(off)} did not hand on what ${off.length > 1 ? 'their output.js say' : 'its output.js says'}: what comes after may be empty or wrong.`;
  } else if (result.status === 'success' && fed.length) {
    summary = `It ran, but ${named(fed)} ${fed.length > 1 ? 'were not handed what their input.js say' : 'was not handed what its input.js says'}: what comes after may be empty or wrong.`;
  } else if (result.status === 'success' && bare.length) {
    summary = `It ran, but nothing arrived at ${bare.map((node) => `"${node.label}"`).join(', ')}: what ${bare.length > 1 ? 'they show' : 'it shows'} is empty. `
      + 'Tick "Include what went in and out" in the report to see what each node handed on.';
  } else if (result.status === 'success') summary = `It went well: ${done} of ${reported.length} nodes ran.`;
  else if (result.status === 'cancelled') summary = 'It was stopped before it was done.';
  else if (failed) summary = `${result.status === 'partial' ? 'Part of it worked, but' : 'It stopped:'} "${failed.label}" failed. ${failed.plain ?? ''}`.trim();
  else if (result.status === 'partial' && partly.length) summary = `It ran, but part of it failed: ${partly.map((node) => `"${node.label}"`).join(', ')}. ${partly[0].plain ?? ''}`.trim();
  else summary = result.error ? `It failed: ${explain(result.error)}` : 'It did not finish.';
  return { status: result.status, summary, nodes: reported, failed, well: result.status === 'success' && !off.length && !fed.length && !bare.length };
}

/** Nothing to show: no value, an empty text, an empty list, an object without a key. */
function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  return typeof value === 'object' && Object.keys(value).length === 0;
}

const MARK: Record<ReportStatus, string> = { success: 'ok', partial: 'partly', error: 'FAILED', skipped: 'did not run', held: 'stood still' };

/** The report as text to paste into a message: no data of the person's unless *withData*. */
export function reportText(report: RunReport, context: { tool: string; ai: string; withData: boolean }): string {
  const lines = [
    'Tell & Wire run report',
    `Tool: ${context.tool}`,
    `AI: ${context.ai}`,
    `Result: ${report.status} — ${report.summary}`,
    '',
    'Nodes, in the order they ran:',
  ];
  report.nodes.forEach((node, index) => {
    lines.push(`${index + 1}. [${MARK[node.status]}] ${node.label}${node.plain ? ` — ${node.plain}` : ''}`);
    if (node.error) lines.push(...node.error.split('\n').map((line) => `     ${line}`));
    for (const message of node.messages.slice(0, 3)) lines.push(`     note: ${message}`);
    if (context.withData && node.inputs) lines.push('     in:', ...node.inputs.split('\n').map((line) => `       ${line}`));
    if (context.withData && node.outputs) lines.push('     out:', ...node.outputs.split('\n').map((line) => `       ${line}`));
  });
  if (!context.withData) lines.push('', '(What went in and out of the nodes is not included.)');
  return lines.join('\n');
}
