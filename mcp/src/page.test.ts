import { describe, expect, it } from 'vitest';
import { PageReader } from './page.ts';
import { RobotsGuard } from './robots.ts';
import { html, open, serve } from './testServer.ts';

const ARTICLE = html(`
  <header><nav><a href="/">Home</a> <a href="/shop">Shop</a></nav></header>
  <main><article>
    <h1>The Lighthouse Keeper</h1>
    <p>For thirty-one years Ansel Brandt kept the light at Skerry Point, and every evening he wrote down the hour the lamp was lit.</p>
    <p>The Harbour Board had asked for the wind and the hour. The number of ships that passed was his own idea.</p>
    <h2>The ledger</h2>
    <ul><li>Lamp lit at dusk</li><li>Wind from the north-west</li></ul>
  </article></main>
  <footer>Subscribe to our newsletter and follow us everywhere.</footer>`, 'The Lighthouse Keeper | Harbour News');

const page = (body: string, type = 'text/html; charset=utf-8') => (_: unknown, response: import('node:http').ServerResponse) => {
  response.writeHead(200, { 'content-type': type });
  response.end(body);
};

describe('PageReader', () => {
  it('reads the article as Markdown and leaves the menus and the footer out', async () => {
    const site = await serve(page(ARTICLE));
    try {
      const result = await new PageReader(open, null).read(`${site.base}/story`, 8000, 0);
      expect(result.title).toContain('Lighthouse Keeper');
      expect(result.content).toContain('For thirty-one years Ansel Brandt kept the light');
      expect(result.content).toMatch(/^#{1,3} The ledger/m);
      expect(result.content).toContain('Wind from the north-west');
      expect(result.content).not.toContain('Subscribe to our newsletter');
      expect(result.content).not.toContain('Shop');
      expect(result.final_url).toBe(`${site.base}/story`);
      expect(result.next_start).toBeNull();
      expect(result.warning).toBe('');
    } finally {
      await site.close();
    }
  });

  it('reads a long page in pieces from one fetch', async () => {
    const paragraphs = Array.from({ length: 60 }, (_, n) => `<p>Paragraph ${n} of a long page, with enough words in it to take up room in a piece.</p>`).join('');
    const site = await serve(page(html(`<article><h1>Long</h1>${paragraphs}</article>`)));
    try {
      const reader = new PageReader(open, null);
      const seen: string[] = [];
      let start: number | null = 0;
      while (start !== null) {
        const part = await reader.read(`${site.base}/long`, 1000, start);
        expect(part.content.length).toBeLessThanOrEqual(1000);
        seen.push(part.content);
        start = part.next_start;
      }
      expect(seen.length).toBeGreaterThan(3);
      const all = seen.join(' ');
      for (let n = 0; n < 60; n += 1) expect(all).toContain(`Paragraph ${n} of a long page`);
      expect(site.hits).toEqual(['/long']);
    } finally {
      await site.close();
    }
  });

  it('fetches again once the five minutes are up', async () => {
    const site = await serve(page(ARTICLE));
    try {
      let now = 0;
      const reader = new PageReader(open, null, () => now);
      await reader.read(`${site.base}/s`, 8000, 0);
      now = 4 * 60 * 1000;
      await reader.read(`${site.base}/s`, 8000, 0);
      expect(site.hits).toHaveLength(1);
      now = 6 * 60 * 1000;
      await reader.read(`${site.base}/s`, 8000, 0);
      expect(site.hits).toHaveLength(2);
    } finally {
      await site.close();
    }
  });

  it('keeps to what robots.txt says, and asks once', async () => {
    const site = await serve((request, response) => {
      if (request.url === '/robots.txt') { response.setHeader('content-type', 'text/plain'); response.end('User-agent: *\nDisallow: /private\n'); return; }
      page(ARTICLE)(request, response);
    });
    try {
      const reader = new PageReader(open, new RobotsGuard());
      await reader.read(`${site.base}/public`, 8000, 0);
      await expect(reader.read(`${site.base}/private/x`, 8000, 0)).rejects.toMatchObject({ code: 'robots' });
      // The owner of the machine may switch that off: then nothing asks.
      expect((await new PageReader(open, null).read(`${site.base}/private/x`, 8000, 0)).title).toContain('Lighthouse');
      expect(site.hits.filter((hit) => hit === '/robots.txt')).toHaveLength(1);
    } finally {
      await site.close();
    }
  });

  it('says what is wrong, in words that say what to do', async () => {
    const site = await serve((request, response) => {
      const [status, type, body] = ({
        '/forbidden': [403, 'text/html', 'no'],
        '/gone': [404, 'text/html', 'no'],
        '/busy': [429, 'text/html', 'no'],
        '/pdf': [200, 'application/pdf', '%PDF-1.7 ...'],
        '/sniffed-pdf': [200, 'application/octet-stream', '%PDF-1.7 ...'],
        '/json': [200, 'application/json', '{}'],
        '/empty': [200, 'text/html', html('')],
      } as Record<string, [number, string, string]>)[request.url ?? ''] ?? [500, 'text/html', 'x'];
      response.writeHead(status, { 'content-type': type });
      response.end(body);
    });
    try {
      const reader = new PageReader(open, null);
      const why = (path: string) => reader.read(`${site.base}${path}`, 8000, 0).then(() => 'read', (error: Error) => error.message);
      expect(await why('/forbidden')).toMatch(/HTTP 403.*refuses.*does not log in/);
      expect(await why('/gone')).toMatch(/HTTP 404: there is no such page/);
      expect(await why('/busy')).toMatch(/HTTP 429.*fewer requests/);
      expect(await why('/pdf')).toMatch(/PDF.*cannot read PDFs/);
      expect(await why('/sniffed-pdf')).toMatch(/PDF/);
      expect(await why('/json')).toMatch(/application\/json, not a web page/);
      expect(await why('/empty')).toMatch(/nothing readable.*JavaScript/);
    } finally {
      await site.close();
    }
  });

  it('reads plain text as it is, titled by its first heading or else its file name', async () => {
    const site = await serve((request, response) => page(request.url?.includes('todo') ? 'Buy milk.' : '# A note\n\nJust text.', 'text/plain; charset=utf-8')(request, response));
    try {
      const reader = new PageReader(open, null);
      const note = await reader.read(`${site.base}/note.txt`, 8000, 0);
      expect(note.content).toBe('# A note\n\nJust text.');
      expect(note.title).toBe('A note');
      expect((await reader.read(`${site.base}/notes/todo%20list.txt`, 8000, 0)).title).toBe('todo list.txt');
    } finally {
      await site.close();
    }
  });

  it('warns when almost nothing was found on a big page', async () => {
    const scripts = '<script>window.app = "builds the page here";</script>'.repeat(200);
    const site = await serve(page(html(`<div id="root"></div><p>Loading...</p>${scripts}`)));
    try {
      const result = await new PageReader(open, null).read(`${site.base}/spa`, 8000, 0);
      expect(result.warning).toMatch(/JavaScript/);
    } finally {
      await site.close();
    }
  });
});
