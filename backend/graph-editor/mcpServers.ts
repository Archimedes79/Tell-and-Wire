// The tool servers that come with this installation, for the editor.
//
// A server is a folder under `mcp/` with a `config.json` of its own: what it is
// called, how it starts, and the environment variables it reads -- each with a
// line on what it means. That list is also the whole of what it may be given.
// If the folder has a `settings.html` the editor shows that page where the
// server's settings are set (`frontend/.../ToolServerDialogs.tsx`); the editor
// itself knows nothing of what a setting is.
//
// Setting one up writes an entry into the machine's `ai-settings.json`, the
// same entry a person would write by hand: a command, its arguments, its
// folder, its environment. A graph still only *names* the server (see
// `graph/ai/mcp.ts`); this is the one place a command line is written for it,
// from a file in the installation -- never from a request's own words, which
// can only fill in the variables the server's config lists. Hence
// `backend/graph-editor/`, and routes that only a server bound to this machine
// answers.

import { exec } from 'node:child_process';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { delimiter, join, resolve } from 'node:path';
import { configuredMcpServers, installFolder } from '../../graph/ai/settings.ts';
import { mcpToolService, type McpServerConfig } from '../../graph/ai/mcp.ts';
import { Refusal, message } from '../app/http.ts';
import type { McpSaved, McpServerView, McpServersView } from '../app/api.ts';
import { edit } from './settings.ts';

type Env = Record<string, string | undefined>;

interface Config {
  title: string;
  about: string;
  command: string;
  args: string[];
  /** The variables it reads, each with what it means: all it may be given. */
  env: Record<string, string>;
  /** Those it does not start without. */
  required: string[];
}

interface Found {
  name: string;
  folder: string;
  config: Config | null;
  /** Its `settings.html`, or nothing. */
  page: string;
  problem: string;
}

const FOLDER_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const VARIABLE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const defaultRoot = (): string => join(installFolder(), 'mcp');

// ---------------------------------------------------------------------------
// What a folder says
// ---------------------------------------------------------------------------

function parseConfig(source: string): Config {
  const raw = JSON.parse(source) as Record<string, unknown>;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('it is not a JSON object');
  const text = (value: unknown, what: string, needed = false): string => {
    if (value === undefined && !needed) return '';
    if (typeof value !== 'string' || (needed && !value.trim())) throw new Error(`"${what}" must be ${needed ? 'some text' : 'text'}`);
    return value;
  };

  const args = raw.args ?? [];
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) throw new Error('"args" must be a list of text');
  const listed = raw.env ?? {};
  if (!listed || typeof listed !== 'object' || Array.isArray(listed)) throw new Error('"env" must be an object');
  const env: Record<string, string> = {};
  for (const [key, meaning] of Object.entries(listed)) {
    if (!VARIABLE.test(key)) throw new Error(`"${key}" is not the name of an environment variable`);
    env[key] = text(meaning, `env.${key}`);
  }
  const required = raw.required ?? [];
  if (!Array.isArray(required) || required.some((key) => typeof key !== 'string' || !(key in env))) {
    throw new Error('"required" must list variables that "env" names');
  }
  return {
    title: text(raw.title, 'title', true),
    about: text(raw.about, 'about'),
    command: text(raw.command, 'command', true),
    args: args as string[],
    env,
    required: required as string[],
  };
}

async function folders(root: string): Promise<string[]> {
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && FOLDER_NAME.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

/** Every folder under *root* that has a `config.json` -- one that has none is not a tool server. */
async function found(root: string): Promise<Found[]> {
  const servers: Found[] = [];
  for (const name of await folders(root)) {
    const folder = join(root, name);
    let source: string;
    try {
      source = await readFile(join(folder, 'config.json'), 'utf8');
    } catch {
      continue;
    }
    const page = await readFile(join(folder, 'settings.html'), 'utf8').catch(() => '');
    try {
      servers.push({ name, folder, config: parseConfig(source), page, problem: '' });
    } catch (error) {
      servers.push({ name, folder, config: null, page, problem: `mcp/${name}/config.json: ${message(error)}.` });
    }
  }
  return servers;
}

/** The one server of this name, as a name a request sent: looked up among the folders, never made into a path. */
async function server(name: string, root: string): Promise<Found & { config: Config }> {
  const one = (await found(root)).find((candidate) => candidate.name === name);
  if (!one) throw new Refusal(404, `There is no tool server "${name}" in mcp/.`);
  if (!one.config) throw new Refusal(422, one.problem);
  return { ...one, config: one.config };
}

/** Its packages are in its folder, or it needs none. */
async function installed(folder: string): Promise<boolean> {
  try {
    const { dependencies } = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
    if (!dependencies || Object.keys(dependencies).length === 0) return true;
  } catch {
    return true;
  }
  return (await stat(join(folder, 'node_modules')).catch(() => null))?.isDirectory() === true;
}

// ---------------------------------------------------------------------------
// The entry in ai-settings.json
// ---------------------------------------------------------------------------

const same = (a: string, b: string): boolean => (process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b));

/** An entry this editor wrote for the server in *folder*: it runs from there. Any other entry of the name was written by hand. */
function isOurs(entry: McpServerConfig | undefined, folder: string): entry is Extract<McpServerConfig, { command: string }> {
  return !!entry && 'command' in entry && typeof entry.cwd === 'string' && same(entry.cwd, folder);
}

function entryFor(one: Found & { config: Config }, env: Record<string, string>): McpServerConfig {
  return {
    // The Node that is running this editor: a download carries its own, which is on no PATH.
    command: one.config.command === 'node' ? process.execPath : one.config.command,
    args: one.config.args,
    cwd: one.folder,
    ...(Object.keys(env).length ? { env } : {}),
  };
}

async function viewOf(one: Found, listed: Record<string, McpServerConfig>): Promise<McpServerView> {
  const entry = Object.prototype.hasOwnProperty.call(listed, one.name) ? listed[one.name] : undefined;
  const ours = isOurs(entry, one.folder);
  const { config } = one;
  return {
    name: one.name,
    title: config?.title ?? one.name,
    about: config?.about ?? '',
    env: config?.env ?? {},
    required: config?.required ?? [],
    page: one.page,
    values: ours && config ? Object.fromEntries(Object.keys(config.env).filter((key) => entry.env?.[key] !== undefined).map((key) => [key, entry.env![key]])) : null,
    installed: await installed(one.folder),
    by_hand: !!entry && !ours,
    problem: one.problem,
  };
}

// ---------------------------------------------------------------------------
// What the editor asks
// ---------------------------------------------------------------------------

/** The servers that came with this installation, and the names this machine has entries for. */
export async function list(root = defaultRoot(), cwd = process.cwd(), env: Env = process.env): Promise<McpServersView> {
  const listed = configuredMcpServers(env, cwd);
  return { servers: await Promise.all((await found(root)).map((one) => viewOf(one, listed))), configured: Object.keys(listed), delimiter };
}

/**
 * Set a server up on this machine: install its packages if they are not
 * there, write its entry, then start it once and say what it offered or why it
 * did not start. The entry stays either way -- a server that wants a folder
 * that is not mounted yet is still set up.
 *
 * *values* are the variables the server reads; blank ones are left out. One
 * its config does not list is refused, so what a request can put into a
 * server's environment is what the server's own folder says it reads.
 */
export async function save(
  name: string, values: Record<string, string>, root = defaultRoot(), cwd = process.cwd(), env: Env = process.env,
): Promise<McpSaved> {
  const one = await server(name, root);
  const listed = configuredMcpServers(env, cwd);
  if (Object.prototype.hasOwnProperty.call(listed, name) && !isOurs(listed[name], one.folder)) {
    throw new Refusal(409, `ai-settings.json already has a tool server called "${name}" that is not this one. Edit it there, or take its entry out first.`);
  }

  const held: Record<string, string> = {};
  for (const [key, given] of Object.entries(values ?? {})) {
    if (!Object.prototype.hasOwnProperty.call(one.config.env, key)) {
      throw new Refusal(422, `"${key}" is not one of its settings. It reads ${Object.keys(one.config.env).join(', ') || 'none'}.`);
    }
    if (String(given).trim()) held[key] = String(given).trim();
  }
  for (const key of one.config.required) {
    if (!held[key]) throw new Refusal(422, `${key} is needed: ${one.config.env[key]}`);
  }

  if (!(await installed(one.folder))) await install(one);
  const entry = entryFor(one, held);
  await edit((file) => { file.mcp_servers = { ...file.mcp_servers, [name]: entry }; }, cwd, env);
  return { server: await viewOf(one, { ...listed, [name]: entry }), ...(await started(name, entry)) };
}

async function started(name: string, entry: McpServerConfig): Promise<{ tools: string[]; problem: string }> {
  try {
    const session = await mcpToolService({ [name]: entry }, { handshakeTimeoutMs: 20_000 }).open([name]);
    try {
      return { tools: session.specs.map((spec) => spec.name), problem: '' };
    } finally {
      await session.close();
    }
  } catch (error) {
    return { tools: [], problem: message(error) };
  }
}

/** Install a server's packages into its folder, as `npm ci` does: the versions its lockfile names, and none of its install scripts. */
async function install(one: Found): Promise<void> {
  try {
    await npm(one.folder);
  } catch (error) {
    const output = (error as { output?: string }).output ?? '';
    if ((error as { code?: unknown }).code === 'ENOENT' || /not recognized|not found/i.test(output)) {
      throw new Refusal(422, 'Its packages are not installed, and npm is not available here to install them. '
        + `The download of Tell & Wire carries its servers with their packages; a copy without them needs npm, which comes with Node.js. Then run "npm ci --omit=dev" in ${one.folder}.`);
    }
    // npm empties node_modules before it installs: what is left after a failure is half a server.
    await rm(join(one.folder, 'node_modules'), { recursive: true, force: true });
    throw new Refusal(422, `npm could not install its packages: ${output.slice(-600) || message(error)}`);
  }
}

/** A fixed command text: nothing a request says is part of it. (A shell starts it, as Windows needs for npm's .cmd shim.) */
function npm(cwd: string): Promise<void> {
  return new Promise((done, fail) => {
    exec('npm ci --omit=dev --ignore-scripts --no-audit --no-fund', { cwd, timeout: 300_000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => (error ? fail(Object.assign(error, { output: `${stderr}${stdout}`.trim() })) : done()));
  });
}
