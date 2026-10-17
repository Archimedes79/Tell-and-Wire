# Notebook: a page you write, with windows you use

The notebook is one of the two products in the overview picture (`docs/images/overview.svg`): the green boxes -- **Page**, **Cells**
and the **Notebook backend** -- standing on the common code, writing the same project files as the graph editor. It is a second way to
build and use a tool, on the same graph, runtime, host and package. It does not replace the graph editor: the notebook
writes the files the graph editor reads, and a project made in the notebook opens in the graph editor (the other way round it does
not: a graph is not a page, except one the notebook made).

A product of its own, with its own folders (`docs/architecture.md`, "Design: the notebook"), its own start files, its own port (8100) and
its own small download; the graph editor does not know it is there, and the two meet only in a link. Branch `tell-and-wire-notebook`, built on `main`.

## The idea

- The **page** is a document, written like any web page or Markdown file: headings, text, bullets, gaps.
- A **window** stands in the page: a small box to use, with what goes in, a button, and what comes out. It never grows when a
  result arrives.
- Under the page is **the list** of the open window (design A2): Ask, Do, Show, one card each, a sentence in each. A step
  takes what its sentence points at with `@Name`; those chips are the wires, and no wire is drawn. A name of several words, or
  with a bracket or a sign in it, is pointed at with underscores (`Bill (EUR)` is `@Bill_EUR`): the chips under a sentence put it in. Beside it
  **Under the hood** (the window as the graph it is) and **Debug** (every round, node by node).

## The screen

| Part | What it does |
|---|---|
| Top bar | The tool's name, **Write / Markdown / As app**, the look of the delivered tool (white by default), undo and redo, **Run all**, Save, Save as, Open, New. Beside Save it says whether the page is kept: *Not saved yet*, *Changed since you saved it at 14:32* (Save is then marked, and the tab title gets a dot), or *Saved at 14:32*. |
| Page, **Write** | Blocks you type in. Enter starts the next block, `# ` `## ` `- ` at the start of a line make a heading or a list, an empty bullet ends the list, Backspace in an empty block takes it away. A handle (⋮⋮) in the margin beside a block opens its options (kind, move, remove; removing a window asks once, and Undo brings it back), so nothing lies over the words; a window is made wider or narrower by pulling its right edge (quarters of the line; the arrow keys do the same); the **+** between blocks adds Text, a heading, Bullets, a Gap or a Window. |
| Page, **Markdown** | The same page as text: `# Title`, `## Heading`, `- bullet`, `[space]`, `[window: id]`. Leaving the box makes it the page. |
| Page, **As app** | The page as the people who use the tool see it: nothing to write in, only the windows to use. |
| Windows | Inputs (text, number, choice, file, folder), a button or a change of an input as the trigger, outputs (text, list, table, chart, image) at the height of their rows, or a chat: one box in which the person types and the answer of the last step is shown, with the conversation kept for the next message (a step takes `@Chat.message` and `@Chat.history`). A window that has not come to anything says why in the place of its first output, even where an older answer still stands in the box (the other old answers are shown dimmed). A column of numbers in a table stands to the right with the same decimals all down it. Running one runs the ones it takes from first when they are not current. |
| Dock | **List**, **Under the hood** and **Debug** under the page, as tall as it is pulled. On a narrow screen (up to 720 px) it opens as the whole screen, with a button back to the page. |
| **List** | The cards of the open window. Ask: what is asked, a field for each input (kind, width, rows, where it starts), what starts the window. Do: the sentence, `takes` and `gives`, done by a model or by code (seeded to run as it is), the prompt or the code. Show: kind, which result, size and width, and the result as it stands. A field for the model: "Say what should change". Pointing at an element of the window lights its card and the other way round. |
| **Under the hood** | Ask → Do → Show as boxes with the names on the wires, and the stored graph. |
| **Debug** | Each round: who ran, what each node got and made, why one did nothing. Stop, and forget what the windows made. |

## What is new, and where it lives

| Part | Folder | Notes |
|---|---|---|
| The model of windows and page; compiling to graph, schedule and gui | `gui/notebook/` | Neutral. `windows.ts` (windows), `page.ts` and `pageModel.ts` (the page, Markdown), `fromGraph.ts` (the windows read back from a graph and its gui), `edit.ts` (the edits, pure functions), `read.ts`. Only the notebook uses it; a package leaves it behind. |
| The order to run windows in | `gui/windows/` | Neutral and shipped: the delivered page needs it. |
| Reading the windows from the graph; a window from a sentence; the notebook's own server | `backend/notebook/` | Authoring only. Four routes (`api.ts`), started by `main.ts`. What it writes a project with is `backend/authoring/` (shared with the graph editor). |
| The page of a delivered tool | `frontend/deployment/windows/` | Shipped. The words and the framed windows, run in order; knows no editor. |
| The notebook | `frontend/notebook/`, `frontend/gui-notebook/`, `frontend/graph-notebook/` | Written anew, a product of its own: the shell (`notebook/`: `document/` with its client, store and runner, `elements/` with the boxes, the chart and the file browser), the page and its windows (`gui-notebook/`), the list, under the hood and debug (`graph-notebook/`), and the stylesheet. It imports nothing of the graph editor. |
| Its page | `frontend/notebook/index.html` | Built on its own (`npm run build:notebook`, `frontend/vite.notebook.config.ts`) into `frontend/notebook/dist`. |
| Starting it | `start-notebook.cmd`, `.ps1`, `.sh`, `scripts/start-notebook.mjs` | The notebook has its own start and stop files (`stop-notebook.*`), its own port (8100), and runs beside the editor (8000) or without it. Neither starts the other; they know each other by a link only (below). |
| Packing it | `scripts/package-notebook.mjs`, `npm run package:notebook` | A zip of the notebook alone: its page and server, what runs a graph, the examples; no editor, no tool servers (`run.cmd`, `run.sh`, optional `--node <folder>`). A copy in what it does of `scripts/package.mjs`, which packs the full version: the two are packed separately, and CI tries each unzipped (`scripts/package-notebook.test.mjs`). On a `vX.Y.Z` tag and on `latest` (main) CI publishes both: `tell-and-wire-<system>.zip` and the small `tell-and-wire-notebook-<system>.zip` (`-latest` for main). |

The notebook takes nothing from a folder named `editor`. What it shares with the graph editor is common code: `graph/`, `gui/`, the deployment, and the `authoring` folders -- `gui/authoring/check.ts` (the check of a gui), `graph/authoring/handedOn.ts` (a graph without what only writing it needs), the designs of the nodes and blocks, `backend/authoring`. `backend/architecture/layers.test.ts` holds both sides: the notebook imports no editor folder, and `authoring` imports no product. A package leaves `gui/notebook` behind with the rest of authoring.
Code is doubled where the two products would otherwise share it (the table's figures, the words of the page): a copy is tested in the product it is in.

## The files of a project

```
my_tool/
  graph-flow.json      every wire
  graph-nodes.json     every node
  graph-schedule.json  one row for each window
  gui.json             the blocks of the windows and the words of the page
  nodes/<id>/          what a model wrote for a step (prompt, code); a new sentence keeps it
```

These are the files the graph editor reads and writes, and the notebook keeps nothing of its own beside them. The page is *read* from them
(`graphToWindows`, `gui/notebook/fromGraph.ts`) and saved by making them again (`windowsToGraph`, `gui/notebook/windows.ts`).

`gui.json` carries what a delivered tool needs to draw the page: each window block has `group`, the heading `span` and
`after` (the windows it takes from) and `page_at` (its place among the words); each word is a text block with `page_at` and
`page_style`. A package therefore shows the page and runs the windows in order from the gui alone.

### What the files say of a page

The principle (`docs/architecture.md`, *what runs and how it is written are apart*): what runs is the graph, what is shown is the gui, and the page is those two read as windows. The `@Name` of a sentence is only how the notebook *writes* a wire: the wire is stored as a wire, the sentence as the node's `description` (each mention as the name it points at, in quotes, which is what a model is told), and the chip "takes: File" is drawn from the ports the node has.

| What a page says | Where the files say it |
|---|---|
| A window | a row of `graph-schedule.json`: its start point, the cells that do something, what is shown |
| Its title, its width | the start point's label; the `span` of its heading block |
| What it asks of the person (`ask`) | the `description` of its start point |
| An input | a block that sends to the start point (`input_picker`, `text_io`, `slider`, `select`); one that takes another window's output is a caption block that names it (`from_window`, `from_output`). Rows it was given: `own_rows` |
| A cell | an `ai` or `code` node: the sentence is its `description`, what it takes its ports and the wires into them, *for each file* its `batch_mode`, its code `code.js` |
| What a cell says that its node has no place for | `config.notebook`: `sentence`, where the sentence would not come back from what a model is told (a quotation mark around an input's name), and `code`, which a model's cell was switched away from |
| An output | an `end` node and the block that shows it. `list` says whether a text block shows a text or a list, `own_rows` the rows it was given where it stands in a taller line |
| The words of the page, and where the windows stand | text blocks with `page_at` and `page_style`; the windows' heading blocks have `page_at` |

A width is kept in cells and read back as the nearest share the notebook offers that makes the same cells. The ids of the blocks of a page are only keys and are made again.

`backend/notebook/fromGraph.test.ts` holds this: a page that uses every kind of input, output and step comes back from its files as it was, field for field, and each example is read from the files it is kept in and makes the same files again.

**A change made outside.** The graph editor opens a notebook's project as a graph, and what it changes is what the page says the next time the project is opened in the notebook -- a cell worded differently is that sentence. A change the windows cannot say, such as a node of its own, leaves the page as what could be read and marks the project *changed outside*: saving would write over the rest, so the notebook asks (**Save as…**, or **Write over it**). A project with no window's heading in its gui is a graph, not a page, and does not open.

**Projects saved before.** The notebook used to keep the page in a file of its own, `graph-windows.json`, beside a signature of the graph it made. A project that still has one opens by it, as it always did (the page it holds, and *changed outside* when the graph is neither what it was saved with nor what the page makes today); saving it writes the project as above and takes the file away.

## Between the notebook and the full version

The two are products of their own and know each other by a route and a query and nothing else (`backend/authoring/product.ts`, which neither product's folder holds): each answers `GET /api/product` (who it is, and whether the other can be reached from this install) and `POST /api/switch` (the way to the other), and the page the person is sent to opens the project once from `/?open=<project folder>` and takes that off the address.
In the notebook **Open in editor** (beside Open, when the page is kept somewhere) opens the saved project in the graph editor; in the editor **Notebook** (a project is open) opens it in the notebook. The switch looks for the other product where it may run -- the ports it tries (the editor from 8000, the notebook from 8100, ten each) -- and starts it from the same install where none answers, so the button works with only one of the two started. The tab is opened at once and sent to the address when it is known (a start takes a moment); a failure is said on the page. The button is not shown in an install without the other product (the notebook download has no editor).
A project made in the notebook is a folder of graph files, so the editor opens it as a graph (the page is in the same files: the words in `gui.json`, the windows as the graph they make). The other way round only works for a project the notebook made: a graph is not a page, and the notebook says so
(it does not turn a graph into windows). Edit the graph in the editor and the notebook finds the project changed outside when it is opened again, and writes nothing over it unasked.
Each side has a copy of the link's few lines (`frontend/notebook/document/links.ts`, `frontend/editor/app/notebookLink.ts`).

## Running

A round of a window is sent the blocks of its own start point and, for what it takes from another window, that window's
*last* answer. So whoever runs a window runs first the ones before it that are not current, one round each, and stops where one
does not come to anything (`runOrder`, `gui/windows/order.ts`). "Current" means it ran, nothing it holds changed since, and so
for everything it takes from. In the delivered tool a button stands on a row of its own, and a window whose cells are too small for its button's label (a narrow page, two windows side by side on a tablet) is stacked, one block under the other, as a whole page is on a phone. A window that failed, or had nothing to do, says why in the place of its first result, in the notebook and in the delivered tool alike (the delivered chip reads Failed or Nothing to do). A round that had a node of the window with nothing to do (an input left empty) is a window that did
nothing, and the window after it is not run on that. Only the window's own nodes count: the other windows stand idle in the
same round.

### Code that draws knows its window

Beside `node.windows` of every GUI (the blocks that show what a body hands on, with their size: main), a code cell of a notebook window has `node.window`: the window as it is laid out, the room of a drawing in it, and the scheme's colours.

A code cell is `function run(inputs, node)`. Beside `node.llm`, a cell of a window has `node.window`: the window it is in
(`id`, `title`, `span`, `rows`), the outputs it feeds (`shows`: for each, `kind`, `cells`, `rows` and `width` x `height`, the pixels a
drawing has in that block on a full-width page, the block's card taken off, and for an image the setting the picture is given in it) and the scheme as values (`scheme`: `background`,
`surface`, `text`, `muted`, `accent`, `series` for chart series). A chart takes a figure (`{kind, title, points}`) and draws it to fit;
a cell that draws SVG itself, which is shown as a picture where the scheme's CSS variables do not reach, reads its room and its colours from here. The facts are written into the settings of the code node
(`config.window`, `windowFacts` in `gui/notebook/windows.ts`) and made again with every graph, so a changed width or scheme reaches the code on its next run. On a narrower page everything scales alike, so text in a drawing
should be 14 px or more (run on its own, `node code.js`, a cell has no `node.window`); the notebook shows the same picture scaled to its own, flatter block, and the delivered tool is the one that is exact.
The numbers the facts rest on, the grid and the schemes' colours, are in `gui/windows/grid.ts` and `gui/windows/scheme.ts` (a delivered tool loads both).

### The page looks as the tool looks

The page is the tool, so it is painted in the look chosen at the top (White, Paper, Night or Graphite), not in the notebook's own: a sheet in that scheme,
lifted off the notebook's ground by the scheme's shadow, with the words of the page set as the delivered page sets them (30, 20 and 16 px) and each window drawn
as the delivered tool draws one -- a frame, its title, a sunken box for what is put in, a raised box for what comes out, the scheme's accent on the button that
runs it, a chat in the accent's tint. **As app** and the delivered tool therefore look alike in every scheme; what differs is only what the page does not
carry: a window's cells are laid out by the notebook's own flow (a quarter, a half of the line), where the delivered tool lays them on its grid, and a file is
named by its file name, where the tool shows the path. The scheme reaches the page as the same CSS variables the built-in GUI uses (`schemeVariables` in
`gui/windows/scheme.ts`; `notebook.css` binds its own names to them on the sheet, and `frontend/notebook/look.test.ts` holds that it asks only for names the
scheme makes). The notebook imports nothing of the GUI's kit: the two draw the same things twice, from the same palette.

### A dark notebook, and key-figure tables

The top bar has **☾ Dark** / **☀ Light**: the notebook itself in a dark look (`frontend/notebook/look.ts`; every colour of `notebook.css` is a variable
and `data-look="dark"` gives them other values; kept in the browser, white by default). It is not the look of the delivered tool, which stays
the document's own choice beside it, and the page is painted in that one: see "The page looks as the tool looks". Every screen was checked for text contrast in both looks.

A table is set as its cells say (`frontend/notebook/elements/figures.ts`; the delivered tool's table has a copy of its own, so the two share no code): a column of figures to the right with the
same decimals all down and thousands told apart (174,898; always as English writes them, so a number and a "+10.2 %" a step wrote as text do not use two ways of writing one),
a signed percentage in green or red, a last row that says Total in bold. The saved CSV keeps the raw values. In the notebook a table is as tall as its rows need,
up to a limit, instead of cutting its last row off; a chart's names are thinned to every other one where they would touch; a finished drawing keeps the proportions
it was drawn for. A chart or a drawing a step handed on under a key of its own (`{ figure: … }`) is taken as the thing itself.

### Writing the page, and the examples

The page takes what Markdown takes, in the words and in the blocks: `**bold**`, `*italic*` (or `_italic_`), `` `code` `` and `[a link](https://…)` (http, https and mailto only),
headings (`#`, `##`), bullets (`- `), numbered lists (`1. `) and quotations (`> `); typing the mark at the start of a text block makes the kind, and Ctrl+B / Ctrl+I put the marks round
what is chosen. In **Write** the boxes show the marks as they are typed (a numbered list is drawn with its numbers only in **As app** and in the delivered tool); both draw them
(`frontend/notebook/elements/inline.tsx` and `frontend/deployment/windows/inline.tsx`: two copies, the two products share no code). A window's outputs are text, a list, a table, a chart or a
picture; a picture is a file, a data or http URL, or the markup of an SVG a code step drew.

`notebook-examples/` holds five pages written by hand, as the notebook saves them: `sales_report` (a CSV, a key-figure table, a trend, a model's two sentences), `text_toolbox`
(a pasted text: numbers by code, a summary by a model), `badge_maker` (a picture drawn by code for the room it has), `picture_sheet` (a folder of pictures shown as a contact sheet, each described by a model that can see) and `tip_calculator` (a short page with a small calculator that runs
when an input changes). Open one with **Open…**; the file inputs name `notebook-examples/data/…`, relative to where the notebook was started. `backend/notebook/examples.test.ts` opens each,
checks that the graph on disk is what its windows make, and presses the buttons of the ones that need no file and no model.

## What a window cannot say yet

A cell that runs several models in parallel (steps stand one under the other and run in turn; `paper_review_panel` is one cell
for each reviewer), a memory that lasts between rounds (the counter), and starting by itself (when the tool starts, every few minutes).
The notebook's own look -- the bar, the dock, the ground -- follows the design (A2), a pale ground with white cards; the scheme of the tool is kept in the document and told
to the model, and the delivered tool draws it. A tool that says no look is white (`office`); the others are chosen at the top. The graph editor has a look of its own too (toolbar, beside Help; white by default), kept in the browser and not in any file.

## Open

- The delivered tool shows the tool's name above the page, so a page that begins with its name says it twice.

### A file dropped on a file box

A file input takes **Browse…**, a typed path, or a file dropped on the box (the notebook and the delivered tool alike). A browser gives a page a dropped file's name and size, never where it is; so the path is the one the drop names where it names one (a `file:` address), and otherwise the one file of that name and size the host finds under the tool's own folder, three levels down (`GET /api/files/find`, `backend/deployment/host/find.ts`; the editor's drop onto a node uses the same). Where none is found, or several, the box says so and what to do: choose it with Browse…. A folder is only chosen with Browse…. A file dropped anywhere else on the page does nothing, rather than leaving the page for the file. The reading is `gui/widgets/input_picker/dropped.ts`, drawn twice (the notebook's own box, and `PathField` of the delivered tool).

### When the model's answer is not windows

The error says what was wrong with the page the model wrote (a mention that is no input, an output of nothing), and under it **What the model sent** holds the words it answered -- the last reply of the calls that led to the failure, which the server sends with the failure -- so the sentence can be said again in other words, one window at a time, or the answer taken as a start. Dismissing the error takes it away (`modelSaid` in `frontend/notebook/document/store.ts`).
