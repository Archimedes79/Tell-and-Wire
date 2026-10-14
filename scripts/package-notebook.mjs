// Build the downloadable package of the notebook alone: `npm run package:notebook`, after `npm run build:notebook`.
//
// A script of its own beside package.mjs, and a copy in what it does: the full version and the notebook are two products, and a change to how one is
// packed is not a change to the other. What both pack with is below them -- the launchers every deploy bundle gets, the zip writer -- and
// is shared. The notebook's package holds the notebook's page and server, what runs a graph, and the examples; no editor, no tool servers.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { zip } from '../backend/editor/project/deploy/zip.ts';
import { NODE_MAJOR, runCmd, runSh, zipMode } from '../backend/editor/project/deploy/launchers.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LAUNCHER = { command: 'backend/notebook/main.ts', portFromEnv: true };

/** Every file under *dir*, recursively, as paths relative to ROOT. */
async function walk(dir, keep = () => true) {
  const found = [];
  let entries;
  try {
    entries = await readdir(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) { if (entry.name !== 'node_modules') found.push(...await walk(path, keep)); }
    else if (keep(path)) found.push(path);
  }
  return found;
}

function version() {
  const git = (...args) => {
    try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return ''; }
  };
  const commit = process.env.GITHUB_SHA || git('rev-parse', 'HEAD') || 'unknown';
  const name = process.env.TW_VERSION || git('describe', '--tags', '--always', '--dirty') || 'unknown';
  return `Tell & Wire Notebook ${name}\ncommit ${commit}\nbuilt ${new Date().toISOString()}\n`;
}

// `--node <folder>`: an unpacked Node.js download for one system, whose binary and LICENSE go into the zip as node/ -- for that system only,
// and nothing to install.
const args = process.argv.slice(2);
const nodeAt = args.indexOf('--node');
const nodeFolder = nodeAt >= 0 ? args.splice(nodeAt, 2)[1] : undefined;

async function bundledNode(folder) {
  for (const [from, to] of [['node.exe', 'node/node.exe'], ['bin/node', 'node/node']]) {
    try {
      return { to, content: await readFile(join(folder, from)), license: await readFile(join(folder, 'LICENSE')) };
    } catch {
      // Not this system's layout: the other one.
    }
  }
  throw new Error(`No node.exe or bin/node, with its LICENSE, in ${folder}`);
}

const node = nodeFolder ? await bundledNode(nodeFolder) : undefined;

const README = `# Tell & Wire Notebook

Unzip, then:

    run.cmd           (Windows -- double-click it)
    ./run.sh          (Linux, macOS)

The notebook opens in your browser, on http://127.0.0.1:8100 or, if something is already there, the next free port -- the address is printed
either way. Set PORT to insist on one. It needs ${node ? 'nothing else: Node.js is in node/, with its licence' : `Node ${NODE_MAJOR} or newer (node --version)`}, and a model for the windows that ask one
(ai-settings.json beside run.cmd, or the environment: see the user guide of the full version).

Open the examples with Open... : notebook-examples/ holds five pages. They name their files relative to this folder, so start the notebook from here.

VERSION says which build this is. This is the notebook alone; the full version, with the graph editor, is a package of its own, and a project
saved here opens in it (a folder of graph files). The page is in those files too: the words in gui.json, the windows as the graph they make.

    LICENSE     the terms Tell & Wire comes under
`;

/** The editor's own: a folder named `editor`, in any tier. The notebook carries what both write with (`authoring`) and its own. */
const notEditors = (path) => !path.split('/').includes('editor');

const files = [
  ...await walk('graph', (path) => path.endsWith('.ts') && !path.endsWith('.test.ts') && !path.includes('/test/') && notEditors(path)),
  'graph/package.json',
  ...await walk('gui', (path) => path.endsWith('.ts') && !path.endsWith('.test.ts') && notEditors(path)),
  'gui/package.json',
  // The server, what runs a graph and what writes a project; not the editor's server, which nothing here imports.
  ...await walk('backend', (path) => path.endsWith('.ts') && !path.endsWith('.test.ts') && !path.includes('/test/') && !path.includes('/architecture/') && notEditors(path)),
  'backend/package.json',
  ...await walk('frontend/notebook/dist', (path) => !path.endsWith('/_audit.js')),
  ...await walk('notebook-examples', (path) => !/(^|\/)([^/]*\.)?state\.json$/.test(path)),
  'LICENSE',
];

const out = args[0] ?? join(ROOT, 'tell-and-wire-notebook.zip');
const top = basename(out).replace(/\.zip$/i, '');

const entries = [];
for (const path of files) entries.push({ path: `${top}/${path}`, content: await readFile(join(ROOT, path)) });
const extra = { 'run.sh': runSh(LAUNCHER), 'run.cmd': runCmd(LAUNCHER), 'README.md': README, 'VERSION': version() };
for (const [name, text] of Object.entries(extra)) entries.push({ path: `${top}/${name}`, content: Buffer.from(text, 'utf8'), mode: zipMode(name) });
if (node) {
  entries.push({ path: `${top}/${node.to}`, content: node.content, mode: zipMode(node.to) });
  entries.push({ path: `${top}/node/LICENSE`, content: node.license });
}

await mkdir(dirname(out), { recursive: true });
await writeFile(out, zip(entries));

const size = (entries.reduce((sum, e) => sum + e.content.length, 0) / 1024 / 1024).toFixed(1);
console.log(`${relative(ROOT, out) || out}: ${entries.length} files, ${size} MB uncompressed`);
