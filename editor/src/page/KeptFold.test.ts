import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import KeptFold from './KeptFold';

/** The state a round runs on, said: what the session keeps that the design does not say, and Start over. */
describe('what using a tool keeps', () => {
  const names: Record<string, string> = { measure: 'Measure', count: 'Count', chat: 'Chat' };
  const drawn = (kept: Parameters<typeof KeptFold>[0]['kept']) =>
    renderToStaticMarkup(createElement(KeptFold, { kept, nameOf: (id) => names[id] ?? id, onStartOver: () => {} }));

  it('is each start point\'s last package, each memory, each block -- by the names a person knows them by', () => {
    const html = drawn({
      nodes: { measure: { values: { paragraph: 'Two words.' } }, count: { data_value: 3 } },
      page: { chat: { messages: [], pending: '' } },
    });
    expect(html).toContain('What using it keeps (3)');
    expect(html).toContain('Measure was sent: {&quot;paragraph&quot;:&quot;Two words.&quot;}');
    expect(html).toContain('Count holds: 3');
    expect(html).toContain('On the page, Chat holds: {&quot;messages&quot;:[],&quot;pending&quot;:&quot;&quot;}');
    expect(html).toMatch(/<button[^>]*>↺ Start over<\/button>/);
  });

  it('says there is nothing yet, before a round has left anything -- and has nothing to forget', () => {
    const html = drawn({ nodes: {}, page: {} });
    expect(html).toContain('What using it keeps: nothing yet');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>↺ Start over<\/button>/);
  });
});
