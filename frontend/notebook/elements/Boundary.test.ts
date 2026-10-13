// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import Boundary from './Boundary';
import { Output } from './Widgets';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement | null = null;
const show = async (node: ReturnType<typeof createElement>): Promise<HTMLElement> => {
  host = document.createElement('div');
  document.body.appendChild(host);
  await act(async () => { createRoot(host!).render(node); });
  return host;
};
afterEach(() => { host?.remove(); host = null; });

const Throws = (): never => { throw new Error('bad value'); };

describe('what a step made, shown', () => {
  it('cannot take the page down: a result that cannot be drawn says so in its own place', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const box = await show(createElement('div', null, createElement('p', null, 'typed and not yet saved'), createElement(Boundary, null, createElement(Throws))));
    expect(box.textContent).toContain('typed and not yet saved');
    expect(box.querySelector('[role=alert]')?.textContent).toBe('This result could not be shown: bad value');
  });

  it('draws a table whose rows are not all rows: a null among them is an empty row', async () => {
    const box = await show(createElement(Boundary, { value: 1 }, createElement(Output, { kind: 'table' as const, rows: 4, value: [{ a: 1, b: 'x' }, null, { a: 3 }] })));
    expect(box.querySelector('[role=alert]')).toBeNull();
    expect([...box.querySelectorAll('tbody tr')].map((row) => row.textContent)).toEqual(['1x', '', '3']);
  });
});
