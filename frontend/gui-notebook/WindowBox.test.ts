// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Window, Windows } from '../../gui/notebook/windows.ts';
import { outEnd } from '../../gui/notebook/windows.ts';
import { tableHeight } from '../notebook/elements/Widgets';

const run = vi.fn(async (_id: string) => undefined);
vi.mock('../notebook/document/runs', () => ({ runWindow: (id: string) => run(id), stopRuns: vi.fn(async () => undefined) }));

const { default: WindowBox } = await import('./WindowBox');
const { useNotebook } = await import('../notebook/document/store');

/**
 * A window to be used: what it takes in, a button, and each kind of thing that comes out -- in boxes that keep the size the
 * window gave them.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DOC: Windows = {
  name: 'Tool', description: '',
  windows: [{
    id: 'w', title: 'Plot', span: 8,
    inputs: [{ name: 'Text', kind: 'text', value: 'hello' }, { name: 'Count', kind: 'number', min: 1, max: 9, value: 3 }, { name: 'Mode', kind: 'choice', options: ['a', 'b'] }],
    steps: [{ name: 'Made', sentence: 'Do @Text.', how: 'ai' }],
    outputs: [
      { name: 'Chart', kind: 'chart', rows: 5 }, { name: 'Rows', kind: 'table', rows: 3 }, { name: 'Items', kind: 'list', rows: 3 }, { name: 'Words', kind: 'text', rows: 2 },
    ],
  }],
};
const window0 = (): Window => DOC.windows[0];

let root: Root;
let screen: HTMLElement;

beforeEach(async () => {
  run.mockClear();
  useNotebook.getState().start(DOC);
  screen = document.createElement('div');
  document.body.appendChild(screen);
  root = createRoot(screen);
  await act(async () => { root.render(createElement(WindowBox, { window: window0(), writing: false })); });
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  screen.remove();
});

describe('a window on the page', () => {
  it('holds what its inputs start at, takes what is typed, and runs by its button', async () => {
    expect((screen.querySelector('textarea') as HTMLTextAreaElement).value).toBe('hello');
    expect((screen.querySelector('input[type="number"]') as HTMLInputElement).value).toBe('3');
    expect((screen.querySelector('select') as HTMLSelectElement).value).toBe('a');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(screen.querySelector('textarea'), 'typed');
      screen.querySelector('textarea')!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(useNotebook.getState().values.w_in_text).toBe('typed');
    await act(async () => { [...screen.querySelectorAll('button')].find((one) => one.textContent === 'Run')!.click(); });
    expect(run).toHaveBeenCalledWith('w');
  });

  it('shows each kind of output in its own box, at the height of its rows, and waits where there is nothing yet', async () => {
    const boxes = [...screen.querySelectorAll<HTMLElement>('.nb-out')];
    expect(boxes.map((one) => one.className.includes('waiting'))).toEqual([true, true, true, true]);
    expect(boxes.map((one) => one.style.height)).toEqual(['162px', '102px', '102px', '72px']);

    await act(async () => { useNotebook.setState({
      done: { ran: new Set(['w']), changed: new Set() },
      results: {
        w: {
          outcome: 'done', message: '', nodes: {},
          shown: {
            [outEnd(window0(), window0().outputs[0])]: { kind: 'bars', title: 'Population', points: [{ label: 'India', value: 1450000000 }, { label: 'China', value: 1419000000 }] },
            [outEnd(window0(), window0().outputs[1])]: [{ country: 'India', people: 1450 }, { country: 'China', people: 1419 }],
            [outEnd(window0(), window0().outputs[2])]: ['one', 'two'],
            [outEnd(window0(), window0().outputs[3])]: 'plain words',
          },
        },
      },
    }); });
    expect(screen.querySelector('svg')?.textContent).toContain('India');
    expect(screen.querySelector('svg')?.textContent).toContain('1.4B');
    expect([...screen.querySelectorAll('th')].map((one) => one.textContent)).toEqual(['country', 'people']);
    expect([...screen.querySelectorAll('li')].map((one) => one.textContent)).toEqual(['one', 'two']);
    expect(screen.textContent).toContain('plain words');
    expect(screen.querySelector('.nb-chip')?.textContent).toBe('Done');
    // The boxes are as tall as they were, but a table: it is as tall as its two rows and its header need (`tableHeight`), more than the 3 rows it was given.
    expect([...screen.querySelectorAll<HTMLElement>('.nb-out')].map((one) => one.style.height)).toEqual(['162px', `${tableHeight(2)}px`, '102px', '72px']);
  });

  it('says why a run came to nothing in the place of the first output, not under it, and does not grow', async () => {
    await act(async () => { useNotebook.setState({ results: { w: { outcome: 'failed', message: 'Could not reach the model.', shown: {}, nodes: {} } } }); });
    const message = screen.querySelector<HTMLElement>('.nb-out.msg')!;
    expect(message.textContent).toBe('Could not reach the model.');
    expect(message.style.height).toBe('162px');
    expect(screen.querySelector('.nb-chip')?.textContent).toBe('Failed');
  });

  it('says so even where an earlier answer still stands in the box, and shows the other old answers as old', async () => {
    const first = outEnd(window0(), window0().outputs[0]);
    const second = outEnd(window0(), window0().outputs[1]);
    await act(async () => { useNotebook.setState({ results: { w: { outcome: 'failed', message: 'TypeError: x is not a function', shown: { [first]: { kind: 'bars', points: [] }, [second]: [{ a: 1 }] }, nodes: {} } } }); });
    expect(screen.querySelector('.nb-out.msg')?.textContent).toContain('TypeError: x is not a function');
    expect(screen.querySelectorAll('.nb-field.old')).toHaveLength(3);
  });
});

describe('a window that is a chat', () => {
  const CHAT: Windows = {
    name: 'Chat', description: '',
    windows: [{ id: 'talk', title: 'Talk', span: 12, inputs: [], steps: [{ name: 'Reply', sentence: 'Answer @Chat.message.', how: 'ai' }], outputs: [{ name: 'Chat', kind: 'chat', rows: 5 }] }],
  };

  it('has a box to say things in instead of a button, and says what was said when it is sent', async () => {
    useNotebook.getState().start(CHAT);
    await act(async () => { root.render(createElement(WindowBox, { window: CHAT.windows[0], writing: false })); });
    expect([...screen.querySelectorAll('button')].some((one) => one.textContent === 'Run')).toBe(false);
    const box = screen.querySelector('textarea[aria-label="Message"]') as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(box, 'hello there');
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { [...screen.querySelectorAll('button')].find((one) => one.textContent === 'Send')!.click(); await new Promise((over) => { setTimeout(over, 0); }); });
    expect(run).toHaveBeenCalledWith('talk');
    expect(useNotebook.getState().values.talk_out_chat).toEqual({ messages: [], pending: 'hello there' });
    // The message in hand stands in the transcript.
    expect(screen.querySelector('.nb-bubble.user')?.textContent).toBe('hello there');
    await act(async () => {
      useNotebook.setState({ values: { talk_out_chat: { messages: [{ role: 'user', text: 'hello there' }, { role: 'assistant', text: 'hi' }], pending: '' } } });
    });
    expect([...screen.querySelectorAll('.nb-bubble')].map((one) => one.textContent)).toEqual(['hello there', 'hi']);
  });
});
