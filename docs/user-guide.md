# User guide

How to build a tool in Tell-and-Wire, step by step. The running example is
[examples/population_plotter](../examples/population_plotter/): choose a CSV, see a bar
chart. `frontend/app/masterExamples.test.ts` builds this example, folder_summaries and
chat the way this guide does (blocks added, a node dropped, a wire dragged) and runs them.

Start the editor and set up a model first, as the [README](../README.md) says. ✨ needs a
model; a small, fast one (for example `gemini-flash-lite-latest`) writes a node's files in
seconds. A local model costs nothing per call but can take minutes per answer.

## The words

| Word | What it is |
|---|---|
| graph | The nodes and the wires between them: what the tool does (Graph tab). |
| node | One step. A heading, a short text, and settings or files. |
| port | A dot on a node's edge: an input on the left, an output on the right. |
| wire | Carries an output to an input. |
| round | One run of the graph, from a start point to the end points it reaches. |
| page | The blocks a person uses: what the tool looks like (Gui tab). |
| block | One thing on the page: a picker, a button, a chart, a chat. |

## The node kinds

The palette on the left of the Graph tab lists them. Click one, or drag it onto the canvas.

| Node | What it does |
|---|---|
| **Start point** | Where a round begins. Started by the page (a block fires it), by a call (a script, the command line, MCP, the graph above) or by itself (when the tool starts, or every `5m`, `2h`, ...). Hands on one package: `{event, values}`. |
| **Folder** | Lists the files in a folder, filtered by file types, optionally with subfolders. Reads no file. |
| **AI** | Asks a model. Its instructions are `prompt.md`; it answers in text, or in JSON when `output.js` names several outputs. |
| **Code** | Runs `code.js`: a JavaScript `run(inputs)` that returns an object keyed by output. It runs sandboxed and may ask a model with `await node.llm({ prompt })`. |
| **Data** | A value kept between rounds: text or a structure. What arrives replaces it for the next round. A loop goes through a data node. |
| **End point** | Where a round ends: what arrives is the tool's result, under its name. It can also write the value to a file, or each item to a file in a folder. |
| **Subgraph** | Holds a graph of its own. Its ports are that graph's start and end points. **Open this graph ▸** goes inside. |

## 1. Build the page

Name the tool in the field at the top left, then open the **Gui** tab. Click **File or
folder**, then **Chart** in the left column (or type `/` on the page). Each block comes
connected: what the picker holds goes to a new start point, *Start*, and the chart shows a
new end point, *Chart*.

Click a block to see its settings on the right:

- **Its data goes to**: the start points whose package carries what the block holds.
- **Using it fires**: the start point a round begins at when the block is used.
- **It shows**: the end point whose value the block draws.

The first block that can fire a start point fires it, so choosing a file runs the graph. A
button or a chat always fires its start point. A dropdown that only sends is a setting: it
starts nothing, and the next round picks up its value.

## 2. Add a node and wire it

On the **Graph** tab the two points are already there. A start point's card says which
blocks fire it and send to it; an end point's card says which blocks show it. Click
**Code** in the palette: the node appears with its panel open on the right.

Drag from the start point's *Data* dot (the amber diamond) to the code node's input, and
from the code node's output to the end point's *Value* dot. A dot's name shows while the
pointer is on the card. The first wire also sets what the input **takes** of the package:
here the chosen file's content (`file.content`). Advanced in the panel shows it and lets
you change it.

## 3. Say what the node does; ✨ writes its files

The top box of the panel is the node in your words:

> Read the population CSV (a country column and a population column) and show a bar chart
> of the population per country.

Press **✨ Input**, **✨ Output**, then **✨ Code** (an AI node: **✨ Prompt**). Each is
written from the ones before it:

| File | What it holds |
|---|---|
| `input.js` | What one call is handed: a JSDoc typedef, then one example as plain JSON. |
| `output.js` | What one call returns, the same way. Its keys are the node's outputs. |
| `code.js` / `prompt.md` | The body: the code, or the AI node's instructions. |
| `history.md` | Every exchange with the model about this node. |

Pressing the body's ✨ first writes whichever definition is missing. New code is tried on
the example in `input.js` and repaired once if it fails. Each file shows in its row, editable
in place; ⤢ opens it full-window, and its chip opens it in your own editor. There is no
Save in the panel: a change is in the graph at once, and Undo takes it back.

- **▶ Try** runs the node once on the example in `input.js` and holds the result to
  `output.js`. **✨ Fix** repairs the body where it failed.
- **What ✨ sends** shows the prompt word for word. Each ✨ shows its prompt; change it
  for this node, or Reset it.
- **The bar under the canvas** (*Say what to change*) changes the selected node, or the
  whole graph when none is selected. A graph change shows what it adds, removes and changes
  before you **Apply** it.
- **Generate** in the toolbar writes every empty node, in the order the graph runs.
  **File → ✨ AI Graph…** designs a whole graph from a description: good for a first sketch.

Two things save the most time. Give ✨ Input a real file before ✨ Code: **⟳ From the graph**
takes what the graph hands the node, **📂 Add a file…** picks one, or drop a file on the
node. And name inputs for what they hold (`story`, not `prompt`): ✨ reads the names.

## 4. Wiring in more detail

- **Types.** A port is `text`, `number`, `boolean`, `json`, `list`, `file_path`, `image`,
  `binary` or `any`. An input marked *Read the file at this path* (`file_path`) is handed
  the file's content: text as text, a Word document as Markdown, a picture or a PDF as
  itself, which an AI node sends to its model.
- **What an input takes.** A start point hands on one package, for example
  `{"event": {"name": "draw", "by": "file"}, "values": {"file": {"path": "...", "content": "..."}}}`.
  An input takes one part of it by a dotted path (`file.content`, `chat.message`), or the
  whole package.
- **Once per item.** A new node runs once on what arrives. Tick **Run once per item**
  (Advanced) and each item of a list is its own call; *Items at once* sets how many run
  together (four by default).
- **The ◆ gate.** Every node but a start point has a ◆ on its top edge. Unwired, the node
  runs whenever a round reaches it. Wired, it runs only when the round began at a start
  point wired to it, or a node put `true` on it. A code node that returns booleans is the
  filter and the router. A node whose gate stays shut keeps what it made last.
- **Failures.** A failed node skips what depends on it. *Catch failures instead of ending
  the run* (Advanced) puts the reason on an `error` output instead.

## 5. Start points and end points

A round runs what its start point is wired to, everything after that, and what those nodes
need upstream. So one page with two start points is two tools in one window. A start
point wired to nothing starts everything; a round of the whole graph counts every start
point as started.

A node upstream that only provides context is reused when nothing about it changed, so a
second round does not ask the model again. A folder node lists its folder every round.

An end point's value is the tool's result under its name: a block shows it, a script and
the command line read it. **Also write it to** writes it to a file, or each item to its own
file in a folder.

## 6. The Gui tab and its blocks

The page is built like a document. Type headings and text in place. Press `/` to insert a
block. A selected block has a small toolbar: ¼ ½ ¾ Full, shorter or taller, move, add
below, remove. *Look & size* holds the tone, frame and background. *Colour scheme of the
page* recolours everything. Blocks are live while you build: a button pressed here runs
the graph.

| Block | Sends | Fires | Shows |
|---|---|---|---|
| File or folder | a file `{path, content}`, or a folder's file paths | when picked | |
| Text input / output / in & out | the text typed (input, in & out) | on Enter | what arrives, as text (output, in & out) |
| Dropdown | the choice | when chosen | |
| Slider | the number | when let go | |
| Button | | when pressed | |
| Chat | `{message, history}` | when a message is sent | the reply, added to the conversation |
| Chart, Table, Image | | | what arrives |
| Heading, Text, Caption, Divider, Gap | | | (the page's own design) |

A block runs no code. A node shapes the data first. A chart draws a **figure**:

```json
{ "kind": "bars", "title": "Population", "points": [{ "label": "India", "value": 1450000000 }] }
```

`kind` is `bars`, `columns`, `line` or `donut`. The chart lays it out at the block's real
size and redraws on resize without a run. For anything else a node can hand it a finished
SVG string. A table shows a list of objects (keys become columns) or a list of lists. An
image shows a path, a URL or a data URL, or a list of them. Text, charts and tables offer
**⤓ Save** (`.txt`, `.svg`, `.csv`).

## 7. ▶ Run and the App tab

**▶ Run** runs the tool as its user will. With a page, the **App** tab opens and the graph
runs when the page is used. With a start point a call starts, the App tab shows a box for
each part the graph reads and a button per start point. Start points that start themselves
start, and their clocks tick. A graph with no start point runs once, whole. **■ Stop** ends
it.

- After a round every node's card shows what it made: a line of text, a row count, a
  small chart, a thumbnail, or the first line of an error.
- The line under the tool's name says what began the last round and why any node did not
  run.
- *What using it keeps* lists what the session holds: what each start point was sent, what
  data nodes hold, what each block holds. **↺ Start over** forgets it. None of it changes
  the saved design.
- A picker that has nothing chosen asks first, in *📥 Before running…*.
- **⧉ Open as a tool** opens the delivered page in a window of its own, on the same session.

## 8. Save the project

**File → Save as…** with a name without `.json` writes a project folder: `flow.json` (the
nodes and a line per wire), `layout.json` (positions), `page/page.json` (the blocks), and
`nodes/<id>/` per node with `node.json`, `interface.json` and its files. A name ending in
`.json` writes one file with everything inline. **Save as…** onto a project or graph file
that is already there asks first (**Replace**).

The editor watches the folder. Change a file in your own editor or with git, and the change
comes in as one undo step. **File → Reload from disk** reopens everything.

## 9. Keep a round as a test

After a round that went as it should, **Keep as a test** on the App tab writes it to the
project's `tests/` folder (the project must be saved). From the command line, `--keep` does
the same:

```bash
node backend/app/main.ts my_project --event measure --value "paragraph=One two." --keep
```

The file holds what came from outside the graph (the start point's package, what the models
answered, what data nodes held) and what the end points handed back. `test` runs the round
again with those handed in, asks no model, and fails when an end point hands back something
else. It also runs each code and AI node on its `input.js` example and holds the result to
`output.js`; `--offline` skips what needs a model:

```bash
node backend/app/main.ts test --offline my_project    # what CI runs for every example
node backend/app/main.ts check my_project             # what is wrong, without running
```

## 10. Deploy

**Deploy** in the toolbar downloads a zip; `node backend/app/main.ts my_project --bundle ./out`
writes the same folder. The person who gets it unzips it and starts `run.cmd` or `./run.sh`.
They need Node 24 or newer and nothing else. With a page, the tool opens in the browser on
port 8000 or the next free one. Without a page or a call, it runs once and prints JSON.

The bundle carries the project, the code that ran it, the built page, the files the graph
starts on (one from outside the project goes to `data/`; a file or folder over 50 MB, or one
that is missing, stops Deploy) and the licence. It leaves out the editor, the tests, each node's `history.md` and `state.json`. A
tool that asks a model reads `ai-settings.json` beside `run.sh`, or the `TW_AI_*`
variables. A project can also bring a page of its own in `frontend/index.html`, which uses
the runtime API by name (see `examples/nested_statistics/frontend/`).

## 11. The MCP server

An assistant such as Claude Code can design, check, save and run graphs in one folder:

```bash
claude mcp add tell-and-wire -- node <repo>/backend/app/main.ts --mcp --mcp-root <project folder>
```

Its tools are `authoring_guide`, `generate_graph`, `validate_graph`, `save_graph`,
`run_graph`, `describe_graph`, `run_node`, `test_graph` and `list_graphs`. Every path stays
inside `--mcp-root`; it never opens `ai-settings.json` and filters keys out of what it
returns. A graph it runs runs for real, so point the root at a project folder, not at your
home folder.

## When something does not work

- **A node shows an error, or is skipped.** Open it and press **▶ Try**. A failing example
  says whether `input.js` or `output.js` is wrong. **✨ Fix** repairs the body.
- **✨ does nothing or fails.** Check **⚙ Settings → AI**: it says *Now: provider / model*.
  A missing key or a local server that is not running ends here.
- **Using the page starts nothing.** No block fires the start point: set **Using it fires**
  on the block that should. `check` names this too.
- **The page stays empty.** The block shows an end point nothing is wired into, or a wire
  is on the wrong dot. The end point's card says which blocks show it.
- **A model that thinks runs out of tokens.** Raise `TW_MAX_TOKENS` (default 4096), or use
  a model that does not think.
