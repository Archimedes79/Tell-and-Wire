// Start the editor: `node scripts/start.mjs [--port 8000]`, which start.cmd,
// start.ps1 and start.sh call.
//
// Starting is also restarting. An editor already on the port is stopped first
// -- only an Tell-and-Wire one, see editorProcess.mjs -- because the usual reason to
// start again is that the engine changed, and a server keeps running the
// engine it was started with while serving whatever page was built since.
// Dependencies are installed on first use, and the page is rebuilt when any
// source it is built from is newer than it, the engine's included: the page
// bundles the engine's elements, so an engine change is a page change too.

import { spawn, spawnSync } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPort, stopEditor } from './editorProcess.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

/** What the page is built from, besides the source folders. */
const BUILD_INPUTS = [
  'package.json', 'package-lock.json', 'frontend/package.json', 'frontend/index.html', 'frontend/runtime.html',
  'frontend/tsconfig.json', 'frontend/tsconfig.node.json', 'frontend/vite.config.ts', 'frontend/tailwind.config.js', 'frontend/postcss.config.js',
];
/** The folders the page's code is in: its own, and the graph's and the backend's, which it imports from. */
const SOURCES = ['frontend/app', 'frontend/graph-editor', 'frontend/gui-editor', 'graph', 'backend'];

try {
  if (Number(process.versions.node.split('.')[0]) < 24) {
    throw new Error(`Node.js 24 or newer is required. Found ${process.version}.`);
  }
  await stopEditor(readPort(args));
  if (!await exists(join(root, 'node_modules'))) npm(['ci'], 'Installing dependencies...');
  const page = join(root, 'frontend', 'dist', 'index.html');
  if (!await exists(page) || await sourcesNewerThan((await stat(page)).mtimeMs)) await build();
} catch (error) {
  console.error(`\n${error.message}`);
  process.exit(1);
}

const editor = spawn(process.execPath, ['backend/app/main.ts', '--editor', 'frontend/dist', ...args], { cwd: root, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => editor.kill(signal));
editor.on('exit', (code, signal) => process.exit(code ?? (signal ? 0 : 1)));
editor.on('error', (error) => {
  console.error(`\nCould not start the editor: ${error.message}`);
  process.exit(1);
});

async function sourcesNewerThan(builtAt) {
  for (const file of BUILD_INPUTS) if (await modifiedAfter(join(root, file), builtAt)) return true;
  for (const folder of SOURCES) if (await newestIn(join(root, folder), builtAt)) return true;
  return false;
}

/** Whether any file under *directory* changed after *builtAt*. Tests are not built into the page. */
async function newestIn(directory, builtAt) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.name === 'node_modules') continue;
    if (entry.isDirectory() ? await newestIn(path, builtAt) : !entry.name.includes('.test.') && await modifiedAfter(path, builtAt)) return true;
  }
  return false;
}

async function modifiedAfter(path, builtAt) {
  try { return (await stat(path)).mtimeMs > builtAt; } catch { return false; }
}

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

/**
 * Build the page, three tries. A synced folder (Dropbox, OneDrive) holds a
 * handle on editor/dist for a moment after files change in it, and Vite's
 * first step -- emptying that folder -- then fails with EPERM for no reason a
 * second attempt still has.
 */
async function build() {
  for (let attempt = 1; ; attempt += 1) {
    try {
      npm(['run', 'build'], attempt === 1 ? 'Building the editor...' : `Building again (attempt ${attempt})...`);
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((wake) => setTimeout(wake, 2000));
    }
  }
}

/**
 * Run npm, and throw if it fails. Through a shell on Windows: npm is a .cmd
 * there, and Node refuses to start a .cmd directly (EINVAL) since the fix for
 * CVE-2024-27980.
 */
function npm(npmArgs, message) {
  console.log(message);
  const result = spawnSync('npm', npmArgs, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm ${npmArgs.join(' ')} failed.`);
}
