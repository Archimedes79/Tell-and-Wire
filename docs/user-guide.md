# User guide

How to build a tool in Tell & Wire, step by step. The running example is
[examples/population_plotter](../examples/population_plotter/): choose a CSV, see a bar
chart. `frontend/app/masterExamples.test.ts` builds this example, folder_summaries and
chat the way this guide does (blocks added, a node dropped, a wire dragged) and runs them.

Start the editor and set up a model first, as the [README](../README.md) says. ✨ needs a
model; a small, fast one (for example `gemini-flash-lite-latest`) writes a node's files in
seconds. A local model costs nothing per call but can take minutes per answer.

## The words

| Word | What it is |
|---|---|
| tool | All of it: its name, graph and page. It is saved, run and deployed as one. |
| graph | The nodes and the wires between them: what the tool does (Graph tab). |
| node | One step. A heading, a short text, and settings or files. |
| port | A dot on a node's edge: an input on the left, an output on the right. |
| wire | Carries an output to an input. |
| run | One run of the graph, from a start point to the end points it reaches. The API calls it a round. |
| page | The blocks a person uses: what the tool looks like (Page tab). |
| block | One thing on the page: a picker, a button, a chart, a chat. |

## The node kinds

The palette on the left of the Graph tab lists them. Click one, or drag it onto the canvas.

| Node | What it does |
|---|---|
| **Start point** | Where a run begins. Started by the page (a block fires it), by a call (a script, the command line, MCP, the graph above) or by itself (when the tool starts, or every `5m`, `2h`, ...). Hands on one package: `{event, values}`. Started by itself, it can also read for the graph, as a file or folder block on a page does: one file (its path and content) or the paths of the files in a folder, filtered by file types, optionally with subfolders. |
| **AI** | Asks a model. Its instructions are `prompt.md`; it answers in text, or in JSON when `output.js` names several outputs. |
| **Code** | Runs `code.js`: a JavaScript `run(inputs)` that returns an object keyed by output. It may ask a model with `await node.llm({ prompt })`. It runs sandboxed: it reads the working directory except `ai-settings.json`, writes only the temp folder, starts no program and stops after 10 minutes (`TW_BODY_TIMEOUT_MS`). A file elsewhere reaches it as an input that reads a file path (section 4). |
| **Data** | A struct kept between rounds: its fields are in `data.json`, and each field is an input and an output of the node, plus `all` (every field as one object), `round` (the number of the round, from 1) and `before` (every field as it was when the round began: its one passive output, which a loop reads). It fills, then forwards: what arrives on a field replaces it, and the struct as it is then goes on to what reads it. A loop goes through a data node. A page block can show a field or the round, with no run. |
| **End point** | Where a run ends: what arrives is the tool's result, under its name. It can also write the value to a file, or each item to a file in a folder. |
| **Subgraph** | Holds a graph of its own. Its ports are that graph's start and end points. **Open this graph ▸** goes inside. |

## 1. Build the page

Name the tool in the field at the top left, then open the **Page** tab. Click **File or
folder**, then **Chart** in the left column (or type `/` on the page). Each block comes
connected: what the picker holds goes to a new start point, *Start*, and the chart shows a
new end point, *Chart*.

Click a block to see everything about it in the right column: its label, one small box
**On the graph**, and the block's own settings. The box shows how the block meets the graph,
by name:

- **Sends to**: the start points whose package carries what the block holds.
- **Starts a run**: a switch for whether using the block begins a run. With several start
  points it becomes *Starts a run at*, and you choose which.
- **Shows**: the end point, or the memory node, whose value the block draws.

With no block selected the right column holds the page's own settings: its colour scheme.

The first block that can fire a start point fires it, so choosing a file runs the graph. A
button or a chat always fires its start point. A dropdown that only sends is a setting: it
starts nothing, and the next run picks up its value.

A graph built first can draw its own page: **From the graph**, at the foot of the left
column, adds a block for each start point and end point that has none -- an input for what
a start point reads, a button that starts it, a text for what an end point hands back. A start
point a call starts is put on the page only if you say so, one at a time: the page can only
start one the page starts, and switched, it no longer serves the command line or a script.

## 2. Add a node and wire it

On the **Graph** tab the two points are already there. A start point's card says which
blocks fire it and send to it; an end point's card says which blocks show it. Click
**Code** in the palette: the node appears right of the selected one, chosen. Every node is
one card: its icon, its heading, a row for each port with the port's name, and below them
what it holds or made. A click chooses a node; **a double-click, or Enter, opens it** (the
next section). Drag a node from the palette to put it where you want it.

Drag from the start point's *Data* dot (the amber diamond) to the code node's input, and
from the code node's output to the end point's *Value* dot. A wire let go on **empty canvas**
opens a search: type `code` and press Enter, and the node arrives already wired. The first
wire also sets what the input **takes** of the package: here the chosen file's content
(`file.content`). The node's settings show it and let you change it.

An empty Graph tab says where to start. A node's card has a 🗑 to delete it, as the Delete
key does: nothing is asked, and Ctrl+Z brings it back. A **⚠ N problems** chip in the bar
under the canvas lists what `check` finds, for example a loop that no data node closes or
a block connected to nothing.

## 3. Say what the node does; ✨ writes its files

Double-click a node (or press Enter on it) and it opens where the canvas was: **Esc**, or
**← Graph**, goes back, and ‹ › step to the node before and the node after. On the left is
the node in your words, and what it is made of; on the right, the one thing you chose to
work on. There is no Save: a change is in the graph at once, and Undo takes it back.

The box on top, **What it does**, is the node in your words:

> Read the population CSV (a country column and a population column) and show a bar chart
> of the population per country.

Below it, **Auto generate** writes everything in order, each file from the ones before it. It
stops after **Pull input** where a wired input has no example to pull -- the message says why --
rather than write against nothing. Under that are the node's files, a card each -- its name in
bold, the ports it holds as chips, and a button for each way of working on it. The one open is lit.
Above the open file, one line says what the node takes in and what it hands on, from its ports:
`file · path → text · info`. A click on a side opens its file, and `≠ input.js` says the file
names other ports than the node has.

| Card | Buttons | File |
|---|---|---|
| **Input** | **File**, and ⟳ (**Pull input**) beside the name | `input.js`: what one call is handed -- a JSDoc typedef, then one example as plain JSON. |
| **Output** | **Chat** or ⟳ (**Pull output**), **File** | `output.js`: what one call returns, the same way. Its keys are the node's outputs. |
| **Code** (AI node: **Prompt**) | **Chat**, **File** | `code.js`, or `prompt.md`: the AI node's instructions. |
| **Fields** (a data node) | **Chat**, **File** | `data.json`: the struct as it starts. |
| **Example** (a data node) | **File** | `example.json`: the same struct filled, one example of what it holds. ✨ writes it together with the fields; left empty, the start stands in. |

- **Pull input** writes `input.js` from the graph, with no model: its types from the
  `output.js` of the node wired before it, its example from running what comes before it on
  the example data -- a file an input reads is read for you. If a node before it asks a model,
  that is a model call, and the button says so.
- **Pull output** takes the place of the output's **Chat** where every output goes into a field of a
  data node: `output.js` is read off the field -- its type, and the filled example of what it
  holds. No model, no run.
- **Chat** says what you want, in your words: *the number of words, and how long it takes to
  read*. The first message writes the file; each message after that changes the file as said.
  Under the line, *Sent with it* lists what goes along with your words -- the node's text, its
  input, its output and the graph around it, the same for every file of every kind of node --
  and **Show what is sent** shows the prompt word for word.
- **File** is the file itself, editable in place; **Full screen** opens it across the window, and
  **Open in my editor** opens it in your own. A dot says whether anything is written in it
  (the legend under the cards says which is which).
  Files an input or an output is written from -- examples, a spec -- are folded under the
  file; drop one on the node on the canvas to add it.
- The gear holds the settings: the ports where they are yours to name, *Run once per item*,
  *Catch failures*, the model and tools, **What runs, technically** (a start or end point has none), and `history.md` -- every
  exchange with the model about this node. Each chat also lists its own exchanges.
- **Last run** at the foot of the pane, once the tool has run, says how the node went and what
  arrived and what it made.

New code is tried on the example in `input.js` and repaired once if it fails. Under the code,
**▶ Try** runs the node once on that example and holds the result to `output.js`; **✨ Fix**
repairs the body where it failed. An AI node's **▶ Try** asks the model on the example.

- **The bar under the canvas** (*Say what to change in the graph*) changes the whole graph, and
  shows what it adds, removes and changes before you **Apply** it. A change to one node is said
  in that node's Chat.
- **Generate all** in the toolbar writes every empty node, in the order the graph runs. It pulls
  what it can -- `input.js` off the nodes before, `output.js` off the data node an output goes
  into -- and asks the model for the rest.
  **File → ✨ Describe a graph…** designs a whole graph from a description: good for a first sketch.

A start point, a folder, an end point and a subgraph have no files: they open on their
settings. **Edit the page** on a node a block uses goes to the Page tab.

Two things save the most time. Wire a node to what feeds it before **Pull input**, so the
example is real data. And name inputs for what they hold (`story`, not `prompt`): ✨ reads the names.

**A data node is a struct.** Its **Fields** file, `data.json`, is an object: each key is a field,
with its starting value. Each field is an input and an output of the node under its name;
`all` carries every field as one object, and `round` is the number of the round, from 1. The node fills,
then forwards: what arrives on a field replaces it, and the struct as it is then goes on to whatever the
node feeds, in the same round. A field keeps its value when nothing arrives.

A field's output is **active**: a node wired from it runs after the node is filled, and sees the new value.
`before` is the one **passive** output (a ring on the card, a dotted wire): every field as it was when the
round began, as one object. A wire from it orders nothing and carries no event, so it can read the memory
in a loop: a node that adds one to a count takes `count` from `before` (the input's *field*) and writes the
new value into the field. Wired from the field's output instead, it would wait for the node it fills --
that is a cycle, and `check` says so. A page, or a script, reads what the last round left, never a round
half done. The node holds no code: working out a new value is a code node, and the button that makes it
happen is wired to that code node, not to the memory. What the struct holds can
be read without a run: a block of the page can show a field (`count`, or the node's name and
a dot and the field) or the round, and the session answers by name. The **Example** file is
what a node before it is shaped as.

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
  (in the node's settings; it shows when a list arrives) and each item of a list is its own
  call; *Items at once* sets how many run together (four by default).
- **The ◆ gate.** Every node but a start point has a ◆ on its top edge. Unwired, the node
  runs whenever a run reaches it. Wired, it runs only when the run began at a start
  point wired to it, or a node put `true` on it. A code node that returns booleans is the
  filter and the router. A node whose gate stays shut keeps what it made last.
- **Failures.** A failed node skips what depends on it. **Catch failures** (in the node's
  settings) puts the reason on an `error` output instead; a data node it feeds keeps what it held.
- **A model that slips.** A small or cheap model now and then answers with a sentence where the
  JSON should be, leaves a key out, calls a list text, or runs into the length limit. An AI node
  does not hand such an answer on to fail further down: it asks again, showing the model what it
  said and what was wrong -- twice more by default (**Ask again when the answer is unusable**, in
  the node's settings; `TW_AI_REPAIRS` for the machine). A JSON object that still lacks something
  after that goes on as it is; an answer that is no JSON fails the node, saying how often it asked.
  Each repair shows in the node's activity. A line that dropped, a busy server and an empty answer
  are tried again before any of that (`TW_AI_ATTEMPTS`, `TW_AI_RETRY_DELAY`). Each ask is a call: put
  0 on a node whose model is costly.

## 5. Start points and end points

A run goes through what its start point is wired to, everything after that, and what
those nodes need upstream. So one page with two start points is two tools in one window.
A start point wired to nothing starts everything; a run of the whole graph counts every
start point as started.

A node upstream that only provides context is reused when nothing about it changed, so a
second run does not ask the model again. A start point that reads a folder lists it every time it starts.

An end point's value is the tool's result under its name: a block shows it, a script and
the command line read it. **Also write it to** writes it to a file, or each item to its own
file in a folder.

## 6. The Page tab and its blocks

The page is built like a document. Type headings and text in place. Press `/` to insert a
block, or drag one from the left column onto the page. A selected block has a small toolbar:
¼ ½ ¾ Full for its width, and a 🗑 that deletes it (so does the Delete key); drag a block
by its grip, beside it while the pointer is on it, to move it, and its corner to size it. A block is as tall as what is in it
needs and at least its height in cells, so text is not cut. One that shows what a run hands back is a
single line, "Waiting for output…", until a run does; selected, it has its whole height. *Look & size* holds the tone, frame and
background. With no block selected, the right column shows the page: *Colour scheme*
recolours the page; the editor keeps its own colours. Blocks are live while you build: a
button pressed here runs the graph.

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
it; the delivered page has a Stop of its own while a run goes.

- After a run every node's card shows what it made: a line of text, a row count, a
  small chart, a thumbnail, or the first line of an error.
- *Last run* above the page says what began the last run, and, on hover, why any node
  did not run.
- *What using it keeps* lists what the session holds: what each start point was sent, what
  data nodes hold, what each block holds. **↺ Start over** forgets it. None of it changes
  the saved design.
- A picker that has nothing chosen asks first, in a *Choose files for the run* window.
- **⧉ Open as a tool** opens the delivered page in a window of its own, on the same session.

## 8. Save the tool

**File → Open…** and **Save as…** open a file browser: pick a folder or file, or type a
path in its address box and press Enter. **Save as…** with a name without `.json` writes
the tool as a folder: `flow.json` (a line per wire), `nodes.json` (each node's kind,
heading, text, settings and ports), `layout.json` (positions), `page.json` (the blocks),
and a folder `nodes/<id>/` for each node that keeps code or text of its own. A name ending
in `.json` writes one file with everything inline. **Save as…** onto a tool or graph file
that is already there asks first (**Replace**). Anything that would drop unsaved changes (New, Open, Reload, a drop) asks
first too: **Save**, **Discard** or **Cancel**.

The editor watches the folder. Change a file in your own editor or with git, and the change
comes in as one undo step. **File → Reload from disk** reopens everything.

## 9. Keep a run as a test

After a run that went as it should, **Keep as a test** on the App tab writes it to the
tool's `tests/` folder (the tool must be saved). From the command line, `--keep` does
the same:

```bash
node backend/app/main.ts my_tool --event measure --value "paragraph=One two." --keep
```

The file holds what came from outside the graph (the start point's package, what the models
answered, what data nodes held) and what the end points handed back. `test` runs it
again with those handed in, asks no model, and fails when an end point hands back something
else. It also runs each code and AI node on its `input.js` example and holds the result to
`output.js`; `--offline` skips what needs a model:

```bash
node backend/app/main.ts test --offline my_tool    # what CI runs for every example
node backend/app/main.ts check my_tool             # what is wrong, without running
```

## 10. Deploy

**File → Deploy as zip** downloads a zip; `node backend/app/main.ts my_tool --bundle ./out`
writes the same folder. The person who gets it unzips it and starts `run.cmd` or `./run.sh`.
They need Node 24 or newer and nothing else. With a page, the tool opens in the browser on
port 8000 or the next free one. Without a page or a call, it runs once and prints JSON.

The bundle carries the tool's folder, the code that ran it, the built page, the files the
graph starts on (one from outside the tool goes to `data/`; a file or folder over 50 MB, or
one that is missing, stops Deploy) and the licence. It leaves out the editor, the tests,
each node's `history.md` and `state.json`. A tool that asks a model reads
`ai-settings.json` beside `run.sh`, or the `TW_AI_*` variables. A tool can also bring a
page of its own in `frontend/index.html`, which uses the runtime API by name (see
`examples/nested_statistics/frontend/`).

## 11. The MCP server

An assistant such as Claude Code can design, check, save and run graphs in one folder:

```bash
claude mcp add tell-and-wire -- node <repo>/backend/app/main.ts --mcp --mcp-root <tools folder>
```

Its tools are `authoring_guide`, `generate_graph`, `validate_graph`, `save_graph`,
`run_graph`, `describe_graph`, `run_node`, `test_graph` and `list_graphs`. Every path stays
inside `--mcp-root`; it never opens `ai-settings.json` and filters keys out of what it
returns. A graph it runs runs for real, so point the root at a folder of tools, not at your
home folder.

## When something does not work

- **A node shows an error, or is skipped.** Open it and press **▶ Try**. A failing example
  says whether `input.js` or `output.js` is wrong. **✨ Fix** repairs the body.
- **✨ does nothing or fails.** Check **⚙ Settings**: its AI section says *Now: provider / model*.
  A missing key or a local server that is not running ends here.
- **Using the page starts nothing.** No block fires the start point: switch **Starts a run**
  on for the block that should. `check` names this too.
- **The page stays empty.** The block shows an end point nothing is wired into, or a wire
  is on the wrong dot. The end point's card says which blocks show it.
- **A model's answer is empty or ends short.** A model that thinks spends the same token
  budget on thinking, and an answer cut off by it is an error that names `TW_MAX_TOKENS`
  (default 4096): raise it, ask for a shorter answer, or use a model that does not think.
