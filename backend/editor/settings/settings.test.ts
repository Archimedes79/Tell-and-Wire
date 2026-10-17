import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { providerStatus, save, status } from './settings.ts';
import { aiSetting, readSettingsFile } from '../../deployment/runtime/ai/settings.ts';

/**
 * The settings dialog's contract: what it may see, and what a save may change.
 *
 * Every test names its own file through TW_SETTINGS and an empty
 * environment, so nothing here can read the developer's real keys or write
 * into their real file.
 */

afterEach(() => { vi.unstubAllGlobals(); });

async function own(contents?: unknown) {
  const dir = await mkdtemp(join(tmpdir(), 'ai-settings-'));
  const file = join(dir, 'ai-settings.json');
  if (contents !== undefined) await writeFile(file, JSON.stringify(contents));
  const env = { TW_SETTINGS: file } as Record<string, string | undefined>;
  return { file, env, dir };
}

describe('settings', () => {
  it('reports endpoints and whether a key is set, and where from -- never the key', async () => {
    const { file, env } = await own({
      endpoints: { lmstudio: 'http://box:1234/v1' },
      api_keys: { openai: 'sk-secret' },
    });
    const seen = status('/nowhere', { ...env, ANTHROPIC_API_KEY: 'from-env-secret' });
    expect(seen.settings_file).toBe(file);
    expect(seen.endpoints.lmstudio).toBe('http://box:1234/v1');
    expect(seen.credentials.openai).toEqual({ configured: true, source: 'settings file' });
    expect(seen.credentials.anthropic).toEqual({ configured: true, source: 'environment' });
    expect(seen.credentials.google).toEqual({ configured: false, source: '' });
    expect(JSON.stringify(seen)).not.toContain('sk-secret');
    expect(JSON.stringify(seen)).not.toContain('from-env-secret');
  });

  it('merges a save -- a key never clears another\'s, a blank one leaves one alone, a clear clears it -- and sets or unsets the one AI setting beside them', async () => {
    const { file, env } = await own({ api_keys: { openai: 'keep-me', google: 'drop-me' }, endpoints: { ollama: 'http://old:11434' }, mcp_servers: { fs: { command: 'x' } } });
    await save({ api_keys: { anthropic: 'new', openai: '' }, clear_keys: ['google'], endpoints: { lmstudio: 'http://box:1234/v1' } }, '/nowhere', env);
    expect(readSettingsFile(file).api_keys).toEqual({ openai: 'keep-me', anthropic: 'new' });
    expect(JSON.parse(await readFile(file, 'utf8')).endpoints).toEqual({ ollama: 'http://old:11434', lmstudio: 'http://box:1234/v1' });

    const seen = await save({ ai: { provider: 'openai', model: 'gpt-5' } }, '/nowhere', env);
    expect(readSettingsFile(file)).toMatchObject({ ai: { provider: 'openai', model: 'gpt-5' }, api_keys: { openai: 'keep-me' }, mcp_servers: { fs: { command: 'x' } } });
    expect(seen.ai).toEqual({ provider: 'openai', model: 'gpt-5', environment: [] });

    await save({ ai: { provider: 'default', model: '' } }, '/nowhere', env);
    expect(readSettingsFile(file).ai).toBeUndefined();
    expect(readSettingsFile(file).api_keys).toEqual({ openai: 'keep-me', anthropic: 'new' });
  });

  it('keeps two AIs -- the nodes\' and the one that writes, which is the nodes\' until it is set apart -- each of provider and model on its own', async () => {
    const { file, env } = await own({ ai: { provider: 'google', model: 'flash' } });
    expect(await aiSetting('/nowhere', env, 'write')).toEqual({ provider: 'google', model: 'flash' });
    await save({ writing: { provider: 'google', model: 'pro' } }, '/nowhere', env);
    expect(readSettingsFile(file).writing_ai).toEqual({ provider: 'google', model: 'pro' });
    expect(await aiSetting('/nowhere', env, 'write')).toEqual({ provider: 'google', model: 'pro' });
    expect(await aiSetting('/nowhere', env)).toEqual({ provider: 'google', model: 'flash' });
    // A model named alone is asked of the nodes' provider; the environment wins over the file.
    await save({ writing: { provider: 'default', model: 'big' } }, '/nowhere', env);
    expect(await aiSetting('/nowhere', env, 'write')).toEqual({ provider: 'google', model: 'big' });
    expect(await aiSetting('/nowhere', { ...env, TW_WRITING_PROVIDER: 'openai' }, 'write')).toEqual({ provider: 'openai', model: 'big' });
    expect(status('/nowhere', { ...env, TW_WRITING_MODEL: 'x' }).writing).toEqual({ provider: '', model: 'big', environment: ['TW_WRITING_MODEL'] });
    await save({ writing: { provider: 'default', model: '' } }, '/nowhere', env);
    expect(readSettingsFile(file).writing_ai).toBeUndefined();
  });

  it('says why the one AI setting cannot answer yet, in a sentence that says what to do', async () => {
    vi.stubGlobal('fetch', async () => { throw new TypeError('fetch failed'); });
    // Nothing set up resolves to Ollama, which is not there: "Now: ollama / llama3" would read as ready.
    expect((await providerStatus('/nowhere', (await own()).env)).problem).toMatch('Ollama is not running at http://localhost:11434');
    expect((await providerStatus('/nowhere', (await own({ ai: { provider: 'google' } })).env)).problem).toMatch(/No Google Gemini key yet.*aistudio/);
    expect((await providerStatus('/nowhere', (await own({ ai: { provider: 'google' }, api_keys: { google: 'k' } })).env)).problem).toBe('');
    // Running, but without the model it is asked for.
    vi.stubGlobal('fetch', async () => ({ json: async () => ({ models: [{ name: 'mistral:latest' }] }) }));
    const asked = (await own({ ai: { provider: 'ollama', model: 'llama3' } })).env;
    expect((await providerStatus('/nowhere', asked)).problem).toMatch(/does not have "llama3".*ollama pull llama3.*mistral:latest/);
  });

  it('will not save over a file it cannot read, which would lose its keys and tool servers', async () => {
    const { file, env } = await own();
    const handEdited = '{\n "api_keys": {"openai": "sk-test-1234567890"},\n "mcp_servers": {"files": {"command": "npx"}},\n}\n';
    await writeFile(file, handEdited);
    await expect(save({ endpoints: { ollama: 'http://127.0.0.1:11434' } }, '/nowhere', env)).rejects.toMatchObject({ status: 409 });
    expect(await readFile(file, 'utf8')).toBe(handEdited);
  });
});
