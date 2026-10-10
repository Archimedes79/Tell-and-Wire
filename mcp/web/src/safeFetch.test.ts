import { brotliCompressSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decode, get, parseTarget, policyFromEnv } from './safeFetch.ts';
import { open, serve, strict } from './testServer.ts';

const text = (body: string | Buffer, headers: Record<string, string> = {}) =>
  (_: unknown, response: import('node:http').ServerResponse) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...headers });
    response.end(body);
  };

describe('what it will not read', () => {
  it('refuses this machine, whatever way its address is written', async () => {
    const site = await serve(text('secret'));
    try {
      await expect(get(`${site.base}/`, strict)).rejects.toMatchObject({ code: 'blocked' });
      await expect(get('http://localhost:9/', strict)).rejects.toMatchObject({ code: 'blocked' });
      for (const address of ['http://[::1]:9/', 'http://2130706433:9/', 'http://0x7f.1:9/', 'http://[::ffff:127.0.0.1]:9/', 'http://169.254.169.254/latest/meta-data/', 'http://192.168.0.1/']) {
        await expect(get(address, strict), address).rejects.toMatchObject({ code: 'blocked' });
      }
      expect(site.hits).toEqual([]);
    } finally {
      await site.close();
    }
  });

  it('refuses anything that is no http or https address, or carries a password', async () => {
    for (const address of ['file:///etc/passwd', 'ftp://example.com/', 'javascript:alert(1)', 'not a url', 'https://user:secret@example.com/']) {
      await expect(get(address, open), address).rejects.toMatchObject({ code: 'url' });
    }
  });

  it('asks again at every redirect', async () => {
    const site = await serve((_, response) => {
      response.writeHead(302, { location: 'http://127.0.0.2:9/inside' });
      response.end();
    });
    try {
      // Only 127.0.0.1 may be read, as if it were a public name; the redirect leads to a neighbour.
      const policy = { ...strict, allowAddress: (address: string) => address === '127.0.0.1' };
      await expect(get(`${site.base}/`, policy)).rejects.toMatchObject({ code: 'blocked' });
    } finally {
      await site.close();
    }
  });
});

describe('what it reads', () => {
  it('follows redirects, up to a number', async () => {
    const site = await serve((request, response) => {
      if (request.url === '/a') { response.writeHead(302, { location: '/b' }); response.end(); return; }
      if (request.url === '/loop') { response.writeHead(301, { location: '/loop' }); response.end(); return; }
      text('arrived')(request, response);
    });
    try {
      const page = await get(`${site.base}/a`, open);
      expect(page.url.pathname).toBe('/b');
      expect(Buffer.from(page.body).toString()).toBe('arrived');
      await expect(get(`${site.base}/loop`, { ...open, maxRedirects: 3 })).rejects.toThrow(/more than 3 redirects/);
    } finally {
      await site.close();
    }
  });

  it('unpacks gzip and brotli', async () => {
    const site = await serve((request, response) => {
      const packed = request.url === '/br' ? brotliCompressSync('brotli body') : gzipSync('gzip body');
      text(packed, { 'content-encoding': request.url === '/br' ? 'br' : 'gzip' })(request, response);
    });
    try {
      expect(Buffer.from((await get(`${site.base}/gz`, open)).body).toString()).toBe('gzip body');
      expect(Buffer.from((await get(`${site.base}/br`, open)).body).toString()).toBe('brotli body');
    } finally {
      await site.close();
    }
  });

  it('hands back a status that is no success, without a body', async () => {
    const site = await serve((_, response) => { response.statusCode = 404; response.end('nothing here'); });
    try {
      const page = await get(`${site.base}/`, open);
      expect(page.status).toBe(404);
      expect(page.body).toHaveLength(0);
    } finally {
      await site.close();
    }
  });

  it('says who it is, and sends no cookie', async () => {
    let seen: import('node:http').IncomingHttpHeaders = {};
    const site = await serve((request, response) => { seen = request.headers; text('ok')(request, response); });
    try {
      await get(`${site.base}/`, open);
      expect(String(seen['user-agent'])).toMatch(/^TellAndWire-Web\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/Archimedes79\/Tell-and-Wire\)$/);
      expect(seen.cookie).toBeUndefined();
      expect(seen.authorization).toBeUndefined();
    } finally {
      await site.close();
    }
  });
});

describe('its limits', () => {
  it('stops at a size, declared or not', async () => {
    const site = await serve((request, response) => {
      const body = Buffer.alloc(2 * 1024 * 1024, 'x');
      if (request.url === '/declared') { text(body)(request, response); return; }
      response.writeHead(200, { 'content-type': 'text/html' });
      response.write(body);
      response.end();
    });
    try {
      await expect(get(`${site.base}/declared`, open)).rejects.toMatchObject({ code: 'size' });
      await expect(get(`${site.base}/chunked`, open)).rejects.toMatchObject({ code: 'size' });
    } finally {
      await site.close();
    }
  });

  it('counts a packed page by what it unpacks to', async () => {
    const site = await serve(text(gzipSync(Buffer.alloc(30 * 1024 * 1024)), { 'content-encoding': 'gzip' }));
    try {
      await expect(get(`${site.base}/`, open)).rejects.toMatchObject({ code: 'size' });
    } finally {
      await site.close();
    }
  });

  it('gives up on a server that does not answer', async () => {
    const site = await serve(() => {});
    try {
      const started = Date.now();
      await expect(get(`${site.base}/`, { ...open, timeoutMs: 300 })).rejects.toMatchObject({ code: 'timeout' });
      expect(Date.now() - started).toBeLessThan(3000);
    } finally {
      await site.close();
    }
  });

  it('says it cannot reach a server that is not there', async () => {
    await expect(get('http://127.0.0.1:1/', open)).rejects.toMatchObject({ code: 'network' });
  });
});

describe('decode', () => {
  it('reads the charset from the header, then from a meta tag, else UTF-8', () => {
    const latin = Uint8Array.from([0x63, 0x61, 0x66, 0xe9]);
    expect(decode(latin, 'text/html; charset=iso-8859-1')).toBe('café');
    expect(decode(Uint8Array.from(Buffer.concat([Buffer.from('<meta charset="windows-1252">'), latin])), 'text/html')).toBe('<meta charset="windows-1252">café');
    expect(decode(Buffer.from('café'), 'text/html')).toBe('café');
    expect(decode(Buffer.from('café'), 'text/html; charset=nonsense')).toBe('café');
  });
});

describe('policyFromEnv', () => {
  it('keeps the default of nothing private, and bounds what the owner may set', () => {
    expect(policyFromEnv({}).allowPrivate).toBe(false);
    expect(policyFromEnv({ TW_WEB_ALLOW_PRIVATE: '1' }).allowPrivate).toBe(true);
    expect(policyFromEnv({ TW_WEB_ALLOW_PRIVATE: 'yes' }).allowPrivate).toBe(false);
    expect(policyFromEnv({ TW_WEB_TIMEOUT_MS: '5' }).timeoutMs).toBe(1000);
    expect(policyFromEnv({ TW_WEB_MAX_BYTES: '999999999999' }).maxBytes).toBe(50 * 1024 * 1024);
    expect(policyFromEnv({ TW_WEB_MAX_BYTES: 'many' }).maxBytes).toBe(5 * 1024 * 1024);
  });
});

describe('parseTarget', () => {
  it('judges an IP written in the address before anything connects', () => {
    expect(() => parseTarget('http://10.0.0.5/', strict)).toThrow(/not a public address/);
    expect(parseTarget('http://8.8.8.8/x', strict).hostname).toBe('8.8.8.8');
    expect(parseTarget('https://example.com/x?y=1', strict).search).toBe('?y=1');
  });
});
