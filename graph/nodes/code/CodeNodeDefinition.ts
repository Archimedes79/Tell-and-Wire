import { NodeDefinition, type TextFile } from '../NodeDefinition.ts';
import { Logic, logicFrom, type LogicFields } from '../../files/logic.ts';
import type { GraphNode } from '../../graph.ts';
import { DEFINITION_TEXTS, definitionsIn, type Definitions } from '../../files/definition.ts';

/** The file a code node's body is kept in, and run from by hand. */
export const CODE_FILE = 'code.js';

/**
 * Files beside code.js, which it may `require` or `import` and read: a helper, a table of rates. Each is kept
 * under a config key of its own, `file:<name>`, so it travels with the node like code.js does and is written to
 * the folder the same way. Flat -- one folder deep -- and of a few kinds of text: code a body can load, and the
 * data it reads.
 */
export const ASIDE_PREFIX = 'file:';
export const ASIDE_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]*\.(?:js|mjs|cjs|json|csv|txt)$/;

/** The files beside code.js that *config* holds, by name. */
export function asideFiles(config: Record<string, unknown>): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key.startsWith(ASIDE_PREFIX) && typeof value === 'string') found[key.slice(ASIDE_PREFIX.length)] = value;
  }
  return found;
}

/** What a code node stores. Its own fields, and no one else's. */
export const CODE_FIELDS: LogicFields = { body: 'code' };

/**
 * code.js while there is no code: what it is, and which ✨ writes it -- and,
 * run on its own (`node code.js`), a line that says so and a failing exit
 * code, where a file of comments printed nothing and "succeeded". The folder
 * reads the stub as it wrote it, as no code (`standard`).
 */
const CODE_STUB = `// code.js: what this code node does -- \`function run(inputs)\`, returning an
// object keyed by its outputs. ✨ Code writes it from the node's text, its
// input.js and its output.js.
console.error('code.js holds no code yet: write it with ✨ Code.');
process.exitCode = 1;`;

/**
 * What follows the code in code.js, and only there: the folder writes it after
 * the body and takes it off again when it reads the file, so the node, the
 * sandbox and the generator never see it (and in the sandbox, whose file is
 * not code.js, it would do nothing).
 *
 * It works under both module systems -- a body that uses `import` runs as an
 * ES module, and so does any file under a package.json that says
 * `"type": "module"`, where `require` and `module` do not exist: a direct run
 * is told by the file Node was asked to run, and input.js is run apart, in a
 * context of its own (`node:vm`) that gives it the `module` it assigns. A few
 * lines a person can read at the end of every code.js, rather than a parser:
 * Tell & Wire reads input.js without running it (`definitionExample`), and for
 * the plain JSON it holds both come to the same example.
 */
export const RUN_ON_ITS_OWN = `// ── Run on its own ─────────────────────────────────────────────────────────
// "node code.js" runs this node on the example in input.js and prints what
// comes out. In a graph Tell & Wire runs this node, and this part is left out.
if (/^code(\\.js)?$/.test(process.getBuiltinModule('node:path').basename(process.argv[1] ?? ''))) {
  const input = { exports: null };
  const file = process.getBuiltinModule('node:path').join(process.argv[1], '..', 'input.js');
  process.getBuiltinModule('node:vm').runInNewContext(process.getBuiltinModule('node:fs').readFileSync(file, 'utf8'), { module: input });
  const example = input.exports;
  if (!example || typeof example !== 'object' || Array.isArray(example)) throw new Error('input.js has no example yet -- an object keyed by input, written by ✨ Input.');
  const node = { windows: [], llm: async () => { throw new Error('node.llm needs Tell & Wire: node backend/cli/main.ts run-node <project> <node id>'); } };
  Promise.resolve(run(example, node)).then((out) => console.log(JSON.stringify(out, null, 2)));
}`;

/**
 * What this keeps in files of its own in a project folder (see
 * `NodeDefinition.texts`), in the order a node is built: what one call is handed,
 * what it returns, the code, and every exchange with the model about it.
 */
const CODE_TEXTS: readonly TextFile[] = [
  ...DEFINITION_TEXTS,
  { field: 'code', file: CODE_FILE, standard: CODE_STUB, footer: RUN_ON_ITS_OWN },
  { field: 'history', file: 'history.md' },
];

/**
 * A node whose behaviour someone wrote.
 *
 * The body is `run(inputs) -> outputs`, both plain JSON objects keyed by port
 * id. JavaScript, and only JavaScript: it is the one language a recipient
 * already has once they can run the graph, so a package asks for Node and nothing
 * else — no interpreter to find, no packages to install, no second sandbox.
 * Everything that is JavaScript about writing and trying a body is its
 * language (`graph/authoring/nodes/code/javascript.ts`): a node for another
 * language declares its own.
 */
export class CodeNodeDefinition extends NodeDefinition {
  readonly nodeType = 'code' as const;

  /**
   * Its code calls a model: `node.llm` -- whatever the second parameter of `run` is called -- or `["llm"]`, or `{ llm }`
   * taken out of it. Read from the text, so a comment that says it counts too: showing the AI settings of a tool that
   * does not need them is the lesser mistake.
   */
  override callsModel(node: GraphNode): boolean {
    return /\.\s*llm\b|\[\s*['"]llm['"]\s*\]|[{,]\s*llm\s*[,}:=]/.test(String(node.config.code ?? ''));
  }

  override texts(node: GraphNode): readonly TextFile[] {
    const aside = Object.keys(asideFiles(node.config)).map((name) => ({ field: ASIDE_PREFIX + name, file: name }));
    return aside.length ? [...CODE_TEXTS, ...aside] : CODE_TEXTS;
  }

  /** A file of a kind it may load or read, other than the ones it keeps its writing in. */
  override fieldOfFile(name: string): string | undefined {
    return ASIDE_NAME.test(name) && !CODE_TEXTS.some((text) => text.file === name) ? ASIDE_PREFIX + name : undefined;
  }

  override definitions(node: GraphNode): Definitions {
    return definitionsIn(node);
  }

  override logic(node: GraphNode): Logic {
    return logicFrom(node, CODE_FIELDS);
  }

  /** Its body is written for one item, so a list can be handed to it an item at a time. */
  override readonly fansOut = true;

  /** A file on an input that says so arrives as its text: `run` reads no files itself. */
  override readonly readsFileInputs = true;
}
