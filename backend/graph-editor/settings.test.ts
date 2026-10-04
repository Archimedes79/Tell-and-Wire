import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { save, status } from './settings.ts';
import { readSettingsFile } from '../../graph/ai/settings.ts';

/**
 * The settings dialog's contract: what it may see, and what a save may change.
 *
 * Every test names its own file through TW_SETTINGS and an empty
 * environment, so nothing here can read the developer's real keys or write
 * into their real file -- the way a test once did in the Python half.
 */

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

  it('merges a save: one provider\'s key never clears another\'s, a blank key leaves one alone, a clear clears it', async () => {
    const { file, env } = await own({ api_keys: { openai: 'keep-me', google: 'drop-me' }, endpoints: { ollama: 'http://old:11434' } });
    await save({ api_keys: { anthropic: 'new', openai: '' }, clear_keys: ['google'], endpoints: { lmstudio: 'http://box:1234/v1' } }, '/nowhere', env);
    expect(readSettingsFile(file).api_keys).toEqual({ openai: 'keep-me', anthropic: 'new' });
    expect(JSON.parse(await readFile(file, 'utf8')).endpoints).toEqual({ ollama: 'http://old:11434', lmstudio: 'http://box:1234/v1' });
  });

  it('will not save over a file it cannot read, which would lose its keys and tool servers', async () => {
    const { file, env } = await own();
    const handEdited = '{\n "api_keys": {"openai": "sk-test-1234567890"},\n "mcp_servers": {"files": {"command": "npx"}},\n}\n';
    await writeFile(file, handEdited);
    await expect(save({ endpoints: { ollama: 'http://127.0.0.1:11434' } }, '/nowhere', env)).rejects.toMatchObject({ status: 409 });
    expect(await readFile(file, 'utf8')).toBe(handEdited);
  });

  it('writes the one AI setting and unsets it for "default", leaving the keys and tool servers alone', async () => {
    const { file, env } = await own({ api_keys: { openai: 'keep-me' }, mcp_servers: { fs: { command: 'x' } } });
    const seen = await save({ ai: { provider: 'openai', model: 'gpt-5' } }, '/nowhere', env);
    expect(readSettingsFile(file)).toMatchObject({ ai: { provider: 'openai', model: 'gpt-5' }, api_keys: { openai: 'keep-me' }, mcp_servers: { fs: { command: 'x' } } });
    expect(seen.ai).toEqual({ provider: 'openai', model: 'gpt-5', environment: [] });

    await save({ ai: { provider: 'default', model: '' } }, '/nowhere', env);
    expect(readSettingsFile(file).ai).toBeUndefined();
    expect(readSettingsFile(file).api_keys).toEqual({ openai: 'keep-me' });
  });
});
