// How an AI writes an element's body, declared by the element.
//
// An element declares this, so a shell renders one ✨ button per element and
// knows nothing about which element it is -- and no element has a body with no
// way to fill it.
//
// A body is one of three things, and each is written with a standard prompt
// of its own (`authoring/prompts.ts`): code that runs, the instructions a
// model is given, or the data a node holds. A node that also has definitions
// -- what one call is handed, and what it returns (`NodeRunner.definitions`)
// -- has them written by the same ✨, first, where they are missing.

import type { LogicFields } from './logic.ts';
import type { Runtime } from '../elements/Runtime.ts';
import type { BodyGiven } from '../elements/body.ts';

/** What the body is, and so which standard prompt writes it. */
export type GenerationKind = 'code' | 'prompt' | 'data';

/**
 * The programming language a body of code is written in, as whoever writes and
 * tries it needs it: what a model is told, the function it completes, and how
 * the result is tried on its example. Declared by the node that runs the body
 * (the code node's is `elements/nodes/code/javascript.ts`), so a node for
 * another language brings its own and the writer names none.
 */
export interface Language {
  /** The file the body is kept in: "code.js". */
  file: string;
  /** The fence its code block is opened with: "js". */
  fence: string;
  /** Who the model is told it is, writing such a body. */
  system: string;
  /** The empty function the model completes, for these input and output ids. */
  skeleton: (inputs: string[], outputs: string[]) => string;
  /** What a body may use and what it may not -- its standard library, no packages. */
  limits: string;
  /** Run *body* on *inputs* as a run runs it: how a written body is tried on its example. */
  run: (body: string, inputs: Record<string, unknown>, runtime: Runtime, given: BodyGiven) => Promise<Record<string, unknown>>;
}

/** One element's answer to "how does an AI write this?". */
export interface Generation {
  kind: GenerationKind;
  /** Where the body is kept: the same constant the element's `logic()` is built from, where it has one. */
  fields: LogicFields;
  /** For a body of code: the language it is written in. */
  language?: Language;
}
