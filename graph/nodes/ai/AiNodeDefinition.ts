import { NodeDefinition, type TextFile } from '../NodeDefinition.ts';
import type { GraphNode } from '../../graph.ts';
import { DEFINITION_TEXTS, definitionsIn, textOutput, type Definitions } from '../../files/definition.ts';
import { answeredAs, fillPrompt, nodeDescription, standardRunPrompt } from '../../files/prompts.ts';

/** The one port a plain answer goes out on: a node with no output definition has no other. */
const ANSWER = 'output';

/** What {Output Definition} says to a node that has none, where its own prompt names it. */
const NO_DEFINITION = 'None: answer in plain text.';

/** What a model is asked and by whom: an ai node's settings, and what `node.llm` starts from. */
export interface AskSettings {
  /** What the model is told before what arrived: an ai node's prompt.md, filled in. Empty: nothing but what arrived. */
  instructions: string;
  provider: string;
  model: string;
  /** Only when the node sets one: current models refuse a sampling parameter nobody asked for. */
  temperature?: number;
  sendImages: boolean;
  /** Tool servers the model may call while answering: URLs, or names this machine configured. */
  toolServers: string[];
}

interface AiConfig extends AskSettings {
  /**
   * The output the answer goes out on as it came, as text: "output" without
   * an output definition, its one output where it names one that holds text.
   * Null where it names several outputs, or a value that is not text: the
   * answer is JSON then, keyed as its example is, and handed on key by key.
   */
  textOn: string | null;
  /** How often to ask again when the answer cannot be used. Unset: the machine's setting, else the standard. */
  repairs?: number;
}

/** One per line, or a list: both are what a person would write. */
function serverList(raw: unknown): string[] {
  const entries = Array.isArray(raw) ? raw : String(raw ?? '').split(/\r?\n/);
  return entries.map((entry) => String(entry).trim()).filter(Boolean);
}

/**
 * What this keeps in files of its own in a project folder (see
 * `NodeDefinition.texts`), in the order a node is built -- the same as a code
 * node's, with the instructions where its code is.
 */
const AI_TEXTS: readonly TextFile[] = [
  ...DEFINITION_TEXTS,
  {
    field: 'prompt', file: 'prompt.md', standard: `<!--
prompt.md: the instructions this ai node's model is given each time it runs,
with the node's description and its output definition filled in where they
are named. ✨ Prompt writes it from the node's text and its output.js. While it
says nothing but this, the node runs with the standard instructions.
-->`,
  },
  { field: 'history', file: 'history.md' },
];

/**
 * A node that asks a model.
 *
 * It is told its instructions -- its prompt.md, or while it has none the
 * standard (`files/prompts.ts`), with its description and its output
 * definition filled in -- and then everything wired into it. Its answer is
 * text on its one output, or, where the output definition names several
 * outputs or a value that is not text, JSON keyed as the definition's example
 * is, each key on the output port of that name. What it sends, and what it
 * does with the answer, is its runner's.
 */
export class AiNodeDefinition extends NodeDefinition<AiConfig> {
  readonly nodeType = 'ai' as const;

  override callsModel(): boolean {
    return true;
  }

  override texts(): readonly TextFile[] {
    return AI_TEXTS;
  }

  override definitions(node: GraphNode): Definitions {
    return definitionsIn(node);
  }

  config(node: GraphNode): AiConfig {
    const c = node.config;
    const output = definitionsIn(node).output.trim();
    const own = String(c.prompt ?? '').trim();
    // A prompt.md of its own that never names the definition still gets it,
    // last: one ✨ wrote ended "Respond with JSON matching this structure:"
    // and nothing after, and its model was never shown the structure.
    const template = !own ? standardRunPrompt(output) : output && !own.includes('{Output Definition}') ? `${own}\n\n{Output Definition}` : own;
    return {
      instructions: fillPrompt(template, {
        'Node Description': nodeDescription(node),
        // The standard instructions say how to answer; a prompt.md of the
        // node's own is handed the definition with that said first (`answeredAs`).
        'Output Definition': !output ? NO_DEFINITION : own ? answeredAs(output) : output,
      }),
      textOn: output ? textOutput(output) ?? null : ANSWER,
      provider: String(c.ai_provider ?? ''),
      model: String(c.ai_model ?? ''),
      ...(typeof c.temperature === 'number' ? { temperature: c.temperature } : {}),
      sendImages: c.send_images === true,
      toolServers: serverList(c.mcp_servers),
      ...(typeof c.repairs === 'number' && Number.isFinite(c.repairs) && c.repairs >= 0 ? { repairs: Math.floor(c.repairs) } : {}),
    };
  }

  /** Its body is written for one item, so a list can be handed to it an item at a time. */
  override readonly fansOut = true;

  /** A file on an input that says so is sent as what it says, not as its name. */
  override readonly readsFileInputs = true;

  /** What is wired in is the question: with all of it empty there is nothing to ask. */
  override needsInput(): boolean {
    return true;
  }
}
