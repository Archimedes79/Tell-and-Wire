# Architecture

How Tell & Wire is put together: what each part is for, where it lives, the rules between the
parts, how a round runs, the project format, the host's APIs and the core protocol, and how to
extend it. Code comments explain each file; this explains how the files relate. Where a test
holds a claim, the test is named.

## The idea

Two products design a **project**, a folder of plain files: the **editor** (a graph and a GUI, each in its tab) and the **notebook**
(a page you write, with windows in it to use). A **deployment** keeps one project in use and executes it. A **package** is a
project together with the deployment's code: what **Deploy** writes, a folder that runs wherever Node runs. The system can save
and transfer what is deployed because a package is nothing but files.

![Two products design a project on common code, the project is plain files, a deployment runs it: what crosses between the bands is files, and the graph is handed to the engine without the GUI](images/overview.svg)

**The picture is the architecture, and the software is cut the same way.** Every box is a folder or a few of them (the next
sections take the picture apart, box by box), and the rules below are asserted on the imports. Read it top to bottom: the two
products design (dashed) on common code, what they make is the same set of files (yellow), and a deployment uses them (teal),
with the engine of one language the only part that can be swapped. Teal ships in a package, grey dashed is only the editor,
green dashed only the notebook, solid grey is common code whose authoring part no package carries, purple is a model.

Four cuts run through everything:

- **Design, state and computation are apart.** Design belongs to the editor and is written to the
  project. State belongs to the host (`state.json`, never in the project). Computation belongs to
  the runtime.
- **Graph and GUI are apart.** The graph is nodes wired together; the GUI is the blocks a person
  uses it through. The graph runs without a GUI, a GUI can be replaced by a page of the project's
  own, and each has its own files, definition and editor.
- **What runs and how it is written are apart.** What runs is the graph and what is shown is the GUI, both in the project's files. How a product lets a person write them -- a wire dragged on a canvas, an `@Name` in a sentence of the notebook, a sentence made into a window by a model -- is that product's *surface*: it writes those files and reads them back, and keeps nothing beside them that they cannot say. An `@Name` is a way to write a wire, and the wire is stored as a wire. The surface is therefore the part of a product that can be replaced or doubled, and the files are what both products share and what a bug fix reaches. (Held for the notebook by `backend/notebook/fromGraph.test.ts`: it keeps no file of its own beside the project's.)
- **Definition, execution and design are apart.** What a kind of node *is* is neutral and runs in
  the browser and in Node; what *runs* it is the runtime's; how an AI *writes* it is authoring's (common to both products).

### Words

| Word | Means |
|---|---|
| **graph** | Nodes and wires. A run starts at a **start point**, runs through **code**, **ai**, **data** nodes and **subgraphs**, and ends at **end points**. |
| **gui** | The blocks a tool is used through (text, picker, button, chart, chat ...). No node: a block connects to the graph by name, to the start points it sends to and fires and the end point it shows. |
| **project** | The folder of files a tool is saved as. |
| **editor** | One of the two products that design a project: the canvas, the GUI designer, saving, packing, the MCP server for assistants. Its own folders are named `editor`. |
| **notebook** | The other product: a page you write, with windows in it. Its own folders are named `notebook` (and `gui-notebook`, `graph-notebook` in the browser). It imports nothing of the editor. |
| **authoring** | What both products write with, and no package carries: the designs of the nodes and blocks (how an AI writes them), the check of a graph, the record of a writing, what a graph is handed on without. Its folders are named `authoring`: `graph/authoring`, `gui/authoring`, `backend/authoring`. It is common code, and knows neither product. |
| **deployment** | Everything a package carries. |
| **runtime** | Execution for one programming language (JavaScript today): runs a round, a node, a node's example, asks the model, runs a code body in a sandbox. |
| **host** | Holds the graph in use (the **session**) and serves it: the queue of rounds, the state, the clock, HTTP. |
| **package** | A project and the deployment's code, with a `MANIFEST.json`. |

## The overview, block by block

`images/overview.svg` is the target; this is the picture taken apart. Each box is named in bold as it is in the picture, with the
folders it is and its sub-blocks. `backend/architecture/blocks.test.ts` holds this section to the software: every box of the
picture is described here, every folder named here exists, and no folder of the source is left out.

`graph/`, `gui/` and `backend/` are TypeScript that Node 24 runs as it is: no build, no runtime dependencies. `frontend/` is
React and Vite: `npm run build` writes the editor's page (`frontend/dist`), `npm run build:notebook` the notebook's
(`frontend/notebook/dist`).

### Design: the editor

One server, `node backend/cli/main.ts --editor frontend/dist` (`start.cmd`, `start.ps1`, `start.sh`), on :8000.

| Box | Folders | Sub-blocks and what they hold |
|---|---|---|
| **GUI editor** | `frontend/editor/gui/` | The GUI designer: the surface blocks are laid out on, the palette, a block's own editor (`widgets/`), what a block sends, fires and shows (`guiWrite.ts`), a GUI drawn from a graph (`guiFromGraph.ts`). |
| **Graph editor** | `frontend/editor/graph/` | The canvas (`canvas/`), a node opened in place (`node/`), the views of a graph (`views/`), the builder and the panels of every node kind (`nodes/<kind>/`), the fields of a node's settings (`fields/`), and writing: ▶ Try, ✨ Generate, the chat for each file (`writing/`). |
| (shell of both) | `frontend/editor/`, `frontend/editor/document/`, `frontend/editor/app/`, `frontend/editor/api/` | `document/`: the open project -- store, undo, model, and the builders of each element kind (`elements/`). `app/`: menus, tabs, toolbar, dialogs, settings, Help, the link to the notebook (`notebookLink.ts`). `api/`: the editor's client of its backend. |
| **Editor backend** | `backend/editor/`, `backend/editor/project/`, `backend/editor/graph/`, `backend/editor/runtime/`, `backend/editor/host/` | `project/`: finds and checks projects, keeps rounds (`keptRounds.ts`) and packs (`deploy/`: `bundle.ts`, `launchers.ts`, `zip.ts`). `graph/`: the AI that writes nodes and whole graphs (`generate.ts`, `generateGraph.ts`, `generatePrompts.ts`, `graphPrompt.ts`). `runtime/`: the model and tool-server setup done for the person (`settings.ts`, `mcpServers.ts`). `host/`: what only the editor's server answers (`api.ts`, `routes.ts`, `commands.ts`: `check`, `test`, `--bundle`, `--mcp`; `mcpServer.ts` with `mcp/`). |
| (the editor's part of the definitions) | `graph/editor/`, `gui/editor/` | What only the editor adds to graph and GUI, neutral so that the browser and Node share it: `prompts.ts` (the prompts that write a node and a whole graph), `pull.ts` (the files a node's Input and Output chats make), `scheduleEdit.ts` (where a card may be put in the table), `complete.ts` (a GUI written whole, with the start and end points its blocks need). |

### Design: the notebook

Its own server, `node backend/notebook/main.ts` (`start-notebook.cmd`, `.ps1`, `.sh`), on :8100, and its own page, built apart.
It imports nothing of the editor; the two know each other by a link only (`docs/notebook.md`).

| Box | Folders | Sub-blocks and what they hold |
|---|---|---|
| **Page** | `frontend/gui-notebook/` | The page and its windows: the blocks you type in and the three views Write, Markdown and As app (`Page.tsx`), a window with its inputs, its button and its outputs, a table, a text, a chart or a picture (`WindowBox.tsx`). |
| **Cells** | `frontend/graph-notebook/` | The list of the open window, Ask, Do and Show (`Cells.tsx`), the window as the graph it is (`Haube.tsx`), the debug of every round (`Debug.tsx`), in a dock under the page (`Dock.tsx`). |
| (shell of both) | `frontend/notebook/`, `frontend/notebook/document/`, `frontend/notebook/elements/` | The notebook's page around the two: `document/` the open page -- store, undo, saving, running the windows in order (`runs.ts`), the link to the editor (`links.ts`); `elements/` the boxes a window shows (table, chart, picture, the file browser); the look (`look.ts`, `notebook.css`). Built by `vite.notebook.config.ts`. |
| **Notebook backend** | `backend/notebook/` | `main.ts` (its start file), `api.ts` and `routes.ts` (open and save a page, hand it to the session), `describe.ts` (windows from a sentence), `files.ts` (a project saved before the page was read from its graph). |
| (its model) | `gui/notebook/` | Windows and the page as data, neutral so that the browser and Node share them: `windows.ts` (windows, and compiling them to a graph, a schedule and a GUI), `fromGraph.ts` (reading them back from those), `page.ts`, `pageModel.ts`, `edit.ts` (the edits, pure functions), `read.ts`. |

### Common code

Stands under both products. The editor and the notebook import nothing of each other, and common code imports neither.

| Sub-block | Folders | What it holds |
|---|---|---|
| Graph definition | `graph/`, `graph/files/`, `graph/nodes/` | The format (`graph.ts`), `wiring.ts`, `order.ts`, `triggers.ts`, `schedule.ts` (the table the cards stand in), `batching.ts`, `interface.ts` (what a graph offers by name), `schema.ts`; `files/`: the project's file formats (flow, nodes, names, definitions, the run prompt); `nodes/`: the **definition** of every node kind -- start, ai, code, data, end, subgraph -- and its registry. |
| GUI definition | `gui/`, `gui/widgets/`, `gui/windows/` | `gui.ts` (blocks, what they send and show), `interface.ts` (what a GUI adds to a graph's interface), `size.ts` (the grid's sizes); `widgets/`: the **definition** of every block kind; `windows/`: what the delivered page of windows shares with the notebook -- the grid, the scheme, the order windows run in. |
| Authoring | `graph/authoring/`, `gui/authoring/`, `backend/authoring/` | What both products write with, and no package carries. `graph/authoring/nodes/` and `gui/authoring/widgets/`: the **design** of every kind (how an AI writes it, what `check` says, what a package needs); `generation.ts`, `history.ts` (the record of a writing), `handedOn.ts` (a graph without what only writing it needs); `check.ts` (the one list of problems), `gui.ts`. `backend/authoring/`: `write.ts` (writes projects), `ask.ts` (a model's transcript, how its answer is read, how a writing fails). |
| Host and runtime | `backend/deployment/` | The deployment's, the same code that runs in Use below. |
| Start-up | `backend/cli/` | The composition root: `main.ts` and `cli.ts` start a run or a server and put the parts together; `runServer` takes the page and the routes of the product it serves. |
| Structure | `backend/architecture/` | The rules below, asserted on the imports and the folders. |

### The project: plain files

Not code: one folder per tool, written by either product, read by a deployment and by you (`examples/` and `notebook-examples/`
hold projects that tests and CI run; the format is under "The project folder").

| Files | What they say |
|---|---|
| `gui.json` | The blocks of the GUI -- and, for a notebook, the words of the page and where its windows stand. |
| `graph-flow.json`, `graph-nodes.json`, `graph-schedule.json` | Every wire, every node, and the table that says in which step each node runs. |
| `nodes/<id>/` | A folder per node: what it does, `input.js`, `output.js`, and `code.js` or `prompt.md`. |

### Use: a deployment

Everything a package carries, and what runs a tool in the editor and in the notebook alike.

| Box | Folders | Sub-blocks and what they hold |
|---|---|---|
| **Browser** | `frontend/deployment/`, `frontend/deployment/gui/`, `frontend/deployment/windows/` | `gui/`: what a deployed tool's browser loads -- `kit/` (API client, look, dialogs), `surface/` (the GUI drawn), `widgets/` (the block views). `windows/`: the page of framed windows a tool made of them shows, and running them in order; it knows no editor. |
| **Session host** | `backend/deployment/host/`, `backend/deployment/gui/`, `backend/deployment/project/` | `host/`: `session.ts` (the graph in use, what nodes keep, `state.json`), `rounds.ts` (the queue of rounds), `serve.ts` and `http.ts` (the server), `api.ts` (the wire), `lifecycle.ts`, `browse.ts`. `gui/`: `hooks.ts`, the GUI as the host uses it. `project/`: `folder.ts` (reads a project folder), `layout.ts` (where things are in an install). |
| **Graph execution engine** | `backend/deployment/runtime/` | `executor.ts` (a round), `latch.ts` and `reuse.ts` (what every node made last, and what may be reused), the core protocol (`protocol.ts`, in this process by `localCore.ts` or as a program of its own by `stdio.ts`), `examples.ts`, `nodes/` (the **runner** of every node kind), `services.ts` and `confine.ts` (what a node touches the world with, and the sandbox), `clock.ts`, `offline.ts`. |
| **AI at run time** | `backend/deployment/runtime/ai/`, `mcp/`, `mcp/web/`, `mcp/documents/` | The model client and its settings, and the tool servers an AI node may call: a web reader and a Word and PDF reader, optional, each a package of its own. |

Beside the blocks: `scripts/` (the launchers, packaging, the licence check), `docs/`, and `frontend/test/` (what the page's
tests share).

## Rules

| Rule | Held by |
|---|---|
| **A package carries every path except those with a folder named `editor`, `notebook` or `authoring`, and nothing outside such a folder imports from one** (`import()` in `backend/cli` aside: it composes, and a package without the editor says so when a command asks for it). | `backend/architecture/layers.test.ts` |
| **The graph editor and the notebook import nothing of each other**, in any tier: each is started by a file of its own, and either can be taken away without the other noticing. What they share is below them, as common code: `graph/`, `gui/`, the deployment and the `authoring` folders. | `layers.test.ts` |
| **Common code knows no product**: nothing in an `authoring` folder imports from the editor's or the notebook's folders. | `layers.test.ts` |
| `graph/` and `gui/` import no `node:*`, nothing from `backend/` or `frontend/`; `graph/` imports nothing from `gui/`. Their tests too: a test that needs a run lives in `backend/`, which runs. | `layers.test.ts` |
| In `backend/`, a module imports only from below: project, then `authoring`, runtime and GUI, then host, then cli; the products' modules above the deployment's. Modules of one rank do not import each other. The wires' files (`host/api.ts`, `notebook/api.ts`) rank with nothing. | `layers.test.ts` |
| `frontend/` reaches `backend/` only through the wire's files. | `layers.test.ts` |
| A deployed tool's browser loads nothing of an `editor` folder or of the notebook's three, no panel, and of `graph/`, `gui/` and `backend/` only the wire and the shapes its views read. | `frontend/deployment/gui/boundary.test.ts` |
| The editor's page imports only downward through its layers: `ui`, `layout` · graph types · `model`, `api` · editor `api` · `store`, `views` · `dialogs` · deployed `widgets`, `surface` · the elements · `gui`, `canvas`, `node` · the app · `App` · `main`. | `frontend/editor/app/layers.test.ts` |
| The notebook's page is read back from the project's own files (`gui/notebook/fromGraph.ts`): every example and a page that uses every kind of input, output and step is made into files, read back and made again, giving the same files and the same windows -- and every feature of a window has its place in them (`docs/notebook.md`). | `backend/notebook/fromGraph.test.ts` |
| The notebook's page the same way: `document` · `elements` · `gui-notebook`, `graph-notebook` (siblings, which do not import each other) · the shell · `main`. | `frontend/notebook/layers.test.ts` |
| A deployed tool answers only the routes of the tables it is composed of; an editor route is a 404. | `backend/deployment/host/serve.test.ts` |
| A package runs from a folder of its own, carries `MANIFEST.json` listing exactly its files, and nothing of the editor. | `backend/editor/project/deploy/bundle.test.ts` |
| Every kind of node and block has all its faces, under the same name, and the registries list the same kinds. | `frontend/editor/document/elements/symmetry.test.ts` |
| No shell compares a node type or block kind with a literal. | both `shells.test.ts` |
| `graph/`, `gui/` and `backend/` use no TypeScript that needs a compiler (enums, parameter properties, namespaces, decorators). | `backend/architecture/strippable.test.ts` |
| All imports are relative; there are no aliases. | read off the imports |

## Elements

Every kind of node and block is an **element**, with one folder per kind under the same name in
each tier it has a part in.

| Face | Node (Graph tab) | Block (GUI tab) | Tier |
|---|---|---|---|
| **Definition**: what it is | `graph/nodes/<kind>/<Kind>NodeDefinition.ts` | `gui/widgets/<kind>/<Kind>WidgetDefinition.ts` | neutral, ships |
| **Runner**: what runs it | `backend/deployment/runtime/nodes/<kind>/<Kind>NodeRunner.ts` | none: a block is computed by nothing language-specific | runtime, ships |
| **Design**: how it is written | `graph/authoring/nodes/<kind>/<Kind>NodeDesign.ts` | `gui/authoring/widgets/<kind>/<Kind>WidgetDesign.ts` | authoring: both products, not shipped |
| **Builder**: how it is edited | `frontend/editor/graph/nodes/<kind>/<Kind>NodeGuiBuilder.ts`, panels | `frontend/editor/gui/widgets/<kind>/<Kind>WidgetGuiBuilder.ts`, panel | editor only |
| **View**: how it is drawn | the node's card on the canvas | `frontend/deployment/gui/widgets/<kind>/<Kind>WidgetView.tsx` | ships |

Registries: `graph/nodes/registry.ts` (`registry`, definitions), `backend/deployment/runtime/nodes/registry.ts`
(`runners`), `graph/authoring/nodes/registry.ts` (`designs`), `gui/widgets/roster.ts` and
`gui/authoring/widgets/roster.ts`, and `frontend/editor/document/elements/registry.ts` (builders).

Node kinds: start, ai, code, data, end, subgraph. Block kinds: text, divider, spacer,
input_picker, text_io, select, slider, button, chat, plot_window, table, image_view.

- A **definition** answers everything about its kind that holds in any language: its settings
  (`config()`), ports, files, what starts a round, what it offers by name, what it keeps between
  rounds. Shared code asks the definition; the definition is the only reader of its kind's
  settings.
- A **runner** holds `execute` and what only `execute` uses (the model call, the sandbox, the
  boundary of a subgraph). It touches the world only through the `Runtime` it is handed
  (`graph/nodes/Runtime.ts`); `backend/deployment/runtime/services.ts` gives the real one,
  `backend/deployment/runtime/test/fakes.ts` a fake.
- A **design** says how an AI writes the kind (`generation()`), what `check` says about it
  (`problems()`), what it tells the model that designs a whole graph, what a package must carry for
  it, and what running it would cost (`asksModel`).
- **The GUI is no node.** It is the graph's list of blocks (`graph.gui.blocks`, stored in
  `gui.json`). A block connects by name: the start points its data goes to (`sends_to`), the
  one using it fires (`fires`), the end point it shows (`shows`). `gui/gui.ts` holds what a round,
  `check` and a package ask of the GUI. The host reaches it only through the hooks of
  `backend/deployment/gui/hooks.ts`; a host composed without them is a graph in use, nothing more.

## How a round runs

1. **Asked.** A GUI, a script, the clock or a caller asks the session
   (`backend/deployment/host/session.ts`) for a round at a start point, with values. A round a GUI
   starts is sent what the blocks that send to that start point hold (`guiSends`, in the GUI's
   hooks).
2. **Queued.** `rounds.ts` runs one round at a time, in the order asked, and turns progress into
   the snapshots a GUI follows on the stream.
3. **Run.** The core gets a working copy: the design, with what nodes keep and what the round was
   sent put in. `backend/deployment/runtime/localCore.ts` runs `executeGraph`
   (`backend/deployment/runtime/executor.ts`): it orders nodes in levels (`graph/order.ts`), where
   a loop may only pass through a data node (a wire from it to a node that runs before it is a read, left out:
   `readingWires`); runs what the start point is wired to, what follows and what those need
   (`graph/triggers.ts`; a data node holds its value, so what writes it is not needed); per node,
   hands each input its `field` of the package, skips a node with nothing to do, reads files on
   `file_path` inputs (`graph/fileInputs.ts`) and runs once or per item (`graph/batching.ts`).
   A wired ◆ gate opens only for the round's start point or a `true`; a node that stands still keeps
   what it made last (`latch.ts`); unchanged context upstream is reused (`reuse.ts`). The runner of
   the kind does the node's own work.
4. **Settled.** Data nodes keep what arrived, field by field (`settleMemory`). The session hands each end point's value to the blocks that show it (the GUI's
   hooks). A round that ran to its end commits and writes `state.json`.

## State

**Using a graph does not change its design.** A session holds one graph as it was handed over, by
the editor or a served tool, and what using it leaves behind. The rules are held one by one in
`backend/deployment/host/session.test.ts`.

1. **What state is.** Each node's kept values, as its definition says (`NodeDefinition.state`): a
   start point's `values`, a data node's fields. The GUI's: what each block holds,
   by id (a value set, a conversation, what an end point handed back). Beside them: what every node
   made last (the latch, held by the graph core), what the GUI shows, how many rounds ran. Not
   state: the reuse cache, a round in flight.
2. **Where.** In the session, and in `state.json` beside `graph-flow.json` (`<file>.state.json`
   beside a single graph file). Not part of the project: a save and `check` leave it alone, a
   package does not carry it.
3. **When.** A round runs on a working copy. One that ran to its end commits; one that was stopped
   or could not start commits nothing.
4. **The design wins.** A kept value is held with the design value it started from. When its node
   or block is gone, or its design changed, that value is dropped and said.
5. **Start over.** **↺ Start over** (`POST /api/runtime/reset`) empties the session and deletes the
   file; the App tab lists what it forgets under *What using it keeps*.
6. **One session per server**, its id in every runtime route
   (`backend/deployment/host/runtimeApi.test.ts`). The command line and `run_graph` keep nothing:
   they start from the design.

None of it marks the editor's document unsaved or is saved with it
(`frontend/editor/document/store/graphStore.test.ts`: "shows what a round made, and keeps none of
it in the document"). Keys and the two AI settings (the nodes', and the one that writes -- ✨ -- which is the nodes' until set apart:
`ai` and `writing_ai`) live in `ai-settings.json`, not in a graph; an AI node may name its own model in its settings.

## The project folder

A tool is saved as a project folder: a folder with a `graph-flow.json`. Each fact is in one place,
keys are sorted, and an unchanged save changes no byte (`backend/editor/project/write.test.ts`).

```
my_tool/
  graph-flow.json      name, description, every wire as one line: "draw.data -> chart.csv", or "draw.data -> chart.csv via C2" when it is drawn through a cell
  graph-nodes.json     id -> { kind, label, description?, config?, inputs?, outputs? }: what each node is, as a person said it
  graph-schedule.json  { table, size? }: the order the nodes run in and where they stand (the schedule, below)
  gui.json             the GUI: a list of its blocks, each with sends_to / fires / shows
  nodes/<id>/          only the writing a node keeps; a node that keeps none has no folder
    input.js           what one call is handed: a JSDoc typedef, then one example as JSON  (code, ai)
    output.js          what one call returns, the same way; its keys are the outputs        (code, ai)
    code.js            the body, plus lines that run it alone on input.js's example          (code)
    prompt.md          the instructions sent to the model                                   (ai)
    data.json          the fields it starts with, an object; its ports follow them           (data)
    example.json       the same struct filled, an example of what it holds; absent, data.json stands in (data)
    history.md         every exchange with the model about this node
    graph-flow.json, graph-nodes.json, graph-schedule.json, nodes/   the graph a subgraph holds: a project folder of its own   (subgraph)
  tests/<name>.json    kept rounds
  frontend/            optional: a page of the project's own, served at / instead of the built gui
  state.json           not the project's: what using it left behind
```

- **The graph is three files**: `graph-flow.json` (the wires), `graph-nodes.json` (the nodes) and
  `graph-schedule.json` (when they run, and where they stand). A run needs the first two and the node
  folders, and reads the third for the order; without it, a graph runs in the order of its wires. Every node has an
  entry in `graph-nodes.json`, at least `{ "kind": … }`; a wire to an id without one is a `check`
  problem. The GUI is no part of the graph: `gui.json` names start and end points by id, and a tool
  without a GUI has no such file.
- **The schedule** (`graph/schedule.ts`) is a table: rows of text, one id or `.` for an empty cell each,
  `"table": ["start read .", ". clean summarize"]`. Its columns are the steps and time runs to the right;
  nodes in one column have no wire between them, so they may run in parallel or in any order, and the
  engine takes them top to bottom. One rule holds it: every wire ends in a later column than it starts, but one that leaves a memory (a
  data node), which may end in an earlier one: it reads what the memory held when the round began
  (`readingWires`). The column decides which a wire of a memory is. A table that breaks it refuses the run and is a `check` problem,
  naming the wire. `size` keeps the size of the cards a person resized (`{ "id": { "width", "height" } }`), and a
  wire's `via` the cells it is drawn through, named as a spreadsheet does (`C2`: third column, second row): how
  it is drawn, nothing a run does. Where a card is drawn follows from the table and the sizes, and is stored
  nowhere. The editor keeps the table holding -- a card dropped, a wire made, a node deleted or added -- and
  without a file a graph is laid out from its wires (`thinTable`).
- **Only what a person said.** A setting at its default is not written, by the editor or by the
  folder's writer alike (`defaultNodeConfig`, `withoutDefaults` in `graph/graph.ts`), and neither
  are the ports that follow from a node's settings (a start point's, a data node's from its fields,
  a subgraph's from its graph): they are worked out when the folder is read. Of those inputs the
  file keeps what a person chose: `field` and `list`.
- The GUI is a flow, not coordinates: its blocks sit in the order of the list, each `w` cells wide
  (of 16 across) and at least `h` high -- a row grows with what is in it --, wrapping like text
  (`frontend/deployment/gui/kit/layout.ts`).
- Which setting is which file is the definition's to say (`NodeDefinition.texts`). Every file is
  there from the start as a stub that reads back as nothing.
- `backend/deployment/project/folder.ts` reads folders -- for the editor, the CLI, a served tool and
  the MCP server -- and `backend/editor/project/write.ts` writes them. The same graph as one
  `.json` file has everything inline.
- A save refuses to overwrite a file changed on disk since it was read; the editor takes outside
  changes in as one undo step.
- A kept round (`backend/editor/project/keptRounds.ts`) holds `event`, `by`, `given` (what came from
  outside or from before, by node id: packages, model answers, memory) and `outputs`. `test` replays
  it with `given` handed in, asks no model, and compares the end points.
- `check` (`gui/authoring/check.ts`, `backend/editor/project/folderCheck.ts`) is the one list of
  problems, for the CLI, CI, the MCP server and the editor.

## The host

The **host** holds the graph in use and talks to everything outside. **Frontends** talk only to the
host. A **graph core** -- the runtime, in this process or a program of its own -- runs graphs.

```
 a tool's gui, a page of your own, a script       the editor
        │  runtime API: /api/runtime/…, by name         │  editor API: /api/graphs/…, /api/ai/…, /api/execute/…
        ▼                                               ▼
 ┌────────────────────────── host: backend/deployment/host ───────────────────────────────┐
 │ the session: what nodes keep, what the GUI's blocks hold, state.json, the clock,        │
 │ the queue of rounds; start points, end points, packages                                 │
 └───────────────────────────────────────────┬─────────────────────────────────────────────┘
                                             │  core protocol (backend/deployment/runtime/protocol.ts)
                                             ▼  in this process, or a program on stdin/stdout
 ┌──────────────────────── graph core: backend/deployment/runtime (JavaScript) ────────────┐
 │ runs a round, one node, a node's example; what every node made last (the latch);        │
 │ the reuse cache; asks the model with its own client                                     │
 └─────────────────────────────────────────────────────────────────────────────────────────┘
```

The core is handed the graph definition as JSON (`Graph`, `graph/graph.ts`): the nodes with their
settings, ports and files, and the wires, as the project folder holds them; not the GUI. Today
there is one core, in JavaScript.

A server is **composed** by `backend/cli`: it answers the host's own routes, the GUI's route when it
has a GUI part (`serve({ gui })`), and the editor's routes when it serves the editor
(`serve({ editor })`). The tables are `API` and `GUI_API` in `backend/deployment/host/api.ts` and
`EDITOR_API` in `backend/editor/host/api.ts`. The server refuses to start when a route of a table it
holds has no handler, and the browser calls routes by name
(`frontend/deployment/gui/kit/api/client.ts`, the editor's `frontend/editor/api/client.ts`), so the
compiler checks both ends.

### The runtime API

For a tool's gui, a page of your own, a script. It knows start points and end points by name, never
a node. Every server answers it, the editor and a deployed tool alike. Every route answers JSON
except the stream; a refusal is `{ "detail": "…" }`.

| Route | What it does |
|---|---|
| `GET /api/runtime/interface` | What the graph offers: its start points (who starts each, what the graph reads of what it is sent, which blocks fire it), its end points, and its memory nodes (`state`: what can be watched without a round) |
| `GET /api/runtime/session` | The session now: what each start point was sent, what the end points handed back, what each memory node holds (`state`, by name, from the design's values on), what each block holds and shows, what a reset forgets (`kept`), the round, the clock |
| `GET /api/runtime/stream` | Server-sent events: `session` on connect and after every change, `round` as each round starts, goes and ends |
| `POST /api/runtime/requirements` | What a round started from the GUI still needs (a file nobody picked) |
| `POST /api/runtime/rounds` | Start a round at a start point (`{ event, values, answers, by }`); answers its id at once |
| `GET /api/runtime/rounds/:id` | One round as it goes, and what it handed back by name once it ended |
| `POST /api/runtime/rounds/:id/stop` | Stop it |
| `POST /api/runtime/run` | Start a round and wait for what it hands back: a function call |
| `POST /api/runtime/reset` | Forget what using the graph left behind |
| `GET /api/runtime/gui` | The gui: its blocks as designed, and how they connect by name (answered when the tool has a GUI) |
| `GET /api/runtime/ai-settings` | Which model the tool asks, and whether its settings file is there; no key, no path |
| `POST /api/files/browse` | A folder's entries, for a file picker (loopback only) |

With `by` (a block id) a round is one the GUI starts, refused unless that block fires the start
point; without it, a call, and `values` are the package as sent. Types and tables:
`backend/deployment/host/api.ts`; handlers: `toolRoutes` in `backend/deployment/host/serve.ts`;
tests: `backend/deployment/host/runtimeApi.test.ts`, `frontend.test.ts`.

### The editor API

For the editor only; a package leaves `backend/editor/` behind, so it answers none of these.

| Route | What it does |
|---|---|
| `POST /api/graphs/file/load`, `POST /api/graphs/file/save` | Open and save a graph file or a project folder (save replaces one only when told) |
| `GET /api/graphs/find`, `GET /api/files/find` | Find projects and files that a drop names (loopback only) |
| `GET /api/graphs/file/changes` | What changed on disk since the editor last asked |
| `POST /api/runtime/hold` | Hand the document being edited to the session, which goes on with it |
| `POST /api/runtime/application/start`, `POST /api/runtime/application/stop` | ▶ Run and ■ Stop: the clock and what starts by itself |
| `POST /api/execute/node` | One node on given inputs |
| `POST /api/execute/inputs` | What would arrive at a node now: what Pull takes its example from |
| `POST /api/execute/example` | ▶ Try: a node on the example its input.js holds |
| `POST /api/graphs/rounds/keep` | Keep a round that ran through as a test of the project |
| `POST /api/ai/generate`, `GET /api/ai/generate/progress` | ✨: write one of a node's files from the standard prompt and what was said to its chat (`ask`), or change the file there is as said (`refine.change`), and watch it being written |
| `POST /api/ai/generate-graph` | ✨ Describe a graph: design a whole graph from a description, or change one |
| `POST /api/windows/load`, `POST /api/windows/save` | The notebook: open a project with the windows it was made from (and whether the graph beside them is still what they made), and save windows as a project (`docs/notebook.md`) |
| `POST /api/windows/describe` | Windows from a description, or the windows there are changed as it says; nothing is written |
| `GET /api/ai/settings`, `POST /api/ai/settings`, `GET /api/ai/providers` | The two AI settings and the providers to choose from |
| `GET /api/mcp/servers`, `POST /api/mcp/servers/:name` | The tool servers in `mcp/` and what this machine has set up; set one up (install its packages, write its entry, start it once) (loopback only) |
| `POST /api/deploy/bundle` | Write the tool as a package zip |
| `POST /api/files/open-external` | Open a node's file in the person's own editor (loopback only) |

Types and table: `backend/editor/host/api.ts`; handlers: `editorRoutes` in
`backend/editor/host/routes.ts`.

### The core protocol

What the host asks of a graph core (`backend/deployment/runtime/protocol.ts`, `GraphCore`). One core
serves one session: what every node made last lives in it between rounds.

| Operation | Asked with | Answers |
|---|---|---|
| `hello` | -- | `protocol` (1), `language`, `core` |
| `open` | `held`: what every node was last left holding (from state.json) | nothing |
| `round` | `graph` as the round starts from it, `trigger` (a start point, or none for the whole graph), optionally `given` (known outputs) and `offline` (ask no model) | `result`; `nodes`: what every node keeps after it; `held` |
| `node` | `graph`, `node`, optionally `inputs` | the inputs it ran on, and its result |
| `example` | `graph`, `node`, `offline` | how it did on the example its definitions hold |
| `test` | `graph`, `offline`, `only` | every node's example, at every depth |
| `arriving` | `graph`, `node` | what would arrive at it, and the upstream run |
| `forget` | -- | nothing: what it keeps between rounds is gone (a reset) |
| `stop` | `of`: the request to stop | whether there was one; the stopped request still answers |

While a `round` goes, the core sends events: first `{ "type": "plan", "total": n }` (how many nodes
it runs), then the executor's `node_start`, `node_done`, `batch` and `activity`.

**The wire.** As a program of its own, a core speaks the same operations on stdin and stdout, one
JSON object per line. The host writes `{ "id": 7, "op": "round", … }`; the core writes any number
of `{ "id": 7, "event": … }` and then `{ "id": 7, "reply": … }` or `{ "id": 7, "error": "…" }`.
Nothing else goes to stdout; what a core says for people goes to stderr.
`node backend/cli/main.ts core` is the JavaScript core as such a program
(`backend/deployment/runtime/stdio.ts`). The host uses one when `TW_CORE` names it, a program and
its arguments; without it the core runs in the host's process
(`backend/deployment/runtime/localCore.ts`):

```bash
TW_CORE="node backend/cli/main.ts core" node backend/cli/main.ts --editor frontend/dist
```

**What every core must do**, whatever its language:

- answer `hello` first and at once: the host refuses a core that does not answer within 15 s, or
  speaks another `protocol`, and starts it again when asked after it ended;
- read requests while one goes: a `stop` arrives in the middle of a round;
- run on the same files as the host: paths in a graph resolve against the same working directory,
  and a path written in the graph file stays below it (see "Security boundaries");
- keep what every node made last between rounds: `held` comes in with `open` and goes back with
  every round, a value the host stores and does not read; what a round left is committed only when
  it ran to its end;
- say in `nodes` each node's state as its kind keeps it: a start point's `values`, a data node's
  fields by their names (`NodeDefinition.state`);
- run a round with `given` as a kept round: those nodes are handed their outputs instead of running,
  and nothing of it stands for the next round (no latch, no reuse);
- end when stdin ends, stopping what still goes; say an error as a sentence.

The shapes asked and answered (`Graph`, `Trigger`, `ExecutionResult`, `NodeResult`, `ExampleRun`) are
the types of `graph/graph.ts`, `graph/triggers.ts` and `backend/deployment/runtime/examples.ts`, as
JSON.

**What a core does not do:** the GUI, the session, state.json, the clock, the queue of rounds, HTTP.
It is handed a graph with what the round was sent already in its start points and what nodes keep
already in them, and it changes nothing it was handed.

**Conformance.** A core in another language is correct when it runs the examples as this one does:
`node backend/cli/main.ts test --offline examples/<name>` with `TW_CORE` naming it runs each node's
example and replays the kept rounds (`tests/*.json`), which came from real runs. Its model client
reads the same `ai-settings.json`. Held by `backend/deployment/runtime/core.test.ts` (a round, a
stopped round, the wire, a kept round replayed in this process and by `main.ts core` with the same
answer) and `backend/deployment/host/session.test.ts` ("a session whose rounds run in a graph core of
its own process"). `backend/architecture/hostDoc.test.ts` holds that every route of the three
tables and every operation of the protocol is in this document.

## Writing a plugin

A plugin is added in the source, not loaded at run time: the faces of a kind, each in its folder
under the same name, each registered in one list. The tests named below fail until all exist and
match.

**A node kind** (say `csv`):

1. `graph/nodes/csv/CsvNodeDefinition.ts`: extend `NodeDefinition`. Add it to `NODES`
   (`graph/nodes/registry.ts`) and to `NodeType` (`graph/graph.ts`).
2. `backend/deployment/runtime/nodes/csv/CsvNodeRunner.ts`: its `execute`; add it to
   `backend/deployment/runtime/nodes/registry.ts`.
3. `graph/authoring/nodes/csv/CsvNodeDesign.ts`: extend `NodeDesign` (how an AI writes it, what `check`
   says); add it to `graph/authoring/nodes/registry.ts`. If ✨ Describe a graph should offer it: a
   `graphAuthorNote` (`backend/editor/graph/graphPrompt.test.ts`).
4. `frontend/editor/graph/nodes/csv/CsvNodeGuiBuilder.ts` and its panel: add it to `NODE_BUILDERS`
   (`frontend/editor/document/elements/registry.ts`); the compiler then asks for its entry in
   `NODE_KINDS` (`frontend/editor/document/model/nodeKinds.ts`).

Checked by `symmetry.test.ts`, `layers.test.ts` and both `shells.test.ts`.

**A block kind** (say `gauge`):

1. `gui/widgets/gauge/GaugeWidgetDefinition.ts`: extend `WidgetDefinition` (`StaticWidgetDefinition`
   for a block that is only design, `DisplayWidgetDefinition` for one that only shows). Add it to
   `gui/widgets/roster.ts` and to `WidgetKind` (`graph/graph.ts`).
2. If it has anything to tell the model that designs a graph: `gui/authoring/widgets/gauge/GaugeWidgetDesign.ts`,
   listed in `gui/authoring/widgets/roster.ts`.
3. `frontend/editor/gui/widgets/gauge/`: `GaugeWidgetGuiBuilder.ts` and, if it has settings, a
   panel, in `frontend/editor/gui/widgets/roster.ts`; and the view,
   `frontend/deployment/gui/widgets/gauge/GaugeWidgetView.tsx`, in `BLOCKS`
   (`frontend/deployment/gui/surface/blocks.ts`).

Checked by `symmetry.test.ts`, and by `boundary.test.ts`, since a deployed GUI draws the view.

**A language.** Everything that is JavaScript about writing a body is the code node's `Language`
(`JAVASCRIPT` in `graph/authoring/nodes/code/javascript.ts`; the interface is in
`graph/authoring/generation.ts`): the file, the fence, what the model is told, the empty `run` it
completes and the limits. How a written body is run is the runtime's
(`backend/deployment/runtime/nodes/body.ts`). The writer (`backend/editor/graph/generate.ts`) names
no language. Two ways:

1. **A node kind for it**: a node kind as above whose design declares its own `Language`, and a
   `CodeService` (`graph/nodes/Runtime.ts`) that runs bodies in that language, beside `nodeCode` in
   `backend/deployment/runtime/services.ts`.
2. **A whole graph in that language**: a second graph core -- a program in that language that speaks
   the core protocol above and runs whole graphs. `TW_CORE` names it; the conformance run above
   checks it. The rules that are language-neutral (ports, wiring, what starts a round) are in the
   definitions of `graph/`, so a core takes them from there.

A JavaScript body runs in a Node process of its own under `--permission` (child processes, addons,
workers no; the network stays open), with no key in its environment. It reads the working directory
except the settings file, and its own folder; it writes its own folder only. Node's permission flags
only allow, so the entries it may read are listed for every body; a link in the working directory
that points at the settings file is followed anyway. A file elsewhere reaches it as an input typed
`file_path`, which the executor reads for it. It ends after `TW_BODY_TIMEOUT_MS`. It talks in lines
(`backend/deployment/runtime/services.ts`; `services.test.ts`, `sandbox.test.ts`):

```
stdin   {"inputs": {…}, "calls": ["llm", …], "windows": […]}   what it is handed
stdout  ␞tell-and-wire:call {"id": 1, "name": "llm", "args": …}   a question (␞ is U+001E)
stdin   {"id": 1, "result": …}  or  {"id": 1, "error": "…"}      its answer
stdout  ␞tell-and-wire:result {…}                               what it made; the run is over
```

`node.llm` is answered by the process running the graph (`backend/deployment/runtime/nodes/ai/ask.ts`),
at most 25 times per run (`TW_MAX_LLM_CALLS`).
`windows` is what a body that draws needs to know and need not ask: the blocks of the GUI that show what its node hands on,
each with its size in cells and in pixels (`gui/windows.ts`); the body has it as `node.windows`, empty without a GUI.

## The package

`backend/editor/project/deploy/bundle.ts` writes it; `bundle.test.ts` runs one from a temporary
folder. A package carries:

- the project folder (without `history.md` or the files ✨ was given);
- the code by an allow-list of folders, `graph/`, `gui/`, `backend/cli/` and `backend/deployment/`,
  without tests, fixtures and anything in a folder named `editor`, `notebook` or `authoring`;
- `web/` with the built `gui.html`, what it references and `licenses.txt` (when the graph has a
  gui and `npm run build` ran);
- the files the graph starts on, those from outside the project in `data/` (one that is missing or
  over 50 MB stops the package; a settings file is never carried, whatever folder holds it);
- the project's own `frontend/`;
- `LICENSE`, a `README.md`, `run.cmd` / `run.sh` (which run `node backend/cli/main.ts .`, with
  `--serve` when there is a GUI), and `MANIFEST.json`: the package and its version, the tool, and
  every file in it.

It leaves out `backend/editor/`, `backend/architecture/`, the editor's folders in `graph/` and
`gui/`, tests and `state.json`. Its model comes from the `TW_AI_*` variables or `ai-settings.json`
beside `run.sh`. The downloadable editor (`scripts/package.mjs`) is not a package: it carries
everything, with Node.

## Security boundaries

- Everything binds to loopback; nothing asks who is calling. The editor refuses to start bound wider
  (`--host`, a container) unless `TW_EDITOR_ON_NETWORK=1` says the port is open to nobody else (the
  Docker image sets it: `docker-compose.yml` publishes on the host's `127.0.0.1`). A tool bound wider
  prints a warning, and every route is open to whoever reaches the port, except the ones `api.ts`
  marks `local` (browsing, finding projects and files, opening a node's file in an editor) and a
  round that sets a picker's file or folder: those answer 403. What stays open includes opening and
  saving at any path, running code and the settings with their keys.
- A request must name `127.0.0.1`, `localhost`, `[::1]` or a name in `TW_ALLOWED_HOSTS`, come from
  the server's own host (the scheme is not compared: a TLS proxy in front shows https) and send
  `application/json` (`foreignRequest`, `backend/deployment/host/http.ts`). Every page it serves
  forbids being framed (`servePage`).
- A graph is a file somebody may hand you, so it reaches files in two ways only
  (`backend/deployment/runtime/confine.ts`, `confine.test.ts`). A path written in the graph file -- a
  start or end point's `path` -- is relative and stays below the working directory (links followed);
  `check` says so, and a run refuses. A path that comes at run time from the person -- a file chosen
  on the GUI, a call's values, the command line -- is theirs. The files that hold keys or a command
  (the settings files) are never read, written or listed, whoever names them, and a code body does
  not see them. A tool served beyond loopback (`--host`) touches nothing outside its folder at all,
  so a remote caller's values cannot name a local path. An end point's file names are made of its
  ports' ids with anything outside letters, digits, `_`, `.` and `-` replaced.
- A graph can name an MCP tool server by name only. What a name starts, or calls, is written on this
  machine, under `mcp_servers` in the machine's settings file (`TW_SETTINGS`, else
  `~/.tell-and-wire/settings.json`): not in a settings file in the working directory or the project
  folder, and a URL is never written in a graph (`settings.test.ts`, `mcp.test.ts`). A server starts
  without this process's keys and tokens (its own `env` gives what it needs). The MCP server confines
  paths to `--mcp-root`, never opens a file that holds keys and filters keys from its answers
  (`mcpServer.test.ts`, "confinement").
- The editor sets up the tool servers in `mcp/` (`mcpServers.ts`, `local` routes): the command it
  writes into the machine's settings file comes from the server's own `config.json` and the Node that
  runs it, never from a request, and a request can fill in only the environment variables that config
  lists. npm runs with a fixed command and no install scripts. A server's `settings.html` runs in a
  sandboxed frame with no network and talks to the editor through three messages (`pageDocument.ts`,
  `ServerPage.tsx`).
- Word and PDF files are the `documents` tool server's (`mcp/documents`): the nodes hand a Word file
  on as its path, a PDF or a picture as itself for a model, a text file as text, and refuse a file
  over 8 MB unread (`graph/nodes/fileContent.ts`).
- A code body runs in a sandbox of its own: see "A language" above (`sandbox.test.ts`).

## Environment variables

Besides the provider keys and addresses in the README:

| Variable | What it sets |
|---|---|
| `TW_SETTINGS` | The one settings file, instead of looking for `ai-settings.json` |
| `TW_AI_PROVIDER`, `TW_AI_MODEL` | The AI the nodes run on, over the file |
| `TW_WRITING_PROVIDER`, `TW_WRITING_MODEL` | The AI that writes (✨), over the file; the nodes' where unset |
| `TW_CORE` | A graph core program to run rounds in |
| `TW_ALLOWED_HOSTS` | Host names a server bound wider than loopback answers to, comma-separated |
| `TW_EDITOR_ON_NETWORK` | Lets the editor start bound beyond this machine, when nobody else can reach its port |
| `TW_NO_BROWSER` | Do not open a browser on start |
| `TW_TIMEOUT_MS`, `TW_MCP_TIMEOUT_MS` | How long a model call (10 min) or an MCP tool call (2 min) may take; `0`: no limit |
| `TW_MAX_TOKENS`, `TW_MAX_LLM_CALLS` | A model answer's token budget (4096; an answer cut off by it is an error); `node.llm` calls per body run (25) |
| `TW_AI_ATTEMPTS`, `TW_AI_RETRY_DELAY` | How often a model call is tried when the line drops, the provider is busy or the answer is empty (3, at most 10), and the wait before the second try in seconds, doubled each time (1, at most 60) |
| `TW_AI_REPAIRS` | How often an ai node asks again when its answer cannot be used -- no JSON, a key left out, a list that is not one, cut off -- unless the node says (`config.repairs`): 2; `0` asks once |
| `TW_BODY_TIMEOUT_MS` | How long a code body may run (10 min); `0`: no limit |
| `TW_NO_PAUSE` | A failing `run.cmd` does not wait for a key |

## Checks

`npm run typecheck` (`graph/`, `gui/`, `backend/` and `frontend/`), `npm run lint` (hooks in `frontend/`, a promise nobody
waits for in `graph/`, `gui/` and `backend/`), `npm run build` (`frontend/dist`; the package test
needs it), `npm test` (Vitest in `graph/`, `backend/` and `frontend/`), `npm run licenses` (every installed package
against the licences it may have, `scripts/licenses.mjs`). CI (`.github/workflows/ci.yml`) runs
these, then `node backend/cli/main.ts check` and `test --offline` over every folder in `examples/`,
and `node --test scripts/launcher.test.mjs scripts/package.test.mjs` (the package test on Linux and
Windows). A green push to `main` rebuilds the `latest` pre-release and the container image; a
`vX.Y.Z` tag publishes a release with the Windows and Linux zips.
