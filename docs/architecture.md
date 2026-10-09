# Architecture

How Tell & Wire is put together: the parts and their folders, the rules between them,
how a round runs (the editor says *run*), the project format, the wrapper's APIs and the
core protocol, and how to extend it. Code comments explain each file; this explains how
the files relate. Where a test holds a claim, the test is named.

## The parts

| Part | Folder | What it holds |
|---|---|---|
| Graph editor, frontend | `frontend/graph-editor/` | `canvas/` (the graph on screen: one card for every kind), `node/` (one node opened: `NodeView`, its file panes, chats, settings, Pull), `views/` (the node view's drawing: layout, rows, chat; pure), `nodes/<kind>/` (each node kind's `<Kind>NodeGuiBuilder.ts` and settings panels), `authoring/` (a node's text, its ✨ files, Pull, ▶ Try), `fields/` |
| Graph editor, backend | `backend/graph-editor/` | `routes.ts` (the `editor` routes: save, open, run one node), `generate.ts`, `generatePrompts.ts` (what ✨ sends), `brief.ts`, `graphPrompt.ts` (✨), `files.ts`, `settings.ts`, `zip.ts` (Deploy), `mcpServer.ts` with `mcp/` (spec, confinement, tools, transport). Not in a deployed tool |
| The graph's code and execution | `graph/` | `graph.ts` (format types), `execution/` (the executor, what starts a round), `core/` (the graph core: `protocol.ts`, `localCore.ts`, `stdio.ts`, `node.ts`), `nodes/<kind>/` (`<Kind>NodeRunner.ts`, `registry.ts`, base classes), `ai/` (model client, settings), `authoring/` (definitions, ✨ prompts, Pull's file, a node's history, examples) |
| Gui editor, frontend | `frontend/gui-editor/` | `page/` (the Page and App tabs), `widgets/<kind>/` (each block kind's builder, view and panel), `runtime/` (the page a deployed tool serves) |
| Gui editor, backend | `backend/gui-editor/` | `session.ts` (the graph in use and its state), `rounds.ts` (the queue of rounds), `graphInterface.ts` (the graph's names), `widgets/<kind>/` (`<Kind>WidgetRunner.ts`), `widgets/page.ts` |
| The shell, frontend | `frontend/app/` | `App.tsx`, toolbar, File menu, settings, `store/` (the open document, undo), `document/`, `api/`, `ui/`, `dialogs/`, `fields/`, `elements/` (the builders' registry) |
| The shell, backend | `backend/app/` | `main.ts`, `cli/` (command line, deploy bundle, launchers), `http.ts`, `serve.ts`, `api.ts` (every route), `project/` (project folders, `check`, kept rounds) |

`graph/` and `backend/` are TypeScript that Node 24 runs as it is: no build, no runtime
dependencies. `frontend/` is React and Vite; `npm run build` writes `frontend/dist`.
`examples/` holds project folders that tests and CI run; `scripts/` the launchers, the
packaging and the licence check. One process serves the editor:
`node backend/app/main.ts --editor frontend/dist`. A deployed tool runs the same server
without `backend/graph-editor/`.

Node and the browser talk over HTTP through one table, `API` in `backend/app/api.ts`: every
route with its method, path, audience (`tool` or `editor`) and types. The server refuses to
start when a route has no handler, and the page calls routes by name
(`frontend/app/api/client.ts`), so the compiler checks both ends.

## Elements

Every kind of node and block is an **element**: one folder per kind, under the same name on
both sides.

| | Node (Graph tab) | Block (Page tab) |
|---|---|---|
| Runs (Node) | `graph/nodes/<kind>/<Kind>NodeRunner.ts` | `backend/gui-editor/widgets/<kind>/<Kind>WidgetRunner.ts` |
| Builds (browser) | `frontend/graph-editor/nodes/<kind>/<Kind>NodeGuiBuilder.ts`, panels | `frontend/gui-editor/widgets/<kind>/<Kind>WidgetGuiBuilder.ts`, `<Kind>WidgetView.tsx`, panel |
| Registry | `graph/nodes/registry.ts`, `frontend/app/elements/registry.ts` | `backend/gui-editor/widgets/roster.ts`, `frontend/gui-editor/widgets/roster.ts` |

Node kinds today: start, folder, ai, code, data, end, subgraph. Block kinds: text, divider,
spacer, input_picker, text_io, select, slider, button, chat, plot_window, table, image_view.

- A `Runner` is what runs; a `GuiBuilder` builds it, and a deployed page does not load one.
  The class trees mirror (`PlotWindowWidgetRunner → DisplayWidgetRunner → WidgetRunner →
  ElementRunner`), and each class is laid out under `── What it is`, `── Run time`,
  `── Build time`.
- An element owns everything about its kind: settings (`config()`), ports, `execute`, what
  a block sends, fires and shows (`sends`, `event`, `showsEnd`), how ✨ writes its body
  (`generation()`), what `check` says (`problems()`). Shared code asks the element.
- An element touches the world only through the `Runtime` it is handed
  (`graph/nodes/Runtime.ts`); `graph/core/node.ts` gives the real one, `graph/test/fakes.ts`
  a fake.
- **The page is no node.** It is the graph's list of blocks (`graph.page.blocks`). A block
  connects by name: the start points its data goes to (`sends_to`), the one using it fires
  (`fires`), the end point it shows (`shows`). `backend/gui-editor/widgets/page.ts` holds
  what a round, `check` and a bundle ask of the page.

## Dependency rules

| Rule (as of 2026-10-04) | Held by |
|---|---|
| `graph/` imports nothing from `backend/` or `frontend/` (its tests may). | `backend/app/shells.test.ts` |
| `backend/gui-editor/` does not import `backend/graph-editor/`; `backend/app/` reaches it only by dynamic import, when it serves the editor or `--mcp` (`serve.ts`, `cli/cli.ts`). A bundle carries `graph/`, `backend/app/`, `backend/gui-editor/` and leaves `backend/graph-editor/` out. | `backend/app/cli/bundle.test.ts` (runs a bundle from its own folder) |
| A deployed tool serves only the `tool` routes; `editor` routes answer 404. | `backend/app/serve.test.ts` |
| `backend/` imports nothing from `frontend/`. `frontend/` imports `graph/`, `backend/app/` and `backend/gui-editor/` for shared rules (which ports a node has, the route table, `check`), not `backend/graph-editor/`. | Read off the imports; no test |
| All imports are relative paths; there are no aliases. | Read off the imports; no test |
| Every node kind is a folder of the same name in `graph/nodes/` and `frontend/graph-editor/nodes/`; every block kind in `backend/gui-editor/widgets/` and `frontend/gui-editor/widgets/`. Names and class trees mirror; both registries list the same kinds. | `frontend/app/elements/symmetry.test.ts` |
| The page's layers import only downward: `app/ui` · `app/graph` · `app/document`, `app/api` · `app/store`, `graph-editor/views` · `app/dialogs` · the elements (`app/elements`, `app/fields`, `graph-editor/nodes`, `graph-editor/fields`, `graph-editor/authoring`, `gui-editor/widgets`) · `gui-editor/page`, `graph-editor/canvas`, `graph-editor/node` · `app` · `app/App`, `gui-editor/runtime` · `app/main`. | `frontend/app/layers.test.ts` |
| A deployed page reaches no `GuiBuilder`, no panel, nothing in `store/`, `canvas/`, `authoring/` or the shell's files; of `graph/` and `backend/` only the route table and the value shapes its views read. | `frontend/gui-editor/runtime/boundary.test.ts` |
| Every element member stands under one of the three bars. In a runner nothing above Build time reaches below it; a `GuiBuilder` has no run-time members. | `backend/app/times.test.ts`, `frontend/app/elements/times.test.ts` |
| No shell compares a node type or block kind with a literal. | `backend/app/shells.test.ts`, `frontend/app/elements/shells.test.ts` |
| `graph/` and `backend/` use no TypeScript that needs a compiler (enums, parameter properties, namespaces, decorators). | `backend/app/strippable.test.ts` |

## How a round runs

1. **Asked.** The page, a script, the clock or a caller asks the session
   (`backend/gui-editor/session.ts`) for a round at a start point, with values. A round the
   page starts is sent what the blocks that send to that start point hold (`pageSends`).
2. **Queued.** `rounds.ts` runs one round at a time, in the order asked, and turns progress
   into the snapshots a page follows on the stream.
3. **Run.** The core gets a working copy: the design, with what nodes keep and what the
   round was sent put in. `graph/core/localCore.ts` runs `executeGraph`
   (`graph/execution/executor.ts`): it orders nodes in levels, where a loop may only pass
   through a data node (the wire that reads it round the loop: `memoryReads`); runs what the start point is wired to, what
   follows and what those need (`triggers.ts`; a data node holds its value, so what writes it is not needed); per node, hands each input its `field` of
   the package, skips a node with nothing to do, reads files on `file_path` inputs
   (`fileInputs.ts`) and runs once or per item (`batching.ts`). A wired ◆ gate opens only for
   the round's start point or a `true`; a node that stands still keeps what it made last
   (`latch.ts`); unchanged context upstream is reused (`reuse.ts`).
4. **Settled.** Data nodes keep what arrived, field by field (`settleMemory`), and count the
   round (`endRound`). The session
   hands each end point's value to the blocks that show it (`settlePage`). A round that ran
   to its end commits and writes `state.json`.

## State

**Using a graph does not change its design.** A session holds one graph as it was handed
over, by the editor or a served tool, and what using it leaves behind. The rules are held
one by one in `backend/gui-editor/session.test.ts`.

1. **What state is.** Each node's kept values, as its element says (`NodeRunner.state`): a start
   point's `values`, a data node's fields and its `round`. The page's: what each block holds, by id (a
   value set, a conversation, what an end point handed back). Beside them: what every node
   made last (the latch, held by the graph core), what the page shows, how many rounds ran.
   Not state: the reuse cache, a round in flight.
2. **Where.** In the session, and in `state.json` beside `flow.json` (`<file>.state.json`
   beside a single graph file). Not part of the project: a save and `check` leave it alone,
   a bundle does not carry it.
3. **When.** A round runs on a working copy. One that ran to its end commits; one that was
   stopped or could not start commits nothing.
4. **The design wins.** A kept value is held with the design value it started from. When its
   node or block is gone, or its design changed, that value is dropped and said.
5. **Start over.** **↺ Start over** (`POST /api/runtime/reset`) empties the session and
   deletes the file; the App tab lists what it forgets under *What using it keeps*.
6. **One session per server**, its id in every runtime route
   (`backend/app/runtimeApi.test.ts`). The command line and `run_graph` keep nothing: they
   start from the design.

None of it marks the editor's document unsaved or is saved with it
(`frontend/app/store/graphStore.test.ts`: "shows what a round made, and keeps none of it in
the document"). Keys and the one AI setting live in `ai-settings.json`, not in a graph;
an AI node may name its own model in its settings.

## The project folder

A tool is saved as a project folder: a folder with a `flow.json`. Each fact is in one
place, keys are sorted, and an unchanged save changes no byte
(`backend/app/project/folder.test.ts`).

```
my_tool/
  flow.json            name, description, nodes (id -> kind), every wire as one line: "draw.data -> chart.csv"
  layout.json          positions and sizes on the canvas
  page/page.json       the page: a list of its blocks, each with sends_to / fires / shows
  nodes/<id>/
    node.json          heading, text and settings (only what differs from the default)
    interface.json     ports: { port, name, type, list?, required?, field? }
    input.js           what one call is handed: a JSDoc typedef, then one example as JSON  (code, ai)
    output.js          what one call returns, the same way; its keys are the outputs        (code, ai)
    code.js            the body, plus lines that run it alone on input.js's example          (code)
    prompt.md          the instructions sent to the model                                   (ai)
    data.json          the fields it starts with, an object; its ports follow them           (data)
    example.json       the same struct filled, an example of what it holds; absent, data.json stands in (data)
    history.md         every exchange with the model about this node
    flow.json, nodes/  the graph a subgraph holds: a project folder of its own              (subgraph)
  tests/<name>.json    kept rounds
  frontend/            optional: a page of the project's own, served at / instead of the built one
  state.json           not the project's: what using it left behind
```

- Which setting is which file is the element's to say (`NodeRunner.texts`). Every file is
  there from the start as a stub that reads back as nothing.
- `backend/app/project/folder.ts` reads and writes folders for the editor, the CLI, a served
  tool and the MCP server. The same graph as one `.json` file has everything inline.
- A save refuses to overwrite a file changed on disk since it was read; the editor takes
  outside changes in as one undo step.
- A kept round (`backend/app/project/keptRounds.ts`) holds `event`, `by`, `given` (what came
  from outside or from before, by node id: packages, model answers, memory) and `outputs`.
  `test` replays it with `given` handed in, asks no model, and compares the end points.
- `check` (`backend/app/project/check.ts`, `folderCheck.ts`) is the one list of problems,
  for the CLI, CI, the MCP server and the editor.

## The wrapper

Tell & Wire is three layers. A **graph core** runs graphs. The **wrapper** around it holds
the graph in use and talks to everything outside. **Frontends** talk only to the wrapper.

```
 a tool's page, a script, any frontend          the graph editor
        │  runtime API: /api/runtime/…, by name         │  design API: /api/graphs/…, /api/ai/…, /api/execute/…
        ▼                                               ▼
 ┌──────────── wrapper: backend/app, backend/gui-editor, backend/graph-editor ────────────┐
 │ the session: what nodes keep, the page and what its blocks hold, state.json, the clock, │
 │ the queue of rounds; start points, end points, packages; files, ✨, settings, deploy    │
 └───────────────────────────────────────────┬─────────────────────────────────────────────┘
                                             │  core protocol (graph/core/protocol.ts)
                                             ▼  in this process, or a program on stdin/stdout
 ┌──────────────────────────── graph core: graph/core (JavaScript) ───────────────────────┐
 │ runs a round, one node, a node's example; what every node made last (the latch);        │
 │ the reuse cache; asks the model with its own client                                     │
 └─────────────────────────────────────────────────────────────────────────────────────────┘
```

The core is handed the graph definition as JSON (`Graph`, `graph/graph.ts`): the nodes with
their settings, ports and files, and the wires, as the project folder holds them; not the
page. Today there is one core, in JavaScript.

### The runtime API

For a tool's page, a page of your own, a script. It knows start points and end points by
name, never a node. Every server answers it, the editor and a deployed tool alike. Every
route answers JSON except the stream; a refusal is `{ "detail": "…" }`.

| Route | What it does |
|---|---|
| `GET /api/runtime/interface` | What the graph offers: its start points (who starts each, what the graph reads of what it is sent, which blocks fire it), its end points, and its memory nodes (`state`: what can be watched without a round) |
| `GET /api/runtime/session` | The session now: what each start point was sent, what the end points handed back, what each memory node holds (`state`, by name, from the design's values on), what each block holds and shows, what a reset forgets (`kept`), the round, the clock |
| `GET /api/runtime/stream` | Server-sent events: `session` on connect and after every change, `round` as each round starts, goes and ends |
| `POST /api/runtime/requirements` | What a round started from the page still needs (a file nobody picked) |
| `POST /api/runtime/rounds` | Start a round at a start point (`{ event, values, answers, by }`); answers its id at once |
| `GET /api/runtime/rounds/:id` | One round as it goes, and what it handed back by name once it ended |
| `POST /api/runtime/rounds/:id/stop` | Stop it |
| `POST /api/runtime/run` | Start a round and wait for what it hands back: a function call |
| `POST /api/runtime/reset` | Forget what using the graph left behind |
| `GET /api/runtime/page` | The page: its blocks as designed, and how they connect by name |
| `GET /api/runtime/ai-settings` | Which model the tool asks, without its key |
| `POST /api/files/browse` | A folder's entries, for a file picker (loopback only) |

With `by` (a block id) a round is one the page starts, refused unless that block fires the
start point; without it, a call, and `values` are the package as sent. Types:
`backend/app/api.ts` (routes marked `tool`); handlers: `toolRoutes` in `backend/app/serve.ts`;
tests: `backend/app/runtimeApi.test.ts`, `frontend.test.ts`.

### The design API

For the editor only; a bundle leaves `backend/graph-editor/` behind.

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
| `GET /api/ai/settings`, `POST /api/ai/settings`, `GET /api/ai/providers` | The one AI setting and the providers to choose from |
| `POST /api/deploy/bundle` | Write the tool as a bundle zip |
| `POST /api/files/open-external` | Open a node's file in the person's own editor (loopback only) |

Types: `backend/app/api.ts` (routes marked `editor`); handlers: `editorRoutes` in
`backend/graph-editor/routes.ts`.

### The core protocol

What the wrapper asks of a graph core (`graph/core/protocol.ts`, `GraphCore`). One core
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

While a `round` goes, the core sends events: first `{ "type": "plan", "total": n }` (how many
nodes it runs), then the executor's `node_start`, `node_done`, `batch` and `activity`.

**The wire.** As a program of its own, a core speaks the same operations on stdin and
stdout, one JSON object per line. The wrapper writes `{ "id": 7, "op": "round", … }`; the core
writes any number of `{ "id": 7, "event": … }` and then `{ "id": 7, "reply": … }` or
`{ "id": 7, "error": "…" }`. Nothing else goes to stdout; what a core says for people goes to
stderr. `node backend/app/main.ts core` is the JavaScript core as such a program
(`graph/core/stdio.ts`). The wrapper uses one when `TW_CORE` names it, a program and its
arguments; without it the core runs in the wrapper's process (`graph/core/localCore.ts`):

```bash
TW_CORE="node backend/app/main.ts core" node backend/app/main.ts --editor frontend/dist
```

**What every core must do**, whatever its language:

- answer `hello` first and at once: the wrapper refuses a core that does not answer within
  15 s, or speaks another `protocol`, and starts it again when asked after it ended;
- read requests while one goes: a `stop` arrives in the middle of a round;
- run on the same files as the wrapper: paths in a graph resolve against the same working
  directory;
- keep what every node made last between rounds: `held` comes in with `open` and goes back
  with every round, a value the wrapper stores and does not read; what a round left is
  committed only when it ran to its end;
- say in `nodes` each node's state as its kind keeps it: a start point's `values`, a data
  node's fields by their names and its `round` (`NodeRunner.state`);
- run a round with `given` as a kept round: those nodes are handed their outputs instead of
  running, and nothing of it stands for the next round (no latch, no reuse);
- end when stdin ends, stopping what still goes; say an error as a sentence.

The shapes asked and answered (`Graph`, `Trigger`, `ExecutionResult`, `NodeResult`,
`ExampleRun`) are the types of `graph/graph.ts`, `graph/execution/triggers.ts` and
`graph/authoring/examples.ts`, as JSON.

**What a core does not do:** the page, the session, state.json, the clock, the queue of
rounds, HTTP. It is handed a graph with what the round was sent already in its start points
and what nodes keep already in them, and it changes nothing it was handed.

**Conformance.** A core in another language is correct when it runs the examples as this
one does: `node backend/app/main.ts test --offline examples/<name>` with `TW_CORE` naming it
runs each node's example and replays the kept rounds (`tests/*.json`), which came from real
runs. Its model client reads the same `ai-settings.json`. Held by `graph/core/core.test.ts`
(a round, a stopped round, the wire, a kept round replayed in this process and by
`main.ts core` with the same answer) and `backend/gui-editor/session.test.ts` ("a session
whose rounds run in a graph core of its own process"). `backend/app/wrapperDoc.test.ts`
holds that every route of `api.ts` and every operation of the protocol is in this section.

## Writing a plugin

A plugin is added in the source, not loaded at run time: two folders under the same name,
each registered in one list. The tests named below fail until both halves exist and match.

**A node kind** (say `csv`):

1. `graph/nodes/csv/CsvNodeRunner.ts`: extend `NodeRunner` and keep its three bars. Add it
   to `NODES` (`graph/nodes/registry.ts`) and to `NodeType` (`graph/graph.ts`).
2. `frontend/graph-editor/nodes/csv/CsvNodeGuiBuilder.ts` and its panel: add it to
   `NODE_BUILDERS` (`frontend/app/elements/registry.ts`); the compiler then asks for its
   entry in `NODE_KINDS` (`frontend/app/document/nodeKinds.ts`).
3. If ✨ Describe a graph should offer it: a `graphAuthorNote` (`backend/graph-editor/graphPrompt.test.ts`).

Checked by `symmetry.test.ts`, both `times.test.ts` and both `shells.test.ts`.

**A block kind** (say `gauge`):

1. `backend/gui-editor/widgets/gauge/GaugeWidgetRunner.ts`: extend `WidgetRunner`
   (`StaticWidgetRunner` for a block that is only design, `DisplayWidgetRunner` for one that
   only shows). Add it to `backend/gui-editor/widgets/roster.ts` and to `WidgetKind`
   (`graph/graph.ts`).
2. `frontend/gui-editor/widgets/gauge/`: `GaugeWidgetGuiBuilder.ts`, `GaugeWidgetView.tsx`
   and, if it has settings, a panel. The builder goes into
   `frontend/gui-editor/widgets/roster.ts`, the view into `BLOCKS`
   (`frontend/gui-editor/page/blocks.ts`).

Checked by `symmetry.test.ts`, and by `boundary.test.ts`, since a deployed page draws the view.

**A language.** Everything that is JavaScript about writing and trying a body is the code
node's `Language` (`JAVASCRIPT` in `graph/nodes/code/javascript.ts`; the interface is in
`graph/authoring/generation.ts`): the file, the fence, what the model is told, the empty
`run` it completes, the limits, and how a written body is run. The writer
(`backend/graph-editor/generate.ts`) names no language. Two ways:

1. **A node kind for it**: a node kind as above whose runner declares its own `Language`,
   and a `CodeService` (`graph/nodes/Runtime.ts`) that runs bodies in that language, beside
   `nodeCode` in `graph/core/node.ts`.
2. **A whole graph in that language**: a second graph core -- a program in that language
   that speaks the core protocol above and runs whole graphs. `TW_CORE` names it; the
   conformance run above checks it. The rules that are language-neutral (ports, wiring,
   what starts a round) are inside the JavaScript runners today; taking them out of
   `graph/` is the first step of this way.

A JavaScript body runs in a Node process of its own under `--permission` (child processes,
addons, workers no; the network stays open), with no key in its environment. It reads the
working directory except the settings file, and the temp folder; it writes the temp folder
only. Node's permission flags only allow, so the entries it may read are listed for every
body; a link in the working directory that points at the settings file is followed anyway.
A file elsewhere reaches it as an input typed `file_path`, which the executor reads for it.
It ends after `TW_BODY_TIMEOUT_MS`. It talks in lines (`graph/core/node.ts`; `node.test.ts`,
`sandbox.test.ts`):

```
stdin   {"inputs": {…}, "calls": ["llm", …]}                  what it is handed
stdout  ␞tell-and-wire:call {"id": 1, "name": "llm", "args": …}   a question (␞ is U+001E)
stdin   {"id": 1, "result": …}  or  {"id": 1, "error": "…"}      its answer
stdout  ␞tell-and-wire:result {…}                               what it made; the run is over
```

`node.llm` is answered by the process running the graph (`graph/nodes/ai/ask.ts`), at most 25 times per run
(`TW_MAX_LLM_CALLS`).

## What a deployed bundle carries

`backend/app/cli/bundle.ts` writes it; `bundle.test.ts` runs one from a temporary folder.
It carries the project folder (without `history.md` or the files ✨ was given); `graph/`, `backend/app/` and `backend/gui-editor/` as they are, without tests;
`web/` with the built `runtime.html`, what it references and `licenses.txt` (when the graph
has a page and `npm run build` ran); the files the graph starts on, those from outside the
project in `data/` (one that is missing or over 50 MB stops the bundle); the project's own `frontend/`;
`LICENSE`, a `README.md`, and `run.cmd` / `run.sh`, which run `node backend/app/main.ts .`,
with `--serve` when there is a page. It leaves out `backend/graph-editor/`, tests and
`state.json`. Its model comes from the `TW_AI_*` variables or `ai-settings.json` beside
`run.sh`.

## Security boundaries

- Everything binds to loopback; nothing asks who is calling. The editor refuses to start
  bound wider (`--host`, a container) unless `TW_EDITOR_ON_NETWORK=1` says the port is open
  to nobody else (the Docker image sets it: `docker-compose.yml` publishes on the host's
  `127.0.0.1`). A tool bound wider prints a warning, and every route is open to whoever
  reaches the port, except the ones `api.ts` marks `local` (browsing, finding projects and
  files, opening a node's file in an editor) and a round that sets a picker's file or
  folder: those answer 403. What stays open includes opening and saving at any path, running
  code and the settings with their keys.
- A request must name `127.0.0.1`, `localhost`, `[::1]` or a name in `TW_ALLOWED_HOSTS`, come
  from the server's own origin and send `application/json` (`foreignRequest`,
  `backend/app/http.ts`). Every page it serves forbids being framed (`servePage`).
- A graph can name an MCP tool server; only `ai-settings.json` says which program it starts,
  and it starts without this process's keys and tokens (its own `env` gives what it needs).
  The MCP server confines paths to `--mcp-root`, never opens `ai-settings.json` and filters
  keys from its answers (`mcpServer.test.ts`, "confinement").
- A code body runs in a sandbox of its own: see "A language" above (`sandbox.test.ts`).

## Environment variables

Besides the provider keys and addresses in the README:

| Variable | What it sets |
|---|---|
| `TW_SETTINGS` | The one settings file, instead of looking for `ai-settings.json` |
| `TW_AI_PROVIDER`, `TW_AI_MODEL` | The one AI setting, over the file |
| `TW_CORE` | A graph core program to run rounds in |
| `TW_ALLOWED_HOSTS` | Host names a server bound wider than loopback answers to, comma-separated |
| `TW_EDITOR_ON_NETWORK` | Lets the editor start bound beyond this machine, when nobody else can reach its port |
| `TW_NO_BROWSER` | Do not open a browser on start |
| `TW_TIMEOUT_MS`, `TW_MCP_TIMEOUT_MS` | How long a model call (10 min) or an MCP tool call (2 min) may take; `0`: no limit |
| `TW_MAX_TOKENS`, `TW_MAX_LLM_CALLS` | A model answer's token budget (4096; an answer cut off by it is an error); `node.llm` calls per body run (25) |
| `TW_BODY_TIMEOUT_MS` | How long a code body may run (10 min); `0`: no limit |
| `TW_NO_PAUSE` | A failing `run.cmd` does not wait for a key |

## Checks

`npm run typecheck` (all three workspaces), `npm run lint` (`frontend/`), `npm run build`
(`frontend/dist`; the package test needs it), `npm test` (Vitest in all three workspaces),
`npm run licenses` (every installed package against the licences it may have,
`scripts/licenses.mjs`). CI (`.github/workflows/ci.yml`) runs these, then
`node backend/app/main.ts check` and `test --offline` over every folder in `examples/`, and
`node --test scripts/launcher.test.mjs scripts/package.test.mjs` (the package test on Linux
and Windows). A green push to `main` rebuilds the `latest` pre-release and the container
image; a `vX.Y.Z` tag publishes a release with the Windows and Linux zips.
