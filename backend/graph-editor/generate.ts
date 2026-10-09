// Writing a node's files with a model.
//
// One entry point for every ✨: a node's input definition (input.js), its
// output definition (output.js), and its body -- code, an ai node's prompt, a
// data node's data. What is sent is the standard prompt for that ✨
// (`authoring/prompts.ts`) with its variables filled from what the node and the
// graph hold (`brief.ts`), what the person said to the file's chat (`ask`), and
// after it the frame (`generatePrompts.ts`, where all the prose is): the file
// format and how to answer, which is what makes an answer usable and not what
// the person asks.
//
// A file can also be changed rather than written anew (`refine`): a chat's
// message sends the file there is and what to change. For a body that includes
// its output.js, what came of it, and the answer brings the node's text back
// restated to fit it -- and a new output.js where the change outgrows the one
// there is, which the body is then held to; ✨ Fix sends how it failed, and gets
// the repair a generation makes of its own first attempt (an output.js that
// cannot be read, corrected with it). Same prompt, same verify-and-repair: not
// a second generator.
//
// Code is not one call. It is written, run once on the example in the node's
// input.js, held to its output.js, and repaired once with the evidence when
// that fails -- because a wrong output key is the single most common way
// generated code "works" and still delivers nothing, and all of it becomes
// knowable the moment the code executes. The second pass is not "try again";
// it is "here is exactly what went wrong", which is why one extra round is
// usually enough and why there is no third. A definition whose example cannot
// be read is sent back once the same way.
//
// Every call a generation makes is recorded and handed back: the editor shows
// what was sent, and keeps it in the node's history.md.

import type { AiRequest, AiService, CodeService, FileService, Runtime } from '../../graph/nodes/Runtime.ts';
import type { NodeRunner, Runners } from '../../graph/nodes/NodeRunner.ts';
import { PLAIN_ASK } from '../../graph/nodes/ai/ask.ts';
import type { Generation, Language } from '../../graph/authoring/generation.ts';
import { STANDARD_PROMPTS, fillPrompt, type PromptKind } from '../../graph/authoring/prompts.ts';
import { definitionExample, definitionKeys, misfits, typedefKeys, unreadableOutput, type Definitions } from '../../graph/authoring/definition.ts';
import { filePorts } from '../../graph/execution/fileInputs.ts';
import { fileContent, isInlineFile } from '../../graph/nodes/documents.ts';
import { runsPerItem } from '../../graph/execution/batching.ts';
import { ERROR_PORT, names } from '../../graph/execution/wiring.ts';
import { parseGraph, type Graph, type GraphNode } from '../../graph/graph.ts';
import { registry } from '../../graph/nodes/registry.ts';
import { AUTHORING_KEYS } from '../../graph/authoring/handedOn.ts';
import { exchangeEntry, withExchange } from '../../graph/authoring/history.ts';
import { BUDGET, clip, variables } from './brief.ts';
import { GRAPH_SYSTEM } from './graphPrompt.ts';
import {
  OUTGROWN, SYSTEMS, bodyChange, changePrompt, codeChange, definitionChange, frame, mendPrompt, repairPrompt, type OutputAsked, type Shape,
} from './generatePrompts.ts';
import type { AICall, GenerateRequest, GenerateResponse, ProbeReport, Target } from '../app/api.ts';

export class GenerationRefused extends Error {}

/** Thrown by the preview "model" at the first request: everything up to it was real. */
class PreviewReached extends Error {}

/** A model that never answers: the request is recorded and the generation stops there. */
const PREVIEW_AI: AiService = {
  async complete(): Promise<string> {
    throw new PreviewReached('preview');
  },
};

// ---------------------------------------------------------------------------
// The transcript
// ---------------------------------------------------------------------------

/** An AI service that writes down every call it makes, for one generation. */
function recording(ai: AiService, calls: AICall[]): AiService {
  return {
    async complete(request: AiRequest): Promise<string> {
      const entry: AICall = {
        provider: request.provider ?? '',
        model: request.model ?? '',
        system: request.system ?? '',
        prompt: request.prompt,
        // Counted here rather than in the browser: "how much did I send" is
        // the question a context-window error raises.
        sent_chars: (request.system ?? '').length + request.prompt.length,
        reply: null, reply_chars: 0, seconds: 0, error: null,
      };
      calls.push(entry);
      const started = Date.now();
      try {
        const reply = await ai.complete(request);
        entry.reply = reply;
        entry.reply_chars = reply.length;
        return reply;
      } catch (error) {
        entry.error = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        entry.seconds = Math.round((Date.now() - started) / 10) / 100;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// How an answer is read
// ---------------------------------------------------------------------------

/**
 * A fenced block after any info string (`javascript `, `js title="x"`, `c++`),
 * closed at the start of a line by a fence at least as long as the one that
 * opened it: code that writes "```" into a string does not end its own block
 * there, and a ```json example in instructions fenced with four backticks does
 * not end theirs.
 */
const FENCED = /(?<!`)(`{3,})[^\n`]*\n([\s\S]*?)\n[ \t]*\1`*/;
/** The same closed mid-line: only where no block is closed at the start of one. */
const FENCED_MID_LINE = /(?<!`)(`{3,})[^\n`]*\n([\s\S]*?)\1`*/;

/** An answer's first fenced block, Windows line ends and all, and what the answer says after it. */
function firstBlock(text: string): { code: string; after: string } | undefined {
  const plain = text.replace(/\r\n/g, '\n');
  const block = FENCED.exec(plain) ?? FENCED_MID_LINE.exec(plain);
  return block ? { code: block[2].trim(), after: plain.slice(block.index + block[0].length).trim() } : undefined;
}

export function firstCodeBlock(text: string): string {
  return firstBlock(text)?.code ?? '';
}

/** The file a model wrote, out of its answer: its first fenced block, or the whole answer where it wrote none. */
function fileIn(reply: string): string {
  return firstCodeBlock(reply) || reply.trim();
}

/** Every fenced block of an answer, in order, each closed at the start of a line (`FENCED`). */
function codeBlocks(reply: string): string[] {
  return [...reply.replace(/\r\n/g, '\n').matchAll(new RegExp(FENCED, 'g'))].map((match) => match[2].trim());
}

/** The text a changed body's answer restated, and the answer without it. */
function descriptionIn(raw: string): { description?: string; rest: string } {
  const match = /<description>([\s\S]*?)<\/description>/.exec(raw);
  if (!match) return { rest: raw };
  const description = match[1].trim();
  return { ...(description ? { description } : {}), rest: `${raw.slice(0, match.index)}${raw.slice(match.index + match[0].length)}`.trim() };
}

// ---------------------------------------------------------------------------
// Verify and repair
// ---------------------------------------------------------------------------

/** A probe is a smoke test, not a run: longer than this on one example is not something a repair fixes. */
const PROBE_TIMEOUT_MS = 25_000;

/** The report of a probe that did not run: nothing to try it on, or nothing that is tried. A fresh one each time. */
const notProbed = (): ProbeReport => ({ status: 'skipped', error: '', problems: [] });

/** A probe with no way to read files: what it asks a model cannot name one. */
const refuse = async (): Promise<never> => { throw new Error('No files here: this body is being tried on its example.'); };
const NO_FILES: FileService = { resolve: (path) => path, exists: async () => false, read: refuse, write: refuse, list: refuse };

async function probe(
  runtime: Runtime, target: Target, language: Language, body: string, sample: Record<string, unknown>,
): Promise<{ result: Record<string, unknown> | null; error: string }> {
  // Ended, not merely given up on: a generated body in an endless loop is a
  // process, and one per ✨ press left running is how a laptop gets warm.
  const stop = new AbortController();
  const clock = setTimeout(() => stop.abort(), PROBE_TIMEOUT_MS);
  clock.unref();
  try {
    // Run as a graph runs it (`graph/nodes/body.ts`): generated code that asks a
    // model through `node.llm` is tried with a `node` that can be asked.
    // What it asks is answered by the model that wrote it, which is the one
    // AI setting -- where the same call in a run goes, too.
    const ask = { ...PLAIN_ASK, provider: target.provider, model: target.model };
    const result = await language.run(body, { ...sample }, runtime, { signal: stop.signal, ask });
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      return { result: null, error: `run() returned ${Array.isArray(result) ? 'an array' : typeof result}, but it must return an object.` };
    }
    return { result, error: '' };
  } catch (error) {
    if (stop.signal.aborted) {
      return { result: null, error: `The function did not finish within ${PROBE_TIMEOUT_MS / 1000}s on its example.` };
    }
    return { result: null, error: (error instanceof Error ? error.message : String(error)).trim() };
  } finally {
    clearTimeout(clock);
  }
}

/**
 * What one call is tried on: the example in the node's input.js -- nothing,
 * for a node that takes nothing in -- or undefined when there is none to try
 * it on: then it is written and not tried.
 */
function exampleOf(shape: Shape): Record<string, unknown> | undefined {
  const input = shape.definitions?.input ?? '';
  if (!input.trim()) return shape.inputs.length ? undefined : {};
  const read = definitionExample(input);
  return 'example' in read ? read.example : undefined;
}

/**
 * The output.js an answer brought after its body, where one was asked for
 * (`OutputAsked`) and it can be taken: a later block that assigns
 * module.exports, readable, keeping the outputs other nodes are wired to, and
 * not the one there is. One that cannot be taken stays in the answer -- the
 * history keeps it -- and the body is held to the output.js there is.
 */
function outputIn(rest: string, shape: Shape): string | undefined {
  const brought = codeBlocks(rest).slice(1).find((block) => /\bmodule\.exports\s*=/.test(block));
  if (!brought || brought === (shape.definitions?.output ?? '').trim()) return undefined;
  return definitionFaults('output', brought, shape).length ? undefined : brought;
}

/** The body a model wrote, out of its answer; the text it restated where it was asked to; the output.js it brought where one was asked for. */
async function askForCode(ai: AiService, target: Target, prompt: string, shape: Shape, asked: OutputAsked): Promise<{ text: string; description?: string; output?: string }> {
  const { description, rest } = descriptionIn(await ai.complete({ prompt, system: shape.language!.system, ...target }));
  const output = asked ? outputIn(rest, shape) : undefined;
  return { text: fileIn(rest), ...(description ? { description } : {}), ...(output ? { output } : {}) };
}

/** A node as a first attempt left it, for its repair: the text a change restated, the output.js it brought. */
interface Left { description?: string; output?: string }

/**
 * Write code and, when there is an example, verify it by running it on that
 * and holding what it returns to the output definition -- the one the answer
 * brought with it (*asked*), where it brought one.
 *
 * The code handed back is always the best one obtained: pass 2's if it improved
 * things, pass 1's otherwise -- a failed repair never leaves the user with
 * something worse than the first attempt. *prompt* puts a pass's evidence into
 * the prompt: *opening*, for the first -- a change to make, a failure to fix,
 * or nothing -- and for a repair, how the first attempt failed, written from
 * the node as the first attempt left it. *change* is the change asked for,
 * which the repair keeps.
 *
 * **A change is held to the shape of an output.js only where it brought the
 * one it was written to.** Held to the one from before it, the repair turned
 * the change back -- a chart's figure became the old config again, under the
 * text restated for the figure. So it is held to running and to returning
 * every output, and where it does not fit the old output.js that is said, not
 * repaired: the attempt that holds the change is kept.
 */
async function writeVerifiedCode(
  ai: AiService, runtime: Runtime, target: Target, shape: Shape,
  prompt: (evidence: string, asked: OutputAsked, left?: Left) => string, opening: string, change: string, asked: OutputAsked,
): Promise<{ text: string; description?: string; output?: string; probe: ProbeReport }> {
  const first = await askForCode(ai, target, prompt(opening, asked), shape, asked);
  const sample = exampleOf(shape);
  if (!sample) return { ...first, probe: notProbed() };
  const output = first.output ?? shape.definitions?.output ?? '';
  const ports = first.output ? definitionKeys(first.output) : shape.outputs;
  const strict = !change || first.output !== undefined;
  // An output.js that cannot be read is nothing a repair of the code mends: it is said, not repaired.
  const unreadable = unreadableOutput(output);

  /**
   * Run it, then ask: did it run, did it return every output, does it fit
   * output.js. *mend* is what a repair is asked to put right: what the code
   * can, and -- for a change -- nothing that would turn it back.
   */
  const verdict = async (body: string) => {
    const ran = await probe(runtime, target, shape.language!, body, sample);
    if (!ran.result) return { ...ran, problems: [] as string[], mend: [] as string[], reached: 0 };
    const absent = ports.filter((port) => !(port in ran.result!));
    const missing = absent.map((port) => `it returns no "${port}"`);
    const misfit = misfits(ran.result, output).filter((line) => !absent.some((port) => line === `output "${port}" is missing`));
    const mend = [...missing, ...(strict ? misfit.filter((line) => line !== unreadable) : [])];
    const problems = [...missing, ...misfit, ...(!strict && misfit.length ? [OUTGROWN] : [])];
    // How far it got: not at all, with something the code can mend, or as far as the code goes.
    return { ...ran, problems, mend, reached: mend.length ? 1 : 2 };
  };
  /** The report: *status* where nothing is left to say, else failed. */
  const reportOf = (found: Awaited<ReturnType<typeof verdict>>, status: ProbeReport['status']): ProbeReport => (
    { status: found.problems.length ? 'failed' : status, error: found.error, problems: found.problems }
  );

  const attempt = await verdict(first.text);
  if (attempt.reached === 2) return { ...first, probe: reportOf(attempt, 'ok') };

  let second: { text: string };
  try {
    // A change is repaired as the node the first attempt left: the text it
    // restated, which says the change, and the output.js it brought -- the text
    // from before asks for the body the change was to replace.
    const left = { description: first.description, output: first.output };
    second = await askForCode(ai, target, prompt(repairPrompt(first.text, sample, attempt.error, attempt.mend, change), undefined, left), shape, undefined);
  } catch {
    // The repair pass is a bonus, never a reason to fail the request.
    return { ...first, probe: reportOf(attempt, 'failed') };
  }
  // The repair is asked for code alone: what the change made of the text, and its output.js, stand.
  const repaired = { text: second.text, ...(first.description ? { description: first.description } : {}), ...(first.output ? { output: first.output } : {}) };
  const again = await verdict(second.text);
  if (again.reached === 2) return { ...repaired, probe: reportOf(again, 'repaired') };
  // Still not right. Keep the attempt that got further -- one that misses a
  // key beats one that does not run -- and say what remains.
  return again.reached >= attempt.reached
    ? { ...repaired, probe: reportOf(again, 'failed') }
    : { ...first, probe: reportOf(attempt, 'failed') };
}

/**
 * What is wrong with a definition a model wrote: its example cannot be read,
 * an input.js names an input the node does not have, an output.js leaves out
 * an output other nodes are wired to.
 */
function definitionFaults(kind: 'input' | 'output', text: string, shape: Shape): string[] {
  const read = definitionExample(text);
  if ('problem' in read) return [`Its example cannot be read: ${read.problem}.`];
  const keys = Object.keys(read.example);
  if (kind === 'input') {
    const stray = keys.filter((key) => !shape.inputs.includes(key));
    return stray.length ? [`It names ${names(stray)}, which ${stray.length > 1 ? 'are' : 'is'} not among the inputs: ${names(shape.inputs)}.`] : [];
  }
  const lost = shape.wired.filter((port) => !keys.includes(port));
  const faults = lost.length ? [`It leaves out ${names(lost)}, which other nodes are wired to and read by that id.`] : [];
  // A JSDoc naming two outputs over an example that wraps them in one key: the
  // ports follow the example, so the node had one output where it said two.
  const said = typedefKeys(text, 'Output');
  if (said.length && (said.length !== keys.length || said.some((key) => !keys.includes(key)))) {
    faults.push(`Its example is keyed ${names(keys)}, and its @typedef Output names ${names(said)}: key the example by exactly the outputs the JSDoc names, one key each, with nothing wrapped around them.`);
  }
  return faults;
}

// ---------------------------------------------------------------------------
// The one entry point
// ---------------------------------------------------------------------------

interface GenerateDeps {
  ai: AiService;
  code: CodeService;
  /** Reads the files ✨ Input and ✨ Output are given, where the request does not bring their text. */
  files?: FileService;
  /** The elements, asked what a node's kind writes and whether it has definitions. */
  elements: Runners;
  target: Target;
  /**
   * Where to write the transcript, if somebody is watching it.
   *
   * A generation is several calls -- write, probe, repair -- over a minute or
   * more, and until it returns there is nothing to see. Handing the array in
   * lets a caller read it while it fills, which is what the editor polls to
   * show the prompt and each step as they happen.
   */
  calls?: AICall[];
}

/** What `GenerateRequest.write` may ask for. */
const WRITES = ['input', 'output', 'body'] as const;

/**
 * Each file's text, the start of it, read here where the request did not bring
 * it, as a run reads it (`documents.ts`); one that cannot be read, said so. A
 * picture or a PDF is handed on as itself, so what is written from it is told
 * the shape a run hands over -- a `data:` URL -- and not its bytes.
 */
async function withTexts(given: { path: string; text?: string }[] | undefined, files: FileService | undefined): Promise<{ path: string; text?: string }[] | undefined> {
  if (!given?.length || !files) return given;
  return Promise.all(given.map(async (file) => {
    if (file.text !== undefined || !file.path.trim()) return file;
    try {
      const content = await fileContent(file.path, files);
      return {
        path: file.path,
        text: isInlineFile(content)
          ? `${content.slice(0, content.indexOf(',') + 1)}... -- the file itself, as a data: URL; an AI node sends it to the model as the file it is`
          : content.slice(0, BUDGET.files + 1),
      };
    } catch {
      return file;
    }
  }));
}

/**
 * *text*, an input.js, with each file handed as itself whole in its example.
 * The model was shown no more than the start of each (`withTexts`), and may
 * write that start or an invented text in its place, but ▶ Try and `test`
 * run the node on the example, and a run hands such a port the file itself:
 * the example of each port that reads (*ports*) is set, in order, to the
 * pictures and PDFs it was given.
 */
async function wholeFiles(text: string, given: { path: string }[] | undefined, ports: string[], files: FileService | undefined): Promise<string> {
  if (!given?.length || !ports.length || !files) return text;
  const inline = (await Promise.all(given.map((file) => fileContent(file.path, files).catch(() => '')))).filter(isInlineFile);
  const at = text.indexOf('module.exports');
  if (at < 0) return text;
  let example = text.slice(at);
  ports.forEach((port, index) => {
    if (!inline[index]) return;
    example = example.replace(new RegExp(String.raw`("${port}"\s*:\s*)"(?:[^"\\]|\\.)*"`), (_, key: string) => `${key}${JSON.stringify(inline[index])}`);
  });
  return text.slice(0, at) + example;
}

/** One ✨ as its steps share it: the node, what is written for it, and how the model is asked. */
interface Job {
  request: GenerateRequest;
  node: GraphNode;
  spec: Generation;
  write: (typeof WRITES)[number];
  kind: PromptKind;
  shape: Shape;
  /** The prompt as sent (`promptFor`). */
  prompt: (evidence: string, asked: OutputAsked, left?: Left) => string;
  /** The model, every call written down in *calls*; for a preview, one that stops at the first. */
  ai: AiService;
  calls: AICall[];
  deps: GenerateDeps;
}

/** The node a request names and what ✨ writes for it -- or why it writes nothing. */
function whatIsAsked(given: GenerateRequest, elements: Runners) {
  const node = given.node as GraphNode | undefined;
  if (!node?.node_type) throw new GenerationRefused('A generation names the node it writes for.');
  const element = elements.node(node.node_type);
  const spec: Generation | undefined = element?.generation();
  if (!element || !spec) throw new GenerationRefused(`A ${node.node_type} node has nothing ✨ writes.`);
  const write = given.write ?? 'body';
  if (!(WRITES as readonly string[]).includes(write)) {
    throw new GenerationRefused(`'${String(write)}' is nothing ✨ writes: it writes a node's ${WRITES.join(', ')}.`);
  }
  const definitions = element.definitions(node);
  if (write !== 'body' && !definitions) throw new GenerationRefused(`A ${node.node_type} node has no input or output definition.`);
  return { node, element, spec, write, definitions };
}

/** What the node is, as far as how to answer depends on it. */
function shapeOf(
  node: GraphNode, element: NodeRunner<unknown>, spec: Generation, definitions: Definitions | undefined, request: GenerateRequest, elements: Runners,
): Shape {
  return {
    inputs: node.inputs.map((port) => port.id),
    // The error port is the executor's (`catch_errors`): filled when the body
    // fails, never returned by it. Left in, the skeleton returned it and the
    // rule said the keys must include it, so correct code was reported as
    // missing a key and "repaired".
    outputs: node.outputs.map((port) => port.id).filter((id) => id !== ERROR_PORT),
    wired: Object.keys(request.output_targets ?? {}).filter((id) => id !== ERROR_PORT),
    fed: Object.keys(request.input_sources ?? {}),
    reads: filePorts(node, elements),
    perItem: runsPerItem(node, element.batchMode(node)),
    definitions,
    json: element.texts(node).some((text) => text.field === spec.fields.body && text.json === true),
    ...(spec.language ? { language: spec.language } : {}),
  };
}

/**
 * The prompt as sent: the template filled -- for a repair, from the node as
 * the first attempt left it (*left*: the text a change restated, the
 * output.js it brought) -- then what the person said to the file's chat
 * (`request.ask`), then *evidence*, then the frame, which says what may come
 * back besides the body (*asked*).
 */
function promptFor(node: GraphNode, request: GenerateRequest, write: Job['write'], kind: PromptKind, shape: Shape): Job['prompt'] {
  const said = request.ask?.trim();
  // ✨ Input and ✨ Output write their file anew, from the text: shown the one
  // there was, a model copied it -- a description that named its output
  // "optimisation" kept "output" through three presses.
  const anew = write === 'input' || write === 'output'
    ? { ...request, node: { ...node, config: { ...node.config, [`${write}_definition`]: '' } } }
    : request;
  const values = variables(anew, shape.reads);
  return (evidence, asked, left = {}) => {
    const now = {
      ...node,
      ...(left.description ? { description: left.description } : {}),
      ...(left.output ? { config: { ...node.config, output_definition: left.output } } : {}),
    };
    const held = left.output ? { ...shape, outputs: definitionKeys(left.output), definitions: { input: shape.definitions?.input ?? '', output: left.output } } : shape;
    return [
      fillPrompt(STANDARD_PROMPTS[kind], left.description || left.output ? variables({ ...request, node: now }, shape.reads) : values),
      said ? `## What is asked of it\n${said}` : '',
      evidence, frame(kind, held, !!request.refine?.change?.trim(), asked),
    ].filter(Boolean).join('\n\n');
  };
}

/** What is asked, checked and made ready to be written. */
async function jobOf(given: GenerateRequest, deps: GenerateDeps): Promise<Job> {
  const { node, element, spec, write, definitions } = whatIsAsked(given, deps.elements);
  const request = write === 'input' ? { ...given, input_files: await withTexts(given.input_files, deps.files) }
    : write === 'output' ? { ...given, output_files: await withTexts(given.output_files, deps.files) } : given;
  const kind: PromptKind = write === 'body' ? spec.kind : write;
  if (kind === 'code' && !spec.language) throw new GenerationRefused(`A ${node.node_type} node runs code and names no language it is written in.`);
  const shape = shapeOf(node, element, spec, definitions, request, deps.elements);
  const calls: AICall[] = deps.calls ?? [];
  // A preview runs every step a generation does up to the model, and stops
  // there: the request it hands back is the request, not a second rendering
  // of it that could differ.
  const ai = recording(request.preview ? PREVIEW_AI : deps.ai, calls);
  return { request, node, spec, write, kind, shape, prompt: promptFor(node, request, write, kind, shape), ai, calls, deps };
}

/**
 * The Input and Output chats: the whole file, written from the text -- or, said
 * to change (`refine.change`), the file there is changed as said -- and asked
 * for once more, with what is wrong, where its example cannot be used.
 */
async function writeDefinition({ request, shape, prompt, ai, calls, deps }: Job, write: 'input' | 'output'): Promise<GenerateResponse> {
  const change = request.refine?.change?.trim();
  const opening = change ? definitionChange(`${write}.js`, shape.definitions?.[write] ?? '', change) : '';
  const complete = async (evidence: string) => fileIn(await ai.complete({ prompt: prompt(evidence, undefined), system: SYSTEMS[write], ...deps.target }));
  let text = await complete(opening);
  let faults = definitionFaults(write, text, shape);
  if (faults.length) {
    // Once, with what is wrong: a definition nobody can read is no definition.
    const again = await complete([opening, `Your last answer was this file:\n\n${text}\n\nIt cannot be used as it is: ${faults.join(' ')} Write the whole file again, corrected.`]
      .filter(Boolean).join('\n\n'));
    const left = definitionFaults(write, again, shape);
    if (left.length <= faults.length) [text, faults] = [again, left];
  }
  if (write === 'input') text = await wholeFiles(text, request.input_files, shape.reads, deps.files);
  return { result: text, probe: faults.length ? { status: 'failed', error: '', problems: faults } : notProbed(), calls };
}

/** What the node's body holds now, as text: fields as JSON. */
function bodyOf(node: GraphNode, spec: Generation): string {
  const held = node.config[spec.fields.body];
  return typeof held === 'string' ? held : held === undefined || held === null ? '' : JSON.stringify(held, null, 2);
}

/**
 * What may come back besides the body (`OutputAsked`): the output.js a change
 * outgrows, or -- asked by ✨ Fix -- the one that cannot be read, corrected.
 * A data node keeps none. *mending* is why the one there is cannot be read.
 */
function mayBring({ request: { refine }, kind, shape }: Job): { output: string; mending: string | undefined; asked: OutputAsked } {
  const output = shape.definitions?.output ?? '';
  const change = kind !== 'data' && !!refine?.change?.trim();
  const mending = refine && !change && kind !== 'data' ? unreadableOutput(output) : undefined;
  return { output, mending, asked: change ? 'new' : mending ? 'mended' : undefined };
}

/**
 * The text a change restated: only a change asks for it, and a text a model
 * offered unasked is not written over the person's. One cut to less than half
 * is not the text restated but a summary of it, which loses what the files are
 * written from: the change is added to it instead.
 */
function restated({ request: { refine }, node }: Job, said: string | undefined): { description?: string } {
  const change = refine?.change?.trim();
  if (!said || !change) return {};
  const was = node.description.trim();
  return { description: said.length * 2 < was.length ? `${was}\n\n${change}` : said };
}

const withOutput = (brought: string | undefined) => (brought ? { output_definition: brought } : {});

/** A node's code: written, tried on its example and repaired once (`writeVerifiedCode`). */
async function writeCode(job: Job): Promise<GenerateResponse> {
  const { request: { refine }, node, spec, shape, prompt, ai, calls, deps } = job;
  const body = bodyOf(node, spec);
  const { output, mending, asked } = mayBring(job);
  const opening = !refine ? '' : mending ? mendPrompt('function', body, output, mending, refine) : codeChange(refine, body, exampleOf(shape), output);
  const probing = { code: deps.code, ai, files: NO_FILES };
  const written = await writeVerifiedCode(ai, probing, deps.target, shape, prompt, opening, refine?.change?.trim() ?? '', asked);
  return { result: written.text, probe: written.probe, calls, ...restated(job, written.description), ...withOutput(written.output) };
}

/** What the node's second file holds now, as text: a data node's example of its fields as rounds fill them. */
function exampleText(node: GraphNode, spec: Generation): string {
  const held = spec.fields.example ? node.config[spec.fields.example] : undefined;
  return typeof held === 'string' ? held : held === undefined || held === null ? '' : JSON.stringify(held, null, 2);
}

/** The struct as rounds fill it, out of a data answer's second block: one JSON object -- or nothing, and the node then shows its start. */
function filledIn(block: string | undefined): string | undefined {
  if (!block) return undefined;
  try {
    const parsed: unknown = JSON.parse(block);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? block : undefined;
  } catch {
    return undefined;
  }
}

/** An ai node's instructions or a data node's data: asked for once, and not tried. */
async function writeText(job: Job, kind: Exclude<PromptKind, 'code'>): Promise<GenerateResponse> {
  const { request: { refine }, node, spec, shape, prompt, ai, calls, deps } = job;
  const filled = exampleText(node, spec);
  const body = [bodyOf(node, spec), filled && `As rounds have filled it (example.json):\n${filled}`].filter(Boolean).join('\n\n');
  const { output, mending, asked } = mayBring(job);
  const what = kind === 'prompt' ? 'The instructions (prompt.md)' : 'The fields (data.json)';
  const evidence = !refine ? '' : mending ? mendPrompt('instructions', body, output, mending, refine)
    : bodyChange(refine, body, what, kind === 'prompt' ? output : undefined);
  const reply = await ai.complete({ prompt: prompt(evidence, asked), system: SYSTEMS[kind], ...deps.target });
  const { description, rest } = descriptionIn(reply);
  const text = fileIn(rest);
  if (shape.json) {
    try {
      JSON.parse(text);
    } catch (error) {
      throw new Error(`The data the model wrote is not JSON (${(error as Error).message}). It began: "${clip(text, 160)}".`);
    }
  }
  const example = kind === 'data' ? filledIn(codeBlocks(rest)[1]) : undefined;
  return { result: text, probe: notProbed(), calls, ...(example ? { example } : {}), ...restated(job, description), ...withOutput(asked ? outputIn(rest, shape) : undefined) };
}

/** What a step's failure comes to: a preview reaching its model is none; a refusal is the caller's; anything else a failure that brings its transcript. */
function failed(error: unknown, calls: AICall[]): GenerateResponse {
  if (error instanceof PreviewReached) {
    // Recorded as a failure by `recording`; it is not one.
    const last = calls.at(-1);
    if (last) last.error = null;
    return { result: '', probe: notProbed(), calls };
  }
  if (error instanceof GenerationRefused) throw error;
  // The failing generation is the one whose transcript is worth reading.
  throw new GenerationFailed(error instanceof Error ? error.message : String(error), calls);
}

/** Write one of a node's files, whatever kind of node it is: its input definition, its output definition, or its body. */
export async function generate(given: GenerateRequest, deps: GenerateDeps): Promise<GenerateResponse> {
  const job = await jobOf(given, deps);
  try {
    if (job.write !== 'body') return await writeDefinition(job, job.write);
    return job.kind === 'code' ? await writeCode(job) : await writeText(job, job.kind);
  } catch (error) {
    return failed(error, job.calls);
  }
}

export class GenerationFailed extends Error {
  readonly calls: AICall[];
  constructor(message: string, calls: AICall[]) {
    super(message);
    this.calls = calls;
  }
}

// ---------------------------------------------------------------------------
// A whole graph
// ---------------------------------------------------------------------------
/** A value as JSON with every object's keys in one order: two that say the same compare equal. */
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => (
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : item));

/** What a node says and holds, as a change could touch it: not where it stands, and not what only writing it needs. */
function said(node: unknown): string {
  try {
    const [parsed] = parseGraph({ nodes: [node], edges: [] }).nodes;
    const config = { ...parsed.config } as Record<string, unknown>;
    for (const key of AUTHORING_KEYS) delete config[key];
    return canonical([parsed.node_type, parsed.label, parsed.description, parsed.inputs, parsed.outputs, config]);
  } catch {
    // Not a node the route could read either: said once, where the document is parsed.
    return '';
  }
}

/**
 * *answer* with what it left out of *current* put back: the graph's name and
 * scheme, where each node it kept stands and the size it was drawn at, and
 * the page, when the answer says nothing of it. Left out, each fell to its
 * default -- a change to one node renamed the tool and moved every node into
 * the corner.
 *
 * And what only writing a node needs (`AUTHORING_KEYS`, its history above all)
 * is the project's, never the answer's: the model was not shown it, so each
 * node kept has its own back -- in the graphs nodes hold too -- and what the
 * answer says there is dropped. A node the change touched -- new, or different
 * in what it says or holds -- gets *entry* at the end of its history, as after
 * every ✨.
 */
function keptFrom(current: Graph, answer: unknown, entry: string): unknown {
  if (!answer || typeof answer !== 'object') return answer;
  const document = answer as { metadata?: object; nodes?: unknown; page?: unknown };
  const before = new Map(current.nodes.map((node) => [node.id, node]));
  const nodes = Array.isArray(document.nodes)
    ? document.nodes.map((node: unknown) => keptNode(node && typeof node === 'object' ? before.get(String((node as { id?: unknown }).id)) : undefined, node, entry))
    : document.nodes;
  return {
    ...document, metadata: { ...current.metadata, ...(document.metadata ?? {}) }, nodes,
    ...(document.page === undefined && current.page ? { page: current.page } : {}),
  };
}

/** One node of an answer, as `keptFrom` hands it on: *was* is the node of that id in the graph that was sent. */
function keptNode(was: GraphNode | undefined, given: unknown, entry: string): unknown {
  if (!given || typeof given !== 'object') return given;
  const node = { ...given } as Record<string, unknown> & GraphNode;
  const config = { ...(node.config && typeof node.config === 'object' ? node.config : {}) } as Record<string, unknown>;
  for (const key of AUTHORING_KEYS) delete config[key];
  if (was) {
    for (const key of ['position', 'width', 'height'] as const) if (node[key] === undefined) (node as Record<string, unknown>)[key] = was[key];
    for (const key of AUTHORING_KEYS) if (was.config[key] !== undefined) config[key] = was.config[key];
  }
  node.config = config as GraphNode['config'];
  const element = registry.node(String(node.node_type));
  const inside = element?.nestedGraph(node);
  if (element && inside) {
    const before = (was && registry.node(was.node_type)?.nestedGraph(was)) || parseGraph({ nodes: [], edges: [] });
    element.setNestedGraph(node, parseGraph(keptFrom(before, inside, entry)));
  }
  const keepsHistory = !!element?.texts(node).some((text) => text.field === 'history');
  if (keepsHistory && (!was || said(was) !== said(node))) config.history = withExchange(String(config.history ?? ''), entry);
  return node;
}

/**
 * Ask for a whole Graph DSL document: one designed from *description* -- or,
 * given the graph there is (*current*), that graph changed as *description*
 * says, its ids and whatever the change does not touch kept. A graph with no
 * nodes yet is designed, under its name. The caller parses the document.
 */
export async function generateGraph(
  description: string, deps: Pick<GenerateDeps, 'ai' | 'target' | 'calls'>, current?: Graph,
): Promise<{ graph: unknown; explanation: string; calls: AICall[] }> {
  const calls: AICall[] = deps.calls ?? [];
  const ai = recording(deps.ai, calls);
  const prompt = current?.nodes.length
    ? changePrompt(current, description)
    : `Design a graph that does the following:\n${description}`;
  let raw: string;
  try {
    raw = await ai.complete({ prompt, system: GRAPH_SYSTEM, ...deps.target });
  } catch (error) {
    throw new GenerationFailed(error instanceof Error ? error.message : String(error), calls);
  }
  // Read as every other answer is: a code node's body in the document may
  // write "```" into a string, and the block does not end there.
  const fenced = firstBlock(raw);
  const candidate = fenced ? fenced.code : raw.trim();
  let graph: unknown;
  try {
    graph = JSON.parse(candidate);
  } catch {
    // Said to whoever asked at the bar: what went wrong most often, and what to do. The transcript keeps the rest.
    throw new GenerationFailed('The model\'s answer was not a whole graph -- it may have been cut off. Try again, or ask for less at once.', calls);
  }
  return {
    graph: current ? keptFrom(current, graph, exchangeEntry(`Change of the graph: ${description}`, calls, new Date())) : graph,
    explanation: fenced?.after ?? '',
    calls,
  };
}
