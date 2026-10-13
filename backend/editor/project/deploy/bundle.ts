// Handing the graph to someone else.
//
// A bundle is the tool as its project folder -- graph-flow.json, graph-nodes.json, its GUI
// in gui.json, a folder per node with writing, as it was built -- the code that runs it, and one
// command. One format: what a recipient opens is what the editor opens. Nothing is
// generated: the code is copied verbatim, so what a recipient runs is what was tested here, byte
// for byte.
//
// What a recipient needs installed: Node. That is the whole list -- every
// written body is JavaScript, so the interpreter that runs the graph runs
// them too.

import { chmod, copyFile, cp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, lstatSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Graph } from '../../../../graph/graph.ts';
import { guiBlocks } from '../../../../gui/gui.ts';
import { guiReferencedPaths } from '../../../../gui/editor/gui.ts';
import { registry } from '../../../../graph/nodes/registry.ts';
import { designs } from '../../../../graph/editor/nodes/registry.ts';
import { withoutWriting } from '../../../../graph/editor/handedOn.ts';
import { FRONTEND_DIR } from '../../../deployment/project/folder.ts';
import { sameFile } from '../../../deployment/runtime/confine.ts';
import { writeProject } from '../../../authoring/write.ts';
import { SETTINGS_FILENAME, candidatePaths } from '../../../deployment/runtime/ai/settings.ts';
import { WEB_DIR, installFolder } from '../../../deployment/project/layout.ts';
import { NODE_MAJOR, runCmd, runSh, zipMode } from './launchers.ts';

/** The checkout's root: a bundle copies the folders of `CARRIED` from it, at the same paths. This file sits in `backend/editor/project/deploy/`. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/**
 * What this particular graph needs to run somewhere else.
 *
 * Two things, and both are about the recipient rather than the graph: every
 * body is JavaScript, so no interpreter and no packages travel with it.
 */
interface BundleNeeds {
  /** The graph has an interface, so a bundle without a GUI is only half of it. */
  interface: boolean;
  /** It asks a model, so the recipient needs a provider configured. */
  ai: boolean;
}

function bundleNeeds(graph: Graph, top = true): BundleNeeds {
  // A GUI with blocks is the GUI a person uses the tool through; a start
  // point the GUI starts says the same of a graph whose gui is still to come.
  const needs: BundleNeeds = { interface: guiBlocks(graph).length > 0, ai: false };

  for (const node of graph.nodes) {
    const element = registry.node(node.node_type);
    if (!element) continue;

    const asked = designs.node(node.node_type)!.deployNeeds(node);
    if (asked.needsInterface) needs.interface = true;
    // A start point a call starts is called through a served tool -- a script,
    // a frontend, its own GUI's call forms -- at the top. In a graph a node
    // holds, the graph above is what calls it.
    if (top && element.startedBy(node) === 'call') needs.interface = true;
    if (asked.asksAi) needs.ai = true;

    // A graph inside a node runs in the bundle like everything else, so what
    // it needs the recipient has to have: a model it calls is a model they
    // must configure, wherever in the depth it sits.
    const held = element.nestedGraph(node);
    if (!held) continue;
    const inner = bundleNeeds(held, false);
    if (inner.ai) needs.ai = true;
    // A GUI in there is a check problem rather than a thing to carry, and a
    // bundle is not the place to find out: it is followed all the same, so a
    // graph that somehow has one is not shipped without its GUI.
    if (inner.interface) needs.interface = true;
  }

  return needs;
}

/** More than a bundle carries: a tool that starts on more is not handed on. */
const DATA_LIMIT_BYTES = 50 * 1024 * 1024;

/** Where a file the tool starts on goes when it came from outside the project. */
const DATA_DIR = 'data';

async function sizeOf(path: string): Promise<number> {
  const found = await stat(path);
  if (!found.isDirectory()) return found.size;
  let total = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) total += await sizeOf(join(path, entry.name));
  return total;
}

/**
 * Whether *path* is a settings file -- by its name, or because the settings are read from it. A folder a graph
 * starts on may hold one with a key in it, and a bundle is handed to someone else.
 */
function isSettingsFile(path: string): boolean {
  const full = resolve(path).toLowerCase();
  return basename(full) === SETTINGS_FILENAME || candidatePaths().some((candidate) => resolve(candidate).toLowerCase() === full || sameFile(candidate, path));
}

/**
 * What a folder is copied without: a settings file by any name, and a link. A link is copied as a link, and the zip is
 * written from what it points at -- a name that said nothing of the keys it led to.
 */
const notCarried = (path: string): boolean => isSettingsFile(path) || lstatSync(path).isSymbolicLink();

/** One file the tool starts on: where it is here, and where it goes in the bundle. */
interface Carried {
  named: string;
  source: string;
  place: string;
}

/** A graph that cannot be handed on: what is wrong is the graph's, not the server's. */
export class CannotBundle extends Error {}

/**
 * The files a graph starts on -- what its pickers and folder inputs name --
 * every one of them: a tool is handed on whole, or not at all. A bundle that
 * left one out for its recipient to bring opened on "no such file", on
 * somebody else's path.
 *
 * A relative path inside keeps its place, so nothing in the graph changes: a
 * bundle runs from its own folder (the launchers see to that), and
 * `examples/data/population.csv` means there what it meant here. One
 * anywhere else -- absolute, as 📂 Browse… picks it, or through `..` -- goes
 * to `data/`, and the graph is told its new place (`moved`). A file that is
 * not there, or more than a bundle carries, stops the bundle before anything
 * is written, and says which.
 */
async function dataFiles(graph: Graph, from: string): Promise<Carried[]> {
  const wanted = new Set<string>();
  const collect = (inside: Graph): void => {
    for (const path of guiReferencedPaths(inside)) wanted.add(path);
    for (const node of inside.nodes) {
      for (const path of designs.node(node.node_type)?.referencedPaths(node) ?? []) wanted.add(path);
      const held = registry.node(node.node_type)?.nestedGraph(node);
      // A file an inner node reads is a file the bundle must carry, and its
      // path is relative to the same project folder.
      if (held) collect(held);
    }
  };
  collect(graph);

  const carried: Carried[] = [];
  const missing: string[] = [];
  const places = new Set<string>();
  for (const named of wanted) {
    const tidy = normalize(named);
    const source = resolve(from, tidy);
    if (!existsSync(source)) { missing.push(`"${named}" is not there`); continue; }
    if (isSettingsFile(source)) { missing.push(`"${named}" is a settings file, which holds keys and is never handed on`); continue; }
    const size = await sizeOf(source);
    if (size > DATA_LIMIT_BYTES) {
      missing.push(`"${named}" is ${Math.round(size / 1024 / 1024)} MB, more than a bundle carries (${DATA_LIMIT_BYTES / 1024 / 1024} MB)`);
      continue;
    }
    let place = tidy.replace(/\\/g, '/');
    if (isAbsolute(named) || tidy.split(sep).includes('..')) {
      // Its own name, and a number where two share one.
      const stem = basename(source, extname(source));
      place = `${DATA_DIR}/${basename(source)}`;
      for (let n = 2; places.has(place); n += 1) place = `${DATA_DIR}/${stem}-${n}${extname(source)}`;
    }
    places.add(place);
    carried.push({ named, source, place });
  }
  if (missing.length) {
    throw new CannotBundle(`This tool cannot be handed on whole: it starts on files it cannot carry -- ${missing.join('; ')}. `
      + 'Choose files that are there and smaller, or clear those fields, and deploy again.');
  }
  return carried;
}

/**
 * *graph* told where the files it starts on are in the bundle: every setting
 * that names one it carried somewhere else names the new place. By value, not
 * by field -- which setting holds a path is each node kind's business, and a
 * path is the whole of the setting that holds it.
 */
function moved(graph: Graph, carried: Carried[]): Graph {
  const to = new Map(carried.filter((file) => file.named !== file.place).map((file) => [file.named, file.place]));
  if (!to.size) return graph;
  const retold = (value: unknown): unknown => {
    if (typeof value === 'string') return to.get(value) ?? value;
    if (Array.isArray(value)) return value.map(retold);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, retold(inner)]));
    return value;
  };
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({ ...node, config: retold(node.config) as typeof node.config })),
    // A picker on the GUI starts on a file too.
    ...(graph.gui ? { gui: { blocks: graph.gui.blocks.map((block) => retold(block) as typeof block) } } : {}),
  };
}

/** Every file under *dir*, relative to it, with `/`. */
export async function filesIn(dir: string, under = ''): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(join(dir, under), { withFileTypes: true })) {
    const path = under ? `${under}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...await filesIn(dir, path));
    else found.push(path);
  }
  return found;
}

/**
 * What a package carries of the code, by folder: the neutral definitions, and the deployment's
 * command line and modules. A folder not named here -- `backend/editor`, the architecture
 * tests -- is not carried, and inside these a folder named `editor` (the editor's part of
 * `graph/` and `gui/`) or `notebook` (the notebook's: `gui/notebook`, which writes the files a package is), a test and its fixtures stay behind: a recipient runs the tool, not
 * its test suite and not an editor. `bundle.test.ts` is the check that says so.
 */
const CARRIED = ['graph', 'gui', 'backend/cli', 'backend/deployment'];
const LEFT_BEHIND = new Set(['editor', 'notebook', 'test', 'node_modules']);

/** The file that says what a package is and lists what is in it. */
const MANIFEST = 'MANIFEST.json';

/** Every source file of *dir* a package carries, so the copy is complete without a list per file. */
async function sourceFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!LEFT_BEHIND.has(entry.name)) found.push(...await sourceFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      found.push(full);
    }
  }
  return found;
}

/**
 * The built gui a deployed tool serves, and only the files it references.
 *
 * Parsed out of `gui.html` rather than listed: the editor's own chunks live
 * in the same folder, and a bundle that copied everything would ship the
 * editor to someone who was handed a finished tool.
 */
async function guiFiles(guiDir: string): Promise<string[]> {
  const html = join(guiDir, 'gui.html');
  if (!existsSync(html)) return [];
  const source = await readFile(html, 'utf8');
  const referenced = [...source.matchAll(/(?:src|href)="\/?([^"]+)"/g)]
    .map((match) => match[1])
    .filter((path) => !path.startsWith('http'));
  return ['gui.html', ...new Set(referenced)].filter((path) => existsSync(join(guiDir, path)));
}

/**
 * Write a runnable copy of *graph* into *target*.
 *
 * Returns the paths written, so a caller can zip exactly this and a test can
 * check that nothing was left out.
 */
export async function writeBundle(
  graph: Graph,
  target: string,
  options: {
    guiDir?: string;
    dataFrom?: string;
    /** The project's own GUI, written by hand (`frontendOf`): carried whole, and served in place of the built one. */
    frontend?: string | null;
  } = {},
): Promise<string[]> {
  // A bundle is something handed to someone else. One of a graph with no nodes
  // is a zip that starts, does nothing and says nothing -- and the person who
  // opens it has no way to tell that from a tool that failed.
  if (!graph.nodes.length) throw new CannotBundle('This graph has no nodes: there is nothing to hand over.');
  const needs = bundleNeeds(graph);
  // Asked first: what cannot be carried stops the bundle before a file is written.
  const data = await dataFiles(graph, options.dataFrom ?? process.cwd());
  const name = graph.metadata.name || 'graph';
  const written: string[] = [];

  const put = async (relativePath: string, content: string): Promise<void> => {
    const path = resolve(target, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
    written.push(relativePath);
  };
  const copy = async (from: string, relativePath: string): Promise<void> => {
    const path = resolve(target, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await copyFile(from, path);
    written.push(relativePath);
  };

  // The project folder, first, into the empty bundle -- what runs, not how each
  // node was written (`withoutWriting`), and the files it starts on where
  // they now are.
  await writeProject(target, withoutWriting(moved(graph, data)));
  written.push(...await filesIn(target));

  for (const file of (await Promise.all(CARRIED.map((folder) => sourceFiles(join(ROOT, folder))))).flat()) {
    await copy(file, relative(ROOT, file).replace(/\\/g, '/'));
  }
  // And the terms it comes under: whoever is handed any part of the code is
  // handed those with it (LICENSE, "Notices").
  await copy(join(installFolder(), 'LICENSE'), 'LICENSE');

  // The GUI, if this graph has one and a build is at hand. A bundle without
  // it still runs -- once, on the terminal, the GUI's start points sent what
  // its blocks hold -- which is why a missing build is not an error here.
  let servesGui = false;
  if (needs.interface && options.guiDir) {
    for (const file of await guiFiles(options.guiDir)) {
      await copy(join(options.guiDir, file), join(WEB_DIR, file).replace(/\\/g, '/'));
      servesGui = true;
    }
  }

  for (const file of data) {
    await mkdir(dirname(resolve(target, file.place)), { recursive: true });
    // A folder may hold the settings file: everything but that.
    await cp(file.source, resolve(target, file.place), { recursive: true, filter: (path) => !notCarried(path) });
    written.push(file.place);
  }

  // A GUI the project brings of its own: all of it, as it is.
  if (options.frontend) {
    await cp(options.frontend, resolve(target, FRONTEND_DIR), { recursive: true, filter: (path) => !notCarried(path) });
    written.push(...(await filesIn(options.frontend)).map((file) => `${FRONTEND_DIR}/${file}`));
    servesGui = true;
  }

  // The same pair the downloadable package ships (see launchers.ts): from its
  // own folder, with Node checked before it is needed and a window that stays
  // open long enough to read a failure.
  const command = servesGui ? 'backend/cli/main.ts . --serve' : 'backend/cli/main.ts .';
  await put('run.cmd', runCmd({ command }));
  await put('run.sh', runSh({ command }));
  // A no-op on Windows; on a Mac or Linux box it is the difference between
  // `./run.sh` and "Permission denied".
  await chmod(resolve(target, 'run.sh'), zipMode('run.sh')!);
  await put('README.md', readme(name, needs, servesGui, data));

  // What this is and what is in it: which Tell & Wire it was made by, and every file, so a copy
  // that was saved, moved or unpacked can be checked against it.
  const version = (JSON.parse(await readFile(join(installFolder(), 'graph', 'package.json'), 'utf8')) as { version?: string }).version ?? '';
  const files = (await filesIn(target)).filter((path) => path !== MANIFEST).sort();
  await put(MANIFEST, `${JSON.stringify({ package: 'tell-and-wire', version, tool: name, files }, null, 2)}\n`);

  return written;
}

function readme(name: string, needs: BundleNeeds, servesGui: boolean, data: Carried[]): string {
  const lines = [
    `# ${name}`,
    '',
    'A tool, as the folder it was built as -- graph-flow.json and graph-nodes.json, its GUI in',
    'gui.json, a folder per node with its code -- and the code that runs it.',
    'Nothing here was generated: that code is a verbatim copy of the one the',
    'graph was built and tested on, so this runs what was tested rather than a',
    'second implementation of it.',
    '',
    '## Running it',
    '',
    '```',
    './run.sh          # or run.cmd on Windows',
    '```',
    '',
    ...(servesGui
      ? [
        'That opens the tool in your browser, and its GUI runs it: a button',
        'pressed, a file chosen.',
        '',
        'It takes port 8000, or the next free one if something else is already',
        'there, and prints the address it settled on. `--port 9000` picks one.',
        '',
        'It listens on localhost only, so nothing on your network can reach it.',
        'The GUI it serves is the GUI this graph was designed against, copied',
        'rather than rebuilt.',
      ]
      : [
        'The result is printed as JSON on stdout; questions and progress go to',
        'stderr, so `./run.sh | jq` works. `--every 5m` runs it again after each',
        'run finishes.',
      ]),
    '',
    '## What you need',
    '',
    // What the launchers check before they start: one number, said once.
    `- **Node ${NODE_MAJOR} or newer.** Nothing to install and nothing to build.`,
    '- Nothing else. Every code node in this graph is JavaScript, so the',
    '  interpreter that runs the graph runs them too.',
  ];

  if (needs.ai) {
    lines.push(
      '',
      '## The model',
      '',
      'This graph asks a model. Configure one through the environment:',
      '',
      '```',
      'TW_AI_PROVIDER=ollama          # or openai, anthropic, google, lmstudio,',
      'TW_AI_MODEL=llama3             #    openai_compatible, github_copilot',
      '```',
      '',
      'Hosted providers also want a key — `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,',
      '`GOOGLE_API_KEY` — and a self-hosted endpoint wants',
      '`OPENAI_COMPATIBLE_BASE_URL`. A local Ollama or LM Studio needs neither.',
    );
  }

  if (needs.interface) {
    lines.push(
      '',
      '## The GUI',
      '',
      'This graph has a GUI. Running it from the command line runs it once: the',
      "gui's start points are sent what its blocks hold, and nothing is drawn.",
      'To use it as it was built, serve it (run.sh / run.cmd) and open the GUI.',
    );
  }

  if (data.length) {
    lines.push(
      '', '## Its files', '',
      'The files this graph starts on came with it -- in the same relative place',
      'they had where it was built, or, from elsewhere on that machine, in',
      `\`${DATA_DIR}/\`:`, '',
      ...data.map((file) => `- \`${file.place}\``),
    );
  }

  lines.push(
    '', '## Licence', '',
    ...(servesGui
      ? [
        'The code in graph/, gui/ and backend/ and the GUI in web/ come under the terms in LICENSE,',
        'except the packages the GUI is built from: web/licenses.txt names each,',
        'with its own licence.',
      ]
      : ['The code in graph/, gui/ and backend/ comes under the terms in LICENSE.']),
    'The tool itself -- graph-flow.json, graph-nodes.json, gui.json and nodes/ -- belongs to whoever built it.',
  );

  lines.push('');
  return lines.join('\n');
}
