// A Word document's text as Markdown: headings, lists, bold and italic, tables.
//
// This package imports nothing from the others, and nothing imports it.
// A .docx is zipped XML and unzipping is DecompressionStream, so it needs no package.

import { UserError } from './errors.ts';

/** A Word file that cannot be read, said the same way whatever is wrong with it. */
export class NotReadable extends UserError {}
const notReadable = (why: string): NotReadable => new NotReadable(`Not a readable Word file: ${why}.`);

/** The most a Word file may unpack to: a few kilobytes of zip can claim gigabytes. */
const UNPACKED_LIMIT = 100 * 1024 * 1024;

/** *packed* inflated, if it unpacks to no more than *room* bytes. */
async function inflate(packed: Uint8Array<ArrayBuffer>, room: number): Promise<Uint8Array> {
  const reader = new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    size += chunk.value.length;
    if (size > room) {
      await reader.cancel();
      throw notReadable('it unpacks to more than 100 MB');
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  return bytes;
}

/** The files of a zip archive that *wanted* names, unpacked. */
async function unzip(zip: Uint8Array, wanted: string[]): Promise<Map<string, string>> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = zip.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end -= 1;
  if (end < 0) throw notReadable('it is no zip archive');
  const found = new Map<string, string>();
  let room = UNPACKED_LIMIT;
  let at = view.getUint32(end + 16, true);
  for (let n = view.getUint16(end + 10, true); n > 0; n -= 1) {
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));
    const local = view.getUint32(at + 42, true);
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    if (!wanted.includes(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const packed = zip.slice(start, start + size);
    const bytes = method === 0 ? packed : await inflate(packed, room);
    room -= bytes.length;
    found.set(name, new TextDecoder().decode(bytes));
  }
  return found;
}

const entities = (text: string): string => text
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(x?)([0-9a-f]+);/gi, (_, hex: string, code: string) => {
    const point = parseInt(code, hex ? 16 : 10);
    return point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '';
  })
  .replace(/&amp;/g, '&');

/** Whether a run property such as `<w:b/>` is on: present, and not set to off. */
const on = (properties: string, tag: string): boolean =>
  new RegExp(`<w:${tag}(?: w:val="(?!0|false|none)[^"]*")?\\s*/>`).test(properties);

/** The text of a paragraph, its runs' bold and italic as Markdown. */
function runsOf(paragraph: string): string {
  let text = '';
  for (const [, run] of paragraph.matchAll(/<w:r[ >]([\s\S]*?)<\/w:r>/g)) {
    const properties = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(run)?.[1] ?? '';
    let words = '';
    for (const [piece] of run.matchAll(/<w:t(?: [^>]*)?>[\s\S]*?<\/w:t>|<w:tab\/>|<w:br\/>/g)) {
      words += piece === '<w:tab/>' ? '\t' : piece === '<w:br/>' ? '\n' : entities(piece.replace(/<[^>]+>/g, ''));
    }
    if (!words.trim()) { text += words; continue; }
    const mark = (on(properties, 'b') ? '**' : '') + (on(properties, 'i') ? '*' : '');
    const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(words)!;
    text += mark ? `${lead}${mark}${core}${[...mark].reverse().join('')}${trail}` : words;
  }
  // Two bold runs side by side are one bold stretch.
  return text.replace(/\*\*\*\*/g, '');
}

/** The outermost `tag` elements of *xml*, each whole: one inside another belongs to the outer one. */
function elements(xml: string, tag: string): string[] {
  const found: string[] = [];
  let depth = 0;
  let start = 0;
  for (const m of xml.matchAll(new RegExp(`<${tag}(?=[ >])|</${tag}>`, 'g'))) {
    if (m[0].startsWith('</')) {
      if (depth > 0 && --depth === 0) found.push(xml.slice(start, m.index + m[0].length));
    } else if (depth++ === 0) {
      start = m.index;
    }
  }
  return found;
}

/**
 * A Word document's body as Markdown: headings (a style named Heading or
 * Überschrift with its level, a title), lists bulleted or numbered as its
 * numbering says, bold and italic, tables. What has no Markdown -- pictures,
 * footnotes, equations -- is left out rather than guessed at.
 */
export async function docxMarkdown(zip: Uint8Array): Promise<string> {
  // What is not a zip, or is one that lies about itself, ends in a RangeError or a failed inflate: all of it "not readable".
  const parts = await unzip(zip, ['word/document.xml', 'word/numbering.xml', 'word/styles.xml'])
    .catch((error: unknown) => { throw error instanceof NotReadable ? error : notReadable('it is damaged'); });
  const document = parts.get('word/document.xml');
  if (!document) throw notReadable('there is no word/document.xml in it');

  // A style's name says what it is, whatever its id in this language.
  const styleNames = new Map<string, string>();
  for (const [, id, body] of (parts.get('word/styles.xml') ?? '').matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g)) {
    const name = /<w:name w:val="([^"]+)"/.exec(body)?.[1];
    if (name) styleNames.set(id, name.toLowerCase());
  }
  const numbering = parts.get('word/numbering.xml') ?? '';
  const abstractOf = new Map([...numbering.matchAll(/<w:num w:numId="(\d+)"[^>]*>\s*<w:abstractNumId w:val="(\d+)"/g)].map(([, num, abs]) => [num, abs]));
  const formats = new Map<string, string>();
  for (const [, abs, body] of numbering.matchAll(/<w:abstractNum [^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g)) {
    for (const [, level, format] of body.matchAll(/<w:lvl w:ilvl="(\d+)"[\s\S]*?<w:numFmt w:val="([^"]+)"/g)) formats.set(`${abs}:${level}`, format);
  }

  const paragraph = (xml: string): string => {
    const properties = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(xml)?.[1] ?? '';
    const text = runsOf(xml).trim();
    if (!text) return '';
    const style = /<w:pStyle w:val="([^"]+)"/.exec(properties)?.[1] ?? '';
    const name = styleNames.get(style) ?? style.toLowerCase();
    const level = /^(?:heading|.*berschrift)\s*(\d)$/.exec(name)?.[1];
    // The title is the one #, so a heading of level n is n + 1 of them.
    if (level) return `${'#'.repeat(Number(level) + 1)} ${text.replace(/\*+/g, '')}`;
    if (name === 'title' || name === 'titel') return `# ${text.replace(/\*+/g, '')}`;
    const list = /<w:numPr>[\s\S]*?<w:ilvl w:val="(\d+)"[\s\S]*?<w:numId w:val="(\d+)"/.exec(properties);
    if (list && list[2] !== '0') {
      const [, depth, num] = list;
      const ordered = (formats.get(`${abstractOf.get(num)}:${depth}`) ?? 'bullet') !== 'bullet';
      return `${'  '.repeat(Number(depth))}${ordered ? '1.' : '-'} ${text}`;
    }
    return text;
  };

  const blocks: string[] = [];
  const body = /<w:body>([\s\S]*)<\/w:body>/.exec(document)?.[1] ?? '';
  const paragraphs = (xml: string): void => {
    for (const [block] of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
      const said = paragraph(block);
      if (said) blocks.push(said);
    }
  };
  let at = 0;
  for (const block of elements(body, 'w:tbl')) {
    const start = body.indexOf(block, at);
    paragraphs(body.slice(at, start));
    at = start + block.length;
    // A table inside a cell is part of the cell: its text is read into it.
    const rows = elements(block, 'w:tr').map((row) =>
      elements(row, 'w:tc').map((cell) =>
        [...cell.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map(([p]) => runsOf(p).trim()).filter(Boolean).join(' ').replace(/\|/g, '\\|')));
    if (!rows.length) continue;
    const width = Math.max(...rows.map((row) => row.length));
    const line = (cells: string[]): string => `| ${[...cells, ...Array(width - cells.length).fill('')].join(' | ')} |`;
    blocks.push([line(rows[0]), line(Array(width).fill('---')), ...rows.slice(1).map(line)].join('\n'));
  }
  paragraphs(body.slice(at));
  // Items of one list are one block: no blank line between them.
  return blocks.join('\n\n').replace(/^((?: *)(?:-|1\.) .*)\n\n(?=(?: *)(?:-|1\.) )/gm, '$1\n') + '\n';
}
