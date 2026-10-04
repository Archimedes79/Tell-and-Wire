import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GuiWidget } from '@/graph';
import type { PageSession } from '@/api/session';
import { GuiSurfacePage } from './GuiPage';
import { connectionsOf, pageInUse } from './pageInUse';

/** The session once a round has run: the output "count" handed back, and shown on the block "said". */
const ran: PageSession = {
  view: {
    session: 's1', sent: {}, kept: { nodes: {}, page: {} }, page: { said: 'forty-two words' }, shown: { said: 'forty-two words' }, outputs: { count: 'forty-two words' },
    rounds: 1, finished_at: 1, round: null, dropped: [], design_revision: 0,
    clock: { running: false, runs_by_itself: false, ticks: false, next_at: null, problem: null },
  },
  round: null, edits: {}, sent: {},
};

/** The page of *blocks*, drawn as a tool draws it once a round has run. */
const drawn = (blocks: GuiWidget[]) => renderToStaticMarkup(createElement(GuiSurfacePage, {
  page: pageInUse({
    name: 'Word counter',
    description: 'Counts the words.',
    scheme: 'night',
    blocks,
    fires: {},
    sends: [],
    outputs: [{ name: 'count', label: 'Words' }],
  }, ran),
  onValue: () => {},
  onEvent: () => {},
}));

describe('a tool whose page has no blocks, after ▶ Run', () => {
  it('shows what the tool does and what its run handed back', () => {
    const html = drawn([]);
    expect(html).toContain('Counts the words.');
    expect(html).toContain('forty-two words');
  });
});

describe('a tool with a page, after a round', () => {
  it('shows on each block what the end point it shows handed back', () => {
    const html = drawn([{ id: 'said', kind: 'text_io', mode: 'output', label: 'Said', tone: 'plain', shows: 'count' }]);
    expect(html).toContain('forty-two words');
    expect(html).not.toContain('Counts the words.');
  });

  it('says over a plain block too what it is -- and over a button nothing, its label is its caption', () => {
    // Rebuilt by hand: three text outputs labelled in the panel, and the page showed none of the labels.
    expect(drawn([{ id: 'said', kind: 'text_io', mode: 'output', label: 'Said', tone: 'plain', shows: 'count' }])).toContain('Said');
    const button = drawn([{ id: 'go', kind: 'button', label: 'Summarize again', tone: 'plain', fires: 'ask' }]);
    expect(button.split('Summarize again').length - 1).toBe(1);
  });
});

describe('how a page is connected, as the interface says it', () => {
  it('is which block fires which start point, and which blocks a round is sent', () => {
    expect(connectionsOf([
      { name: 'ask', label: 'Ask', type: 'json', started_by: 'page', fired_by: ['go', 'box'], sends: [{ name: 'box', label: 'Box', type: 'text' }] },
      { name: 'api', label: 'API', type: 'json', started_by: 'call' },
    ])).toEqual({ fires: { go: 'ask', box: 'ask' }, sends: ['box'] });
  });
});
