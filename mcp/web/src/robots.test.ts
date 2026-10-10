import { describe, expect, it } from 'vitest';
import { RobotsGuard, parseRobots } from './robots.ts';
import { open, serve } from './testServer.ts';

describe('parseRobots', () => {
  it('lets the longest matching rule decide, and Allow win a tie', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /private\nAllow: /private/open\nDisallow: /tie\nAllow: /tie\n');
    expect(rules.allows('/private/secret')).toBe(false);
    expect(rules.allows('/private/open/page')).toBe(true);
    expect(rules.allows('/tie')).toBe(true);
    expect(rules.allows('/elsewhere')).toBe(true);
  });

  it('knows * and $', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /*.pdf$\nDisallow: /a*b/c\n');
    expect(rules.allows('/x/y.pdf')).toBe(false);
    expect(rules.allows('/x/y.pdf?download=1')).toBe(true);
    expect(rules.allows('/x/y.pdfx')).toBe(true);
    expect(rules.allows('/a-long-b/c')).toBe(false);
    expect(rules.allows('/ab')).toBe(true);
  });

  it('takes the group that names this tool over the one for everyone', () => {
    const text = 'User-agent: *\nDisallow: /\n\nUser-agent: TellAndWire\nDisallow: /nothing-for-me/\n';
    const rules = parseRobots(text, 'TellAndWire-Web');
    expect(rules.allows('/page')).toBe(true);
    expect(rules.allows('/nothing-for-me/x')).toBe(false);
    expect(parseRobots(text, 'SomeoneElse').allows('/page')).toBe(false);
  });

  it('shares the rules of several User-agent lines in a row, and ignores comments and CRLF', () => {
    const rules = parseRobots('# hello\r\nUser-agent: other\r\nUser-agent: tellandwire-web # me\r\nDisallow: /shared # no\r\n');
    expect(rules.allows('/shared/x')).toBe(false);
    expect(rules.allows('/free')).toBe(true);
  });

  it('allows everything when nothing applies', () => {
    expect(parseRobots('User-agent: other\nDisallow: /\n').allows('/x')).toBe(true);
    expect(parseRobots('User-agent: *\nDisallow:\n').allows('/x')).toBe(true);
    expect(parseRobots('').allows('/x')).toBe(true);
    expect(parseRobots('Disallow: /\n').allows('/x')).toBe(true);
  });
});

describe('RobotsGuard', () => {
  it('asks once, and refuses what the site refuses', async () => {
    const site = await serve((request, response) => {
      response.setHeader('content-type', 'text/plain');
      response.end(request.url === '/robots.txt' ? 'User-agent: *\nDisallow: /private\n' : 'page');
    });
    try {
      const guard = new RobotsGuard();
      await guard.check(new URL(`${site.base}/public`), open);
      await guard.check(new URL(`${site.base}/also/public`), open);
      await expect(guard.check(new URL(`${site.base}/private/x`), open)).rejects.toMatchObject({ code: 'robots' });
      expect(site.hits.filter((hit) => hit === '/robots.txt')).toHaveLength(1);
    } finally {
      await site.close();
    }
  });

  it('allows everything where there is no robots.txt, and nothing where it does not answer', async () => {
    const missing = await serve((_, response) => { response.statusCode = 404; response.end('no'); });
    const broken = await serve((_, response) => { response.statusCode = 503; response.end('down'); });
    try {
      await new RobotsGuard().check(new URL(`${missing.base}/x`), open);
      await expect(new RobotsGuard().check(new URL(`${broken.base}/x`), open)).rejects.toThrow(/answered HTTP 503/);
    } finally {
      await missing.close();
      await broken.close();
    }
  });

  it('asks again after an hour', async () => {
    const site = await serve((_, response) => { response.statusCode = 404; response.end(); });
    try {
      let now = 0;
      const guard = new RobotsGuard(() => now);
      await guard.check(new URL(`${site.base}/a`), open);
      now = 59 * 60 * 1000;
      await guard.check(new URL(`${site.base}/b`), open);
      expect(site.hits).toHaveLength(1);
      now = 61 * 60 * 1000;
      await guard.check(new URL(`${site.base}/c`), open);
      expect(site.hits).toHaveLength(2);
    } finally {
      await site.close();
    }
  });
});
