/**
 * The README's picture (`docs/images/overview.svg`) drawn again with each box grown by its folders and key files
 * (`docs/images/overview-detail.svg`): the same three bands, the same boxes in the same places, the same colours.
 *
 * What each box holds is written down here, as paths: `drawings.test.ts` holds every folder and file to the tree, and the folders of a box
 * to the document's table of that box ("The overview, block by block"). The picture's own styles are read from the README's, so a
 * change of its colours reaches this one by `node backend/architecture/draw.ts`.
 */

/** A key file of a box, and what it is. `files` are full paths from the root; a `<kind>` or `*` in one stands for the files of every kind. */
export interface Entry {
  files: string | string[];
  role: string;
}

/** The classes a box is drawn with: the README's own. */
interface Look {
  cls: string;
  tcls: string;
  scls: string;
  /** On the dark box of the engine the text is light. */
  deep?: boolean;
}

/** A box: its name and words as in the README, the folders it is, and its key files. */
export interface Box extends Look {
  title: string;
  title2?: string;
  sub?: string;
  /** The folders the box is, from the root: checked against the tree and against the document's table. */
  folders?: string[];
  /** Where the box's table is in the document: the heading it stands under, and its name there. */
  doc?: [heading: string, name: string];
  /** What the folders are written as, when not as one line of them: `frontend/editor/{app,api}/`. */
  pathLines?: string[];
  /** Files are written from here, when it is not the folders' common parent. */
  base?: string;
  entries?: Entry[];
  /** Words under the folders and files, not checked: a line of text, and the second part of it. */
  text?: [string, string][];
}

const EDITOR: Look = { cls: 'edit', tcls: 't', scls: 's' };
const NOTEBOOK: Look = { cls: 'nb', tcls: 'nb-t', scls: 'nb-s' };
const SHIPPED: Look = { cls: 'box', tcls: 'box-t', scls: 'box-s' };
const MODEL: Look = { cls: 'ai', tcls: 'ai-t', scls: 'ai-s' };
const FILES: Look = { cls: 'note', tcls: 'note-t', scls: 'note-s' };

const EDITOR_FRONTEND = 'frontend/editor/';
const NOTEBOOK_FRONTEND = 'frontend/notebook/';

export const guiEditor: Box = {
  ...EDITOR, title: 'GUI editor', sub: 'blocks in a page', doc: ['Design: the editor', '**GUI editor**'],
  folders: [`${EDITOR_FRONTEND}gui/`],
  entries: [
    { files: `${EDITOR_FRONTEND}gui/DesignerTab.tsx`, role: 'blocks placed on the grid' },
    { files: `${EDITOR_FRONTEND}gui/ApplicationView.tsx`, role: 'the tool as it runs' },
    { files: `${EDITOR_FRONTEND}gui/widgets/<kind>/<Kind>WidgetGuiBuilder.ts`, role: 'in widgets/<kind>/: how a block is edited' },
  ],
};
export const graphEditor: Box = {
  ...EDITOR, title: 'Graph editor', sub: 'nodes, wires, schedule', doc: ['Design: the editor', '**Graph editor**'],
  folders: [`${EDITOR_FRONTEND}graph/`],
  entries: [
    { files: `${EDITOR_FRONTEND}graph/canvas/GraphCanvas.tsx`, role: 'nodes and wires' },
    { files: `${EDITOR_FRONTEND}graph/node/NodeView.tsx`, role: 'a node opened in place' },
    { files: `${EDITOR_FRONTEND}graph/writing/useGenerate.ts`, role: 'one ✨ in flight' },
    { files: `${EDITOR_FRONTEND}graph/nodes/<kind>/<Kind>NodeGuiBuilder.ts`, role: 'in nodes/<kind>/: how a kind is edited' },
  ],
};
export const editorShell: Box = {
  ...EDITOR, title: 'their shell', sub: 'what both halves stand on', doc: ['Design: the editor', '(shell of both)'],
  folders: ['app', 'dialogs', 'fields', 'elements', 'document', 'api'].map((name) => `${EDITOR_FRONTEND}${name}/`),
  entries: [
    { files: `${EDITOR_FRONTEND}app/App.tsx`, role: 'documents, tabs, menus, dialogs' },
    { files: `${EDITOR_FRONTEND}document/store/graphStore.ts`, role: 'the open graph' },
    { files: `${EDITOR_FRONTEND}elements/registry.ts`, role: "each kind's builder, by name" },
    { files: `${EDITOR_FRONTEND}api/client.ts`, role: "the host's routes, by name" },
  ],
};
export const editorBackend: Box = {
  ...EDITOR, title: 'Editor backend', sub: 'checks it, runs it for you', doc: ['Design: the editor', '**Editor backend**'],
  folders: ['host', 'project', 'graph', 'settings', 'assistant'].map((name) => `backend/editor/${name}/`),
  pathLines: ['backend/editor/{host,project,graph,settings,assistant}/', 'graph/editor/  gui/editor/  (its part of the definitions)'],
  entries: [
    { files: 'backend/editor/host/routes.ts', role: 'what only the editor answers' },
    { files: 'backend/editor/graph/generate.ts', role: "writes a node's files with a model" },
    { files: 'backend/editor/project/deploy/bundle.ts', role: 'Deploy: the package' },
    { files: 'backend/editor/assistant/server.ts', role: 'Tell & Wire offered to an assistant' },
    { files: 'graph/editor/prompts.ts', role: 'the prompts a node is written with' },
  ],
};

export const page: Box = {
  ...NOTEBOOK, title: 'Page', sub: 'text and windows', doc: ['Design: the notebook', '**Page**'],
  folders: [`${NOTEBOOK_FRONTEND}gui/`],
  entries: [
    { files: `${NOTEBOOK_FRONTEND}gui/Page.tsx`, role: 'the page, windows standing in it' },
    { files: `${NOTEBOOK_FRONTEND}gui/WindowBox.tsx`, role: 'a window to be used' },
  ],
};
export const cells: Box = {
  ...NOTEBOOK, title: 'Cells', sub: 'list, under the hood, debug', doc: ['Design: the notebook', '**Cells**'],
  folders: [`${NOTEBOOK_FRONTEND}graph/`],
  entries: [
    { files: `${NOTEBOOK_FRONTEND}graph/Cells.tsx`, role: 'Ask, Do, Show of a window' },
    { files: `${NOTEBOOK_FRONTEND}graph/Haube.tsx`, role: 'the window as its graph' },
    { files: [`${NOTEBOOK_FRONTEND}graph/Debug.tsx`, `${NOTEBOOK_FRONTEND}graph/Dock.tsx`], role: 'every round; under the page' },
  ],
};
export const notebookShell: Box = {
  ...NOTEBOOK, title: 'their shell', sub: 'what both halves stand on', doc: ['Design: the notebook', '(shell of both)'],
  folders: [`${NOTEBOOK_FRONTEND}document/`, `${NOTEBOOK_FRONTEND}elements/`],
  pathLines: [`${NOTEBOOK_FRONTEND}{document,elements}/ and App.tsx`],
  entries: [
    { files: [`${NOTEBOOK_FRONTEND}App.tsx`, `${NOTEBOOK_FRONTEND}look.ts`], role: 'the bar; the first page; light or dark' },
    { files: `${NOTEBOOK_FRONTEND}document/store.ts`, role: 'the open notebook, undo' },
    { files: `${NOTEBOOK_FRONTEND}document/runs.ts`, role: 'windows as a graph to the host' },
    { files: `${NOTEBOOK_FRONTEND}elements/Widgets.tsx`, role: 'inputs and outputs: its own' },
    { files: `${NOTEBOOK_FRONTEND}notebook.css`, role: 'its look, and the scheme of the tool on the sheet' },
  ],
};
export const notebookBackend: Box = {
  ...NOTEBOOK, title: 'Notebook backend', sub: 'reads the page from the project, saves it', doc: ['Design: the notebook', '**Notebook backend**'],
  folders: ['backend/notebook/'],
  pathLines: ['backend/notebook/', 'gui/notebook/  (its model: windows and page)'],
  entries: [
    { files: 'backend/notebook/routes.ts', role: 'open, save, hold' },
    { files: 'backend/notebook/describe.ts', role: 'windows from a sentence, by a model' },
    { files: 'gui/notebook/windows.ts', role: 'a tool as fixed windows of cells' },
    { files: 'gui/notebook/fromGraph.ts', role: 'the windows a graph says' },
  ],
};

/** The four halves of the box "Common code", drawn inside it. */
export const commonHalves: Box[] = [
  {
    ...EDITOR, title: 'Graph definition', doc: ['Common code', 'Graph definition'], folders: ['graph/'],
    entries: [
      { files: 'graph/graph.ts', role: 'the graph as stored and run' },
      { files: ['graph/order.ts', 'graph/triggers.ts'], role: 'run order; what starts it' },
      { files: 'graph/files/flow.ts', role: 'graph-flow.json' },
      { files: 'graph/nodes/<kind>/<Kind>NodeDefinition.ts', role: 'in nodes/<kind>/: what a kind is' },
    ],
  },
  {
    ...EDITOR, title: 'GUI definition', doc: ['Common code', 'GUI definition'], folders: ['gui/'],
    entries: [
      { files: ['gui/gui.ts', 'gui/interface.ts'], role: 'blocks, and what fires what' },
      { files: 'gui/scheme.ts', role: 'the colour scheme' },
      { files: 'gui/room.ts', role: 'where a result is shown' },
      { files: 'gui/widgets/<kind>/<Kind>WidgetDefinition.ts', role: 'in widgets/<kind>/: what a block is' },
    ],
  },
  {
    ...EDITOR, title: 'Authoring', doc: ['Common code', 'Authoring'], folders: ['graph/authoring/', 'gui/authoring/', 'backend/authoring/'],
    pathLines: ['graph/ gui/ backend/ authoring/'], base: '',
    entries: [
      { files: 'gui/authoring/check.ts', role: 'the one list of problems' },
      { files: 'backend/authoring/ask.ts', role: "a model's transcript" },
      { files: 'backend/authoring/write.ts', role: 'a project, written' },
      { files: 'backend/authoring/product.ts', role: 'switching products' },
    ],
  },
  {
    ...EDITOR, title: 'Start-up, structure', folders: ['backend/cli/', 'backend/architecture/'],
    entries: [
      { files: ['backend/cli/cli.ts', 'backend/cli/main.ts'], role: 'run a graph, or serve it' },
      { files: 'backend/architecture/*.test.ts', role: 'the picture, held by tests' },
    ],
  },
];

export const aiWrites: Box = {
  ...MODEL, title: 'AI that writes', sub: 'local model or API',
  text: [['asked through', 'backend/authoring/ask.ts'], ['and the one client', 'backend/deployment/runtime/ai/providers.ts'], ['written into', 'nodes/<id>/ and history.md']],
};

const projectGui: Box = { ...FILES, title: 'GUI', sub: 'gui.json', text: [['blocks, sizes, page words', ''], ['format: gui/gui.ts', '']] };
const projectGraph: Box = {
  ...FILES, title: 'Graph', sub: 'graph-flow.json  graph-nodes.json  graph-schedule.json',
  text: [['format: graph/files/flow.ts, nodesFile.ts', ''], ['and graph/schedule.ts', '']],
};
const projectNode: Box = {
  ...FILES, title: 'One folder per node', sub: 'what it does  input.js  output.js  code.js or prompt.md',
  text: [['format: graph/files/definition.ts, logic.ts,', ''], ['prompts.ts; history.md: graph/authoring/history.ts', '']],
};
const projectGit: Box = { ...EDITOR, title: 'Your editor, git', sub: 'read, change, diff any file' };

export const browser: Box = {
  ...SHIPPED, title: 'Browser', sub: 'the GUI, as designed', doc: ['Use: a deployment', '**Browser**'],
  folders: ['frontend/deployment/gui/', 'frontend/deployment/windows/'],
  entries: [
    { files: 'frontend/deployment/gui/GuiApp.tsx', role: 'the delivered page' },
    { files: 'frontend/deployment/gui/kit/api/port.ts', role: 'its end of the GUI port' },
    { files: 'frontend/deployment/gui/widgets/<kind>/<Kind>WidgetView.tsx', role: 'in gui/widgets/<kind>/: each block drawn' },
    { files: 'frontend/deployment/windows/WindowsSurface.tsx', role: 'framed windows' },
  ],
};
export const host: Box = {
  ...SHIPPED, title: 'Session host', sub: 'rounds, state, clock, HTTP', doc: ['Use: a deployment', '**Session host**'],
  folders: ['backend/deployment/host/', 'backend/deployment/gui/', 'backend/deployment/project/'],
  entries: [
    { files: ['backend/deployment/host/serve.ts', 'backend/deployment/host/api.ts'], role: 'the server; every route' },
    { files: ['backend/deployment/host/session.ts', 'backend/deployment/host/rounds.ts'], role: 'the graph in use; one round at a time' },
    { files: 'backend/deployment/host/clock.ts', role: 'a tool that starts by itself' },
    { files: 'backend/deployment/gui/hooks.ts', role: 'the GUI side of the backend' },
    { files: 'backend/deployment/project/folder.ts', role: 'a graph as a folder' },
  ],
};
export const engine: Box = {
  cls: 'deep', tcls: 'deep-t', scls: 'deep-t', deep: true, title: 'Graph execution', title2: 'engine', doc: ['Use: a deployment', '**Graph execution engine**'],
  folders: ['backend/deployment/runtime/'],
  entries: [
    { files: 'backend/deployment/runtime/executor.ts', role: 'initialise, order, execute' },
    { files: 'backend/deployment/runtime/latch.ts', role: 'what each node last made' },
    { files: ['backend/deployment/runtime/localCore.ts', 'backend/deployment/runtime/protocol.ts'], role: 'the core, behind its protocol' },
    { files: 'backend/deployment/runtime/nodes/<kind>/<Kind>NodeRunner.ts', role: 'in nodes/<kind>/: what runs a kind' },
    { files: 'backend/deployment/runtime/nodes/body.ts', role: 'a code body, in a sandbox' },
  ],
};
export const aiRun: Box = {
  ...MODEL, title: 'AI at run time', sub: 'a model, tool servers', doc: ['Use: a deployment', '**AI at run time**'],
  folders: ['backend/deployment/runtime/ai/', 'mcp/web/', 'mcp/documents/'],
  pathLines: ['backend/deployment/runtime/ai/', 'mcp/{web,documents}/'], base: 'backend/deployment/runtime/ai/',
  entries: [
    { files: 'backend/deployment/runtime/ai/providers.ts', role: 'every model client' },
    { files: ['backend/deployment/runtime/ai/settings.ts', 'backend/deployment/runtime/ai/window.ts'], role: 'which model; its window' },
    { files: 'backend/deployment/runtime/ai/tools.ts', role: 'tools for a model, from MCP servers' },
  ],
};

/** Every box with its own folders: what the tests hold to the tree and to the document. */
export const BOXES: Box[] = [guiEditor, graphEditor, editorShell, editorBackend, page, cells, notebookShell, notebookBackend, ...commonHalves, browser, host, engine, aiRun];

/** The key files of every box, for the tests. */
export const keyFiles = (): string[] => BOXES.flatMap((box) => (box.entries ?? []).flatMap((entry) => (Array.isArray(entry.files) ? entry.files : [entry.files])));

// ---- how a box is written ----------------------------------------------------------------------------------------------------------------

const esc = (text: string): string => text.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;');
const MONO = 6.7, SANS = 5.6;

/** The common parent folder of paths, with its slash: where a box's files are written from. */
function commonParent(paths: string[]): string {
  if (!paths.length) return '';
  const parts = paths.map((path) => path.split('/').slice(0, -1));
  const shared: string[] = [];
  for (let i = 0; i < Math.min(...parts.map((one) => one.length)); i += 1) {
    if (parts.every((one) => one[i] === parts[0][i])) shared.push(parts[0][i]);
    else break;
  }
  return shared.length ? `${shared.join('/')}/` : '';
}

/** The folders of a box as the lines they are written in: the common parent with what differs in braces, when they are siblings. */
function pathLines(box: Box): string[] {
  if (box.pathLines) return box.pathLines;
  const folders = box.folders ?? [];
  const parent = commonParent(folders);
  if (folders.length > 1 && folders.every((folder) => !folder.slice(parent.length).slice(0, -1).includes('/'))) {
    return [`${parent}{${folders.map((folder) => folder.slice(parent.length, -1)).join(',')}}/`];
  }
  return folders.length ? [folders.join('  ')] : [];
}

/** What an entry is called in a box: its files from the box's base, and a file in the folder of the one before by its name alone. */
export function shown(box: Box, entry: Entry): string {
  const base = box.base ?? commonParent(box.folders ?? []);
  const files = Array.isArray(entry.files) ? entry.files : [entry.files];
  return files.map((file, index) => {
    if (file.includes('<')) return file.slice(file.lastIndexOf('/') + 1);
    const dir = file.slice(0, file.lastIndexOf('/') + 1);
    if (index > 0 && dir === files[index - 1].slice(0, files[index - 1].lastIndexOf('/') + 1)) return file.slice(dir.length);
    return file.startsWith(base) ? file.slice(base.length) : file;
  }).join(', ');
}

type Line = ['title' | 'sub' | 'path' | 'file', string] | ['file1', string, string] | ['role', string];

function linesOf(box: Box, width: number): { lines: Line[]; height: number } {
  const inner = width - 22;
  const lines: Line[] = [['title', box.title]];
  if (box.title2) lines.push(['title', box.title2]);
  if (box.sub) lines.push(['sub', box.sub]);
  for (const path of pathLines(box)) {
    const max = Math.floor(inner / MONO);
    for (let i = 0; i < path.length; i += max) lines.push(['path', path.slice(i, i + max)]);
  }
  const files: [string, string][] = [...(box.entries ?? []).map((entry): [string, string] => [shown(box, entry), entry.role]), ...(box.text ?? [])];
  for (const [name, role] of files) {
    if (name.length * MONO + 10 + role.length * SANS <= inner) lines.push(['file1', name, role]);
    else {
      lines.push(['file', name]);
      lines.push(['role', role]);
    }
  }
  let height = 12;
  let before: string | null = null;
  for (const line of lines) {
    height += line[0] === 'title' ? 19 : line[0] === 'sub' ? 17 : line[0] === 'path' ? 16 : 15;
    if ((before === 'sub' || before === 'title') && line[0] === 'path') height += 3;
    before = line[0];
  }
  return { lines, height: height + 6 };
}

/** The picture as SVG text; `readme` is the README's own picture, whose styles it takes. */
export function overviewDetail(readme: string): string {
  const style = readme.slice(readme.indexOf('<style>'), readme.indexOf('</style>') + 8);
  const extra = `<style>
  .pth { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; font-size: 11px; font-weight: 700; fill: var(--ink); }
  .fil { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; font-size: 11px; fill: var(--ink); }
  .rol { font-size: 11px; fill: var(--soft); }
  .on-deep { fill: var(--deep-ink); }
  .sub { fill: #ffffff; stroke: var(--soft); stroke-width: 0.6; } @media (prefers-color-scheme: dark) { .sub { fill: #0f172a; } }
</style>`;
  const body: string[] = [];
  const back: string[] = [];
  const put = (text: string): void => { body.push(text); };

  function draw(x: number, y: number, width: number, height: number, box: Box, lines: Line[]): void {
    put(`<rect class="${box.cls}" x="${x}" y="${y}" width="${width}" height="${height}" rx="8"/>`);
    const ink = box.deep ? ' on-deep' : '';
    let at = y + 12;
    let before: string | null = null;
    for (const line of lines) {
      const [kind] = line;
      if (kind === 'title') { at += 15; put(`<text class="${box.tcls}" x="${x + 11}" y="${at}">${esc(line[1])}</text>`); at += 4; }
      else if (kind === 'sub') { at += 13; put(`<text class="${box.scls}" x="${x + 11}" y="${at}">${esc(line[1])}</text>`); at += 4; }
      else if (kind === 'path') { if (before === 'sub' || before === 'title') at += 3; at += 12; put(`<text class="pth${ink}" x="${x + 11}" y="${at}">${esc(line[1])}</text>`); at += 4; }
      else if (kind === 'file1') { at += 12; put(`<text class="fil${ink}" x="${x + 11}" y="${at}">${esc(line[1])}</text><text class="rol${ink}" x="${x + 11 + line[1].length * MONO + 8}" y="${at}">${esc(line[2] as string)}</text>`); at += 3; }
      else if (kind === 'file') { at += 12; put(`<text class="fil${ink}" x="${x + 11}" y="${at}">${esc(line[1])}</text>`); at += 3; }
      else if (kind === 'role') { at += 12; put(`<text class="rol${ink}" x="${x + 22}" y="${at}">${esc(line[1])}</text>`); at += 3; }
      before = kind;
    }
  }

  const W = 1640;
  interface Placed { x: number; w: number; box: Box }
  /** A row of boxes as tall as the tallest; returns that height. */
  function row(y: number, items: Placed[]): number {
    const height = Math.max(...items.map((one) => linesOf(one.box, one.w).height));
    for (const one of items) draw(one.x, y, one.w, height, one.box, linesOf(one.box, one.w).lines);
    return height;
  }

  // DESIGN
  const D0 = 16;
  put(`<text class="bl" x="38" y="${D0 + 24}">DESIGN  ·  two products, in your browser</text>`);
  put(`<text class="bl" x="50" y="${D0 + 44}">EDITOR</text>`);
  put(`<text class="bl" x="872" y="${D0 + 44}">NOTEBOOK</text>`);
  let y = D0 + 56;
  const h1 = row(y, [{ x: 50, w: 330, box: guiEditor }, { x: 392, w: 330, box: graphEditor }, { x: 872, w: 330, box: page }, { x: 1214, w: 330, box: cells }]);
  const y1 = y;
  y += h1 + 30;
  const h2 = row(y, [{ x: 50, w: 672, box: editorShell }, { x: 872, w: 672, box: notebookShell }]);
  const y2 = y;
  y += h2 + 30;
  const h3 = row(y, [{ x: 50, w: 672, box: editorBackend }, { x: 872, w: 672, box: notebookBackend }]);
  const y3 = y;
  y += h3 + 30;
  // common code, grown: the box of the picture with its four halves inside
  const commonWidth = 1180;
  const HALF = 280;
  const halves = commonHalves.map((half) => linesOf({ ...half, cls: 'sub', tcls: 't', scls: 's' }, HALF));
  const halfHeight = Math.max(...halves.map((one) => one.height));
  const commonHeight = 46 + halfHeight + 34;
  const y4 = y;
  put(`<rect class="common" x="50" y="${y4}" width="${commonWidth}" height="${commonHeight}" rx="8"/>`);
  put(`<text class="t" x="${50 + commonWidth / 2}" y="${y4 + 22}" text-anchor="middle">Common code</text>`);
  put(`<text class="s" x="${50 + commonWidth / 2}" y="${y4 + 39}" text-anchor="middle">graph and GUI definitions · authoring · host and runtime · start-up</text>`);
  commonHalves.forEach((half, i) => draw(62 + i * (HALF + 12), y4 + 50, HALF, halfHeight, { ...half, cls: 'sub', tcls: 't', scls: 's' }, halves[i].lines));
  put(`<text class="s" x="62" y="${y4 + 50 + halfHeight + 20}">host and runtime: the code of the USE band below, carried by every package</text>`);
  const ai = linesOf(aiWrites, 300);
  const aiY = y4 + (commonHeight - ai.height) / 2 + 6;
  draw(1290, aiY, 300, ai.height, aiWrites, ai.lines);
  put(`<text class="s" x="1440" y="${aiY - 8}" text-anchor="middle">writes code and prompts</text>`);
  put(`<path class="arr" d="M1290 ${y4 + commonHeight / 2 + 4} H${50 + commonWidth + 4}"/>`);
  y = y4 + commonHeight + 24;
  const designBottom = y;
  back.push(`<rect class="band editband" x="20" y="${D0}" width="1600" height="${designBottom - D0}" rx="12"/>`);
  // arrows of the design band (drawn after the band so they sit on it)
  const mid = (x: number, w: number): number => x + w / 2;
  for (const [x, w] of [[50, 330], [392, 330], [872, 330], [1214, 330]]) {
    put(`<path class="arr" d="M${mid(x, w) - 10} ${y1 + h1} V${y2}"/><path class="arr" d="M${mid(x, w) + 10} ${y2} V${y1 + h1}"/>`);
  }
  put(`<path class="arr2" d="M386 ${y2 + h2} V${y3}"/><path class="arr2" d="M1208 ${y2 + h2} V${y3}"/>`);
  put(`<path class="arr2" d="M386 ${y3 + h3} V${y4}"/><path class="arr2" d="M1208 ${y3 + h3} V${y4}"/>`);
  put(`<path class="dash2" d="M726 ${y1 + 42} H868"/>`);
  put(`<text class="s" x="797" y="${y1 + 34}" text-anchor="middle">open in the other</text>`);

  // THE PROJECT
  const J0 = designBottom + 22;
  const PJ_Y = J0 + 34;
  const hj = row(PJ_Y, [{ x: 60, w: 330, box: projectGui }, { x: 410, w: 430, box: projectGraph }, { x: 860, w: 470, box: projectNode }, { x: 1350, w: 240, box: projectGit }]);
  put(`<text class="s" x="110" y="${PJ_Y + hj + 22}">The notebook saves these same files: its page is gui.json (words and windows); a window is a row of the schedule.</text>`);
  put(`<text class="s" x="110" y="${PJ_Y + hj + 40}">Read by backend/deployment/project/folder.ts, written by backend/authoring/write.ts; the format of each file is in graph/files/ and gui/gui.ts.</text>`);
  const projectBottom = PJ_Y + hj + 56;
  back.push(`<rect class="band" x="20" y="${J0}" width="1600" height="${projectBottom - J0}" rx="12"/>`);
  put(`<text class="bl" x="1602" y="${J0 + 24}" text-anchor="end">THE PROJECT  ·  plain files</text>`);
  for (const x of [225, 625, 1095]) put(`<path class="arr2" d="M${x} ${designBottom - 24} V${PJ_Y}"/>`);
  put(`<path class="arr2" d="M1352 ${PJ_Y + hj / 2} H1332"/>`);

  // USE
  const U0 = projectBottom + 24;
  const U_Y = U0 + 44;
  const widths = [330, 360, 360, 320];
  const xs = [50, 430, 840, 1250];
  const hu = row(U_Y, [browser, host, engine, aiRun].map((box, i) => ({ x: xs[i], w: widths[i], box })));
  const useBottom = U_Y + hu + 74;
  back.push(`<rect class="band" x="20" y="${U0}" width="1600" height="${useBottom - U0}" rx="12"/>`);
  back.push(`<rect class="lang" x="${xs[2] - 16}" y="${U_Y - 20}" width="${widths[2] + 32}" height="${hu + 40 + 46}" rx="10"/>`);
  put(`<text class="bl" x="1602" y="${U0 + 24}" text-anchor="end">USE  ·  anywhere Node runs</text>`);
  put(`<text class="s" x="${xs[2] + widths[2] / 2}" y="${U_Y + hu + 34}" text-anchor="middle" style="font-weight:600">language-specific</text>`);
  put(`<text class="s" x="${xs[2] + widths[2] / 2}" y="${U_Y + hu + 50}" text-anchor="middle">JavaScript today, open to more</text>`);
  const my = U_Y + 64;
  put(`<path class="arr" d="M${xs[0] + widths[0] + 2} ${my - 12} H${xs[1] - 2}"/><path class="arr" d="M${xs[1] - 2} ${my + 14} H${xs[0] + widths[0] + 2}"/>`);
  put(`<text class="s" x="${xs[0] + widths[0] + 28}" y="${my - 18}" text-anchor="middle">use</text><text class="s" x="${xs[0] + widths[0] + 28}" y="${my + 32}" text-anchor="middle">shows</text>`);
  put(`<path class="arr" d="M${xs[1] + widths[1] + 2} ${my - 12} H${xs[2] - 2}"/><path class="arr" d="M${xs[2] - 2} ${my + 14} H${xs[1] + widths[1] + 2}"/>`);
  put(`<text class="s" x="${xs[1] + widths[1] + 28}" y="${my - 18}" text-anchor="middle">run</text><text class="s" x="${xs[1] + widths[1] + 28}" y="${my + 32}" text-anchor="middle">result</text>`);
  put(`<path class="arr2" d="M${xs[2] + widths[2] + 2} ${my} H${xs[3] - 2}"/>`);
  // project -> use
  put(`<path class="arr" d="M75 ${PJ_Y + hj} V${U_Y}"/>`);
  put(`<path class="arr" d="M${xs[2] + 120} ${PJ_Y + hj} V${U_Y}"/>`);
  put(`<path class="arr" d="M${xs[2] + 250} ${PJ_Y + hj} V${U_Y}"/>`);
  put(`<text class="s" x="${xs[2] + 260}" y="${PJ_Y + hj + 20}">graph and node files, not the GUI</text>`);
  put(`<text class="s" x="60" y="${useBottom - 38}">A block can also watch what a data node holds, with no round started. Two downloads: the full version, and the notebook alone.</text>`);

  // legend, as the README's
  const L = useBottom + 22;
  const legend = (x: number, fill: string, stroke: string, dash: boolean, text: string): string => `<rect x="${x}" y="${L - 10}" width="12" height="12" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="0.8"${dash ? ' stroke-dasharray="3 2"' : ''}/><text class="s" x="${x + 18}" y="${L}">${text}</text>`;
  put(legend(40, 'var(--ship-fill)', 'var(--ship-edge)', false, 'ships in a package'));
  put(legend(190, 'var(--edit-fill)', 'var(--soft)', true, 'only the editor'));
  put(legend(320, 'var(--nb-fill)', 'var(--nb-edge)', true, 'only the notebook'));
  put(legend(470, 'var(--edit-fill)', 'var(--soft)', false, 'common code'));
  put(legend(590, 'var(--note-fill)', 'none', false, 'files'));
  put(legend(650, 'var(--ai-fill)', 'var(--ai-edge)', false, 'a model'));
  const H = L + 20;
  put(`<text class="s" x="${W - 30}" y="${L}" text-anchor="end">The README's picture, box for box, with each box's folders and key files</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif"><title>Tell &amp; Wire: the README's picture with the folders and key files of each box</title><desc>The same three bands as the README's overview: design (the editor and the notebook over common code, with an AI that writes), the project as plain files, and use (a browser, a session host, a graph execution engine, an AI at run time). Each box carries the folders it is and its key files.</desc>${style}${extra}<defs><marker id="a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 L9 5 L1 9 z" fill="var(--arrow)"/></marker><marker id="b" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M9 1 L1 5 L9 9 z" fill="var(--arrow)"/></marker></defs><rect class="bg" x="0" y="0" width="${W}" height="${H}"/>${back.join('\n')}\n${body.join('\n')}</svg>`;
}
