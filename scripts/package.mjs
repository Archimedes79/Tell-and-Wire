// Build the downloadable package: Tell & Wire, ready to run, nothing to install.
//
// Tell & Wire has no runtime dependencies -- only devDependencies -- and Node
// runs its TypeScript unbuilt. So everything a recipient needs is source plus
// the already-built page: unzip, run the script, no `npm install`, no build,
// no Docker. The tool servers under mcp/ are the exception that proves it: they
// have dependencies of their own, so they come with them, installed here, as
// `npm ci --omit=dev` leaves them and with their licences -- the download
// carries Node and no npm, so a server that were left to install itself
// could not.
//
// Tests are left out; nothing else is. The editor's own server routes stay in,
// because this package *is* the editor, unlike a deploy bundle, which is one
// graph and drops them.

import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, execSync } from 'node:child_process';
import { zip } from '../backend/graph-editor/zip.ts';
import { NODE_MAJOR, runCmd, runSh, zipMode } from '../backend/app/cli/launchers.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

/**
 * The tool servers in mcp/ -- a folder with a config.json is one -- as zip
 * entries: what a person runs (source, config, settings page, package files),
 * and their packages, installed anew in a folder of their own so that what
 * ships is what `npm ci --omit=dev` gives and nothing a developer's
 * node_modules happens to hold. Each package keeps its own licence file.
 */
async function toolServers() {
  const entries = [];
  let folders;
  try {
    folders = await readdir(join(ROOT, 'mcp'), { withFileTypes: true });
  } catch {
    return entries;
  }
  // The servers' READMEs point to it: how a server brings its config and its settings page.
  entries.push({ path: 'mcp/README.md', content: await readFile(join(ROOT, 'mcp', 'README.md')) });
  for (const folder of folders) {
    const base = `mcp/${folder.name}`;
    if (!folder.isDirectory() || !existsSync(join(ROOT, base, 'config.json'))) continue;
    for (const path of await walk(base, (file) => !file.endsWith('.test.ts') && !file.startsWith(`${base}/scripts/`) && file !== `${base}/tsconfig.json`)) {
      entries.push({ path, content: await readFile(join(ROOT, path)) });
    }

    const { dependencies = {} } = JSON.parse(await readFile(join(ROOT, base, 'package.json'), 'utf8'));
    if (Object.keys(dependencies).length === 0) continue;
    const work = await mkdtemp(join(tmpdir(), 'tell-and-wire-mcp-'));
    try {
      for (const file of ['package.json', 'package-lock.json']) await copyFile(join(ROOT, base, file), join(work, file));
      // A fixed command text, not arguments: Windows starts npm through its .cmd shim, which only a shell runs.
      execSync('npm ci --omit=dev --ignore-scripts --no-audit --no-fund', { cwd: work, stdio: ['ignore', 'ignore', 'inherit'] });
      const installed = join(work, 'node_modules');
      const inside = async (dir) => {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
          const path = join(dir, entry.name);
          // .bin holds links to commands nobody runs from here.
          if (entry.isDirectory()) { if (entry.name !== '.bin') await inside(path); }
          else entries.push({ path: `${base}/node_modules/${relative(installed, path).split(sep).join('/')}`, content: await readFile(path) });
        }
      };
      await inside(installed);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }
  return entries;
}

// The same launchers every deploy bundle gets (backend/app/cli/launchers.ts):
// they check for Node before it is needed, start from their own folder, and
// keep a Windows window open long enough to read a failure. No port is passed
// unless PORT is set, so the server takes the first free one from 8000 --
// the version before always passed 8000, and died on a machine that already
// had an editor running there.
const LAUNCHER = { command: 'backend/app/main.ts --editor frontend/dist', portFromEnv: true };

/**
 * What this zip was built from, in a file beside the README.
 *
 * A downloaded folder otherwise has no way to say how old it is, and "is this
 * the current code?" was a question nobody could answer from the outside. CI
 * names the build (a tag, or `latest`); a local build asks git.
 */
function version() {
  const git = (...args) => {
    try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return ''; }
  };
  const commit = process.env.GITHUB_SHA || git('rev-parse', 'HEAD') || 'unknown';
  const name = process.env.TW_VERSION || git('describe', '--tags', '--always', '--dirty') || 'unknown';
  return `Tell & Wire ${name}\ncommit ${commit}\nbuilt ${new Date().toISOString()}\n`;
}

// `--node <folder>`: an unpacked Node.js download for one system -- node.exe
// at its top on Windows, bin/node elsewhere -- whose binary and LICENSE go into
// the zip as node/. That zip is for that system only, and needs nothing
// installed: having to install Node 24 first was what stopped people who only
// wanted to try it, and was why they reached for the container instead.
const args = process.argv.slice(2);
const nodeAt = args.indexOf('--node');
const nodeFolder = nodeAt >= 0 ? args.splice(nodeAt, 2)[1] : undefined;

/** The Node binary in *folder*, and where it goes in the zip. */
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

const NEEDS = node
  ? `Nothing. Node.js, which runs it, is in node/ -- with its licence, node/LICENSE --
and the launchers use it. The code is TypeScript that Node runs directly, it
has no dependencies, and the page in frontend/dist is already built. Nothing is
installed, and nothing is installed while a graph runs.`
  : `Node ${NODE_MAJOR} or newer. That is the whole list: the code is TypeScript that Node
runs directly, it has no dependencies, and the page in frontend/dist is already
built. Nothing is installed, and nothing is installed while a graph runs.

    node --version

The launchers check this before starting and say so if it is missing or too
old; on Windows the window stays open until you have read it.`;

const README = `# Tell & Wire

Unzip, then:

    run.cmd           (Windows -- double-click it)
    ./run.sh          (Linux, macOS)

The editor opens in your browser, on http://127.0.0.1:8000 or, if something is
already there, the next free port -- the address is printed either way. Set
PORT to insist on one.

VERSION says which build this is and which commit it was made from.

## What this needs

${NEEDS}

## What is in here

    run.sh, run.cmd   start it${node ? '\n    node/       Node.js, which runs it, and its licence' : ''}
    VERSION     what this was built from
    graph/      the graph's code: how a graph runs, as source
    backend/    the editor's server, as source
    frontend/dist the editor's page, built; its licenses.txt names the
                packages it is built from, each with its licence
    examples/   project folders to open from the editor's Open dialog
    mcp/        tool servers an AI node can use (add one in the node's settings),
                each with the packages it needs and their licences
    LICENSE     the terms Tell & Wire comes under

A graph you build here can be handed on with the Deploy button, which writes a
folder of its own -- that one holds a single graph and no editor.
`;

const files = [
  ...await walk('graph', (path) => path.endsWith('.ts') && !path.endsWith('.test.ts') && !path.includes('/test/')),
  'graph/package.json',
  ...await walk('backend', (path) => path.endsWith('.ts') && !path.endsWith('.test.ts')),
  'backend/package.json',
  ...await walk('frontend/dist'),
  ...await walk('examples'),
  'LICENSE',
];

const out = args[0] ?? join(ROOT, 'tell-and-wire.zip');
// Everything sits under one folder named after the file, so unzipping in a
// downloads directory produces one directory rather than scattering 87 files
// across it.
const top = basename(out).replace(/\.zip$/i, '');

const entries = [];
for (const path of files) {
  entries.push({ path: `${top}/${path}`, content: await readFile(join(ROOT, path)) });
}
for (const entry of await toolServers()) entries.push({ ...entry, path: `${top}/${entry.path}` });
const extra = {
  'run.sh': runSh(LAUNCHER),
  'run.cmd': runCmd(LAUNCHER),
  'README.md': README,
  'VERSION': version(),
};
for (const [name, text] of Object.entries(extra)) {
  entries.push({ path: `${top}/${name}`, content: Buffer.from(text, 'utf8'), mode: zipMode(name) });
}
if (node) {
  entries.push({ path: `${top}/${node.to}`, content: node.content, mode: zipMode(node.to) });
  entries.push({ path: `${top}/node/LICENSE`, content: node.license });
}

await mkdir(dirname(out), { recursive: true });
await writeFile(out, zip(entries));

const size = (entries.reduce((sum, e) => sum + e.content.length, 0) / 1024 / 1024).toFixed(1);
console.log(`${relative(ROOT, out) || out}: ${entries.length} files, ${size} MB uncompressed`);
