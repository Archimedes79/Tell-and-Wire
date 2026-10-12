#!/usr/bin/env node
// The notebook's start file: `node backend/notebook/main.ts [--port 8100] [--host 127.0.0.1]`.
//
// The editor has its own (`backend/cli/main.ts --editor frontend/dist`); each product is started by the file that is its own, and
// neither names the other. What they share is `runServer` -- the port, the opening of a browser, the stopping -- which takes the page
// and the routes of the product it serves. The page is the notebook's own build, `frontend/notebook/dist` (`npm run build:notebook`).
//
// Separate from the routes so that everything there stays importable and testable without a process exiting in the middle of a test run.

import { join } from 'node:path';
import { messageOf } from '../../graph/errors.ts';
import { aiSetting } from '../deployment/runtime/ai/settings.ts';
import { installFolder } from '../deployment/project/layout.ts';
import { parseArgs, runServer } from '../cli/cli.ts';
import { notebookPart } from './routes.ts';

/** Where a free port is looked for first: not 8000, which the editor takes, so that both can be open. */
const NOTEBOOK_PORT = 8100;

/** What the notebook says of the model setup once it is up: which AI runs the windows, and which writes them. */
async function setupLines(): Promise<string[]> {
  const line = (what: string, chosen: { provider: string; model: string }) => `${what}: ${chosen.provider}/${chosen.model || '(no model)'}`;
  const [runs, writes] = await Promise.all([aiSetting(process.cwd(), process.env, 'run'), aiSetting(process.cwd(), process.env, 'write')]);
  const apart = runs.provider !== writes.provider || runs.model !== writes.model;
  return [line(apart ? 'AI that runs the windows' : 'AI', runs), ...(apart ? [line('AI that writes the windows', writes)] : [])];
}

runServer(parseArgs(process.argv.slice(2)), {
  part: notebookPart(join(installFolder(), 'frontend', 'notebook', 'dist')),
  name: 'notebook',
  port: NOTEBOOK_PORT,
  setup: setupLines,
})
  .then((code) => { process.exitCode = code; })
  .catch((error: unknown) => {
    process.stderr.write(`${messageOf(error)}\n`);
    process.exitCode = 1;
  });
