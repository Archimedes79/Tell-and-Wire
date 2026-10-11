import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aiSetting, configuredMcpServers, configuredSettings, fromFile } from './settings.ts';

/**
 * A key belongs in a file, not in a terminal on every run — and not in the
 * repository. This is the file, and the rule that an explicit variable still
 * wins over it, so a one-off `TW_AI_MODEL=x` needs no editing.
 */
async function withSettings(contents: string, run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'tell-and-wire-settings-'));
  try {
    await writeFile(join(dir, 'ai-settings.json'), contents);
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('ai-settings.json', () => {
  it('supplies the provider, the model, the key and the tool servers; a variable wins, except for a tool server', async () => {
    await withSettings(
      JSON.stringify({
        ai: { provider: 'google', model: 'gemini-2.5-flash' },
        api_keys: { google: 'k' },
        mcp_servers: {
          files: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'], env: { DEBUG: '1' } },
          remote: { url: 'https://example.com/mcp', headers: { Authorization: 'Bearer t' } },
          // Neither a program nor an address: nothing the client could open.
          half: { args: ['--oops'] },
        },
      }),
      async (dir) => {
        expect(await aiSetting(dir, {})).toEqual({ provider: 'google', model: 'gemini-2.5-flash' });
        expect(fromFile(dir, {}).apiKeys).toEqual({ google: 'k' });

        // One command can differ without an edit, and the key from the file survives.
        const env = { TW_AI_MODEL: 'gemini-2.5-pro' };
        expect(await aiSetting(dir, env)).toEqual({ provider: 'google', model: 'gemini-2.5-pro' });
        expect(configuredSettings(env, dir).apiKeys).toEqual({ google: 'k' });

        // A settings file in the folder a tool runs in -- a stranger's project may ship one -- supplies no tool server.
        expect(Object.keys(configuredMcpServers({ TW_SETTINGS: join(dir, 'nowhere.json'), TW_MCP_SERVERS: '{"evil":{"command":"calc"}}' }))).not.toContain('files');
      },
    );
  });

  it('names tool servers from the machine\'s settings file and from the servers\' own folders, and from nothing else', async () => {
    await withSettings(
      JSON.stringify({
        mcp_servers: {
          files: { command: 'npx', args: ['-y', 'server-filesystem'], env: { DEBUG: '1' } },
          remote: { url: 'https://example.com/mcp', headers: { Authorization: 'Bearer t' } },
          // Neither a program nor an address: nothing the client could open.
          half: { args: ['--oops'] },
        },
      }),
      async (dir) => {
        const servers = configuredMcpServers({ TW_SETTINGS: join(dir, 'ai-settings.json') });
        expect(servers.files).toMatchObject({ command: 'npx' });
        expect(servers.remote).toMatchObject({ url: 'https://example.com/mcp' });
        expect(servers).not.toHaveProperty('half');
      },
    );
  });
});
