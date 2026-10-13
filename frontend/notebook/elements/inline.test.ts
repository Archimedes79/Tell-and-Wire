import { describe, expect, it } from 'vitest';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { inline } from './inline';

const html = (text: string): string => renderToStaticMarkup(createElement(Fragment, null, ...inline(text)));

describe('the words of the page', () => {
  it('are drawn with the marks of Markdown: bold, italic, code and a link, one inside another where it makes sense', () => {
    expect(html('a **bold** and *italic* and _italic_ word')).toBe('a <strong>bold</strong> and <em>italic</em> and <em>italic</em> word');
    expect(html('press `Run` now')).toBe('press <code class="nb-inline-code">Run</code> now');
    expect(html('see [the guide](https://example.com/a?b=1) here')).toBe('see <a href="https://example.com/a?b=1" target="_blank" rel="noopener noreferrer">the guide</a> here');
    expect(html('**a `code` inside**')).toBe('<strong>a <code class="nb-inline-code">code</code> inside</strong>');
  });

  it('keep what is not a mark as it is: stars in a code, a snake_case name, a lone star, a path', () => {
    expect(html('`a*b*c`')).toBe('<code class="nb-inline-code">a*b*c</code>');
    expect(html('use snake_case_names here')).toBe('use snake_case_names here');
    expect(html('2 * 3 = 6')).toBe('2 * 3 = 6');
    expect(html('C:\\Users\\me')).toBe('C:\\Users\\me');
  });

  it('can put no markup of its own into the page: text is escaped, and a link is http, https or mailto only', () => {
    expect(html('<b>x</b> & <script>')).toBe('&lt;b&gt;x&lt;/b&gt; &amp; &lt;script&gt;');
    expect(html('[bad](javascript:alert(1)) [mail](mailto:a@b.de)')).toBe('[bad](javascript:alert(1)) <a href="mailto:a@b.de" target="_blank" rel="noopener noreferrer">mail</a>');
    expect(html('**<i>**')).toBe('<strong>&lt;i&gt;</strong>');
  });
});
