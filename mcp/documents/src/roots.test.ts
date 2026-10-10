import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessError, listInside, openRoots, resolveInside } from './roots.ts';

let base = '';
let root = '';

beforeAll(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'tw-docs-')));
  root = join(base, 'root');
  await mkdir(join(root, 'sub'), { recursive: true });
  await mkdir(join(base, 'root-evil'));
  await writeFile(join(root, 'a.pdf'), 'a');
  await writeFile(join(root, 'sub', 'b.docx'), 'b');
  await writeFile(join(root, 'notes.txt'), 'n');
  await writeFile(join(root, '.hidden.pdf'), 'h');
  await writeFile(join(base, 'root-evil', 'secret.txt'), 'secret');
  await writeFile(join(base, 'outside.txt'), 'outside');
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

const NOT_THERE = 'not found in the folders this server may read';

describe('resolveInside', () => {
  it('finds a file inside a root, by a relative or an absolute path', async () => {
    expect(await resolveInside([root], 'a.pdf', 'file')).toBe(join(root, 'a.pdf'));
    expect(await resolveInside([root], 'sub/b.docx', 'file')).toBe(join(root, 'sub', 'b.docx'));
    expect(await resolveInside([root], join(root, 'sub', 'b.docx'), 'file')).toBe(join(root, 'sub', 'b.docx'));
    expect(await resolveInside([root], 'sub/../a.pdf', 'file')).toBe(join(root, 'a.pdf'));
  });

  it('refuses everything outside, and says the same thing as for what is not there', async () => {
    for (const path of ['../outside.txt', join(base, 'outside.txt'), '../root-evil/secret.txt', join(base, 'root-evil', 'secret.txt'), 'sub/../../outside.txt', 'does-not-exist.pdf', join(base, 'nothing-here.txt')]) {
      await expect(resolveInside([root], path, 'file'), path).rejects.toThrow(NOT_THERE);
    }
  });

  it('judges a link by where it points', async () => {
    try {
      await symlink(join(base, 'outside.txt'), join(root, 'link-out.txt'), 'file');
      await symlink(join(root, 'a.pdf'), join(root, 'link-in.pdf'), 'file');
    } catch {
      return; // no permission to make links here (Windows without developer mode): nothing to test
    }
    await expect(resolveInside([root], 'link-out.txt', 'file')).rejects.toThrow(NOT_THERE);
    expect(await resolveInside([root], 'link-in.pdf', 'file')).toBe(join(root, 'a.pdf'));
  });

  it('knows a file from a folder, and refuses what is no path', async () => {
    await expect(resolveInside([root], 'sub', 'file')).rejects.toThrow('that is a folder, not a file');
    await expect(resolveInside([root], 'a.pdf', 'folder')).rejects.toThrow('that is a file, not a folder');
    for (const path of ['', '   ', 'a\0.pdf']) await expect(resolveInside([root], path, 'file')).rejects.toBeInstanceOf(AccessError);
    await expect(resolveInside([root], 'https://example.com/a.pdf', 'file')).rejects.toThrow('not addresses');
    await expect(resolveInside([root], 'file:///etc/passwd', 'file')).rejects.toThrow('not addresses');
  });

  it('takes any of several roots, and a relative path from the first', async () => {
    const second = join(base, 'root-evil');
    expect(await resolveInside([root, second], join(second, 'secret.txt'), 'file')).toBe(join(second, 'secret.txt'));
    await expect(resolveInside([root, second], 'secret.txt', 'file')).rejects.toThrow(NOT_THERE);
  });

  it.runIf(process.platform === 'win32')('does not mind the case of a Windows path', async () => {
    expect(await resolveInside([root], join(root, 'A.PDF').toUpperCase(), 'file')).toBe(join(root, 'a.pdf'));
  });
});

describe('openRoots', () => {
  it('wants real folders', async () => {
    expect(await openRoots([root])).toEqual([root]);
    await expect(openRoots([join(base, 'nope')])).rejects.toThrow('does not exist');
    await expect(openRoots([join(root, 'a.pdf')])).rejects.toThrow('is not a folder');
  });
});

describe('listInside', () => {
  const documents = (name: string): boolean => /\.(pdf|docx)$/i.test(name);

  it('lists folders first, then the files of interest, and hides dot files', async () => {
    const listing = await listInside([root], undefined, documents);
    expect(listing).toEqual({ folder: '.', entries: [{ name: 'sub', kind: 'folder', size: 0 }, { name: 'a.pdf', kind: 'file', size: 1 }], truncated: false });
    expect((await listInside([root], 'sub', documents)).entries.map((entry) => entry.name)).toEqual(['b.docx']);
    expect((await listInside([root], 'sub', documents)).folder).toBe('sub');
  });

  it('stops at a limit, and stays inside', async () => {
    expect(await listInside([root], undefined, documents, 1)).toMatchObject({ truncated: true });
    await expect(listInside([root], '..', documents)).rejects.toThrow(NOT_THERE);
  });
});
