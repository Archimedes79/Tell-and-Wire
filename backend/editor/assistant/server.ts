// Tell & Wire, offered to an assistant outside it.
//
// A Model Context Protocol server over stdio: Claude Code, Claude Desktop or any
// other MCP client can have a graph designed, check one, save it and run it.
// `backend/deployment/runtime/ai/tools.ts` is the other direction -- a graph's model
// calling out to somebody's tools. This is somebody's model calling in.
//
// **One folder, one door.** Everything the outside can reach is the nine tools,
// and everything they can reach is one folder. Four more files beside this one, so each can be
// read and tested without the others:
//
//   spec.ts       what the tools say of themselves: their descriptions, limits, guide
//   confine.ts    what they may touch and say: the confinement rules, each with a test
//   tools.ts      `createGraphTools`, what the tools do. No transport, no process, no
//                 globals: a test hands it a temp folder and a fake model.
//   transport.ts  `serveStdio`, JSON-RPC over two streams
//
// This file wires the real machine into them: `runMcpServer`, which
// `backend/cli/cli.ts` calls for `--mcp`, and nothing else does.
//
// No SDK, for the reason the client has none: Tell & Wire has no runtime
// dependencies. It lives under `backend/editor/` because it is the editor's, and a
// package does not carry an `editor` folder (`backend/editor/project/deploy/bundle.ts`), which
// is why `cli.ts` reaches this file with a dynamic import.

import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { aiSetting, configuredMcpServers, configuredSettings } from '../../deployment/runtime/ai/settings.ts';
import { SECRET_NAME } from '../../deployment/runtime/ai/providers.ts';
import { nodeRuntime } from '../../deployment/runtime/services.ts';
import { hostCore } from '../../deployment/host/room.ts';
import { createGraphTools } from './tools.ts';
import { serveStdio } from './transport.ts';
import { messageOf } from '../../../graph/errors.ts';

/** Every string on this machine that a result must not contain (`scrubber` skips the short ones). Read fresh each time: keys change while a server runs. */
function machineSecrets(): string[] {
  const found: string[] = Object.values(configuredSettings().apiKeys ?? {});
  for (const [name, value] of Object.entries(process.env)) {
    if (value && SECRET_NAME.test(name)) found.push(value);
  }
  for (const server of Object.values(configuredMcpServers())) {
    if ('headers' in server) found.push(...Object.values(server.headers ?? {}));
    if ('env' in server) {
      for (const [name, value] of Object.entries(server.env ?? {})) if (SECRET_NAME.test(name)) found.push(value);
    }
  }
  return found;
}

/**
 * `node backend/cli/main.ts --mcp [--mcp-root <dir>]`.
 *
 * The root defaults to where the client started this process, which for Claude
 * Code is the project it was opened in. The process moves *into* the root, so
 * a relative path inside a graph -- `data/sales.csv` on a file picker -- means
 * the same thing here as the path arguments do.
 */
export async function runMcpServer(folder?: string): Promise<void> {
  const root = resolve(folder ?? process.cwd());
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`--mcp-root: ${root} is not a folder.`);
  }
  process.chdir(root);

  // stdout belongs to the protocol. Nothing in Tell & Wire prints to it, and
  // this is for the dependency-free day somebody adds a `console.log` anyway.
  const toStderr = (...parts: unknown[]): void => { process.stderr.write(`${parts.map(String).join(' ')}\n`); };
  console.log = toStderr;
  console.info = toStderr;
  console.debug = toStderr;

  // A server a client started is not watched by anyone. One rejected promise
  // in a run must cost that run, not every tool call after it.
  process.on('uncaughtException', (error) => toStderr('tell-and-wire mcp:', messageOf(error)));
  process.on('unhandledRejection', (error) => toStderr('tell-and-wire mcp:', messageOf(error)));

  const tools = createGraphTools({
    root,
    // Built per call, like the runtime: a key saved in the editor while this
    // server runs is the key the next generation uses.
    ai: { complete: (request) => nodeRuntime().ai.complete(request) },
    runtime: () => nodeRuntime(),
    core: () => hostCore(),
    target: () => aiSetting(process.cwd(), process.env, 'write'),
    secrets: machineSecrets,
  });

  process.stderr.write(`tell-and-wire MCP server on stdio, confined to ${root}\n`);
  await serveStdio(tools);
}
