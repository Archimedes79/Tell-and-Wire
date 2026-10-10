// Where the model configuration comes from.
//
// Three sources, in the order that lets each override the one below it:
//
//   1. what the caller passed in code
//   2. environment variables
//   3. `ai-settings.json`
//
// The file exists because a key is not something to type into a terminal on
// every run, and because a double-clicked build has no terminal to type it in.
//
// It is **not** in the repository and must not be: `.gitignore` names it, and
// `ai-settings.example.json` beside it shows the shape with no key in it.
//
// Which tool servers this machine has is not said by this file but by the
// machine's own settings and the servers' folders -- see `configuredMcpServers`.
//
// And it holds the one AI setting, which `aiSetting` alone resolves.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SETTINGS, settingsFromEnv, type ProviderSettings } from './providers.ts';
import type { McpServerConfig } from './mcp.ts';
import type { ModelChoice } from '../nodes/Runtime.ts';

const FILENAME = 'ai-settings.json';

/**
 * Where the file is looked for, in order.
 *
 * `TW_SETTINGS` is not the first of several candidates but the only one:
 * "use this file" has to mean that even when the file is not there yet, or the
 * search quietly falls through to some other machine-wide file and the answer
 * depends on what else happens to be installed.
 */
export function candidatePaths(
  cwd = process.cwd(),
  env: Record<string, string | undefined> = process.env,
): string[] {
  if (env.TW_SETTINGS) return [env.TW_SETTINGS];
  return [...new Set([
    join(cwd, FILENAME),
    // Beside the bundle, which is the deployed equivalent of a config file:
    // a recipient drops one next to `run.sh` and never sets a variable.
    join(installFolder(), FILENAME),
    join(homedir(), '.tell-and-wire', 'settings.json'),
  ])];
}

/** The file of a tool server's own folder under `mcp/` that says how it is started. */
const SERVER_FILE = 'server.json';

/**
 * Every file that holds a key, a token or a command: what a graph must never
 * read or write and a code body never sees. The settings files, and the
 * tool servers' own.
 */
export function secretPaths(env: Record<string, string | undefined> = process.env): string[] {
  const folder = join(installFolder(), 'mcp');
  const servers = existsSync(folder) ? readdirSync(folder).map((name) => join(folder, name, SERVER_FILE)) : [];
  return [...candidatePaths(process.cwd(), env), ...servers];
}

/**
 * The folder the code came in, with its launchers: the one holding `graph/`
 * -- a checkout, the downloadable package, a bundle, which all keep it at the
 * same path. Found by name, not counted.
 */
export function installFolder(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (basename(dir) !== 'graph' && dirname(dir) !== dir) dir = dirname(dir);
  return dirname(dir);
}

/**
 * The file that is in use, or would be written.
 *
 * `TW_SETTINGS` wins outright, whether or not the file exists yet: "use
 * this file" has to hold for the first write too, or a save silently lands
 * somewhere else. Otherwise the first candidate that exists, else the first
 * candidate, which is where a save creates it.
 */
export function settingsPath(cwd = process.cwd(), env: Record<string, string | undefined> = process.env): string {
  const candidates = candidatePaths(cwd, env);
  return candidates.find((path) => existsSync(path)) ?? candidates[0];
}

export interface SettingsFile {
  /** The one AI setting (`aiSetting`), as ⚙ Settings saves it. */
  ai?: { provider?: string; model?: string };
  api_keys?: Record<string, string>;
  /** Keyed by provider name: `endpoints.lmstudio`. */
  endpoints?: Record<string, string>;
  /**
   * Tool servers, keyed by the name a graph uses for them.
   *
   * The entries are Claude Desktop's `mcpServers` entries, so the snippet in
   * any MCP server's README pastes in as it is; `{ "url": … }` is added for a
   * server reached over HTTP.
   */
  mcp_servers?: Record<string, McpServerConfig>;
}

/**
 * One settings file, parsed, or why it cannot be: missing is empty, anything
 * but a JSON object throws. For a writer, which must not save over a file it
 * could not read -- the keys and tool servers in it would be gone.
 */
export function parseSettingsFile(path: string): SettingsFile {
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('it is not a JSON object');
  return parsed as SettingsFile;
}

/**
 * One settings file, parsed. Missing is empty; malformed is empty too, because
 * a file someone is halfway through editing should not stop a run that does
 * not need a model at all.
 */
export function readSettingsFile(path: string): SettingsFile {
  try {
    return parseSettingsFile(path);
  } catch {
    return {};
  }
}

/** The settings file in use, as provider settings, or nothing. */
export function fromFile(
  cwd = process.cwd(),
  env: Record<string, string | undefined> = process.env,
): Partial<ProviderSettings> {
  const parsed = readSettingsFile(settingsPath(cwd, env));
  // Missing and malformed read as empty, and empty means "nothing configured
  // here" -- not "keys and endpoints, both blank", which would look configured.
  if (Object.keys(parsed).length === 0) return {};
  return {
    apiKeys: parsed.api_keys ?? {},
    // A blank address is no address: the provider's own default stands.
    endpoints: Object.fromEntries(Object.entries(parsed.endpoints ?? {}).filter(([, url]) => String(url ?? '').trim())),
  };
}

/**
 * The file, then the environment on top of it.
 *
 * An explicitly set variable wins, which is what makes `OLLAMA_BASE_URL=x`
 * on one command a usable thing to do without editing the file. Which model
 * to ask is not here: that is the one AI setting (`aiSetting`).
 */
export function configuredSettings(
  env: Record<string, string | undefined> = process.env,
  cwd = process.cwd(),
): Partial<ProviderSettings> {
  // The same environment for both halves: reading the file through
  // `process.env` while everything else follows the argument made the answer
  // depend on the machine the caller was trying to hold still.
  const file = fromFile(cwd, env);
  const environment = settingsFromEnv(env);
  return {
    ...file,
    ...environment,
    apiKeys: { ...file.apiKeys, ...environment.apiKeys },
    endpoints: { ...file.endpoints, ...environment.endpoints },
  };
}

// ---------------------------------------------------------------------------
// The one AI setting
// ---------------------------------------------------------------------------

type Env = Record<string, string | undefined>;

/** A usable model when none was configured, per provider. Empty: only the user knows. */
const DEFAULT_MODELS: Record<string, string> = {
  ollama: 'llama3',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-opus-5',
  google: 'gemini-flash-lite-latest',
  github_copilot: 'gpt-4o-mini',
};

export const LOCAL_PROVIDERS = ['ollama', 'lmstudio'] as const;

/**
 * Cached per provider, but only for a few seconds.
 *
 * A local probe is one request to a machine you are already talking to, so
 * the cache is here to keep a burst of calls from making a burst of probes,
 * nothing more: a model swapped in LM Studio shows within seconds, and
 * `refresh` (the status route's) asks again at once.
 */
const probed = new Map<string, { models: string[] | null; at: number }>();
const PROBE_TTL_MS = 5_000;

/**
 * The models a local provider serves right now, or null when it is not there.
 *
 * Asked of the provider itself rather than assumed: a machine that runs LM
 * Studio instead of Ollama should not get connection errors out of the box.
 * `refresh` re-asks, which the editor's status route does so starting LM
 * Studio mid-session is noticed.
 */
export async function probeLocal(
  provider: string,
  { refresh = false, timeoutMs = 1500, cwd = process.cwd(), env = process.env as Env } = {},
): Promise<string[] | null> {
  if (!(LOCAL_PROVIDERS as readonly string[]).includes(provider)) return null;
  const cached = probed.get(provider);
  if (!refresh && cached && Date.now() - cached.at < PROBE_TTL_MS) return cached.models;

  // Where a call goes: the environment over the file, as `configuredSettings` has it.
  const base = (configuredSettings(env, cwd).endpoints?.[provider] ?? DEFAULT_SETTINGS.endpoints[provider]).replace(/\/+$/, '');
  const url = provider === 'ollama' ? `${base}/api/tags` : `${base}/models`;
  let models: string[] | null = null;
  try {
    const reply = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    const payload = await reply.json() as { models?: { name?: string }[]; data?: { id?: string }[] };
    models = provider === 'ollama'
      ? (payload.models ?? []).map((m) => m.name ?? '').filter(Boolean)
      : (payload.data ?? []).map((m) => m.id ?? '').filter(Boolean);
  } catch {
    // Not reachable is a normal answer here, not an error.
  }
  probed.set(provider, { models, at: Date.now() });
  return models;
}

/**
 * The one AI setting: where every AI call goes that does not name its own
 * provider and model -- ✨ and its probe, ▶ Try, and
 * every run, in the editor, from the command line and in a deployed tool
 * alike. Only a node that pins its own model is answered by
 * anything else.
 *
 * Read here and nowhere else, so the editor's "now: …" and what a run calls
 * cannot disagree. The file's `ai` section is what ⚙ Settings saves;
 * `TW_AI_PROVIDER` / `TW_AI_MODEL` are the same setting for a
 * machine with no dialog, and win over the file. With nothing set it is
 * whichever local provider is running, else Ollama. A provider named without a
 * model takes *its own* default, not whatever another provider has loaded.
 */
export async function aiSetting(cwd = process.cwd(), env: Env = process.env): Promise<ModelChoice> {
  // Each of the two on its own: a variable naming the model leaves the file's provider standing.
  const saved = readSettingsFile(settingsPath(cwd, env)).ai;
  let provider = env.TW_AI_PROVIDER || saved?.provider || '';
  const model = env.TW_AI_MODEL || saved?.model || '';
  if (!provider) {
    for (const local of LOCAL_PROVIDERS) {
      if (await probeLocal(local, { cwd, env })) { provider = local; break; }
    }
  }
  provider ||= 'ollama';
  if (model) return { provider, model };
  const served = await probeLocal(provider, { cwd, env });
  return { provider, model: served?.[0] ?? DEFAULT_MODELS[provider] ?? '' };
}

/**
 * The tool servers this machine has, by the name a graph uses for them.
 *
 * Two places, and no other: the servers' own folders -- `mcp/<name>/server.json`
 * in the install folder, where `graph/` lives; the server runs in that folder
 * -- and `mcp_servers` in the machine's settings file (`TW_SETTINGS`, else
 * `~/.tell-and-wire/settings.json`), which wins by name. Not the working
 * directory and not the project folder: a stranger's project may ship an
 * `ai-settings.json` with keys and endpoints in it, and a command in it would
 * be a program started by opening a graph. No environment variable either, for
 * the same reason: one place a program to run comes from is the right number.
 *
 * An entry that is neither a command nor a URL is dropped rather than passed
 * on, so what reaches the client is only ever one of the two shapes it knows.
 * A graph naming a dropped entry is told it is not configured, which is true.
 */
export function configuredMcpServers(env: Record<string, string | undefined> = process.env): Record<string, McpServerConfig> {
  const servers: Record<string, McpServerConfig> = {};
  const folder = join(installFolder(), 'mcp');
  for (const name of existsSync(folder) ? readdirSync(folder) : []) {
    const entry = readSettingsFile(join(folder, name, SERVER_FILE)) as unknown as McpServerConfig;
    if (usable(entry)) servers[name] = 'command' in entry ? { cwd: join(folder, name), ...entry } : entry;
  }
  const listed = readSettingsFile(env.TW_SETTINGS || join(homedir(), '.tell-and-wire', 'settings.json')).mcp_servers;
  for (const [name, entry] of Object.entries(listed && typeof listed === 'object' && !Array.isArray(listed) ? listed : {})) {
    if (usable(entry)) servers[name] = entry;
  }
  return servers;
}

const usable = (entry: unknown): entry is McpServerConfig => {
  const { command, url } = (entry ?? {}) as { command?: unknown; url?: unknown };
  return (typeof command === 'string' && !!command) || (typeof url === 'string' && !!url);
};

export { FILENAME as SETTINGS_FILENAME };
