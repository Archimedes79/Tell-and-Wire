# Notebook: a page you write, with windows you use

A second way to build and use a tool, on the same graph, runtime, host and package. It does not replace the graph
editor: the notebook writes the files the graph editor reads, and a project made in the notebook opens in the graph editor
(the other way round it does not: a graph is not a page).

Branch `tell-and-wire-notebook`, built on `main`. A product of its own: new folders, started by files of its own; the graph editor does not know it is there.

## The idea

- The **page** is a document, written like any web page or Markdown file: headings, text, bullets, gaps.
- A **window** stands in the page: a small box to use, with what goes in, a button, and what comes out. It never grows when a
  result arrives.
- Under the page is **the list** of the open window (design A2): Ask, Do, Show, one card each, a sentence in each. A step
  takes what its sentence points at with `@Name`; those chips are the wires, and no wire is drawn. Beside it
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
| The model of windows and page; compiling to graph, schedule and gui | `gui/notebook/` | Neutral. `windows.ts` (windows), `page.ts` and `pageModel.ts` (the page, Markdown), `edit.ts` (the edits, pure functions), `read.ts`. Only the notebook uses it; a package leaves it behind. |
| The order to run windows in | `gui/windows/` | Neutral and shipped: the delivered page needs it. |
| Reading and writing `graph-windows.json`; a window from a sentence; the notebook's own server | `backend/notebook/` | Authoring only. Four routes (`api.ts`), started by `main.ts`. What it writes a project with is `backend/authoring/` (shared with the graph editor). |
| The page of a delivered tool | `frontend/deployment/windows/` | Shipped. The words and the framed windows, run in order; knows no editor. |
| The notebook | `frontend/notebook/`, `frontend/gui-notebook/`, `frontend/graph-notebook/` | Written anew, a product of its own: the shell (`notebook/`: `document/` with its client, store and runner, `elements/` with the boxes, the chart and the file browser), the page and its windows (`gui-notebook/`), the list, under the hood and debug (`graph-notebook/`), and the stylesheet. It imports nothing of the graph editor. |
| Its page | `frontend/notebook/index.html` | Built on its own (`npm run build:notebook`, `frontend/vite.notebook.config.ts`) into `frontend/notebook/dist`. |
| Starting it | `start-notebook.cmd`, `.ps1`, `.sh`, `scripts/start-notebook.mjs` | The notebook has its own start and stop files (`stop-notebook.*`), its own port (8100), and runs beside the editor (8000) or without it. Neither names the other. |

## The files of a project

```
my_tool/
  graph-windows.json   the windows and the page as the notebook edits them (editor only; not in a package)
  graph-flow.json      made from it: every wire
  graph-nodes.json     made from it: every node
  graph-schedule.json  made from it: one row for each window
  gui.json             made from it: the blocks of the windows and the words of the page
  nodes/<id>/          what a model wrote for a step (prompt, code); a new sentence keeps it
```

`gui.json` carries what a delivered tool needs to draw the page: each window block has `group`, the heading `span` and
`after` (the windows it takes from) and `page_at` (its place among the words); each word is a text block with `page_at` and
`page_style`. A package therefore shows the page and runs the windows in order from the gui alone.

`graph-windows.json` carries a `signature` of what it made. When a project is opened and the graph on disk no longer matches
(it was edited in the graph editor), the notebook says so and nothing is overwritten unasked. A graph that is not what the windows were saved with but is what they make today (saved by another version) is not a change.

## Running

A round of a window is sent the blocks of its own start point and, for what it takes from another window, that window's
*last* answer. So whoever runs a window runs first the ones before it that are not current, one round each, and stops where one
does not come to anything (`runOrder`, `gui/windows/order.ts`). "Current" means it ran, nothing it holds changed since, and so
for everything it takes from. In the delivered tool a button stands on a row of its own, and a window whose cells are too small for its button's label (a narrow page, two windows side by side on a tablet) is stacked, one block under the other, as a whole page is on a phone. A window that failed, or had nothing to do, says why in the place of its first result, in the notebook and in the delivered tool alike (the delivered chip reads Failed or Nothing to do). A round that had a node of the window with nothing to do (an input left empty) is a window that did
nothing, and the window after it is not run on that. Only the window's own nodes count: the other windows stand idle in the
same round.

### Code that draws knows its window

A code cell is `function run(inputs, node)`. Beside `node.llm`, a cell of a window has `node.window`: the window it is in
(`id`, `title`, `span`, `rows`), the outputs it feeds (`shows`: for each, `kind`, `cells`, `rows` and `width` x `height`, the pixels a
drawing has in that block on a full-width page, the block's card taken off) and the scheme as values (`scheme`: `background`,
`surface`, `text`, `muted`, `accent`, `series` for chart series). A chart takes a figure (`{kind, title, points}`) and draws it to fit;
a cell that draws SVG itself, which is shown as a picture where the scheme's CSS variables do not reach, reads its room and its colours from here. The facts are written into the settings of the code node
(`config.window`, `windowFacts` in `gui/notebook/windows.ts`) and made again with every graph, so a changed width or scheme reaches the code on its next run. On a narrower page everything scales alike, so text in a drawing
should be 14 px or more (run on its own, `node code.js`, a cell has no `node.window`); the notebook shows the same picture scaled to its own, flatter block, and the delivered tool is the one that is exact.
The numbers the facts rest on, the grid and the schemes' colours, are in `gui/windows/grid.ts` and `gui/windows/scheme.ts` (a delivered tool loads both).

### A dark notebook, and key-figure tables

The top bar has **☾ Dark** / **☀ Light**: the notebook itself in a dark look (`frontend/notebook/look.ts`; every colour of `notebook.css` is a variable
and `data-look="dark"` gives them other values; kept in the browser, white by default). It is not the look of the delivered tool, which stays
the document's own choice beside it. Every screen was checked for text contrast in both looks.

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

`notebook-examples/` holds four pages written by hand, as the notebook saves them: `sales_report` (a CSV, a key-figure table, a trend, a model's two sentences), `text_toolbox`
(a pasted text: numbers by code, a summary by a model), `badge_maker` (a picture drawn by code for the room it has) and `tip_calculator` (a short page with a small calculator that runs
when an input changes). Open one with **Open…**; the file inputs name `notebook-examples/data/…`, relative to where the notebook was started. `backend/notebook/examples.test.ts` opens each,
checks that the graph on disk is what its windows make, and presses the buttons of the ones that need no file and no model.

## What a window cannot say yet

A cell that runs several models in parallel (steps stand one under the other and run in turn; `paper_review_panel` is one cell
for each reviewer), a memory that lasts between rounds (the counter), and starting by itself (when the tool starts, every few minutes).
The editor's own look follows the design (A2), a pale page with white cards, not the colour scheme of the tool; the scheme is kept in the document and told
to the model, and the delivered tool draws it. A tool that says no look is white (`office`); the others are chosen at the top. The graph editor has a look of its own too (toolbar, beside Help; white by default), kept in the browser and not in any file.

## Open

- Whether `graph-windows.json` stays a file of its own or moves into `graph-flow.json`'s metadata (it would travel in a
  package; the flow would stop being "wires only").
- The delivered tool shows the tool's name above the page, so a page that begins with its name says it twice.
