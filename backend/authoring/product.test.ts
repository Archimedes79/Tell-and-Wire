import { describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Refusal } from '../deployment/host/http.ts';
import { findProduct, installHolds, openingAt, PORTS_TRIED, productRoutes, startProduct, switchTo, whoIsAt, type Product } from './product.ts';

describe('finding the other product', () => {
  it('asks the ports a product may have taken, in order, and answers the first that says it is that product', async () => {
    const asked: string[] = [];
    const who = async (base: string): Promise<Product | null> => { asked.push(base); return base.endsWith(':8102') ? 'notebook' : base.endsWith(':8100') ? 'editor' : null; };
    expect(await findProduct('notebook', who)).toBe('http://127.0.0.1:8102');
    expect(asked).toEqual(['http://127.0.0.1:8100', 'http://127.0.0.1:8101', 'http://127.0.0.1:8102']);
  });

  it('answers none when no port of the range has it, after as many as a product tries', async () => {
    const who = vi.fn(async () => null);
    expect(await findProduct('editor', who)).toBeNull();
    expect(who).toHaveBeenCalledTimes(PORTS_TRIED);
  });

  it('takes a port for what it says it is, and anything else for nobody', async () => {
    const says = (body: unknown, ok = true): typeof fetch => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
    expect(await whoIsAt('http://x', says({ product: 'editor' }))).toBe('editor');
    expect(await whoIsAt('http://x', says({ product: 'other' }))).toBeNull();
    expect(await whoIsAt('http://x', says({}, false))).toBeNull();
    expect(await whoIsAt('http://x', (async () => { throw new Error('refused'); }) as typeof fetch)).toBeNull();
  });
});

describe('switching', () => {
  it('sends the person to the product where it runs, asking it to open the project', async () => {
    const start = vi.fn();
    const found = await switchTo('editor', '/work/a b', { find: async () => 'http://127.0.0.1:8001', start, holds: () => true });
    expect(found).toEqual({ url: 'http://127.0.0.1:8001/?open=%2Fwork%2Fa%20b', started: false });
    expect(start).not.toHaveBeenCalled();
  });

  it('starts it where it does not run', async () => {
    const found = await switchTo('notebook', '/p', { find: async () => null, start: async () => 'http://127.0.0.1:8100', holds: () => true });
    expect(found).toEqual({ url: openingAt('http://127.0.0.1:8100', '/p'), started: true });
  });

  it('says so, in words, where the install does not hold it', async () => {
    const start = vi.fn();
    await expect(switchTo('editor', '/p', { find: async () => null, start, holds: () => false })).rejects.toThrow(/no editor.*notebook download/);
    expect(start).not.toHaveBeenCalled();
  });

  it('is answered by each product as the other one: who it is, whether the other can be reached, and a switch to the other', async () => {
    const asked: Product[] = [];
    const routes = productRoutes('notebook', { find: async () => 'http://127.0.0.1:8000', holds: (product) => { asked.push(product); return false; } });
    expect(await routes.product!(undefined as never, undefined as never)).toEqual({ product: 'notebook', can_switch: false });
    expect(asked).toEqual(['editor']);
    expect((await routes.switchProduct!({ path: '/p' }, undefined as never) as { url: string }).url).toBe('http://127.0.0.1:8000/?open=%2Fp');
    const refusing = productRoutes('editor', { find: async () => null, holds: () => false });
    await expect(refusing.switchProduct!({ path: '/p' }, undefined as never)).rejects.toBeInstanceOf(Refusal);
  });
});

describe('an install and a product to start', () => {
  // A product just started may still hold its folder for a moment (on Windows a folder in use cannot go): a temporary folder left is no failure.
  const clean = (install: string): void => { try { rmSync(install, { recursive: true, force: true, maxRetries: 3 }); } catch { /* left to the system's temp cleaning */ } };

  const fake = (): string => {
    const install = mkdtempSync(join(tmpdir(), 'tw-install-'));
    mkdirSync(join(install, 'backend', 'notebook'), { recursive: true });
    mkdirSync(join(install, 'frontend', 'notebook', 'dist'), { recursive: true });
    writeFileSync(join(install, 'frontend', 'notebook', 'dist', 'index.html'), '<html></html>');
    return install;
  };

  it('holds what has its start file and its page', () => {
    const install = fake();
    try {
      expect(installHolds('notebook', install)).toBe(false);
      writeFileSync(join(install, 'backend', 'notebook', 'main.ts'), '');
      expect(installHolds('notebook', install)).toBe(true);
      expect(installHolds('editor', install)).toBe(false);
    } finally { clean(install); }
  });

  it('is started from the install and answers the address it says it serves on', async () => {
    const install = fake();
    writeFileSync(join(install, 'backend', 'notebook', 'main.ts'), "process.stderr.write('Serving on http://127.0.0.1:8123/\\n'); setTimeout(() => undefined, 1500);\n");
    try {
      expect(await startProduct('notebook', install)).toBe('http://127.0.0.1:8123');
    } finally { clean(install); }
  }, 20_000);

  it('fails with what the product said when it ends before it serves', async () => {
    const install = fake();
    writeFileSync(join(install, 'backend', 'notebook', 'main.ts'), "process.stderr.write('No free port\\n'); process.exit(1);\n");
    try {
      await expect(startProduct('notebook', install)).rejects.toThrow(/before it served[\s\S]*No free port/);
    } finally { clean(install); }
  }, 20_000);
});
