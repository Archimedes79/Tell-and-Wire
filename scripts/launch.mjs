// What every product's start file does, once: stop the one already running on the port, install on first use, build the page when a
// source it is built from is newer than it, and start the server.
//
// A product -- the editor, the notebook -- has a start file of its own (`start.mjs`, `start-notebook.mjs`) that says only what is
// its own: which page, from which folders, built how, started how. Nothing here names a product, and a new one is a new start file.
//
// Starting is also restarting. A server already on the port is stopped first -- only a Tell & Wire one, see editorProcess.mjs --
// because the usual reason to start again is that the code changed, and a server keeps running the code it was started with while
// serving whatever page was built since. The page is rebuilt when any source it is built from is newer than it, graph/, gui/ and
// backend/ included: the page bundles their wire and definitions, so a change there is a page change too.

import { spawn, spawnSync } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPort, stopEditor } from './editorProcess.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @typedef {object} Product
 * @property {string} name What it is called in what is said: "editor", "notebook".
 * @property {number} port Where it starts looking for a free port, and what stop looks for.
 * @property {string} page The built page, from the root: a build is due when a source is newer than it.
 * @property {string[]} buildInputs Files the page is built from, besides the folders.
 * @property {string[]} sources Folders the page's code is in: its own, and those of graph/, gui/ and backend/, which it imports from.
 * @property {string} buildScript The npm script (of the root) that builds the page.
 * @property {string[]} server The server's command line, from the root: the file Node runs, and its arguments.
 */

/**
 * Start *product*, with the command line's *args* (`--port`). Does not return until the server ends.
 * @param {Product} product
 * @param {string[]} args
 */
export async function launch(product, args) {
  try {
    if (Number(process.versions.node.split('.')[0]) < 24) {
      throw new Error(`Node.js 24 or newer is required. Found ${process.version}.`);
    }
    await stopEditor(readPort(args, product.port), product.name);
    if (!await exists(join(root, 'node_modules'))) npm(['ci'], 'Installing dependencies...');
    const page = join(root, product.page);
    if (!await exists(page) || await sourcesNewerThan(product, (await stat(page)).mtimeMs)) await build(product);
  } catch (error) {
    console.error(`\n${error.message}`);
    process.exit(1);
  }

  const server = spawn(process.execPath, [...product.server, ...args], { cwd: root, stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
  server.on('exit', (code, signal) => process.exit(code ?? (signal ? 0 : 1)));
  server.on('error', (error) => {
    console.error(`\nCould not start the ${product.name}: ${error.message}`);
    process.exit(1);
  });
}

async function sourcesNewerThan(product, builtAt) {
  for (const file of product.buildInputs) if (await modifiedAfter(join(root, file), builtAt)) return true;
  for (const folder of product.sources) if (await newestIn(join(root, folder), builtAt)) return true;
  return false;
}

/** Whether any file under *directory* changed after *builtAt*. Tests are not built into the page, and a built page is not a source. */
async function newestIn(directory, builtAt) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
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
 * handle on the built folder for a moment after files change in it, and Vite's
 * first step -- emptying that folder -- then fails with EPERM for no reason a
 * second attempt still has.
 */
async function build(product) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      npm(['run', product.buildScript], attempt === 1 ? `Building the ${product.name}...` : `Building again (attempt ${attempt})...`);
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
