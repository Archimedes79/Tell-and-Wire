# Notebook: a tool said as a page of windows

A second way to build and use a tool, on the same graph, runtime, host and package. Nothing here
replaces the graph editor: the notebook writes the files the graph editor reads, and a project made in
either opens in the other.

Branch `tell-and-wire-notebook`, built on `main` (0.7.4). Rules for this work: new code in new files, a
few lines added to existing ones where a new thing has to be told about; nothing deleted or rewritten;
nothing on `main` until it is asked for.

## The idea in four lines

- The **page** is the tool. It holds **windows**, side by side like text, each a fixed size.
- A window is a short list of **cells**: what goes in, what starts it (a trigger), what is done (a
  sentence), what comes out. A cell takes what its sentence mentions with `@Name`; wires are never drawn.
- Its elements are its size: a window never grows when a result arrives.
- Open a window and you see its interface beside its cells. Cells are the notebook; the window is the app.

## What is new, and where it lives

The tiers and the rules between them are `docs/architecture.md`; every new file follows them.

| Part | Folder | Notes |
|---|---|---|
| The model: windows, cells, trigger; compile to graph, schedule and gui; the words a model is told; problems | `gui/editor/windows/` | Neutral, editor only. Built: `windows.ts`, tested in `backend/editor/project/windows.test.ts`. |
| The order to run windows in; which are current | `gui/windows/` | Neutral and **shipped**: the deployed page needs it. The same code as in the model, moved here. |
| Reading and writing `graph-windows.json`; a window from a sentence | `backend/editor/windows/` | Editor only. Two routes to read and write, one to describe. |
| The page with framed windows, and running them in order | `frontend/deployment/windows/` | Shipped. Draws the gui's blocks through the existing `GuiBlock`; knows no editor. |
| The notebook editor: start, page, split view, cells | `frontend/editor/windows/` | Editor only. Reaches the host through the editor's API client. |
| Its page | `frontend/notebook.html` | A second entry of the same build, served from the same folder. |

## The files of a project

```
my_tool/
  graph-windows.json   the windows as the notebook edits them (editor only; not in a package)
  graph-flow.json      made from it: every wire
  graph-nodes.json     made from it: every node
  graph-schedule.json  made from it: one row for each window, read left to right
  gui.json             made from it: the blocks, with group / span / after on them
  nodes/<id>/          what a model wrote for a cell (prompt, code); a new sentence keeps it
```

`graph-windows.json` carries a `signature` of what it made. When a project is opened and the graph on
disk no longer matches (it was edited in the graph editor), the notebook says so and offers to make it
again from the windows, or to leave it alone. Nothing is overwritten unasked.

`gui.json` carries enough to draw the page without `graph-windows.json`: each block has `group` (its
window), the heading block has `span` (cells across) and `after` (the windows it takes from). A tool
delivered in a package therefore shows framed windows and runs them in order from the gui alone.

## Running

A round of a window is sent the blocks of its own start point and, for what it takes from another
window, that window's *last* answer. Measured on `main`: a window run before the one it takes from brings
back "success" with nothing in it; a changed input that was not run is not seen by the window after. So
whoever runs a window runs first the ones before it that are not current, in order (`runOrder`); a
current one is reused, the model is not asked again.

"Current" is read from the session, not kept: a window is current when its start point was sent what its
blocks hold now, and so is everything it takes from.

## The editor

1. **Start.** One sentence ("What should the tool do?") or open a folder or an example. A sentence makes
   a page with its first window, cells filled in; the model is told the room, the scheme and what each
   output wants (`windowContext`).
2. **Page.** Windows as people will use them. *Edit* on a window opens it.
3. **Split view.** Left: the interface, drawn by the same code as the deployed page, at the cell size of
   the product. Right: the cells. Numbers tie an element to its cell; hover or focus on one lights the
   other; a click chooses both and opens its size (width as a share, height in rows).
4. **Cells.** Add and remove Rein, Tun, Raus; many outputs, each with its own kind, size and the result it
   shows. The trigger is a cell of its own: a button (its words), a change of an input, or both.
5. **Scheme.** One of the five of the gui, shown on the page; it is the gui's `gui_scheme` and is part of
   what a model is told.
6. **Run.** Windows are run in the order above, through the host's runtime API, in a session the editor
   hands the compiled graph to (`holdGraph`).

## Steps

1. Model, compile, order, words (done; moved and extended as below).
2. Shipped order (`gui/windows`) and the deployed page (`frontend/deployment/windows`), one line in
   `GuiApp` choosing it when blocks carry `group`.
3. Files and routes (`backend/editor/windows`), tested through a session.
4. The notebook editor, page by page: start, page, split view, cells, scheme, run.
5. Describe a window with a model (stubbed in tests).
6. Usability: rebuild `file_summarizer`, `folder_summaries`, `population_plotter` and the chat with the
   mouse, count the clicks, remove what is not needed (CLAUDE.md, step 4).

## Seams (existing files that get a line)

- `frontend/vite.config.ts`: the second entry.
- `frontend/deployment/gui/GuiApp.tsx`: draw windows when the blocks say they are in windows.
- `backend/editor/host/api.ts`, `backend/editor/host/routes.ts`: three routes.
- `docs/architecture.md`, `README.md`: a paragraph each.

## Open

- Whether `graph-windows.json` stays a file of its own or moves into `graph-flow.json`'s metadata (it
  would travel in a package; the flow would stop being "wires only").
- Starting by itself (when the tool starts, every few minutes) is a start point that takes no inputs from
  the gui: not a trigger of a window that has inputs, so not offered yet.
- A window with more than one model step shows them as cells; cells that run in parallel (two reviewers of
  one manuscript) need a group, as `paper_review_panel` does.
