import { NodeRunner } from '../NodeRunner.ts';
import type { Runtime } from '../../../../../graph/nodes/Runtime.ts';
import type { GraphNode, Port } from '../../../../../graph/graph.ts';
import { ERROR_PORT } from '../../../../../graph/wiring.ts';
import { definitionExample } from '../../../../../graph/files/definition.ts';
import type { AiNodeDefinition } from '../../../../../graph/nodes/ai/AiNodeDefinition.ts';
import { askModel, type Repair } from './ask.ts';

/**
 * How often a node asks again when its answer cannot be used, unless the node or the
 * machine (`TW_AI_REPAIRS`) says otherwise. Two: a model that gets it wrong twice more is
 * not about to get it right, and each ask is a call somebody pays for or waits for.
 */
const DEFAULT_REPAIRS = 2;

/**
 * Asks the model.
 *
 * It is told its instructions -- its prompt.md, or while it has none the
 * standard, with its description and its output definition filled in -- and
 * then **everything wired into it**, in port order, each input under its port
 * id where there are several (see `prompt.ts`). Not a port named `prompt`: a
 * node with two inputs wired to two different upstream nodes should send both,
 * and naming one of them would make the second silently disappear.
 *
 * Its answer is text -- on "output" without an output definition, on the one
 * output a definition names where that holds text -- or, where the definition
 * names several outputs or a value that is not text, it maps whatever arrives
 * onto that format: the answer is JSON keyed as the definition's example is,
 * and each key goes out on the output port of that name. A model is asked for
 * JSON only where nothing less says what goes out.
 *
 * Running once per item is not here. A node that fans out does so the same way
 * a code node does, in the executor, because "run this once per element" is a
 * property of the graph rather than of asking a model.
 */
export class AiNodeRunner extends NodeRunner<AiNodeDefinition> {
  /**
   * The model is asked, here: the process that holds the keys makes the call. The
   * answer is text on its one output -- or, to a node whose output definition names
   * several outputs or a value that is not text, the JSON it writes out, each
   * key on its own port (`jsonObject`): a node that maps whatever arrives onto
   * a fixed format hands on that format, not a text of it.
   *
   * A cheap or a small model gets this wrong now and then, in ways that fail far from
   * the cause: a sentence where the JSON should be, a key left out, a list that is
   * text, an answer that ran into the length limit and was cut off. Such an answer is
   * not handed on. The model is asked again, shown what it said and what was wrong,
   * up to `repairs` more times. An answer that is a JSON object but still lacks
   * something after that is kept -- what it has is more than nothing, and it is what
   * would have gone on before; an answer that is no JSON object fails the node.
   * (Failures of the line and empty answers are the provider's, `ai/providers.ts`.)
   */
  async execute(node: GraphNode, inputs: Record<string, unknown>, runtime: Runtime) {
    const settings = this.kind.config(node);
    const order = node.inputs.map((port) => port.id);
    const repairs = settings.repairs ?? runtime.aiRepairs ?? DEFAULT_REPAIRS;
    const ports = answerPorts(node);
    let repair: Repair | undefined;
    let kept: Record<string, unknown> | undefined;
    for (let tries = 1; ; tries += 1) {
      let answer: string;
      try {
        answer = await askModel(settings, inputs, runtime, order, repair);
      } catch (error) {
        if (!ranOutOfLength(error) || tries > repairs) throw error;
        repair = { answer: '', problem: 'it ran past the length limit and was cut off', reminder: 'Make it much shorter, and finish it.' };
        runtime.report?.({ type: 'activity', node_id: node.id, message: `asked again (${tries} of ${repairs + 1}): the answer was cut off` });
        continue;
      }
      if (settings.textOn) return { [settings.textOn]: answer };

      const object = jsonObject(answer);
      const problems = object ? usable(object, ports) : ['it was not a JSON object'];
      if (object && !problems.length) return coerced(object, ports);
      if (object) kept = object;
      const said = problems.join('; ');
      if (tries > repairs) {
        if (!kept) throw new Error(`${notJson(answer)}${repairs ? ` It was asked ${tries} times.` : ''}`);
        runtime.report?.({ type: 'activity', node_id: node.id, message: `kept the last answer after ${tries} tries: ${said}` });
        return coerced(kept, ports);
      }
      repair = {
        answer,
        problem: said,
        reminder: `Answer with the JSON object alone${ports.length ? `, with these keys: ${ports.map((port) => port.id).join(', ')}` : ''}.`,
      };
      runtime.report?.({ type: 'activity', node_id: node.id, message: `asked again (${tries} of ${repairs + 1}): ${said}` });
    }
  }
}

/**
 * A model's answer as the JSON object it is, or null: what the node writes out, key by
 * key. The object is taken where the answer holds it -- its first fenced
 * block, else from its first `{` to its last `}`, since a model asked for JSON
 * and nothing else still says "Here is the result:" around it -- and, where
 * the model answered in the output definition's own format,
 * `module.exports = …;` and all, read the way that file is read. An answer
 * that holds no JSON object is not handed on as text: it would reach the node
 * after it as a string where a record was promised, and fail there, further
 * from why.
 */
function jsonObject(answer: string): Record<string, unknown> | null {
  const said = answer.trim();
  const fenced = /```[^\n`]*\n([\s\S]*?)\n?[ \t]*```/.exec(said)?.[1];
  const braced = said.slice(said.indexOf('{'), said.lastIndexOf('}') + 1);
  const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  for (const candidate of [fenced, braced]) {
    if (!candidate?.trim()) continue;
    try {
      const value: unknown = JSON.parse(candidate);
      if (isObject(value)) return value;
    } catch {
      // Not this one: the next place the object may be.
    }
  }
  const asFile = definitionExample(fenced ?? said);
  const value = 'example' in asFile ? asFile.example : undefined;
  return isObject(value) ? value : null;
}

/** What a node says when its answer holds no JSON object, quoting how it began. */
function notJson(answer: string): string {
  const said = answer.trim();
  const start = said.length > 160 ? `${said.slice(0, 160)}…` : said;
  return `The model's answer is not the JSON object this node's output.js asks for. It began: "${start}". `
    + 'Say in its prompt that the answer is that JSON and nothing else -- or, for a plain text answer, give its output.js one output that holds text.';
}

/** The ports an answer goes out on: all but the one a node that catches its failures grows. */
function answerPorts(node: GraphNode): Port[] {
  return node.outputs.filter((port) => port.id !== ERROR_PORT);
}

const asksForList = (port: Port): boolean => port.multi || port.data_type === 'list';

/**
 * What is wrong with an answer that is a JSON object, as sentences -- none: it is fine. A key
 * left out, a list that is not one, a number that is not a number. A node with one output
 * whose answer holds none of its keys is not wrong: the executor takes the whole object
 * for that output (`reconcileOutputs`). A number or a true that came as text is not wrong
 * either: `coerced` makes it what it was meant to be.
 */
function usable(object: Record<string, unknown>, ports: Port[]): string[] {
  if (ports.length === 1 && !(ports[0].id in object)) return [];
  const problems: string[] = [];
  const missing = ports.filter((port) => !(port.id in object)).map((port) => port.id);
  if (missing.length) problems.push(`the key${missing.length > 1 ? 's' : ''} ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} missing`);
  for (const port of ports) {
    if (!(port.id in object)) continue;
    const value = object[port.id];
    if (asksForList(port)) {
      if (!Array.isArray(value)) problems.push(`${port.id} must be a list`);
    } else if (port.data_type === 'number' && typeof value !== 'number' && !(typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))) {
      problems.push(`${port.id} must be a number`);
    } else if (port.data_type === 'boolean' && typeof value !== 'boolean' && !(value === 'true' || value === 'false')) {
      problems.push(`${port.id} must be true or false`);
    }
  }
  return problems;
}

/** The answer with a number or a true/false that came as text made what it was meant to be. */
function coerced(object: Record<string, unknown>, ports: Port[]): Record<string, unknown> {
  const out = { ...object };
  for (const port of ports) {
    const value = out[port.id];
    if (asksForList(port) || typeof value !== 'string') continue;
    if (port.data_type === 'number' && value.trim() !== '' && Number.isFinite(Number(value))) out[port.id] = Number(value);
    else if (port.data_type === 'boolean' && (value === 'true' || value === 'false')) out[port.id] = value === 'true';
  }
  return out;
}

/** The provider says it plainly: the model was cut off by its token budget (`OutOfBudgetError`). */
function ranOutOfLength(error: unknown): boolean {
  return error instanceof Error && error.name === 'OutOfBudgetError';
}
