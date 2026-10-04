import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RequirementsDialog from './RequirementsDialog';

// A modal is drawn through a portal in the browser; here, in place.
vi.mock('../ui/Modal', () => ({
  default: ({ children, footer }: { children: unknown; footer: unknown }) => createElement('div', null, children as never, footer as never),
}));

describe('Before running…', () => {
  it('asks each picker with nothing chosen for its file or its folder, with the file browser', () => {
    // A picker on the page is the one thing a round asks before it runs:
    // whoever calls a graph sends what it needs.
    const html = renderToStaticMarkup(createElement(RequirementsDialog, {
      requirements: [
        { key: 'paper', label: 'Manuscript', kind: 'file', current: '' },
        { key: 'notes', label: 'Notes', kind: 'directory', current: 'notes' },
      ],
      onSubmit: () => {}, onCancel: () => {},
    }));
    expect(html).toContain('File for &quot;Manuscript&quot;');
    expect(html).toContain('Folder for &quot;Notes&quot;');
    expect(html).toContain('📂 Browse…');
    expect(html).toContain('Still needed: Manuscript');
  });
});
