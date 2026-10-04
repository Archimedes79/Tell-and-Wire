import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CallForms from './CallForms';

/** The App tab as the caller of a start point a call starts: what a script would send, in boxes. */
describe('a call to a start point, on the App tab', () => {
  const events = [
    { name: 'measure', label: 'Measure', type: 'json' as const, started_by: 'call' as const, reads: [{ name: 'paragraph', label: 'Text', type: 'any' as const }] },
    { name: 'go', label: 'Go', type: 'json' as const, started_by: 'page' as const },
  ];
  const drawn = (sent: Record<string, unknown>) =>
    renderToStaticMarkup(createElement(CallForms, { events, sent, onCall: () => {} }));

  it('has a box for each part the graph reads of what it is sent, filled with what it was sent last, and a button that starts it', () => {
    const html = drawn({ measure: { paragraph: 'Two words.' } });
    expect(html).toContain('<strong>Measure</strong> — started by a call');
    expect(html).toMatch(/aria-label="Text"[^>]*>Two words\.<\/textarea>/);
    expect(html).toMatch(/<button type="submit"[^>]*>Measure<\/button>/);
  });

  it('draws nothing for a start point the page starts: the page is what calls it', () => {
    expect(drawn({})).not.toContain('Go</button>');
    expect(renderToStaticMarkup(createElement(CallForms, { events: [events[1]], sent: {}, onCall: () => {} }))).toBe('');
  });
});
