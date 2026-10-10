import { describe, it, expect } from 'vitest';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { list, save } from './mcpServers.ts';
import { readSettingsFile } from '../../graph/ai/settings.ts';

const ECHO = join(__dirname, '..', '..', 'graph', 'ai', 'fixtures', 'echo-mcp-server.mjs');
const SHIPPED = join(__dirname, '..', '..', 'mcp');

describe('the servers that ship in mcp/', () => {
  it('each has a config the editor can read, a program to start, a page for its settings, and settings its code really reads', async () => {
    const { servers } = await list(SHIPPED, { TW_SETTINGS: join(tmpdir(), 'none', 'ai-settings.json') });
    expect(servers.map((server) => server.name)).toEqual(['documents', 'web']);
    for (const server of servers) {
      expect(server.problem).toBe('');
      const config = JSON.parse(await readFile(join(SHIPPED, server.name, 'config.json'), 'utf8')) as { args: string[] };
      await expect(readFile(join(SHIPPED, server.name, config.args[0]))).resolves.toBeTruthy();
      const source = (await Promise.all((await readdir(join(SHIPPED, server.name, 'src')))
        .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
        .map((file) => readFile(join(SHIPPED, server.name, 'src', file), 'utf8')))).join('\n');
      for (const key of Object.keys(server.env)) {
        // A variable named in the config and not read by the server would be a setting that does nothing;
        // one the page leaves out, a setting nobody can set.
        expect(source, `${server.name}: ${key} in the code`).toContain(key);
        expect(server.page, `${server.name}: ${key} in settings.html`).toContain(key);
      }
    }
  });
});

describe('setting a server up', () => {
  async function installation() {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-servers-'));
    const root = join(dir, 'mcp');
    // A server of the kind a person drops in: its program is the echo server the MCP tests use.
    await mkdir(join(root, 'echo'), { recursive: true });
    await writeFile(join(root, 'echo', 'config.json'), JSON.stringify({
      title: 'Echo', about: 'Says back what it is told.', command: 'node', args: [ECHO],
      env: { TW_ECHO_FOLDERS: 'Folders.', TW_ECHO_LIMIT: 'A limit.', TW_ECHO_LOUD: '1 for loud.' },
      required: ['TW_ECHO_FOLDERS'],
    }));
    await mkdir(join(root, 'broken'), { recursive: true });
    await writeFile(join(root, 'broken', 'config.json'), '{ "title": "Broken", "command": "node", "env": { "no good": "" } }');
    const file = join(dir, 'ai-settings.json');
    const env = { TW_SETTINGS: file } as Record<string, string | undefined>;
    return { dir, root, file, env };
  }

  it('writes the entry a person would, starts the server once, shows its values again, and touches nothing else in the file', async () => {
    const { dir, root, file, env } = await installation();
    await writeFile(file, JSON.stringify({ api_keys: { openai: 'keep-me' }, mcp_servers: { mine: { command: 'x' }, echo: { command: 'by-hand' } } }));

    // Not ours: the entry of that name was written by hand, and is not written over.
    await expect(save('echo', { TW_ECHO_FOLDERS: dir }, root, env)).rejects.toMatchObject({ status: 409 });
    await writeFile(file, JSON.stringify({ api_keys: { openai: 'keep-me' }, mcp_servers: { mine: { command: 'x' } } }));

    // What is needed, what the server does not read -- a request cannot put anything else into its environment -- and what is no server here.
    await expect(save('echo', {}, root, env)).rejects.toMatchObject({ status: 422, message: 'TW_ECHO_FOLDERS is needed: Folders.' });
    await expect(save('echo', { TW_ECHO_FOLDERS: dir, NODE_OPTIONS: '--require x.js' }, root, env)).rejects.toMatchObject({ status: 422, message: expect.stringContaining('"NODE_OPTIONS" is not one of its settings') });
    await expect(save('broken', {}, root, env)).rejects.toMatchObject({ status: 422 });
    await expect(save('../etc', {}, root, env)).rejects.toMatchObject({ status: 404 });
    expect(readSettingsFile(file).mcp_servers).toEqual({ mine: { command: 'x' } });

    const folders = `${dir}${delimiter}${root}`;
    const saved = await save('echo', { TW_ECHO_FOLDERS: folders, TW_ECHO_LIMIT: '2097152', TW_ECHO_LOUD: '1' }, root, env);
    expect(saved.problem).toBe('');
    expect(saved.tools).toEqual(['add', 'echo', 'fail', 'hang']);
    expect(readSettingsFile(file)).toEqual({
      api_keys: { openai: 'keep-me' },
      mcp_servers: {
        mine: { command: 'x' },
        echo: {
          command: process.execPath, args: [ECHO], cwd: join(root, 'echo'),
          env: { TW_ECHO_FOLDERS: folders, TW_ECHO_LIMIT: '2097152', TW_ECHO_LOUD: '1' },
        },
      },
    });

    // Edit config shows what was saved; a blank value leaves the variable out.
    const seen = await list(root, env);
    expect(seen).toMatchObject({ configured: ['mine', 'echo'], delimiter });
    expect(seen.servers.find((server) => server.name === 'echo')).toMatchObject({
      installed: true, by_hand: false, required: ['TW_ECHO_FOLDERS'], values: { TW_ECHO_FOLDERS: folders, TW_ECHO_LIMIT: '2097152', TW_ECHO_LOUD: '1' },
    });
    expect(seen.servers.find((server) => server.name === 'broken')).toMatchObject({ problem: expect.stringContaining('broken/config.json') });
    await save('echo', { TW_ECHO_FOLDERS: dir, TW_ECHO_LIMIT: '', TW_ECHO_LOUD: '' }, root, env);
    expect(readSettingsFile(file).mcp_servers?.echo).toMatchObject({ env: { TW_ECHO_FOLDERS: dir } });
    expect(JSON.stringify(readSettingsFile(file).mcp_servers?.echo)).not.toContain('TW_ECHO_LIMIT');
  });
});
