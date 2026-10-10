import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { confineEverything, inProject } from './confine.ts';
import { nodeFiles } from './node.ts';

afterEach(() => {
  confineEverything(false);
  delete process.env.TW_SETTINGS;
});

describe('which files a graph may reach', () => {
  it('names a path below the tool\'s folder, never an absolute one, one that climbs out, or a link that leads out', () => {
    expect(inProject('data/in.csv')).toBe(join(process.cwd(), 'data', 'in.csv'));
    for (const written of ['/etc/passwd', 'C:\\Windows\\win.ini', '\\\\host\\share\\x', '../x', 'data/../../x']) expect(() => inProject(written)).toThrow(/absolute|leaves/);

    const outside = mkdtempSync(join(tmpdir(), 'tell-and-wire-confine-'));
    const link = join(process.cwd(), 'confine-probe-link');
    try {
      symlinkSync(outside, link, 'junction');
      expect(() => inProject('confine-probe-link/secret.txt')).toThrow(/leads out/);
    } finally {
      rmSync(link, { force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('never reads the settings file, whoever names it, and a tool served beyond this machine touches nothing outside its folder', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'tell-and-wire-confine-'));
    const settings = join(outside, 'settings.json');
    const other = join(outside, 'other.txt');
    writeFileSync(settings, '{"api_keys":{"openai":"sk-planted"}}');
    writeFileSync(other, 'x');
    process.env.TW_SETTINGS = settings;
    try {
      await expect(nodeFiles.read(settings)).rejects.toThrow(/holds keys/);
      await expect(nodeFiles.write(settings, '{}')).rejects.toThrow(/holds keys/);
      expect(await nodeFiles.list(outside)).toEqual([other.replace(/\\/g, '/')]);
      expect(await nodeFiles.read(other)).toBe('x');
      confineEverything();
      await expect(nodeFiles.read(other)).rejects.toThrow(/served beyond/);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
