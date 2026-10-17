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
It imports nothing of the editor; the two know each other by a route and a query only (`docs/notebook.md`).

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

## The files

The main drawing with the most important files in each box, and where a round and a writing with the model take place: [architecture-key-files.svg](images/architecture-key-files.svg). Drawn by area, one box a directory with each file and its role: [definitions](images/architecture-files-1-definitions.svg), [backend](images/architecture-files-2-backend.svg), [pages of a tool, the notebook and the build](images/architecture-files-3-frontend-tool.svg), [the editor's page](images/architecture-files-4-frontend-editor.svg), [tool servers and root](images/architecture-files-5-mcp-root.svg); how the layers stand on one another is in [architecture-detail.svg](images/architecture-detail.svg).

Where each source file is and what it does: one row a file, by area. A kind of node or block has the same set of files in several
places (the faces under "Elements"); those are one row each, written as a pattern -- `<kind>` is the kind's folder name
(`start`, `input_picker`), `<Kind>` its class prefix, `*` anything in a name. Tests sit beside what they test, as
`<name>.test.ts`, and are not listed; the project files a tool is made of are under "The project folder".
`backend/architecture/files.test.ts` holds this section to the tree: every source file is in it, and every row is a file there is.

### The root and its scripts

| File | What it does |
|---|---|
| `.eslintrc.node.cjs` | The lint rules of `graph/`, `gui/` and `backend/` (`npm run lint`); the page has its own, `frontend/.eslintrc.cjs`. |
| `scripts/dev.mjs` | Development: the backend on :8000 and Vite on :3000, in one terminal |
| `scripts/editorProcess.mjs` | The editor as a process on a port: which one it is, and how to stop it |
| `scripts/launch.mjs` | What every product's start file does once: stop the one running on the port, install on first use, build a stale page, start the server, open the browser. |
| `scripts/licenses.mjs` | Every package this workspace installs, held to the licences it may come under |
| `scripts/package-notebook.mjs` | Build the downloadable package of the notebook alone: `npm run package:notebook`, after `npm run build:notebook` |
| `scripts/package.mjs` | Build the downloadable package: Tell & Wire, ready to run, nothing to install |
| `scripts/start-notebook.mjs` | Start the notebook: `node scripts/start-notebook.mjs [--port 8100]`, which start-notebook.cmd, .ps1 and .sh call |
| `scripts/start.mjs` | Start the editor: `node scripts/start.mjs [--port 8000]`, which start.cmd, start.ps1 and start.sh call |
| `scripts/stop-notebook.mjs` | Stop the notebook: `node scripts/stop-notebook.mjs [--port 8100]`, which stop-notebook.cmd, .ps1 and .sh call |
| `scripts/stop.mjs` | Stop the editor: `node scripts/stop.mjs [--port 8000]`, which stop.cmd, stop.ps1 and stop.sh call |
| `start-notebook.cmd`, `start-notebook.ps1`, `start-notebook.sh` | Start the notebook (:8100), the same way (`scripts/start-notebook.mjs`). |
| `start.cmd`, `start.ps1`, `start.sh` | Start the editor (:8000): install on first use, build what is stale, restart one that runs, open the page. All three call `scripts/start.mjs`. |
| `stop-notebook.cmd`, `stop-notebook.ps1`, `stop-notebook.sh` | Stop the notebook (`scripts/stop-notebook.mjs`). |
| `stop.cmd`, `stop.ps1`, `stop.sh` | Stop the editor, and only a Tell & Wire server (`scripts/stop.mjs`). |

### `graph/`: the graph definition

| File | What it does |
|---|---|
| `graph/authoring/generation.ts` | How an AI writes an element's body, declared by the element |
| `graph/authoring/handedOn.ts` | A graph without what only writing it needs, for what leaves the project: a deployed tool, a served GUI, a run, an MCP answer, a model asked to change it. |
| `graph/authoring/history.ts` | history.md: the whole conversation with the model about one node |
| `graph/authoring/nodes/NodeDesign.ts` | What only building a node asks |
| `graph/authoring/nodes/<kind>/<Kind>NodeDesign.ts` | The **design** of each node kind: how an AI writes it, what `check` says about it, what a package must carry for it. |
| `graph/authoring/nodes/code/javascript.ts` | The language a code node's body is written in, as whoever writes and tries it needs it said: JavaScript, run by the Node the graph runs on |
| `graph/authoring/nodes/registry.ts` | The registry of designs: what the editor asks of each kind of node |
| `graph/batching.ts` | Running a node once per item instead of once for the list |
| `graph/editor/prompts.ts` | The prompts a node is written with: the standard texts of each chat, and what every one sends |
| `graph/editor/pull.ts` | Pull: the definition a node's wires imply |
| `graph/editor/scheduleEdit.ts` | Changing a schedule (`graph/schedule.ts`): where a card may be put, and putting it |
| `graph/endpoints.ts` | Where each model provider is, unless a person says otherwise |
| `graph/errors.ts` | What more than one layer says, said once: two answers and what an error says |
| `graph/fileInputs.ts` | Handing an element a file's content instead of its name |
| `graph/files/changes.ts` | What changed in a project folder, as whoever has it open is told |
| `graph/files/definition.ts` | A node's two definitions, as the files its folder keeps them in: what comes in (`input.js`) and what goes out (`output.js`) |
| `graph/files/flow.ts` | `graph-flow.json`: the graph's name and every wire -- nothing about any node |
| `graph/files/logic.ts` | What a node does, as an object rather than as a field name |
| `graph/files/names.ts` | What an id is called on disk |
| `graph/files/nodesFile.ts` | `graph-nodes.json`: the list of a graph's nodes -- what each one is |
| `graph/files/prompts.ts` | The prompt an ai node runs with, and the variables a prompt names |
| `graph/graph.ts` | The graph as it is stored and as a run sees it |
| `graph/interface.ts` | What a graph offers whoever uses it from outside, under names |
| `graph/nodes/ElementDefinition.ts` | What an element is: the half every package carries |
| `graph/nodes/NodeDefinition.ts` | A node: the element branch that sits on the canvas and runs in the graph |
| `graph/nodes/Runtime.ts` | The world an element is allowed to touch |
| `graph/nodes/<kind>/<Kind>NodeDefinition.ts` | The **definition** of each node kind (start, ai, code, data, end, subgraph): what it is, whatever the language -- see "Elements". |
| `graph/nodes/fileContent.ts` | What a node that reads a file is handed |
| `graph/nodes/folderListing.ts` | Reading a file or a folder: the start point's and the file-picker block's, one behaviour at two levels, implemented once |
| `graph/nodes/images.ts` | Turning a picture on disk into something that can be looked at or sent, and the one place where the size of a picture or a PDF read is limited |
| `graph/nodes/ownPath.ts` | A path written in a graph file -- a start point's, an end point's -- is the graph's, and a graph may come from a stranger |
| `graph/nodes/port.ts` | How a port is written: its id, name, type and what it reads of a package. |
| `graph/nodes/registry.ts` | The registry of node kinds: every node a graph can hold, as its definition |
| `graph/nodes/subgraph/boundary.ts` | Where a graph inside a node meets the node that holds it |
| `graph/order.ts` | The order a graph runs in: levels over the wires, and how a loop may pass through a data node. |
| `graph/schedule.ts` | The schedule: the order a graph runs in, and where its nodes stand |
| `graph/schema.ts` | What a node's outputs look like, written down: its output interface |
| `graph/triggers.ts` | What starts a graph: start points, started by a GUI, a call or by themselves; and which nodes a start point runs. |
| `graph/usesModel.ts` | Whether running a graph needs an AI: one node of it asks a model |
| `graph/wiring.ts` | Whether a graph's wiring holds together: every node its own id, every edge between two nodes that exist, on ports those nodes have |

### `gui/`: the GUI definition

| File | What it does |
|---|---|
| `gui/authoring/check.ts` | What is wrong with a graph: the one list of problems that `check`, CI, the MCP server and the editor all read. |
| `gui/authoring/gui.ts` | What only the editor asks of the GUI: whether it is sound, what to tell the model that writes one, what a package carries |
| `gui/authoring/widgets/DisplayWidgetDesign.ts` | The design of a block that only shows an end point's value. |
| `gui/authoring/widgets/WidgetDesign.ts` | What only building the GUI asks of a widget: what to tell a neighbour, the model that writes a graph, a package |
| `gui/authoring/widgets/<kind>/<Kind>WidgetDesign.ts` | The **design** of each block kind: what only building the GUI asks of it. |
| `gui/authoring/widgets/roster.ts` | The design of each kind of block: what only building the GUI asks of it |
| `gui/editor/complete.ts` | A GUI written whole, with the start and end points its blocks need |
| `gui/gui.ts` | The GUI a graph is used through: its blocks, and how each connects itself |
| `gui/interface.ts` | What a GUI adds to a graph's interface: which blocks fire a start point and what the GUI sends with it. |
| `gui/notebook/edit.ts` | Changing windows: the small edits a person makes to a page, each one a function from windows to windows |
| `gui/notebook/fromGraph.ts` | The windows a graph says: `windowsToGraph` (`windows.ts`) read backwards |
| `gui/notebook/page.ts` | The page: headings, text, lists and gaps as in the plainest editor of pages, with the windows standing in them |
| `gui/notebook/pageModel.ts` | What a page is made of, before anything is done to it: which blocks it has, and the one a tool without a page of its own gets |
| `gui/notebook/read.ts` | Windows read from JSON: a file, or a model's answer |
| `gui/notebook/windows.ts` | Windows: a tool said as a page of fixed windows, each one a short list of cells |
| `gui/size.ts` | How large a block of the GUI is, in cells and in pixels |
| `gui/widgets/DisplayWidgetDefinition.ts` | The definition of a block that only shows the end point it shows hands back. |
| `gui/widgets/StaticWidgetDefinition.ts` | The definition of a block that is part of the GUI, not of the graph: a heading, a divider, a gap. |
| `gui/widgets/WidgetDefinition.ts` | A widget: the element branch that sits on the GUI a graph is used through |
| `gui/widgets/<kind>/<Kind>WidgetDefinition.ts` | The **definition** of each block kind (text, divider, spacer, input_picker, text_io, select, slider, button, chat, plot_window, table, image_view). |
| `gui/widgets/chat/value.ts` | What a chat block holds: the conversation so far and the message in hand |
| `gui/widgets/chat/compact.ts` | A long conversation, shortened by the model: what a chat block sends of it, how much that is, and what is asked to shorten it |
| `gui/widgets/input_picker/dropped.ts` | A file dropped onto a file picker: where it is on the machine the tool runs on |
| `gui/widgets/roster.ts` | The blocks a GUI is built from |
| `gui/widgets/select/choice.ts` | What a dropdown offers and what it stands at |
| `gui/widgets/slider/range.ts` | What a slider's stored settings mean: its range, its step and the number it stands at |
| `gui/widgets/text/role.ts` | How a piece of prose is set: a first-level heading, a second-level heading, a paragraph or a caption |
| `gui/widgets/text_io/role.ts` | What a box of text is for: typed into, shown in, or both |
| `gui/widgets/text_io/text.ts` | A value, as a box of text reads it |
| `gui/windows.ts` | The room what a node hands on is shown in |
| `gui/windows/grid.ts` | What a window and the block in it keep of their room, in pixels: the numbers a drawing function is told and the delivered page draws with. |
| `gui/windows/order.ts` | Which windows to run, and in what order |
| `gui/windows/owns.ts` | Whose a node of a round is: a window's nodes are named after it. |
| `gui/windows/scheme.ts` | The colour scheme: one choice for the whole tool, from a closed set, and the CSS variables a frontend paints it with |

### `backend/deployment/`: host, runtime and what a package carries

| File | What it does |
|---|---|
| `backend/deployment/gui/hooks.ts` | What a GUI does around the graph in use, as the host asks it |
| `backend/deployment/host/api.ts` | The wire between a GUI and the server: the host's routes, and what travels each way |
| `backend/deployment/host/browse.ts` | Walking the machine's files, for a picker |
| `backend/deployment/host/chat.ts` | A chat block's two asks of the model besides a round: the window it has, and a long conversation shortened |
| `backend/deployment/host/find.ts` | Finding a file that was dropped onto a page: a browser hands a page the name and size of a dropped file, never where it is |
| `backend/deployment/host/http.ts` | The few HTTP things a route handler needs, and nothing that knows a route |
| `backend/deployment/host/lifecycle.ts` | What a served tool holds while it runs, and how it lets go of it |
| `backend/deployment/host/port.js` | The reference client of the GUI port (`port.ts`, "The GUI port" in docs/architecture.md): what a page written by hand uses to meet its tool |
| `backend/deployment/host/port.ts` | The GUI port: the connection points a page has to the tool it shows |
| `backend/deployment/host/rounds.ts` | The rounds of one session: one at a time, watched while they go, stopped when asked |
| `backend/deployment/host/serve.ts` | The server: the built gui or editor, and the routes of `api.ts` |
| `backend/deployment/host/session.ts` | The graph in use, and what using it leaves behind |
| `backend/deployment/host/states.ts` | States saved under a name: what a person or a memory node keeps, written out on request and read back on request |
| `backend/deployment/project/folder.ts` | A graph as a folder: the project |
| `backend/deployment/project/layout.ts` | Where things are in an install, and where a package keeps what is not the project's own |
| `backend/deployment/runtime/ai/fixtures/echo-mcp-server.mjs` | A tool server small enough to read in one go, for `mcp.test.ts` |
| `backend/deployment/runtime/ai/mcp.ts` | Tools for a model, from MCP servers |
| `backend/deployment/runtime/ai/providers.ts` | The model clients: a table of OpenAI-compatible providers, plus those with a shape of their own. |
| `backend/deployment/runtime/ai/settings.ts` | Where the model configuration comes from |
| `backend/deployment/runtime/ai/window.ts` | How much a model takes in at once, and where that is known from: the person, the provider, or a guess |
| `backend/deployment/runtime/clock.ts` | The clock of a tool that runs by itself: what its start points start by themselves, one round after another |
| `backend/deployment/runtime/confine.ts` | Which files a graph may reach |
| `backend/deployment/runtime/examples.ts` | A node's example: what its input.js gives one call, held to its output.js |
| `backend/deployment/runtime/executor.ts` | Running a graph: initialise, wire, order, execute |
| `backend/deployment/runtime/latch.ts` | What every node last produced, held until it runs again |
| `backend/deployment/runtime/localCore.ts` | The JavaScript graph core, in the host's own process: the executor and the runners, behind the protocol (`protocol.ts`) |
| `backend/deployment/runtime/lru.ts` | A map that keeps the *limit* most recently used entries: reading one counts as using it |
| `backend/deployment/runtime/nodes/NodeRunner.ts` | What a node does when the graph runs |
| `backend/deployment/runtime/nodes/<kind>/<Kind>NodeRunner.ts` | The **runner** of each node kind: what executes it in a round. |
| `backend/deployment/runtime/nodes/ai/ask.ts` | Asking a model, as a node does it -- and as a body may ask for it to be done |
| `backend/deployment/runtime/nodes/ai/prompt.ts` | What an ai node actually sends, put together in one place |
| `backend/deployment/runtime/nodes/body.ts` | How a body -- the JavaScript of a code node, written by a person or a model -- is run. |
| `backend/deployment/runtime/nodes/registry.ts` | The registry of runners: what runs each kind of node in a deployed tool |
| `backend/deployment/runtime/offline.ts` | A run that asks no model: the services as they are, and a model that says so when it is asked |
| `backend/deployment/runtime/protocol.ts` | What the host asks of a graph core, and what a core answers |
| `backend/deployment/runtime/reuse.ts` | What a node produced last time, for a run that only needs it as context |
| `backend/deployment/runtime/services.ts` | The runtime's services on a machine with a filesystem: Node today, Deno unchanged |
| `backend/deployment/runtime/stdio.ts` | A graph core as a program of its own: the protocol (`protocol.ts`) over stdin and stdout, one JSON object per line |
| `backend/deployment/runtime/test/fakes.ts` | What tests stand a run on when the world it runs in is not what they are about |

### `backend/authoring/`, `backend/cli/`, `backend/architecture/`

| File | What it does |
|---|---|
| `backend/architecture/filesUnder.ts` | Every file under a folder, for the structure tests: no hidden names, no links followed, nothing that vanishes mid-read. |
| `backend/authoring/ask.ts` | What writing with a model has in common: the transcript of its calls, how a fenced answer is read, how a writing fails. |
| `backend/authoring/product.ts` | Switching from one product to the other: find the one that is running, or start it, and say where it is |
| `backend/authoring/productApi.ts` | The wire between a product and the page it serves, for the way to the other product: who this is, and a switch to the other |
| `backend/authoring/write.ts` | A graph written as a folder: the project, saved |
| `backend/cli/cli.ts` | Running a graph from a command line |
| `backend/cli/main.ts` | The executable entry point: `node backend/cli/main.ts graph.json` |

### `backend/editor/`

| File | What it does |
|---|---|
| `backend/editor/graph/brief.ts` | The variables of a node's prompts, filled from what the node and the graph hold. |
| `backend/editor/graph/generate.ts` | Writing a node's files with a model |
| `backend/editor/graph/generateGraph.ts` | Writing a whole graph with a model: one designed from a description, or the graph there is, changed as asked |
| `backend/editor/graph/generatePrompts.ts` | What the model is told when ✨ writes a node's files, and when it designs or changes a whole graph: the prose around what the node and the graph hold |
| `backend/editor/graph/graphPrompt.ts` | What the model is told before it designs a whole graph |
| `backend/editor/host/api.ts` | The wire between the editor and the server: the routes only the editor serves, and what travels |
| `backend/editor/host/commands.ts` | The commands only the editor has: `check`, `test`, one node, `--bundle`, `--mcp`. |
| `backend/editor/host/mcp/confine.ts` | What the MCP server's tools may touch, and what they may say |
| `backend/editor/host/mcp/spec.ts` | What the MCP server's nine tools say of themselves: limits, descriptions, and the guide to writing a graph. |
| `backend/editor/host/mcp/tools.ts` | The nine tools, over one folder: what each does, and nothing of how it is reached |
| `backend/editor/host/mcp/transport.ts` | stdio: JSON-RPC, one message per line |
| `backend/editor/host/mcpServer.ts` | Tell & Wire, offered to an assistant outside it |
| `backend/editor/host/routes.ts` | What the server answers only while a graph is being built |
| `backend/editor/project/deploy/bundle.ts` | Handing the graph to someone else |
| `backend/editor/project/deploy/launchers.ts` | The two files that start something from the folder they sit in: run.sh and run.cmd |
| `backend/editor/project/deploy/zip.ts` | A zip archive, written by hand |
| `backend/editor/project/files.ts` | The editor's view of the machine's files: finding projects and dropped files, and handing a node's file to the editor the person works in |
| `backend/editor/project/folderCheck.ts` | What is wrong with a project folder, and the `check` command's answer |
| `backend/editor/project/keptRounds.ts` | A round kept as a test: what it was started with and what it handed back, run again without asking a model |
| `backend/editor/runtime/mcpServers.ts` | The tool servers that come with this installation, for the editor |
| `backend/editor/runtime/settings.ts` | The editor's settings dialog, and the one file behind it |

### `backend/notebook/`

| File | What it does |
|---|---|
| `backend/notebook/api.ts` | The wire between the notebook and its server: the routes only the notebook's server answers, and what travels |
| `backend/notebook/describe.ts` | Windows from a sentence: a tool said in words, or the windows there are changed as asked |
| `backend/notebook/files.ts` | What the notebook reads and writes of a project besides the project's own files: nothing, any more |
| `backend/notebook/main.ts` | The notebook's start file: `node backend/notebook/main.ts [--port 8100] [--host 127.0.0.1]` |
| `backend/notebook/routes.ts` | The routes of the notebook: open and save a project made of windows, and make windows from a sentence |

### `frontend/deployment/`: what a delivered tool's browser loads

| File | What it does |
|---|---|
| `frontend/deployment/gui/GuiAISettings.tsx` | The read-only dialog that says which model a delivered tool calls and where to change that. |
| `frontend/deployment/gui/GuiApp.tsx` | The delivered tool's page: loads the GUI design, listens to the session, draws the header, the GUI or the windows, and the dialogs. |
| `frontend/deployment/gui/GuiStates.tsx` | The State dialog: save what the tool keeps under a name, load or replace a saved state. |
| `frontend/deployment/gui/kit/api/client.ts` | A GUI's end of the wire: the routes of `backend/deployment/host/api.ts`, called by name |
| `frontend/deployment/gui/kit/api/errorText.ts` | The message to show a user for a failed request |
| `frontend/deployment/gui/kit/api/port.ts` | The built-in GUI's end of the GUI port (`backend/deployment/host/port.ts`, "The GUI port" in docs/architecture.md) |
| `frontend/deployment/gui/kit/api/session.ts` | The session as a GUI sees it: what its start points were sent, what its outputs showed, the round going or gone -- as the server tells it, by name |
| `frontend/deployment/gui/kit/api/start.ts` | What the GUI does to its tool: begin a round, stop it, start over |
| `frontend/deployment/gui/kit/dialogs/FileBrowserDialog.tsx` | The file browser: choose a file, a folder or a name to save under, on the machine the tool runs on. |
| `frontend/deployment/gui/kit/dialogs/PathField.tsx` | A path box with Browse beside it, which takes a dropped file too; and the file-types field. |
| `frontend/deployment/gui/kit/dialogs/RequirementsDialog.tsx` | The "before running" window: the file or folder a run still needs from each picker. |
| `frontend/deployment/gui/kit/guiWidget.ts` | One block of a GUI, as the GUI holds it |
| `frontend/deployment/gui/kit/index.css` | The stylesheet of a delivered tool and of the editor: base rules, the scheme's variables, the grid. |
| `frontend/deployment/gui/kit/layout.ts` | The GUI a graph is used through, as a document rather than a canvas |
| `frontend/deployment/gui/kit/ui/Button.tsx` | The one button of dialogs, panels and the GUI. |
| `frontend/deployment/gui/kit/ui/Chip.tsx` | A small pill that names one thing: a start point a block sends to, an end point it shows. |
| `frontend/deployment/gui/kit/ui/ErrorBoundary.tsx` | Catches a module that did not load (a page older than its server) and says so instead of a blank page. |
| `frontend/deployment/gui/kit/ui/Markdown.tsx` | A small Markdown renderer built as React elements, not a library. |
| `frontend/deployment/gui/kit/ui/Modal.tsx` | The one modal shell: backdrop, panel, header, footer, Escape and focus kept inside. |
| `frontend/deployment/gui/kit/ui/QuickPick.tsx` | A searchable pick list with icons, for the palette and quick insert. |
| `frontend/deployment/gui/kit/ui/Toggle.tsx` | An on/off switch with its label read aloud. |
| `frontend/deployment/gui/kit/ui/ToolbarButton.tsx` | An icon button of a toolbar, with its words in the tooltip and for screen readers. |
| `frontend/deployment/gui/kit/ui/cut.ts` | *text*, or its first *max* characters and an ellipsis: a value said in a line, cut short |
| `frontend/deployment/gui/kit/ui/scheme.ts` | The colour scheme as the frontend uses it: the scheme's data (`gui/windows/scheme.ts`) as CSS variables |
| `frontend/deployment/gui/kit/ui/theme.ts` | The editor's colour vocabulary, and the few style objects built from it |
| `frontend/deployment/gui/kit/ui/tone.ts` | How a block sits on the GUI, chosen from a closed set rather than picked from a colour wheel |
| `frontend/deployment/gui/main.tsx` | The entry of a delivered tool's page (`gui.html`): refuses a file dropped beside a picker, mounts `GuiApp`. |
| `frontend/deployment/gui/surface/CallForms.tsx` | A form for each start point a call starts, prefilled with what it was sent last: the GUI of a tool that has no blocks. |
| `frontend/deployment/gui/surface/DeliveredHeader.tsx` | The bar above a delivered tool: its name, how the last run went, Stop; the host adds its own buttons. |
| `frontend/deployment/gui/surface/GuiSurface.tsx` | The GUI a graph shows: its blocks on one grid. The deployment boundary: what a delivered tool can reach is decided by what this imports. |
| `frontend/deployment/gui/surface/LiveGui.tsx` | The GUI in use: the design with what the session holds, listening to the session for itself. |
| `frontend/deployment/gui/surface/RunResult.tsx` | One output of the graph as a GUI shows it, for a tool with no block for it. |
| `frontend/deployment/gui/surface/blocks.ts` | What a block is, to the GUI: the half of a widget that is delivered |
| `frontend/deployment/gui/surface/guiInUse.ts` | The GUI as designed and how it connects to the graph by name: what a host knows before anything is used. |
| `frontend/deployment/gui/surface/useContainerCell.ts` | The current square-cell size of whatever element a ref is on (a sixteenth of its width, capped). |
| `frontend/deployment/gui/surface/useRound.ts` | Starting a round the way every GUI does: ask what it needs, then begin it with what the GUI holds. |
| `frontend/deployment/gui/widgets/SaveButton.tsx` | "Save" in the corner of what a block shows: a text, a chart, rows as a file of their own. |
| `frontend/deployment/gui/widgets/WidgetView.ts` | What a view of a block is handed, and the registry of views by block kind. |
| `frontend/deployment/gui/widgets/<kind>/<Kind>WidgetView.tsx` | The **view** of each block kind: how a delivered tool draws it. |
| `frontend/deployment/gui/widgets/download.ts` | Saving what a block shows as a file: a text as .txt, a chart as .svg, rows as .csv. |
| `frontend/deployment/gui/widgets/plot_window/PlotChart.tsx` | The chart a plot block draws, as SVG, from the figure a node made. |
| `frontend/deployment/gui/widgets/table/figures.ts` | How a delivered tool sets the cells of a table: figures to the right, equal decimals, thousands told. |
| `frontend/deployment/windows/LiveWindows.tsx` | The page of windows in use: design with what the session holds, and how a window's button runs the ones before it. |
| `frontend/deployment/windows/WindowsSurface.tsx` | The page of framed windows a tool made of windows shows, stacked where a window is too narrow. |
| `frontend/deployment/windows/inline.tsx` | The words of a delivered page as they are read: bold, italic, code and links. |
| `frontend/deployment/windows/windowRuns.ts` | Running a window: the ones before it first, each as a round of its own |
| `frontend/deployment/windows/windowsInUse.ts` | The windows of a gui, read off its blocks, and which of them are current |

### `frontend/editor/`

| File | What it does |
|---|---|
| `frontend/editor/api/client.ts` | The editor's end of the wire: the host's routes and the editor's own, called by name |
| `frontend/editor/app/App.tsx` | The editor's page: documents, menus, tabs, dialogs, the open and save of projects, and the link to the notebook. |
| `frontend/editor/app/ChangeBar.tsx` | The bar under the canvas: say what to change in the graph, and a model changes it. |
| `frontend/editor/app/FileMenu.tsx` | The File menu: its entries, whether each can be chosen now and, if not, why. |
| `frontend/editor/app/GraphProblems.tsx` | What `check` says of the open graph, as a list to read and to jump from. |
| `frontend/editor/app/HelpDialog.tsx` | Help: getting started and the user guide, a chapter at a time. |
| `frontend/editor/app/JsonDialog.tsx` | Paste or read a graph as JSON, and say what is wrong with it. |
| `frontend/editor/app/Notices.tsx` | The cards the editor tells the person things on: saved, failed, written, stopped. |
| `frontend/editor/app/ProblemsChip.tsx` | "N problems" in the bottom bar: what `check` says of the graph being built. |
| `frontend/editor/app/RunReportDialog.tsx` | The report of a run, in words, with a way to copy it. |
| `frontend/editor/app/SettingsDialog.tsx` | The settings dialog: each provider's endpoint and key, and which AI runs and which writes. |
| `frontend/editor/app/Sidebar.tsx` | The palette: each node kind under the heading it says it goes under. |
| `frontend/editor/app/SubgraphTrail.tsx` | Where you are among nested graphs, and the way back out. |
| `frontend/editor/app/Toolbar.tsx` | The toolbar: save, run, generate all, the notebook, help and settings. |
| `frontend/editor/app/ViewTabs.tsx` | The views by one word each: the graph (nodes and wires) and the GUI (blocks). |
| `frontend/editor/app/browseStart.ts` | Where a file browser opens: the folder a path is in. |
| `frontend/editor/app/dialogs/Question.tsx` | A question with its answers, asked of the person in a dialog. |
| `frontend/editor/app/dialogs/useDialogs.tsx` | Dialogs asked from code and answered as a promise: "may this graph be replaced?" is a question to await. |
| `frontend/editor/app/fields/FolderListing.tsx` | How a start point's folder listing is set and shown: types, subfolders and what it found. |
| `frontend/editor/app/fields/ProviderModelSelect.tsx` | The provider and model pickers, with what each costs and whether it is set up. |
| `frontend/editor/app/help.ts` | The help: the getting-started page and the user guide, cut into chapters |
| `frontend/editor/app/main.tsx` | The entry of the editor's page. |
| `frontend/editor/app/notebookLink.ts` | The way from the editor to the notebook: a switch to it (`switchTab`), and the project a link names. |
| `frontend/editor/app/runReport.ts` | The report of a run in words anybody can read, and as plain text to send. |
| `frontend/editor/app/windowDrops.ts` | What is dropped anywhere on the editor's window: a graph to open |
| `frontend/editor/document/application.ts` | The application ▶ Run starts, as an IDE runs the program it builds |
| `frontend/editor/document/diskChanges.ts` | What the server said changed in the project on disk, held until the open graph can take it. |
| `frontend/editor/document/elements/ElementGuiBuilder.ts` | The face of an element that exists so a person can build with it |
| `frontend/editor/document/elements/registry.ts` | Every element's GuiBuilder, by the name the file format gives it: the mirror of `graph/nodes/registry.ts` |
| `frontend/editor/document/elements/resultPreview.ts` | What a value looks like, small, on a node's card: a line, a count, a sketch or a picture. |
| `frontend/editor/document/graph.ts` | The graph as the editor sees it |
| `frontend/editor/document/graphAsk.ts` | Asking the model to design a graph or change the open one: the one request the File menu and the bar under the canvas make. |
| `frontend/editor/document/graphChange.ts` | What a change of the whole graph would change: the rule part of the bar under the canvas. |
| `frontend/editor/document/model/baseNodeConfig.ts` | Every setting's one default, as the editor's typed node config. |
| `frontend/editor/document/model/givenFiles.ts` | The files a code or an ai node is given to write its definitions from |
| `frontend/editor/document/model/graphDoc.ts` | A graph as the editor holds it, as pure functions: read from a file, a paste or a model; laid out for the canvas. |
| `frontend/editor/document/model/gui.ts` | The GUI of the document: blocks that connect themselves to the graph's start and end points by name |
| `frontend/editor/document/model/heading.ts` | A node's heading: never empty |
| `frontend/editor/document/model/ids.ts` | The id something new is given: what it is, and a number only when that is taken |
| `frontend/editor/document/model/nodeKinds.ts` | What a node of each type *is* when it is made, and what a file keeps of it |
| `frontend/editor/document/model/placement.ts` | Where a node stands on the canvas, read off the node. |
| `frontend/editor/document/model/ports.ts` | The ports a node has, where they follow from its settings |
| `frontend/editor/document/model/scheduleLayout.ts` | Where a schedule (`graph/schedule.ts`) puts the cards on the canvas, and where a card being dragged would land |
| `frontend/editor/document/model/wires.ts` | A wire as the canvas holds it, turned into the edge a graph file saves -- and what wiring does to the ports it joins, a port renamed or gone |
| `frontend/editor/document/store/diskActions.ts` | Taking in what another editor changed in the project folder on disk |
| `frontend/editor/document/store/editorScheme.ts` | The editor's own colour scheme: the four the GUI has, or whichever the system is in |
| `frontend/editor/document/store/executionStatus.ts` | Whether a node result carries usable output, and the tone its status is shown in. |
| `frontend/editor/document/store/flushPanels.ts` | What a node panel has typed and not yet written (400 ms after the last key) is written before anything that saves, runs, undoes or leaves the graph |
| `frontend/editor/document/store/graphStore.ts` | The editor's store: the open graph and its views, composed of the actions in this folder. |
| `frontend/editor/document/store/handoff.ts` | The document handed to the server's session, and the rounds of that session shown on the canvas. |
| `frontend/editor/document/store/history.ts` | The open document's undo history: whole serialised graphs, oldest first, and what makes a named change one step (`commit`) |
| `frontend/editor/document/store/nodeData.ts` | What ReactFlow carries per node on the canvas: the graph node |
| `frontend/editor/document/store/nodeEdits.ts` | Adding, wiring, changing and deleting nodes: the store's editing actions |
| `frontend/editor/document/store/noticeBoard.ts` | What the editor tells the person, in one place: saved, opened, failed, written, stopped |
| `frontend/editor/document/store/portRenames.ts` | Which port became which, across an edit of a node's ports |
| `frontend/editor/document/store/scheduleActions.ts` | The schedule in the store: where the cards stand, where a card held would land, and the routes of wires |
| `frontend/editor/document/store/subgraphs.ts` | Going into the graph a node holds, and out again: the frames of the levels the canvas is inside, each with the undo history of its own level |
| `frontend/editor/graph/canvas/GraphCanvas.tsx` | The canvas: the schedule's cells, the cards and wires, drag, drop and what a wire let go on empty canvas offers. |
| `frontend/editor/graph/canvas/GraphNodeView.tsx` | A node's card on the canvas: a header and one row per port. |
| `frontend/editor/graph/canvas/ResultPreview.tsx` | What a node made last, small, on its card: a line, a count, a sketch or a picture. |
| `frontend/editor/graph/canvas/RoutedEdge.tsx` | A wire drawn through the cells the schedule routes it through. |
| `frontend/editor/graph/canvas/ScheduleLayer.tsx` | The table behind the cards: columns, rows and the plus of each cell. |
| `frontend/editor/graph/canvas/ThinOut.tsx` | The button that moves every card to the earliest column its wires allow. |
| `frontend/editor/graph/canvas/inView.ts` | A box on screen, in pixels: where it starts and how big it is |
| `frontend/editor/graph/canvas/nodeRemoval.ts` | Whether Delete or Backspace on the canvas removes what is selected. |
| `frontend/editor/graph/canvas/useGlide.ts` | Cards that are put somewhere else glide there instead of jumping. |
| `frontend/editor/graph/canvas/wireLook.ts` | How a wire is drawn: soft grey, in the accent where it touches what is selected. |
| `frontend/editor/graph/fields/RunOncePerItem.tsx` | The setting that runs a node once per item of a list, and how many at once. |
| `frontend/editor/graph/fields/RunOptions.tsx` | The run settings of a node: catch failures and the like. |
| `frontend/editor/graph/fields/WhatRuns.tsx` | Says what runs when a node runs: its file or its runner, in a sentence. |
| `frontend/editor/graph/node/DataFieldsForm.tsx` | The fields of a data node: their names and starting values. |
| `frontend/editor/graph/node/FilePane.tsx` | The pane that edits one file of a node, whatever the file is kept as. |
| `frontend/editor/graph/node/FilesLine.tsx` | The files a definition is written from, folded under their file, a chip each. |
| `frontend/editor/graph/node/LastRun.tsx` | What a node made in its last run, for reading. |
| `frontend/editor/graph/node/NodeView.tsx` | A node opened in place: its files, their chats and its settings. |
| `frontend/editor/graph/node/PartChat.tsx` | The chat of one file of a node: what was typed, what was asked, what came of it. |
| `frontend/editor/graph/node/PortsEditor.tsx` | The ports of a node, named by the person who wrote it. |
| `frontend/editor/graph/node/SettingsPane.tsx` | Everything about a node that is set and not written: its kind's settings, its ports, its run options. |
| `frontend/editor/graph/node/WritingStatus.tsx` | What the model is doing for the node and what it last said. |
| `frontend/editor/graph/node/nodeDraft.ts` | A node's edits as they reach the graph: a setting, ports, and what an output that catches failures says. |
| `frontend/editor/graph/node/nodePanel.ts` | A node's panel, as its changes reach the graph |
| `frontend/editor/graph/node/portIds.ts` | What a node's port ids must be, for the node panel to store them |
| `frontend/editor/graph/node/useGraphSweep.ts` | The toolbar's Generate: every node of the graph written, front to back |
| `frontend/editor/graph/node/usePartGenerate.ts` | Everything the node view asks of the model, once: one state machine for the whole node. |
| `frontend/editor/graph/node/writeFile.ts` | Writing one file of a node (input, output or body) the way the node view and the toolbar's Generate do. |
| `frontend/editor/graph/nodes/NodeGuiBuilder.ts` | How a person edits a node, in the browser: the mirror of `graph/nodes/NodeDefinition.ts` |
| `frontend/editor/graph/nodes/<kind>/<Kind>NodeGuiBuilder.ts`, `frontend/editor/graph/nodes/<kind>/<Kind>Node*Panel.tsx` | The **builder** of each node kind -- how a person edits it -- and the panels its settings are drawn in. |
| `frontend/editor/graph/nodes/ai/ServerPage.tsx` | The settings page a tool server brings for itself, in a sandboxed frame. |
| `frontend/editor/graph/nodes/ai/ToolServerDialogs.tsx` | Add and set up a tool server: install, write its entry, start it once. |
| `frontend/editor/graph/nodes/ai/ToolServers.tsx` | The tool servers an AI node may use: which are set up on this machine and how each stands. |
| `frontend/editor/graph/nodes/ai/pageDocument.ts` | The document a tool server's page stands on: the editor's colours and form controls. |
| `frontend/editor/graph/views/ChatPane.tsx` | One chat: the exchanges, the words said and what came of them. |
| `frontend/editor/graph/views/NodeHeader.tsx` | The header of an opened node: its heading and a step to a neighbour. |
| `frontend/editor/graph/views/NodeViewLayout.tsx` | The layout of an opened node: panes with their headers. |
| `frontend/editor/graph/views/RowList.tsx` | The list of a node's files, each with whether anything is written in it yet. |
| `frontend/editor/graph/writing/CodeField.tsx` | The code box (CodeMirror) a body or a definition is written in. |
| `frontend/editor/graph/writing/CodeSurface.tsx` | The look of the code box for the editor's scheme. |
| `frontend/editor/graph/writing/FileChip.tsx` | A file's chip: whether it is written, and a way to open it in the person's own editor. |
| `frontend/editor/graph/writing/GenerationTranscript.tsx` | The transcript of a writing: what was asked and what came back, for the writing that ran and the one that runs. |
| `frontend/editor/graph/writing/HeadingField.tsx` | A node's heading, which is never empty. |
| `frontend/editor/graph/writing/LiveGeneration.tsx` | What is happening while a generate button is busy: the prompt, the context, whether the model has answered. |
| `frontend/editor/graph/writing/TryExample.tsx` | Try: run a node on the example its input definition holds, and say what came of it. |
| `frontend/editor/graph/writing/definitionPorts.ts` | A node's definitions, following its ports as they are renamed and removed |
| `frontend/editor/graph/writing/droppedFile.ts` | A file dropped onto a node: taken as its path or its content, with no browse dialog. |
| `frontend/editor/graph/writing/exampleFile.ts` | The files a node's input definition is written from |
| `frontend/editor/graph/writing/generation.ts` | ✨ for one node: what its chats ask the backend, and what comes back, written in |
| `frontend/editor/graph/writing/generationContext.ts` | What generation tells the model of the world around a node: its inputs' sources, its outputs' targets, the block that shows it. |
| `frontend/editor/graph/writing/graphContext.ts` | {Context}: the graph around a node, in words, as ✨ is told it |
| `frontend/editor/graph/writing/graphSweep.ts` | Generating a whole graph, front to back |
| `frontend/editor/graph/writing/perItem.ts` | "Run once per item", and "whole list" beside it: how a node takes the lists that arrive, set on its ports and its settings together |
| `frontend/editor/graph/writing/pull.ts` | Pull as the editor does it: what feeds each input of a node and where each output is written, read off the graph. |
| `frontend/editor/graph/writing/readAsRun.ts` | Files, read the way a run reads them |
| `frontend/editor/graph/writing/useGenerate.ts` | Run a generation and keep what is being written, and said when it was stopped. |
| `frontend/editor/graph/writing/useTyped.ts` | The text of a box whose stored form comes back tidied, kept as it is typed. |
| `frontend/editor/gui/ApplicationView.tsx` | The application Run starts, shown: the tool as its recipient gets it, on the document being edited. |
| `frontend/editor/gui/DesignerPalette.tsx` | The block palette of the GUI tab. |
| `frontend/editor/gui/DesignerSurface.tsx` | The GUI plus the few affordances needed to build one: select, move, resize, drop. |
| `frontend/editor/gui/DesignerTab.tsx` | The GUI tab: palette, surface, the heading and the panel of the selected block. |
| `frontend/editor/gui/GuiHeading.tsx` | The tool's name and description, edited above the GUI. |
| `frontend/editor/gui/GuiSettings.tsx` | What the right panel shows while no block is selected: the GUI's colour scheme. |
| `frontend/editor/gui/KeptFold.tsx` | What a block holds in the session, folded under it, one line. |
| `frontend/editor/gui/OnTheGraph.tsx` | How a block meets the graph: which start point it sends to, which end point it shows. |
| `frontend/editor/gui/QuickInsert.tsx` | "/" on the GUI: type what you want, press Enter, keep going. |
| `frontend/editor/gui/TopGraphOnly.tsx` | Shows the GUI only where a GUI can be: in the graph at the top. |
| `frontend/editor/gui/WidgetEditor.tsx` | The panel of the selected block: its label, how it meets the graph, its own settings. |
| `frontend/editor/gui/guiFromGraph.ts` | A GUI drawn from the graph: the blocks it still lacks |
| `frontend/editor/gui/guiWrite.ts` | Changing the GUI: the one way a block is added, changed, moved or removed |
| `frontend/editor/gui/roundWords.ts` | Who sent what began a round, in words. |
| `frontend/editor/gui/typedValues.ts` | What the designer shows in a block somebody has typed into |
| `frontend/editor/gui/widgets/DisplayWidgetGuiBuilder.ts` | The mirror of `gui/widgets/DisplayWidgetDefinition.ts`: a block that only shows what the end point it shows hands back -- a chart, a table, an image |
| `frontend/editor/gui/widgets/DisplayWidgetPanel.tsx` | The panel of a block that only shows an end point's value. |
| `frontend/editor/gui/widgets/StaticWidgetGuiBuilder.ts` | The mirror of `gui/widgets/StaticWidgetDefinition.ts`: a widget that is part of the GUI rather than part of the graph -- a heading, a rule, a gap |
| `frontend/editor/gui/widgets/WidgetGuiBuilder.ts` | How a person edits a block, in the browser: the mirror of `gui/widgets/WidgetDefinition.ts` |
| `frontend/editor/gui/widgets/<kind>/<Kind>WidgetGuiBuilder.ts`, `frontend/editor/gui/widgets/<kind>/<Kind>Widget*Panel.tsx` | The **builder** of each block kind -- how a person edits it on the GUI tab -- and the panel of its own settings. |
| `frontend/editor/gui/widgets/roster.ts` | The widgets a GUI is built from: the mirror of `gui/widgets/roster.ts`, and the only place that knows the whole set |
| `frontend/editor/gui/widgets/text/TextInPlace.tsx` | A heading or a paragraph typed where it stands on the GUI. |

### `frontend/notebook/`, `frontend/gui-notebook/`, `frontend/graph-notebook/`

| File | What it does |
|---|---|
| `frontend/graph-notebook/Cells.tsx` | The cells of a window, as the design of the list (A2) has them: Ask, Do, Show, one white card each, a sentence in each |
| `frontend/graph-notebook/Debug.tsx` | The debug window: every round the notebook ran, node by node -- what each got, what it made, why one did nothing |
| `frontend/graph-notebook/Dock.tsx` | Under the page: the cells of the open window (the list, A2), the window as a graph, and the debug window |
| `frontend/graph-notebook/Haube.tsx` | Under the hood: the window as the graph it is, left to right, with what runs between written on the wires. |
| `frontend/gui-notebook/Page.tsx` | The page: written like any page -- headings, text, bullets, gaps -- with windows standing in it to be used |
| `frontend/gui-notebook/WindowBox.tsx` | A window on the page, to be used: its inputs, a button, and what came out -- at the size its elements give it |
| `frontend/notebook/App.tsx` | The notebook: a page to write on and use, and under it the cells of a window, the window as a graph, and the debug window |
| `frontend/notebook/Start.tsx` | The first page (A1): one sentence about what the tool should do, and the tool is built from it |
| `frontend/notebook/document/api.ts` | The notebook's own end of the wire: the host's routes called by name, with nothing of the graph editor's client in it |
| `frontend/notebook/document/links.ts` | The way from the notebook to the editor: a switch to it (`switchTab`), and the project a link names. |
| `frontend/notebook/document/runs.ts` | Running windows: the notebook hands the windows, as the graph they are, to the host, and runs a window by a round |
| `frontend/notebook/document/status.ts` | Where a window stands, in a word, for the chip on it and the status of its cells |
| `frontend/notebook/document/store.ts` | The open notebook: the document, where it is kept, undo, what its windows made, and what is asked of the server. |
| `frontend/notebook/document/values.ts` | What a window's inputs hold to begin with, and the ids the page and the graph share |
| `frontend/notebook/elements/Boundary.tsx` | A box that shows what a step made and cannot be taken down by it. |
| `frontend/notebook/elements/Browse.tsx` | Choosing a file or a folder on the machine the notebook runs on, and where a project is kept |
| `frontend/notebook/elements/Chart.tsx` | The notebook's own charts: bars, lines, points, with their labels. |
| `frontend/notebook/elements/ModelSaid.tsx` | What the model sent back when its answer could not be made into windows, beside the error. |
| `frontend/notebook/elements/Widgets.tsx` | What a window is made of, drawn the notebook's own way: boxes to put something in and boxes to show what came out |
| `frontend/notebook/elements/figures.ts` | How the notebook sets the cells of a table: figures to the right, equal decimals, thousands told. |
| `frontend/notebook/elements/inline.tsx` | The words of the page as a web page reads them: bold, italic, code and links. |
| `frontend/notebook/index.html` | The notebook's page. |
| `frontend/notebook/look.ts` | How the notebook itself looks, light or dark: its own choice, kept in the browser (not in any file: it is the person's, not the tool's) |
| `frontend/notebook/main.tsx` | The entry of the notebook's page. |
| `frontend/notebook/notebook.css` | The notebook's own look: a page to write on, windows to use, and the cells of one beneath it |

### `frontend/`: the build and the page entries

| File | What it does |
|---|---|
| `frontend/.eslintrc.cjs` | The lint rules of the page (`npm run lint --workspace frontend`): above all the rules of hooks. |
| `frontend/gui.html` | The page of a delivered tool; built next to `index.html`. |
| `frontend/index.html` | The editor's page. |
| `frontend/postcss.config.js` | PostCSS for the page's styles (Tailwind). |
| `frontend/tailwind.config.js` | Tailwind for the page: no colours here, every colour is a token in `deployment/gui/kit/ui/theme.ts`. |
| `frontend/test/runAnswers.ts` | What the definitions make of a node, as the editor's tests compare it |
| `frontend/vite.config.ts` | The build of the editor's and the delivered tool's pages (two entries, shared chunks). |
| `frontend/vite.licenses.ts` | Writes the licences of what the build bundles next to the page. |
| `frontend/vite.notebook.config.ts` | The build of the notebook's page, apart from the editor's. |

### `mcp/`: the tool servers that come with it

| File | What it does |
|---|---|
| `mcp/documents/scripts/licenses.mjs` | Every package this folder installs, held to the licences it may come under |
| `mcp/documents/settings.html` | The settings page this server brings for the editor to show. |
| `mcp/documents/src/chunk.ts` | A long Markdown text, cut into chunks that each stand on their own |
| `mcp/documents/src/documents.ts` | Reading a file: find it (inside the folders it was given), take its text out, hand it over in pieces |
| `mcp/documents/src/docx.ts` | A Word document's text as Markdown: headings, lists, bold and italic, tables |
| `mcp/documents/src/errors.ts` | Something that went wrong in a way worth telling the person, in words they can act on |
| `mcp/documents/src/info.ts` | What this server calls itself |
| `mcp/documents/src/main.ts` | Starts the server on stdin and stdout, for the folders given as arguments (or listed in TW_DOCS_ROOTS) |
| `mcp/documents/src/paging.ts` | A long text in pieces that end where a person would stop. |
| `mcp/documents/src/pdf.ts` | The text layer of a PDF, a page at a time |
| `mcp/documents/src/roots.ts` | Which files this server may read: those inside the folders it was started with, and no others |
| `mcp/documents/src/server.ts` | The MCP server: `read_document` and `list_documents` |
| `mcp/documents/src/testFiles.ts` | Files for the tests to read, written by hand: a PDF, a Word document, a zip |
| `mcp/web/scripts/licenses.mjs` | Every package this folder installs, held to the licences it may come under |
| `mcp/web/settings.html` | The settings page this server brings for the editor to show. |
| `mcp/web/src/chunk.ts` | A long Markdown text, cut into chunks that each stand on their own |
| `mcp/web/src/extract.ts` | The readable part of a web page, as Markdown, with what the page says about itself |
| `mcp/web/src/info.ts` | What this server calls itself, and the product token a site's robots.txt can name |
| `mcp/web/src/ip.ts` | Whether an address is one a public web server can have |
| `mcp/web/src/main.ts` | Starts the server on stdin and stdout |
| `mcp/web/src/page.ts` | Reading a page: fetch it (politely, and only the public web), take out what is worth reading, hand it over in pieces |
| `mcp/web/src/paging.ts` | A long text in pieces that end where a person would stop. |
| `mcp/web/src/robots.ts` | robots.txt read as RFC 9309 says, so the server reads only what a site allows. |
| `mcp/web/src/safeFetch.ts` | One GET of a public web address, with what a tool that reads other people's pages on someone's own machine must not do without |
| `mcp/web/src/server.ts` | The MCP server: one tool, `read_page` |
| `mcp/web/src/testServer.ts` | A web server on this machine for the tests to read from -- the one place the private-address rule is switched off, and only by the test that says so |

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
   package does not carry it. **What is written depends on the session** (`Keeps` in `session.ts`): a
   graph being made (the editor, the notebook, ▶ Try) writes everything, so a restart goes on where it
   was; a tool in use (a served package) writes only what a person or a memory node keeps -- the
   memory nodes' fields and what the GUI's blocks hold and show -- and never the latch or the last
   results. What a start point was sent is kept in memory for the session and is in no file
   (`NodeDefinition.writtenToFile`): the blocks hold what a person set, and a restart starts from the design. Code and AI nodes remember nothing of their own: what a node made
   last stands on its wire in memory until the node runs again or the session ends, and is not saved.
3. **When.** A round runs on a working copy. One that ran to its end commits; one that was stopped
   or could not start commits nothing.
4. **The design wins.** A kept value is held with the design value it started from. When its node
   or block is gone, or its design changed, that value is dropped and said.
5. **Saved states.** Besides `state.json`, which a session writes by itself, a person can save what is kept
   under a name and load it again (`states/<name>.json`, plain JSON beside `state.json`): the same
   rules as for a design that changed (a value with no place any more is dropped and said), a load
   waits for the round that goes, and nothing else is in it -- no latch, no results. The GUI offers it
   (**State** in the header of a delivered tool); a site of its own calls the same routes.
6. **Start over.** **↺ Start over** (`POST /api/runtime/reset`) empties the session and deletes the
   file; the App tab lists what it forgets under *What using it keeps*.
7. **One session per server**, its id in every runtime route
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
| `GET /api/runtime/port` | The GUI port: every connection point by name, with its role, method, path and what it is for (see "The GUI port") |
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
| `GET /api/runtime/states`, `POST /api/runtime/states/save`, `POST /api/runtime/states/load` | States saved under a name (`states/` beside `state.json`; `backend/deployment/host/states.ts`): list them; save what a person or a memory node keeps now (the memory nodes' fields, what the GUI's blocks hold and show -- never the latch, the results or what a start point was sent); take one back in place of what is kept (saving and loading are loopback only) |
| `GET /api/runtime/chat/context`, `POST /api/runtime/chat/compact` | What a chat block asks of the model besides a round: the window of the model the tool runs on and how that is known (`set`, `provider`, `assumed`), and the oldest turns of a conversation shortened into one summary by that model (one call) |
| `GET /api/files/find` | Files of a name and size under the tool's own folder: for a file dropped onto a picker, whose path a browser never says (loopback only) |

With `by` (a block id) a round is one the GUI starts, refused unless that block fires the start
point; without it, a call, and `values` are the package as sent. Types and tables:
`backend/deployment/host/api.ts`; handlers: `toolRoutes` in `backend/deployment/host/serve.ts`;
tests: `backend/deployment/host/runtimeApi.test.ts`, `frontend.test.ts`.

### The GUI port

A tool's page -- the built-in GUI, a hand-written `frontend/index.html` in the project, a more sophisticated site, a test, a phone
app -- is a different program from the tool. It meets the tool at **connection points**, which are routes of the runtime API sorted by
what a page does there (`backend/deployment/host/port.ts`, `GUI_PORT`; the compiler holds that every route is placed):

| Role | Points | What a page does there |
|---|---|---|
| **describe** | `interface`, `gui`, `toolAiSettings` | Ask what the tool offers by name -- start points, end points, memory nodes -- and, if it has a GUI, the GUI as designed (its blocks, and how they connect by name). |
| **start** | `requirements`, `startRound`, `runRound`, `stopRound`, `reset` | Do something to the tool: ask what a round still needs, begin it (or begin it and wait for its answer: a call), stop it, start over. |
| **return** | `session`, `stream`, `round` | Hear what the tool tells: the session now and after every change, each round as it starts, goes and ends -- whoever began it. |
| **state** | `states`, `saveState`, `loadState` | Keep what the tool keeps under a name, and take it back. |
| **files** | `browse`, `findFile` | Name a file or folder on the machine the tool runs on. |
| **model** | `chatContext`, `compactChat` | Ask the tool's model for what is not a round: the window it has, and a long conversation shortened. |

*Start* and *return* are apart on purpose. A round a page begins answers with its id at once; what comes of it arrives on the stream
like any other round, so a page is built as two halves that know nothing of each other and meet only in what they show.

**The server says what the points are.** `GET /api/runtime/port` answers `{ version, points }`: each point by name with its role,
method, path (with its `:params`), a line of what it is for, and whether only the person at the keyboard may call it (`local`). A page
that reads its paths there hard-codes none, and `version` says when a point changed in a way an old page would not survive.

**A page of one's own** needs no build. Every tool serves a plain-JavaScript client of the port at `/tw/port.js`
(`backend/deployment/host/port.js`, carried by every package):

```html
<script type="module">
  import { connect } from '/tw/port.js';
  const tool = await connect();
  const { interface: what } = await tool.describe();          // describe
  tool.watch({ round: (round) => show(round), session: (view) => draw(view) });   // return
  await tool.start('picked', { values: { pick: 'b' } });      // start
  await tool.states.save('Tuesday');                          // state
</script>
```

Put the page in the project as `frontend/index.html` (`frontendOf`): a served project shows it in place of the built-in GUI, and a
bundle carries the folder whole. The client is the port's other end, nothing more: `connect({ base })` meets a tool on another origin,
and `connect({ fetch })` takes another transport. `backend/deployment/host/port.test.ts` runs a tool through it.

**The built-in GUI** is one page on the same port, and splits the same way (`frontend/deployment/gui/kit/api/`): `port.ts` is its end
of the points (`StartPort`, `ReturnPort`, the HTTP implementation, `setPort` to plug another in), `start.ts` what it does to the tool
(`startRound`, `startOver`, `stopRound`), `session.ts` the store the return half feeds. Nothing else of the GUI reaches the wire of a
round -- `port.test.ts` scans for it -- so replacing the transport, or the whole page, touches no widget.

### The editor API

For the editor only; a package leaves `backend/editor/` behind, so it answers none of these.

| Route | What it does |
|---|---|
| `POST /api/graphs/file/load`, `POST /api/graphs/file/save` | Open and save a graph file or a project folder (save replaces one only when told) |
| `GET /api/graphs/find` | Find project folders that a drop names (loopback only) |
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
| `GET /api/product`, `POST /api/switch` | Both products answer these (`backend/authoring/product.ts`): who this is and whether the other can be reached from this install; and the way to the other -- it is found where it runs (the ports it may have taken), else started from the same install, and the person is sent to its address with the project to open (loopback only) |

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
  on as its path, a PDF or a picture as itself for a model, a text file as text (of any size), and refuse a picture or PDF
  over 8 MB unread (`graph/nodes/fileContent.ts`).
- A code body runs in a sandbox of its own: see "A language" above (`sandbox.test.ts`).

## Environment variables

Besides the provider keys and addresses in the README:

| Variable | What it sets |
|---|---|
| `TW_SETTINGS` | The one settings file, instead of looking for `ai-settings.json` |
| `TW_AI_PROVIDER`, `TW_AI_MODEL` | The AI the nodes run on, over the file |
| `TW_CONTEXT_TOKENS` | How many tokens the AI the nodes run on takes in at once, over `context_tokens` in the file; a chat block counts against it |
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
