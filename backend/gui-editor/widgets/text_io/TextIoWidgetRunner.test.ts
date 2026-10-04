import { describe, it, expect } from 'vitest';
import { TextIoWidgetRunner } from './TextIoWidgetRunner.ts';
import type { Widget } from '../WidgetRunner.ts';
import type { Graph } from '../../../../graph/graph.ts';
import { pageSends, settlePage } from '../page.ts';
import { quietRuntime } from '../../../../graph/test/fakes.ts';

/**
 * A box of text holds one of two things, and the difference is what happens to
 * it after a round.
 *
 * A box whose Enter fires a start point holds a *message*: said once, and
 * emptied when a round has delivered it, so the box is ready for the next one.
 * A box that fires nothing holds a *setting* -- a search term, a name -- and
 * emptying that after every round would make the person retype it every time.
 *
 * What a round means for a block is the block's own business, the same family
 * as `settle`, so it is asked of the element here.
 */
const element = new TextIoWidgetRunner();

const box = (config: Record<string, unknown>, fires: string | null = null): Widget => ({
  id: 'box', kind: 'text_io', label: 'Box', w: 4, h: 2, tone: 'sunken', sends_to: [], fires, shows: null, config,
});

describe('what a round leaves in a text box', () => {
  it('empties a box whose Enter fires a start point, because a message is said once', () => {
    expect(element.clearsValueAfterRun(box({ mode: 'both' }, 'ask'))).toBe(true);
    expect(element.clearsValueAfterRun(box({ mode: 'input' }, 'ask'))).toBe(true);
  });

  it('leaves a box that fires nothing, because that is a setting', () => {
    expect(element.clearsValueAfterRun(box({ mode: 'both' }))).toBe(false);
    expect(element.clearsValueAfterRun(box({ mode: 'input' }))).toBe(false);
  });

  it('leaves a box that only shows: there is nothing of the person\'s in it', () => {
    expect(element.clearsValueAfterRun(box({ mode: 'output' }, 'ask'))).toBe(false);
  });

  it('reads an unknown mode as "both": it sends, fires on Enter and shows', () => {
    // One rule, not three: `config()` decides the role for what it sends, what
    // it fires on and what it shows, so a box with no mode set behaves the same in all.
    for (const config of [{}, { mode: 'nonsense' }]) {
      expect(element.clearsValueAfterRun(box(config, 'ask'))).toBe(true);
      expect(element.sends(box(config))).toMatchObject({ type: 'text' });
      expect(element.event(box(config))).toBe('enter');
      expect(element.showsEnd(box(config))).toBe(true);
    }
  });

  it('sends nothing, fires nothing and shows nothing it should not, by its mode', () => {
    expect(element.sends(box({ mode: 'output' }))).toBeNull();
    expect(element.event(box({ mode: 'output' }))).toBeNull();
    expect(element.showsEnd(box({ mode: 'input' }))).toBe(false);
  });
});

/**
 * What its end point hands back is something to read, not something typed.
 *
 * It used to settle into what the box holds, so the next round sent the
 * model's own answer back to it as the person's message, and an answer that
 * was an object went out as "[object Object]".
 */
describe('what a text box keeps of what its end point hands back', () => {
  it('keeps what the person typed in a box they type in, whatever came back', () => {
    for (const mode of ['both', undefined, 'nonsense']) {
      const stored: Record<string, unknown> = { id: 'box', kind: 'text_io', mode, value: 'my question' };
      element.settle(stored as never, 'the model reply');
      expect(stored.value, String(mode)).toBe('my question');
    }
  });

  it('keeps what arrived in a box that only shows', () => {
    const stored: Record<string, unknown> = { id: 'box', kind: 'text_io', mode: 'output', value: '' };
    element.settle(stored as never, 'the model reply');
    expect(stored.value).toBe('the model reply');
  });

  it('sends what the person typed, round after round, and shows the reply', async () => {
    const graph: Graph = {
      metadata: { name: 'ask' } as Graph['metadata'], nodes: [], edges: [],
      page: { blocks: [{ id: 'box', kind: 'text_io', label: 'Box', mode: 'both', value: 'my question', sends_to: ['ask'], shows: 'answer' }] },
    };
    const runtime = quietRuntime();
    expect(await pageSends(graph, 'ask', runtime)).toEqual({ box: 'my question' });
    // The answer is shown on the box, and is not what it sends next.
    expect(await settlePage(graph, { answer: { answer: 42 } }, runtime)).toEqual({ box: { answer: 42 } });
    expect(await pageSends(graph, 'ask', runtime)).toEqual({ box: 'my question' });
  });
});
