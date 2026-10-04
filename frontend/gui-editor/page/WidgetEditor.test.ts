import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WIDGET_BUILDERS } from '../../app/elements/registry';
import type { GuiWidget } from '../../app/graph';
import WidgetEditor from './WidgetEditor';

const edited = (widget: GuiWidget) => renderToStaticMarkup(createElement(WidgetEditor, { widget, onChange: () => {} }));

/**
 * The selected block's editor: its label, its own settings (a lazy panel,
 * not drawn here), and how it looks. A block writes no body, so there is no
 * ✨ and no ▶ Try -- for any kind.
 */
describe('the editor of the selected block', () => {
  it('is, for a chart, its label, the end point it shows, and its look and size: nothing to send, nothing to fire', () => {
    const html = edited(WIDGET_BUILDERS.plot_window.create('chart', 'Temperatures'));
    expect(html).toContain('value="Temperatures"');
    expect(html).toContain('It shows');
    expect(html).toContain('+ New end point');
    expect(html).toContain('Look &amp; size');
    expect(html).not.toContain('Its data goes to');
    expect(html).not.toContain('Using it fires');
  });

  it('offers a block a person sets where its data goes and what using it fires, and nothing to show', () => {
    const html = edited(WIDGET_BUILDERS.input_picker.create('pick', 'Folder', 'directory'));
    expect(html).toContain('Its data goes to');
    expect(html).toContain('+ New start point');
    expect(html).toContain('Using it fires');
    expect(html).not.toContain('It shows');
  });

  it('offers a heading no connection at all: it is part of the page, not of the graph', () => {
    const html = edited(WIDGET_BUILDERS.text.create('title', 'Title'));
    for (const offer of ['Its data goes to', 'Using it fires', 'It shows']) expect(html).not.toContain(offer);
  });

  it('has no ✨ and no ▶ Try for any kind', () => {
    for (const builder of Object.values(WIDGET_BUILDERS)) {
      const html = edited(builder.create('b', 'Block'));
      expect(html, builder.widgetKind).not.toContain('✨');
      expect(html, builder.widgetKind).not.toContain('▶ Try');
    }
  });
});
