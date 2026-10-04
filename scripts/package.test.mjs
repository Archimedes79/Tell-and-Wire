// What someone who downloads the zip gets, tried the way they try it:
// `node --test scripts/package.test.mjs`, after `npm run build`.
//
// Not a unit test. v0.2.0's zip was intact and still "did not start": its
// run.cmd assumed Node was there and new enough, and its run.sh came out of the
// archive without an executable bit. None of that shows without unzipping it
// and double-clicking, so this does exactly that, on Linux and on Windows.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const windows = process.platform === 'win32';
const work = mkdtempSync(join(tmpdir(), 'tell-and-wire-package-'));
const folder = join(work, 'tell-and-wire-test');
const launcher = join(folder, windows ? 'run.cmd' : 'run.sh');

/** Every child this file started, so a failure halfway leaves no editor behind. */
const started = [];

after(() => {
  for (const child of started) stopTree(child);
  rmSync(work, { recursive: true, force: true });
});

/**
 * Unzip *zip* into *into* with the tools a person has: Info-ZIP's unzip on
 * Linux, and on Windows 10 and later its own tar.exe -- bsdtar, which reads a
 * zip. Named by its place, not looked up: in a Git Bash, PATH finds GNU tar
 * first, which reads no zip and takes "C:" for a host to connect to.
 */
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

/** Start the launcher as a double-click would: its path, from some other folder; resolves to the URL it serves on. */
function launch() {
  const env = { ...process.env, TW_NO_BROWSER: '1', TW_NO_PAUSE: '1' };
  // PORT is removed, not emptied; keys are matched without regard to case (`Path` on Windows).
  for (const key of Object.keys(env)) if (key.toUpperCase() === 'PORT') delete env[key];
  const child = spawn(windows ? process.env.ComSpec || 'cmd.exe' : launcher, windows ? ['/d', '/c', launcher] : [], {
    cwd: work, env, stdio: ['ignore', 'pipe', 'pipe'],
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

test('the zip holds what a person runs, and its launcher starts from its own folder and serves the editor', async () => {
  assert.ok(existsSync(join(root, 'frontend', 'dist', 'index.html')), 'build the editor first: npm run build');
  const zip = join(work, 'tell-and-wire-test.zip');
  const packed = spawnSync(process.execPath, [join(root, 'scripts', 'package.mjs'), zip], {
    cwd: root, encoding: 'utf8', env: { ...process.env, TW_VERSION: 'test' },
  });
  assert.equal(packed.status, 0, packed.stderr);

  const unpacked = unzip(zip, work);
  assert.equal(unpacked.status, 0, unpacked.stderr);

  for (const file of ['run.sh', 'run.cmd', 'README.md', 'VERSION', 'LICENSE', 'backend/app/main.ts', 'frontend/dist/index.html', 'frontend/dist/licenses.txt']) {
    assert.ok(existsSync(join(folder, file)), `${file} is in the zip`);
  }
  assert.match(readFileSync(join(folder, 'VERSION'), 'utf8'), /^Tell & Wire test\ncommit \S+\nbuilt /);
  // "Permission denied" was every Mac and Linux user's first ./run.sh.
  if (!windows) assert.ok(statSync(join(folder, 'run.sh')).mode & 0o111, 'run.sh is executable once unzipped');

  const run = launch();
  const page = await fetch(await run.served);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>/);
  stopTree(run.child);
  await run.ended;
}, { timeout: 120_000 });
