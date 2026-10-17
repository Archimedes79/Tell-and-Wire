import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contextWindow } from './window.ts';

/** A provider that answers with *body*, and the requests it was asked. */
function provider(body: unknown, ok = true) {
  const asked: { url: string; headers: Record<string, string> }[] = [];
  const fetcher = (async (url: string, init?: { headers?: Record<string, string> }) => {
    asked.push({ url, headers: init?.headers ?? {} });
    return { ok, json: async () => body };
  }) as unknown as typeof fetch;
  return { fetcher, asked };
}

/** A working folder with a settings file of its own, so that no real one is read. */
async function folder(settings: object = {}): Promise<{ cwd: string; env: Record<string, string> }> {
  const cwd = await mkdtemp(join(tmpdir(), 'window-'));
  const file = join(cwd, 'ai-settings.json');
  await writeFile(file, JSON.stringify(settings));
  return { cwd, env: { TW_SETTINGS: file } };
}

describe('how much a model takes in at once', () => {
  it('is what the person set, before anything is asked of a provider', async () => {
    const { cwd, env } = await folder({ context_tokens: 32000, api_keys: { anthropic: 'k' } });
    const said = provider({ max_input_tokens: 200000 });
    expect(await contextWindow({ provider: 'anthropic', model: 'm1' }, { cwd, env, fetcher: said.fetcher })).toMatchObject({ tokens: 32000, source: 'set' });
    expect(said.asked).toEqual([]);
    expect(await contextWindow({ provider: 'openai', model: 'm' }, { cwd, env: { ...env, TW_CONTEXT_TOKENS: '64 000' }, fetcher: said.fetcher })).toMatchObject({ tokens: 64000, source: 'set' });
  });

  it('is what Anthropic says of the model, asked with the key and not twice', async () => {
    const { cwd, env } = await folder({ api_keys: { anthropic: 'secret' } });
    const said = provider({ max_input_tokens: 200000 });
    const first = await contextWindow({ provider: 'anthropic', model: 'claude-x' }, { cwd, env, fetcher: said.fetcher });
    expect(first).toEqual({ provider: 'anthropic', model: 'claude-x', tokens: 200000, source: 'provider' });
    expect(said.asked[0].url).toBe('https://api.anthropic.com/v1/models/claude-x');
    expect(said.asked[0].headers['x-api-key']).toBe('secret');
    await contextWindow({ provider: 'anthropic', model: 'claude-x' }, { cwd, env, fetcher: said.fetcher });
    expect(said.asked).toHaveLength(1);
  });

  it('is what Google says of the model, asked at the model\'s own address with the key in a header, not in the URL', async () => {
    const { cwd, env } = await folder({ api_keys: { google: 'secret' } });
    const said = provider({ inputTokenLimit: 1048576 });
    expect(await contextWindow({ provider: 'google', model: 'gemini-x' }, { cwd, env, fetcher: said.fetcher })).toMatchObject({ tokens: 1048576, source: 'provider' });
    expect(said.asked[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-x');
    expect(said.asked[0].headers['x-goog-api-key']).toBe('secret');
  });

  it('is a guess, said as one, where the provider does not say: no key, no answer, an answer that is no number, or a provider that never tells', async () => {
    const { cwd, env } = await folder({ api_keys: { anthropic: 'k' } });
    const nothing = provider({}, false);
    expect(await contextWindow({ provider: 'anthropic', model: 'a' }, { cwd, env, fetcher: nothing.fetcher })).toMatchObject({ tokens: 128000, source: 'assumed' });
    expect(await contextWindow({ provider: 'anthropic', model: 'b' }, { cwd, env, fetcher: provider({ max_input_tokens: 'many' }).fetcher })).toMatchObject({ source: 'assumed' });
    const unkeyed = provider({ inputTokenLimit: 9999999 });
    expect(await contextWindow({ provider: 'google', model: 'g' }, { cwd, env, fetcher: unkeyed.fetcher })).toMatchObject({ source: 'assumed' });
    expect(unkeyed.asked).toEqual([]);
    expect(await contextWindow({ provider: 'openai', model: 'gpt' }, { cwd, env, fetcher: nothing.fetcher })).toMatchObject({ tokens: 128000, source: 'assumed' });
    expect(await contextWindow({ provider: 'ollama', model: 'llama3' }, { cwd, env, fetcher: nothing.fetcher })).toMatchObject({ tokens: 8000, source: 'assumed' });
  });

  it('is asked again after a failure: a key saved since is tried', async () => {
    const { cwd, env } = await folder({ api_keys: { anthropic: 'k' } });
    const failing = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await contextWindow({ provider: 'anthropic', model: 'later' }, { cwd, env, fetcher: failing })).toMatchObject({ source: 'assumed' });
    expect(await contextWindow({ provider: 'anthropic', model: 'later' }, { cwd, env, fetcher: provider({ max_input_tokens: 100000 }).fetcher })).toMatchObject({ tokens: 100000, source: 'provider' });
  });
});
