import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { editorRoutes } from './routes.ts';
import { nodeRuntime } from '../../graph/core/node.ts';
import { executeGraph } from '../../graph/execution/executor.ts';
import { registry } from '../../graph/nodes/registry.ts';
import type { GraphNode } from '../../graph/graph.ts';
import { graphOf } from '../../graph/test/fakes.ts';

/**
 * Where an AI call goes, whoever makes it: to the node's own provider and
 * model when it pins them, and to the one AI setting otherwise -- for a run
 * and ✨ Generate alike.
 *
 * Both are providers nobody has, so the provider layer refuses each by name
 * before anything leaves the machine, and the refusal says where the call
 * went.
 */

const SETTING = 'the_one_setting';
const PIN = 'the_nodes_own';
let dir = '';

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tell-and-wire-one-setting-'));
  const file = join(dir, 'ai-settings.json');
  await writeFile(file, JSON.stringify({ ai: { provider: SETTING, model: 'm' } }));
  vi.stubEnv('TW_SETTINGS', file);
  // The developer's own shell must not decide this either.
  vi.stubEnv('TW_AI_PROVIDER', '');
  vi.stubEnv('TW_AI_MODEL', '');
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

const refusedBy = (provider: string) => `Unknown AI provider: ${provider}`;

const asking = (config: Record<string, unknown>): GraphNode => ({
  id: 'ask', node_type: 'ai', label: 'Ask', description: '',
  position: { x: 0, y: 0 }, inputs: [], outputs: [],
  config: { prompt: 'Name a city.', ...config },
});

describe('an AI call', () => {
  it('goes to the node\'s own model when it pins one, and to the one AI setting otherwise -- in a run, and from ✨ Generate', async () => {
    const pinned = await executeGraph(graphOf([asking({ ai_provider: PIN, ai_model: 'its-model' })]), { runtime: nodeRuntime(), registry });
    expect(pinned.node_results[0].error).toContain(refusedBy(PIN));

    const onSetting = await executeGraph(graphOf([asking({ ai_provider: 'default', ai_model: '' })]), { runtime: nodeRuntime(), registry });
    expect(onSetting.node_results[0].error).toContain(refusedBy(SETTING));

    const node = { id: 'count', node_type: 'code', label: 'Count', description: 'Count the words.', inputs: [], outputs: [], config: {} };
    await expect(editorRoutes().generate!({ node } as never, { loopback: true } as never)).rejects.toThrow(refusedBy(SETTING));
  }, 30_000);
});
