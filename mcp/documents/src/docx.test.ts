import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { docxMarkdown } from './docx.ts';
import { bullet, cell, docxOf, p, r, zipOf } from './testFiles.ts';

describe('docxMarkdown', () => {
  it('gives headings by what their style is called, emphasis, lists and tables as Markdown', async () => {
    const said = await docxMarkdown(docxOf(
      p(r('Bericht'), '<w:pStyle w:val="Titel"/>') + p(r('Einleitung'), '<w:pStyle w:val="berschrift1"/>')
      + p(r('ein ') + r('fettes ', '<w:b/>') + r('Wort', '<w:i/>') + r(' &amp; mehr'))
      + p(r('a'), bullet(1)) + p(r('b'), bullet(1)) + p(r('eins'), bullet(2))
      + `<w:tbl><w:tr>${cell('A')}${cell('B')}</w:tr><w:tr>${cell('1')}${cell('x | y')}</w:tr></w:tbl>`,
    ));
    expect(said).toBe('# Bericht\n\n## Einleitung\n\nein **fettes** *Wort* & mehr\n\n- a\n- b\n1. eins\n\n| A | B |\n| --- | --- |\n| 1 | x \\| y |\n');
  });

  it('reads a file whose entries are stored, not deflated', async () => {
    expect(await docxMarkdown(docxOf(p(r('Plain.')), false))).toBe('Plain.\n');
  });

  it('leaves out a code point that does not exist', async () => {
    expect(await docxMarkdown(docxOf(p(r('a&#99999999;b'))))).toBe('ab\n');
  });

  it('says a file is no readable Word file, the same way whatever is wrong with it', async () => {
    const damaged = docxOf(p(r('x')));
    new DataView(damaged.buffer).setUint32(damaged.length - 22 + 16, 0xfffffff0, true);
    await expect(docxMarkdown(damaged)).rejects.toThrow(/Not a readable Word file/);
    await expect(docxMarkdown(Uint8Array.from(Buffer.from('this is plain text')))).rejects.toThrow(/Not a readable Word file: it is no zip archive/);
    await expect(docxMarkdown(zipOf({ 'other.xml': '<x/>' }))).rejects.toThrow(/no word\/document\.xml/);
  });

  it('will not unpack more than 100 MB, however little the zip says it holds', async () => {
    const huge = Buffer.alloc(101 * 1024 * 1024);
    const packed = deflateRawSync(huge);
    const archive = Buffer.from(zipOf({ 'word/document.xml': 'x' }));
    // Rewrite the one entry's packed bytes to a stream that inflates to 101 MB: a zip that lies about its size.
    const name = Buffer.from('word/document.xml');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(1, 22); local.writeUInt16LE(name.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(8, 10); entry.writeUInt32LE(packed.length, 20); entry.writeUInt32LE(1, 24); entry.writeUInt16LE(name.length, 28);
    const directoryAt = 30 + name.length + packed.length;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + name.length, 12); end.writeUInt32LE(directoryAt, 16);
    expect(archive.length).toBeGreaterThan(0);
    const lying = Uint8Array.from(Buffer.concat([local, name, packed, entry, name, end]));
    await expect(docxMarkdown(lying)).rejects.toThrow(/unpacks to more than 100 MB/);
  }, 30_000);
});
