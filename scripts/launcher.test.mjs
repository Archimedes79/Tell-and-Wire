// What the launcher promises, tried against a real editor: `node --test scripts/`.
//
// Not a unit test. The things that went wrong on a real machine were a fresh
// checkout that never installed, and a stop that ended whatever happened to be
// on the port -- and neither can be seen without starting the thing. So this
// test runs start.mjs and stop.mjs as a person does, on a port nothing else uses.
//
// It installs and builds when the checkout has not yet, which is the
// fresh-checkout case and is also why it is given ten minutes.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isTellAndWire, isListening } from './editorProcess.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Out of the way of the editor a person has open on 8000, and of the examples' ports. */
const PORT = 8731;
const START = join(root, 'scripts', 'start.mjs');
const STOP = join(root, 'scripts', 'stop.mjs');

/** Every child this file started, so a failure halfway leaves nothing behind. */
const started = [];

function launch() {
  const child = spawn(process.execPath, [START, '--port', String(PORT)], {
    cwd: root,
    stdio: 'ignore',
    env: { ...process.env, TW_NO_BROWSER: '1' },
  });
  started.push(child);
  return child;
}

const stop = (...args) => spawnSync(process.execPath, [STOP, ...args], { cwd: root, encoding: 'utf8' });

/** Wait until *ready* answers true, or give up after *seconds*. */
async function until(ready, seconds) {
  for (let waited = 0; waited < seconds * 10; waited += 1) {
    if (await ready()) return true;
    await new Promise((wake) => setTimeout(wake, 100));
  }
  return false;
}

after(async () => {
  stop('--port', String(PORT));
  for (const child of started) child.kill();
});

test('starts, stops, and will not end a program on that port that is not Tell & Wire', async () => {
  launch();
  assert.ok(await until(() => isTellAndWire(PORT), 600), `nothing answered as Tell & Wire on ${PORT}`);

  const first = stop('--port', String(PORT));
  assert.equal(first.status, 0);
  assert.match(first.stdout, /Editor stopped\./);
  assert.equal(await isListening(PORT), false);

  // The reason the check exists: the launcher used to end whatever held the
  // port, which on 8000 is somebody's database as often as it is the editor.
  const stranger = createServer((_request, response) => response.end('not me'));
  await new Promise((listening) => stranger.listen(PORT, '127.0.0.1', listening));
  try {
    const refused = stop('--port', String(PORT));
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /not Tell & Wire/);
    assert.ok(stranger.listening, 'the stranger is still running');
  } finally {
    await new Promise((closed) => stranger.close(closed));
  }
}, { timeout: 620_000 });
