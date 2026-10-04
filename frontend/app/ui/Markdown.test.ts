import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from './Markdown';

describe('Markdown links', () => {
  it('go to http, https, mailto or a relative place; any other scheme -- however it is spelled -- is only its words', () => {
    const html = renderToStaticMarkup(createElement(Markdown, {
      source: '[web](https://x.org) [mail](mailto:a@x.org) [here](/docs/a:b) '
        + '[js](javascript:run) [caps](JaVaScRiPt:run) [tab](java\tscript:run) [data](data:text/html,x)',
    }));
    expect([...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1])).toEqual(['https://x.org', 'mailto:a@x.org', '/docs/a:b']);
    expect(html).toContain('js caps tab data');
  });
});
