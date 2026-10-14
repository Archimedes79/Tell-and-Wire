// What someone who downloads the notebook's zip gets, tried the way they try it:
// `node --test scripts/package-notebook.test.mjs`, after `npm run build:notebook`.
//
// A copy of package.test.mjs in what it does, and smaller: the two products are packed by scripts of their own and
// each is tried by a test of its own, so a change to one package breaks the other's test only if it broke the other's package.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const windows = process.platform === 'win32';
const work = mkdtempSync(join(tmpdir(), 'tell-and-wire-notebook-package-'));
const folder = join(work, 'tell-and-wire-notebook-test');
const launcher = join(folder, windows ? 'run.cmd' : 'run.sh');

/** Every child this file started, so a failure halfway leaves no server behind. */
const started = [];

after(() => {
  for (const child of started) stopTree(child);
  rmSync(work, { recursive: true, force: true });
});

/** Unzip with the tools a person has: Info-ZIP's unzip on Linux, on Windows its own tar.exe (bsdtar, which reads a zip), named by its place. */
function unzip(zip, into) {
  return windows
    ? spawnSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', into], { encoding: 'utf8' })
    : spawnSync('unzip', ['-q', zip, '-d', into], { encoding: 'utf8' });
}

/** On Windows the launcher is cmd.exe with node under it; killing cmd.exe alone orphans node. */
function stopTree(child) {
  if (child.exitCode !== null) return;
  if (windows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
  else child.kill();
}

/** Start the launcher as a double-click would; resolves to the URL it serves on. */
function launch() {
  const env = { ...process.env, TW_NO_BROWSER: '1', TW_NO_PAUSE: '1', TW_SETTINGS: join(work, 'ai-settings.json') };
  for (const key of Object.keys(env)) if (key.toUpperCase() === 'PORT') delete env[key];
  // The example pages name their files relative to the folder they are started from.
  const child = spawn(windows ? process.env.ComSpec || 'cmd.exe' : launcher, windows ? ['/d', '/c', launcher] : [], {
    cwd: folder, env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  started.push(child);
  let output = '';
  const served = new Promise((found, failed) => {
    const look = (chunk) => {
      output += chunk;
      const url = /Serving on (http:\/\/\S+)/.exec(output)?.[1];
      if (url) found(url);
    };
    child.stdout.on('data', look);
    child.stderr.on('data', look);
    child.on('exit', (code) => failed(new Error(`the launcher ended (${code}) before serving:\n${output}`)));
  });
  const ended = new Promise((done) => child.on('exit', done));
  return { child, served, ended };
}

test('the notebook zip holds the notebook and not the editor, and its launcher serves the notebook and opens an example', async () => {
  assert.ok(existsSync(join(root, 'frontend', 'notebook', 'dist', 'index.html')), 'build the notebook first: npm run build:notebook');
  const zip = join(work, 'tell-and-wire-notebook-test.zip');
  const packed = spawnSync(process.execPath, [join(root, 'scripts', 'package-notebook.mjs'), zip], {
    cwd: root, encoding: 'utf8', env: { ...process.env, TW_VERSION: 'test' },
  });
  assert.equal(packed.status, 0, packed.stderr);

  const unpacked = unzip(zip, work);
  assert.equal(unpacked.status, 0, unpacked.stderr);

  for (const file of ['run.sh', 'run.cmd', 'README.md', 'VERSION', 'LICENSE', 'backend/notebook/main.ts', 'frontend/notebook/dist/index.html', 'notebook-examples/badge_maker/gui.json', 'graph/authoring/nodes/registry.ts', 'gui/authoring/check.ts']) {
    assert.ok(existsSync(join(folder, file)), `${file} is in the zip`);
  }
  // The other product is not in it: no editor page, no editor server, no tool servers.
  for (const file of ['frontend/dist', 'backend/editor', 'graph/editor', 'gui/editor', 'mcp']) {
    assert.ok(!existsSync(join(folder, file)), `${file} is not in the zip`);
  }
  assert.match(readFileSync(join(folder, 'VERSION'), 'utf8'), /^Tell & Wire Notebook test\ncommit \S+\nbuilt /);
  if (!windows) assert.ok(statSync(join(folder, 'run.sh')).mode & 0o111, 'run.sh is executable once unzipped');

  const run = launch();
  const served = await run.served;
  const page = await fetch(served);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>/);

  const opened = await fetch(new URL('/api/windows/load', served), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: join(folder, 'notebook-examples', 'badge_maker') }),
  });
  assert.equal(opened.status, 200);
  assert.ok((await opened.json()).windows, 'the example comes with its page');
  stopTree(run.child);
  await run.ended;
}, { timeout: 120_000 });
