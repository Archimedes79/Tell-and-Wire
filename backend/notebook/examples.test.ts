import { describe, expect, it } from 'vitest';
import { readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { problemsIn } from '../../gui/editor/check.ts';
import { windowProblems, windowsToGraph } from '../../gui/notebook/windows.ts';
import { quietRuntime } from '../deployment/runtime/test/fakes.ts';
import { nodeCode } from '../deployment/runtime/services.ts';
import { Session } from '../deployment/host/session.ts';
import { guiHooks } from '../deployment/gui/hooks.ts';
import { loadGraph } from '../deployment/project/folder.ts';
import { readKept, signatureOf } from './files.ts';

/**
 * The examples that come with the notebook (`notebook-examples/`): pages written by hand, each a project the notebook opens. They are
 * kept as the notebook saves them, so what is checked here is what a person opens: that its windows are sound, that the graph on disk is
 * what they make, and -- for the ones that need no file and no model -- that pressing the button gives what the page promises.
 */

const ROOT = resolve(__dirname, '..', '..', 'notebook-examples');
const NAMES = readdirSync(ROOT, { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync(join(ROOT, entry.name, 'graph-windows.json'))).map((entry) => entry.name);

describe('the notebook examples', () => {
  it('are there', () => {
    expect(NAMES).toEqual(['badge_maker', 'picture_sheet', 'sales_report', 'text_toolbox', 'tip_calculator']);
  });

  it.each(NAMES)('%s: sound windows, and a graph on disk that they make', async (name) => {
    const folder = join(ROOT, name);
    const kept = await readKept(folder);
    expect(kept, 'graph-windows.json').not.toBeNull();
    expect(windowProblems(kept!.windows)).toEqual([]);
    const graph = await loadGraph(folder);
    expect(problemsIn(graph)).toEqual([]);
    expect(signatureOf(graph)).toBe(signatureOf(windowsToGraph(kept!.windows, graph)));
    expect(signatureOf(graph)).toBe(kept!.signature);
  });

  /** Press the button of the window *id* of the example *name*, with code run as a graph runs it and a model that answers "said". */
  async function press(name: string, id: string) {
    const graph = await loadGraph(join(ROOT, name));
    const runtime = () => quietRuntime({ ai: { complete: async () => 'said' }, code: nodeCode });
    const session = await Session.open(graph, { runtime, gui: guiHooks });
    const done = await session.run({ node_id: id, port_id: 'data' }, { by: `${id}_run` });
    expect(done.status).toBe('success');
    return session.view().shown as Record<string, unknown>;
  }

  it('badge_maker draws a picture, in the room the window gives it', async () => {
    const shown = await press('badge_maker', 'badge');
    const picture = String(shown.badge_out_badge);
    expect(picture.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    const svg = decodeURIComponent(picture.slice(picture.indexOf(',') + 1));
    expect(svg).toContain('Ada Lovelace');
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
  });

  it('tip_calculator works out the sum', async () => {
    const shown = await press('tip_calculator', 'split');
    expect(shown.split_out_the_sum).toEqual([
      { Item: 'Bill', Amount: 86.4 }, { Item: 'Tip (10 %)', Amount: 8.64 }, { Item: 'Total', Amount: 95.04 }, { Item: 'Each of 3', Amount: 31.68 },
    ]);
  });

  it('text_toolbox counts the words of its text and asks the model for the rest', async () => {
    const shown = await press('text_toolbox', 'toolbox');
    expect((shown.toolbox_out_numbers as { Measure: string; Value: unknown }[]).slice(0, 3)).toEqual([
      { Measure: 'Words', Value: 32 }, { Measure: 'Sentences', Value: 3 }, { Measure: 'Characters', Value: 187 },
    ]);
    expect(shown.toolbox_out_summary).toBe('said');
  });
});
