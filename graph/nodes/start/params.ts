// What a start point that a call starts takes, named: its parameters.
//
// A call -- a script, a model over MCP, the command line -- sends a start point values under
// names of its own, and the first node wired to it reads what it needs (`StartNodeDefinition`).
// A start point may also *declare* what it takes: a name, a kind, a default, whether it must be
// there, a sentence. Then the command line can say it -- `tool --text "One sentence." --words 20`
// -- and answer `tool --help`, check what was given and fill in the defaults, and the same
// declaration tells a person or a model what the tool wants. The values still go in as the one
// package, `{event, values}`: a declaration adds a way in and a promise, never another shape.
//
// Plain functions of plain values: no Node, so the editor shows the same sentence the command
// line says (`graph/` is neutral).

import { isStruct, type GraphNode } from '../../graph.ts';

/** What a parameter holds: text, a number, or a flag that is there or not. */
export const PARAM_TYPES = ['text', 'number', 'flag'] as const;
export type ParamType = (typeof PARAM_TYPES)[number];

/** One parameter of a start point. */
export interface Param {
  /** What it is called on the command line, `--name`, and in the package's values. */
  name: string;
  type: ParamType;
  /** What it is when nobody says: as typed. A flag's is "false" unless said. */
  default?: string;
  /** It must be given, there being no default. */
  required?: boolean;
  /** One sentence, for `--help` and for whoever reads the graph. */
  description?: string;
}

/**
 * Names the command line itself uses: a parameter called one of these would never be heard. `help` is
 * answered by the command line, whatever the tool.
 */
export const RESERVED_FLAGS = [
  'value', 'event', 'every', 'limit', 'keep', 'bundle', 'serve', 'port', 'editor', 'host', 'mcp', 'mcp-root', 'help',
] as const;

/** A name a person can type after two dashes: lower case, digits, `_` and `-`, starting with a letter. */
export const PARAM_NAME = /^[a-z][a-z0-9_-]*$/;

/** The parameters *node* declares: those that are well formed, in order. A start point of the GUI or of itself has none. */
export function paramsOf(node: Pick<GraphNode, 'config'>): Param[] {
  if (node.config.started_by !== 'call') return [];
  const declared = (node.config as Record<string, unknown>).params;
  if (!Array.isArray(declared)) return [];
  const found: Param[] = [];
  for (const one of declared) {
    if (!isStruct(one) || typeof one.name !== 'string' || !one.name) continue;
    const type = PARAM_TYPES.includes(one.type as ParamType) ? one.type as ParamType : 'text';
    found.push({
      name: one.name, type,
      ...(typeof one.default === 'string' && one.default !== '' ? { default: one.default } : {}),
      ...(one.required === true ? { required: true } : {}),
      ...(typeof one.description === 'string' && one.description.trim() ? { description: one.description.trim() } : {}),
    });
  }
  return found;
}

/** What is wrong with *params* as a list, in sentences: a name nobody can type, taken twice, or the command line's own. */
export function paramProblems(params: Param[]): string[] {
  const said: string[] = [];
  const seen = new Set<string>();
  for (const { name, type, default: given, required } of params) {
    if (!PARAM_NAME.test(name)) said.push(`"${name}" cannot be typed as --${name}: lower case letters, digits, _ and -, starting with a letter.`);
    else if ((RESERVED_FLAGS as readonly string[]).includes(name)) said.push(`--${name} is the command line's own, so a parameter called "${name}" would never be heard.`);
    if (seen.has(name)) said.push(`"${name}" is declared twice.`);
    seen.add(name);
    if (type === 'number' && given !== undefined && !Number.isFinite(Number(given))) said.push(`The default of "${name}" is not a number: "${given}".`);
    if (type === 'flag' && given !== undefined && !['true', 'false'].includes(given)) said.push(`The default of "${name}" is a flag: true or false, not "${given}".`);
    if (required && given !== undefined) said.push(`"${name}" is required and has a default: it can never be missing.`);
  }
  return said;
}

/**
 * What was given on the command line: each `--name value` or `--name=value` by name, `true` for a name with
 * no value -- how a flag is given.
 */
export type Flags = Record<string, string | true>;

/** *given* as the parameter *param* holds it, or why it is not one. */
function typed(param: Param, given: string | true): string | number | boolean {
  if (param.type === 'flag') {
    if (given === true || given === 'true') return true;
    if (given === 'false') return false;
    throw new Error(`--${param.name} is a flag: give it alone, or as --${param.name}=false, not "${given}".`);
  }
  if (given === true) throw new Error(`--${param.name} wants a value: --${param.name} ${param.type === 'number' ? '20' : '"…"'}.`);
  if (param.type === 'number') {
    const number = Number(given);
    if (!given.trim() || !Number.isFinite(number)) throw new Error(`--${param.name} wants a number, not "${given}".`);
    return number;
  }
  return given;
}

/**
 * The package's values for what was given: every parameter by its name, typed, the default where nothing was
 * given, and nothing for one that has neither. Refused, in a sentence, for a name that is no parameter, a
 * value of the wrong kind, and a parameter that must be given and was not.
 */
export function valuesFromFlags(params: Param[], flags: Flags): Record<string, unknown> {
  const names = params.map((param) => `--${param.name}`);
  for (const given of Object.keys(flags)) {
    if (!params.some((param) => param.name === given)) {
      throw new Error(`Unknown option "--${given}". `
        + (names.length ? `This tool takes ${names.join(', ')} -- and --help says what each is.` : 'This tool takes none.'));
    }
  }
  const values: Record<string, unknown> = {};
  const missing: string[] = [];
  for (const param of params) {
    const given = flags[param.name];
    if (given !== undefined) values[param.name] = typed(param, given);
    else if (param.type === 'flag') values[param.name] = param.default === 'true';
    else if (param.default !== undefined) values[param.name] = typed(param, param.default);
    else if (param.required) missing.push(`--${param.name}`);
  }
  if (missing.length) throw new Error(`Missing ${missing.join(', ')}: ${missing.length > 1 ? 'they are' : 'it is'} required. --help says what ${missing.length > 1 ? 'each is' : 'it is'}.`);
  return values;
}

/** One line of `--help` for *param*: `--words <number>  how many words (default 20)`. */
function lineOf(param: Param): [string, string] {
  const left = param.type === 'flag' ? `--${param.name}` : `--${param.name} <${param.type}>`;
  const notes = [
    param.required ? 'required' : '',
    param.type === 'flag' ? '' : param.default !== undefined ? `default ${param.default}` : '',
  ].filter(Boolean).join(', ');
  const right = [param.description ?? '', notes ? `(${notes})` : ''].filter(Boolean).join(' ');
  return [left, right];
}

/**
 * What `--help` says of a tool: its name and what it does, how to run it, each parameter -- aligned -- and that a
 * value of `-` is read from standard input.
 */
export function usageOf(tool: { name: string; description?: string; command: string; params: Param[] }): string {
  const lines = [tool.name];
  if (tool.description?.trim()) lines.push(tool.description.trim());
  lines.push('', `Usage: ${tool.command}${tool.params.map((param) => (param.required ? ` --${param.name} …` : '')).join('')}${tool.params.some((p) => !p.required) ? ' [options]' : ''}`);
  if (tool.params.length) {
    const rows = tool.params.map(lineOf);
    const width = Math.max(...rows.map(([left]) => left.length));
    lines.push('', 'Options:', ...rows.map(([left, right]) => `  ${left.padEnd(width)}${right ? `  ${right}` : ''}`));
    if (tool.params.some((param) => param.type === 'text')) lines.push('', 'A text of - is read from standard input: cat notes.txt | ' + tool.command + ' --' + (tool.params.find((param) => param.type === 'text')!.name) + ' -');
  }
  lines.push('', 'The result is printed as JSON on stdout; questions and progress go to stderr.');
  return lines.join('\n');
}
