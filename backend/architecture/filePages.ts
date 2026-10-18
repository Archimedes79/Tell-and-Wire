/**
 * The five pages by area of the file map (`docs/images/architecture-files-*.svg`): one box a directory, each file with what it does.
 *
 * They are drawn from "The files" in docs/architecture.md and from nothing else, so the folders and files they show are the ones the
 * document names -- and `files.test.ts` holds that document to the tree. `drawings.test.ts` holds the pages to the document: a row added,
 * moved or reworded without `node backend/architecture/draw.ts` fails there.
 */

/** One row of "The files": the directory of its file, what to call the file, and what it does. */
export interface FileRow {
  dir: string;
  label: string;
  role: string;
  /** The first path of the row, which decides the page. */
  path: string;
}

/** The colours of a page, light and dark: the heading of a box, its fill, and its line. */
interface Colours {
  head: string;
  fill: string;
  line: string;
  darkHead: string;
  darkLine: string;
}

export interface FilePage {
  file: string;
  /** The heading, which is also the title of the picture. */
  heading: string;
  about: string;
  /** Columns of boxes: the page is as wide as they are. */
  columns: number;
  colours: Colours;
  takes: (path: string) => boolean;
}

const rest = (path: string): boolean => !/^(graph|gui|backend|frontend)\//.test(path);

export const FILE_PAGES: FilePage[] = [
  {
    file: 'architecture-files-1-definitions.svg',
    heading: 'The definitions: graph/ and gui/',
    about: 'What a graph and a GUI are, whatever the language. Stand on nothing but themselves; every other layer imports them.',
    columns: 4,
    colours: { head: '#444441', fill: '#F1EFE8', line: '#5F5E5A', darkHead: '#D3D1C7', darkLine: '#B4B2A9' },
    takes: (path) => /^(graph|gui)\//.test(path),
  },
  {
    file: 'architecture-files-2-backend.svg',
    heading: 'The backend: backend/',
    about: "deployment/ runs a tool and is carried by every package; authoring/, cli/ and architecture/ write and check; editor/ and notebook/ are the two products' servers.",
    columns: 3,
    colours: { head: '#712B13', fill: '#FAECE7', line: '#993C1D', darkHead: '#F5C4B3', darkLine: '#F0997B' },
    takes: (path) => path.startsWith('backend/'),
  },
  {
    file: 'architecture-files-3-frontend-tool.svg',
    heading: 'The pages: frontend/ (a delivered tool, the notebook, the build)',
    about: "deployment/ is what a delivered tool's browser loads and is also the kit the editor and notebook build on.",
    columns: 3,
    colours: { head: '#085041', fill: '#E1F5EE', line: '#0F6E56', darkHead: '#9FE1CB', darkLine: '#5DCAA5' },
    takes: (path) => path.startsWith('frontend/') && !path.startsWith('frontend/editor/'),
  },
  {
    file: 'architecture-files-4-frontend-editor.svg',
    heading: "The editor's page: frontend/editor/",
    about: 'The canvas, a node opened in place, the GUI designer, the schedule table, the notebook link and the settings.',
    columns: 4,
    colours: { head: '#3C3489', fill: '#EEEDFE', line: '#534AB7', darkHead: '#CECBF6', darkLine: '#AFA9EC' },
    takes: (path) => path.startsWith('frontend/editor/'),
  },
  {
    file: 'architecture-files-5-mcp-root.svg',
    heading: 'The tool servers and the root: mcp/, scripts/, start and stop files',
    about: 'mcp/ are the tool servers that come with it, each a program of its own; the root holds how everything is started, built and packaged.',
    columns: 2,
    colours: { head: '#633806', fill: '#FAEEDA', line: '#854F0B', darkHead: '#FAC775', darkLine: '#EF9F27' },
    takes: rest,
  },
];

const esc = (text: string): string => text.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;');
const plain = (text: string): string => text.split('`').join('').split('**').join('');

/** "The files" of the document: its text from the heading to the next. */
function filesSection(doc: string): string {
  const from = doc.indexOf('\n## The files\n');
  const to = doc.indexOf('\n## ', from + 1);
  return doc.slice(from, to);
}

/** Every file row of "The files", in the order it has them. */
export function fileRows(doc: string): FileRow[] {
  const rows: FileRow[] = [];
  for (const line of filesSection(doc).split('\n')) {
    const found = /^\|\s*((?:`[^`]+`(?:,\s*)?)+)\s*\|\s*(.*?)\s*\|$/.exec(line);
    if (!found) continue;
    const paths = [...found[1].matchAll(/`([^`]+)`/g)].map((one) => one[1]);
    const dirs = paths.map((path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '(root)'));
    const names = paths.map((path) => path.slice(path.lastIndexOf('/') + 1));
    const sameDir = dirs.every((dir) => dir === dirs[0]);
    rows.push({ dir: dirs[0], label: sameDir ? names.join(', ') : paths.join(', '), role: plain(found[2]), path: paths[0] });
  }
  return rows;
}

const COLUMN_WIDTH = 440, GAP = 16, MARGIN = 20, TOP = 78, TALLEST = 520, WRAP = 82;

function wrap(text: string): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(' ')) {
    if (current && `${current} ${word}`.length > WRAP) {
      lines.push(current);
      current = word;
    } else current = current ? `${current} ${word}` : word;
  }
  if (current) lines.push(current);
  return lines;
}

/** How tall a box of these rows is: the title, then each file with the lines of its role. */
function heightOf(rows: FileRow[]): number {
  let y = 47;
  let last = 0;
  rows.forEach((row, index) => {
    last = y + 14.5 * wrap(row.role).length;
    if (index < rows.length - 1) y = last + 22.5;
  });
  return last + 15.5;
}

const styleOf = (c: Colours): string => `<style>svg{font-family:Segoe UI,Helvetica,Arial,sans-serif}.bg{fill:#ffffff}.h{font-size:19px;font-weight:600;fill:#1f1e1d}.n{font-size:12.5px;fill:#5f5e5a}.d{font-size:13px;font-weight:600;fill:${c.head}}.f{font-family:Consolas,Menlo,monospace;font-size:11.5px;font-weight:600;fill:#1f1e1d}.r{font-size:11px;fill:#5f5e5a}.box{fill:${c.fill};stroke:${c.line};stroke-width:.6}.row{stroke:${c.line};stroke-opacity:.25}@media (prefers-color-scheme:dark){.bg{fill:#1c1c1a}.h,.f{fill:#e8e6dc}.n,.r{fill:#b4b2a9}.d{fill:${c.darkHead}}.box{fill:#262624;stroke:${c.darkLine}}.row{stroke:${c.darkLine}}}</style>`;

/** The rows a page shows: those of its area. */
export const rowsOf = (doc: string, page: FilePage): FileRow[] => fileRows(doc).filter((row) => page.takes(row.path));

/** A page as SVG text. */
export function filePage(doc: string, page: FilePage): string {
  const mine = rowsOf(doc, page);
  const byDir = new Map<string, FileRow[]>();
  for (const row of mine) byDir.set(row.dir, [...(byDir.get(row.dir) ?? []), row]);
  // one box a directory, in the order of the directories; a long one goes on in a second box
  const boxes: { title: string; rows: FileRow[] }[] = [];
  for (const dir of [...byDir.keys()].sort()) {
    let left = byDir.get(dir) ?? [];
    let part = 0;
    while (left.length) {
      let take = left.length;
      while (take > 1 && heightOf(left.slice(0, take)) > TALLEST) take -= 1;
      boxes.push({ title: part ? `${dir} (cont.)/` : `${dir}/`, rows: left.slice(0, take) });
      left = left.slice(take);
      part += 1;
    }
  }
  // each box goes to the shortest column
  const bottoms: number[] = Array(page.columns).fill(TOP);
  const out: string[] = [];
  for (const box of boxes) {
    const column = bottoms.indexOf(Math.min(...bottoms));
    const x = MARGIN + column * (COLUMN_WIDTH + GAP);
    const y = bottoms[column];
    const height = heightOf(box.rows);
    out.push('<g>');
    out.push(`<rect class="box" x="${x}" y="${y}" width="${COLUMN_WIDTH}" height="${height}" rx="9"/>`);
    out.push(`<text class="d" x="${x + 14}" y="${y + 22}">${esc(box.title)}</text>`);
    let at = y + 47;
    box.rows.forEach((row, index) => {
      out.push(`<text class="f" x="${x + 14}" y="${at}">${esc(row.label)}</text>`);
      const lines = wrap(row.role);
      lines.forEach((line, k) => out.push(`<text class="r" x="${x + 22}" y="${at + 14.5 * (k + 1)}">${esc(line)}</text>`));
      const last = at + 14.5 * lines.length;
      if (index < box.rows.length - 1) {
        out.push(`<line class="row" x1="${x + 14}" x2="${x + COLUMN_WIDTH - 14}" y1="${last + 6.5}" y2="${last + 6.5}"/>`);
        at = last + 22.5;
      }
    });
    out.push('</g>');
    bottoms[column] = y + height + GAP;
  }
  const width = MARGIN * 2 + page.columns * COLUMN_WIDTH + (page.columns - 1) * GAP;
  const height = Math.max(...bottoms) - GAP + MARGIN;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" viewBox="0 0 ${width} ${height}" role="img">\n<title>${esc(page.heading)}</title>\n<desc>${esc(page.about)} ${mine.length} rows: each file with what it does.</desc>\n${styleOf(page.colours)}\n<rect class="bg" width="${width}" height="${height}"/>\n<text class="h" x="20" y="34">${esc(page.heading)}</text>\n<text class="n" x="20" y="54">${esc(page.about)} (${mine.length} rows)</text>\n${out.join('\n')}\n</svg>\n`;
}
