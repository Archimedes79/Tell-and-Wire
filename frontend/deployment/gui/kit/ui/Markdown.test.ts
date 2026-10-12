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

describe('Markdown lines', () => {
  it('end however the text ends them: a heading before a carriage return is a heading, and the page does not stop', () => {
    const html = renderToStaticMarkup(createElement(Markdown, { source: '# Title\r\nbody\r\n\r\n## Next - one\r- two' }));
    expect(html).toContain('Title');
    expect(html).toContain('Next');
    expect(html.match(/<li>/g)).toHaveLength(2);
  });
});

describe('Markdown blocks', () => {
  it('draws a fenced block as written, and numbered steps as a numbered list', () => {
    const html = renderToStaticMarkup(createElement(Markdown, { source: 'Run:\n```\nnpm start\n  --port 8000\n```\n1. one\n2. two\nAfter.' }));
    expect(html).toContain('<pre');
    expect(html).toContain('npm start\n  --port 8000');
    expect(html.match(/<ol/g)).toHaveLength(1);
    expect(html.match(/<li>/g)).toHaveLength(2);
    expect(html).toContain('After.');
  });
});

describe('Markdown quotes', () => {
  it('draw lines starting with ">" as one quoted block, without the mark, and end it where they end', () => {
    const html = renderToStaticMarkup(createElement(Markdown, { source: 'Say:\n\n> Read the CSV\n> and show a **chart**.\nAfter.' }));
    expect(html.match(/<blockquote/g)).toHaveLength(1);
    expect(html).toContain('Read the CSV and show a <strong>chart</strong>.');
    expect(html).not.toContain('&gt;');
    expect(html).toContain('After.');
  });
});

describe('Markdown list items', () => {
  it('go on over the indented lines under them', () => {
    const html = renderToStaticMarkup(createElement(Markdown, { source: '- **One.** First part\n  and the rest.\n- Two' }));
    expect(html.match(/<li>/g)).toHaveLength(2);
    expect(html).toContain('First part and the rest.');
  });
});
