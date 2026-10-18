import { describe, expect, it } from 'vitest';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { inline } from './inline';

describe('the words of a delivered page', () => {
  it('are drawn with bold, italic, code and links, and put no markup of their own into the page', () => {
    const html = (text: string): string => renderToStaticMarkup(createElement(Fragment, null, ...inline(text)));
    expect(html('a **bold** and *italic* word')).toBe('a <strong>bold</strong> and <em>italic</em> word');
    expect(html('[x](https://example.com) <b>')).toMatch(/^<a href="https:\/\/example.com" [^>]*>x<\/a> &lt;b&gt;$/);
    expect(html('[bad](javascript:alert(1))')).toBe('[bad](javascript:alert(1))');
    expect(html('![a chart](https://example.com/p.png)')).not.toContain('<img');
  });
});
