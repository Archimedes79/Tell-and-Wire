# Architecture

How AI-Graph is put together, which rules hold it together, and what is knowingly left
untidy. Read this before changing anything structural; the code comments explain the
*why* of each file, this explains how the files relate. Diagrams with every box mapped to
its files are in [`arch/overview.md`](../arch/overview.md).

## The shape

```
engine/    runs a graph. TypeScript that Node executes by stripping types: no build, no runtime dependencies.
editor/    the page: React + ReactFlow. Built on the engine, never the other way round.
examples/  project folders that the test suite runs, event-driven and deployed (examples.test.ts, masterExamples.test.ts).
scripts/   dev server, the launchers' start and stop, the download's packaging (with its own Node), the licence check.
docs/      the prose, one file per subject; arch/ the architecture diagrams, one file.
```

One process serves everything: `node engine/src/main.ts --editor editor/dist`. The same
server serves a deployed tool, with the editor's routes simply not loaded.

## Elements first

Everything the tool can do is an **element**: a node type (start, folder, ai, code, data,
end, subgraph) or a widget kind on a page (text, divider, spacer, input_picker, text_io,
select, slider, button, chat, plot_window, table, image_view). The design is organised
around them, and each element is one folder, at the **same relative path on both sides**:

```
engine/src/elements/                            editor/src/elements/
  ElementRunner.ts                                ElementGuiBuilder.ts
  NodeRunner.ts                                   NodeGuiBuilder.ts
  WidgetRunner.ts                                 WidgetGuiBuilder.ts
  registry.ts                                     registry.ts
  page.ts      what the page's blocks are asked   resultPreview.ts
  Runtime.ts  port.ts  body.ts                    fields/  (settings several panels share)
  folderListing.ts  images.ts  documents.ts
  nodes/                                          nodes/
    start/  StartNodeRunner.ts                      start/ StartNodeGuiBuilder.ts  StartNodePanel.tsx
    ai/     AiNodeRunner.ts  prompt.ts  ask.ts      ai/   AiNodeGuiBuilder.ts  AiNodePanel.tsx
                                                          AiNodeAdvancedPanel.tsx
    code/   CodeNodeRunner.ts                       code/ CodeNodeGuiBuilder.ts  CodeNodePanel.tsx …
    subgraph/ SubgraphNodeRunner.ts boundary.ts     subgraph/ SubgraphNodeGuiBuilder.ts …
    folder/ data/ end/                              folder/ data/ end/
  widgets/                                        widgets/
    roster.ts                                       roster.ts  WidgetView.ts  download.ts
    StaticWidgetRunner.ts                           StaticWidgetGuiBuilder.ts
    DisplayWidgetRunner.ts                          DisplayWidgetGuiBuilder.ts
                                                    DisplayWidgetPanel.tsx
    select/ SelectWidgetRunner.ts                   select/ SelectWidgetGuiBuilder.ts
                                                            SelectWidgetView.tsx
                                                            SelectWidgetPanel.tsx
    plot_window/ PlotWindowWidgetRunner.ts          plot_window/ PlotWindowWidgetGuiBuilder.ts
                                                                PlotWindowWidgetView.tsx
                                                                PlotChart.tsx
    …                                               …
```

**The page is no element and no node.** It is the graph's list of blocks
(`graph.page.blocks`; `page/page.json` in a project folder), in neither the graph's order
nor its wires: a block connects itself to the graph by name -- the start points its data
goes to (`sends_to`), the start point using it fires (`fires`), the end point it shows
(`shows`). What a round, `check`, a bundle and the prompt that designs a graph ask of the
page are the functions of [`elements/page.ts`](../engine/src/elements/page.ts), and each of
them asks the block's own element.

**Names follow the file format, mechanically, and pair across the wire.** Every element
class in the engine ends in `Runner`; its editor half is a class that swaps `Runner` for
`GuiBuilder`, and inherits the same way. Node type `ai` is `AiNodeRunner` in
`nodes/ai/AiNodeRunner.ts` and `AiNodeGuiBuilder` in `nodes/ai/AiNodeGuiBuilder.ts`;
widget kind `plot_window` is `PlotWindowWidgetRunner` and `PlotWindowWidgetGuiBuilder`.
One class per file, and the file is named after it.

**What the two words mean.** Two axes cross in them, and together they are the whole
reason the split exists.

- `Runner` against `GuiBuilder` is **what the class is for**: running the application, or
  building it. A graph is an application; it runs with no browser anywhere.
- `Gui` in the middle is **where the class lives**: the engine owns the graph and runs it,
  and everything a person clicks is in the browser, which the engine never imports.

So a `Runner` is the application, and a `GuiBuilder` is the tooling around it. That is why
only one of the two may be missing from a delivered tool, and why it is the builder:
a deployed graph runs, and nobody edits it. The fourth square of the grid — build-time work
in the engine, such as `generation()` — has no class of its own; it rides on the `Runner`
under a `── Build time` bar, which [`times.test.ts`](../engine/src/elements/times.test.ts)
reads and enforces.

| Engine | Editor |
|---|---|
| `ElementRunner` | `ElementGuiBuilder` |
| `NodeRunner` | `NodeGuiBuilder` |
| `WidgetRunner` | `WidgetGuiBuilder` |
| `StaticWidgetRunner`, `DisplayWidgetRunner` | `StaticWidgetGuiBuilder`, `DisplayWidgetGuiBuilder` |
| `StartNodeRunner`, `AiNodeRunner` | `StartNodeGuiBuilder`, `AiNodeGuiBuilder` |
| `SelectWidgetRunner` | `SelectWidgetGuiBuilder` |

Each element has a fixed set of **facets**, told apart by suffix:

| Facet | Engine (Node) | Editor (browser) |
|---|---|---|
| What it is and does: its config; a node's ports, `execute` and `generation`; a block's `sends`, `event`, `showsEnd` and `data` | `<Kind>NodeRunner.ts` / `<Kind>WidgetRunner.ts` | — |
| How it looks on a page — the designer and the deployed tool draw the same component | — | `<Kind>WidgetView.tsx`, listed in `page/blocks.ts` |
| Its settings | — | `<Kind>NodePanel.tsx` / `<Kind>WidgetPanel.tsx` |
| What the editor's shells ask of it | — | `<Kind>NodeGuiBuilder.ts` / `<Kind>WidgetGuiBuilder.ts` |

A node's look on the canvas is generic (`canvas/GraphNodeView.tsx`), so nodes have no view
of their own. [`symmetry.test.ts`](../editor/src/elements/symmetry.test.ts) holds the two
sides to this: both registries list the same kinds, and every element has its files, under
its names, on both sides.

## The element hierarchy

Behaviour lives in classes. Shared code asks the element and never switches on a type name.

```
ElementRunner<Subject, Config>          config() · catchesErrors()
├── NodeRunner<C>                a node: texts · logic · derivedPorts · execute · eventPorts · startedBy · offers · shows · takesPackage · startWith · lastSent · answerWith · state · settleMemory ┊ generation · deployNeeds · whatRuns · problems · graphAuthorNote
│   ├── StartNodeRunner          where a round begins: named, started by the page, a call or itself; one package out
│   ├── FolderNodeRunner   AiNodeRunner   CodeNodeRunner   DataNodeRunner
│   ├── EndNodeRunner            where a round ends: what the graph hands back, under its name
│   └── SubgraphNodeRunner       holds a graph: its ports are that graph's start and end points (not a start point that starts itself)
└── WidgetRunner<C>              a block: sends · event · showsEnd · data · keepsState · settle · displayValue · takesValue · setValue · runtimeRequirements ┊ receives · graphAuthorNote · referencedPaths · valueIsDesign
    ├── InputPickerWidgetRunner   TextIoWidgetRunner   SelectWidgetRunner
    ├── SliderWidgetRunner        ButtonWidgetRunner   ChatWidgetRunner
    ├── StaticWidgetRunner       sends, fires and shows nothing: part of the page, not of the graph
    │   └── TextWidgetRunner   DividerWidgetRunner   SpacerWidgetRunner
    └── DisplayWidgetRunner      shows an end point and does nothing else: says what it draws
        └── PlotWindowWidgetRunner   TableWidgetRunner   ImageViewWidgetRunner

ElementGuiBuilder<PanelProps>                    Panel
├── NodeGuiBuilder                        label · icon · color · hint · paletteGroup · AdvancedPanel · describeOutput/canvasSummary   (builder only)
│                                         + definesItself · ownsDescription · portEditing/portHint · wantsOn · restingValue · missingExample
│                                           dropPort/withDropped (what a file dropped on the node gives it)
│   ├── StartNodeGuiBuilder   FolderNodeGuiBuilder   AiNodeGuiBuilder   CodeNodeGuiBuilder
│   ├── DataNodeGuiBuilder    EndNodeGuiBuilder
│   └── SubgraphNodeGuiBuilder
└── WidgetGuiBuilder                      create(id, label, mode) · label · paletteEntries · called · defaultSpan · defaultTone · firesHint · textShown · InlineEditor · missingExample   (builder only)
    ├── InputPickerWidgetGuiBuilder   TextIoWidgetGuiBuilder   SelectWidgetGuiBuilder
    ├── SliderWidgetGuiBuilder        ButtonWidgetGuiBuilder   ChatWidgetGuiBuilder
    ├── StaticWidgetGuiBuilder            starts unnamed (initialLabel)
    │   └── TextWidgetGuiBuilder   DividerWidgetGuiBuilder   SpacerWidgetGuiBuilder
    └── DisplayWidgetGuiBuilder           one panel: what the kind shows, in its runner's words
        └── PlotWindowWidgetGuiBuilder   TableWidgetGuiBuilder   ImageViewWidgetGuiBuilder
```

The browser half is the same tree with `GuiBuilder` for `Runner`, and
[`symmetry.test.ts`](../editor/src/elements/symmetry.test.ts) compares the two lineages
class by class. What each kind knows about its own appearance — its name, icon and colour,
a new widget's size, tone and first values, how its last result reads on the canvas — is a
member of its `GuiBuilder`, not a table in a shell. After a run a node's card shows each value
it made, by the port it stands at, read by its shape (`elements/resultPreview.ts`: a
line, a count and the first row, a sketch, a thumbnail); `portPreviews` (`resultPreview.ts`) says
which port -- an end point's value stands under the input it arrived on. An element is handed
its services (`Runtime.ts`: `files`, `code`, `ai`, `tools`, `subgraph`) rather than reaching
for them.

### Build time and run time, in one class

There are three programs in this repository: the **editor** (building a graph), the
**page of a tool** (using one), and the **run** (what happens between a press and an
answer). A tool needs the last two. What it does not need, it must never *call* — and that
is the line that is kept, not "never carry".

An element is one class per kind, and it holds both what a run asks of it and what only
building asks: the knowledge is small, it belongs to the kind, and one file per kind is what
makes a kind easy to add. So on the **engine** side build-time members travel into a
bundle with their class, and are kept apart *inside* it. On the browser side there is
nothing to keep apart — see below.

- Every base class (`ElementRunner`, `NodeRunner`, `WidgetRunner`; `NodeGuiBuilder`, `WidgetGuiBuilder`) is
  laid out under the bars **What it is · Run time · Build time** -- a `GuiBuilder`'s Run time
  holds nothing, and `NodeGuiBuilder` leaves that bar out -- and every kind keeps that order,
  its build-time members under a `── Build time` bar of its own.
- The bars are load-bearing: `elements/times.test.ts` reads them, on both sides.

| | What it is | Run time | Build time |
|---|---|---|---|
| **asked by** | anything that reads a graph | the executor, the session, a served tool | the editor, `check`, `test`, a bundle being made, a project being saved |
| `ElementRunner` | `config` | `catchesErrors` | — |
| `NodeRunner` | `nodeType` · `texts` · `logic` · `derivedPorts` · `nestedGraph` · `setNestedGraph` · `isResult` · `resultLabel` · `boundaryRole` · `valuePorts` · `definitions` · `outputInterface` | `isMemory` · `eventPorts` · `keepsTime` · `needsInput` · `fansOut` · `batchMode` · `batchConcurrency` · `readsFileInputs` · `readsOutside` · `offers` · `shows` · `startedBy` · `takesPackage` · `startWith` · `lastSent` · `answerWith` · `execute` · `settleMemory` · `state` · `setState` | `generation` · `deployNeeds` · `graphAuthorNote` · `whatRuns` · `engineRuns` · `problems` · `asksModel` · `referencedPaths` |
| `WidgetRunner` | `widgetKind` · `sends` · `event` · `showsEnd` | `data` · `keepsState` · `settle` · `clearsValueAfterRun` · `displayValue` · `runtimeRequirements` · `takesValue` · `setValue` | `receives` · `graphAuthorNote` · `referencedPaths` · `valueIsDesign` |
| `NodeGuiBuilder` | `nodeType` | — | **everything**: the palette, panels, what ✨ is told |
| `WidgetGuiBuilder` | `widgetKind` | — | **everything**: the palette, its panel |

### …and a third role, which is neither

The two `GuiBuilder` rows have no run-time members, and that is the point: **a `GuiBuilder` is the
builder, whole, and a delivered tool never loads it.** What a tool does need of an element
that is not the engine's run lives elsewhere:

| What | Where | Because |
|---|---|---|
| what the **page draws** for a block: its view, whether it owns its value | [`page/blocks.ts`](../editor/src/page/blocks.ts) (`BLOCKS`) | the one part of a widget a recipient operates |
| what a **run** means for a block: `clearsValueAfterRun` | `WidgetRunner` | the same family as `settle` |

A node's middle role is empty by nature: the canvas is never delivered. A widget's is not,
because the page is.

What a node *is* when it is made, loaded and saved -- `create`, `placedAmong`,
`placedInside`, and `savedNode`, which leaves every default out of the file -- is no
builder's either. It is the document's, in
[`document/nodeKinds.ts`](../editor/src/document/nodeKinds.ts) (`NODE_KINDS`), which the
store asks on every load and save without the builders' registry (the store ranks below it,
`layers.test.ts`). It is in the editor because it builds `NodeConfig`
([`editor/src/graph.ts`](../editor/src/graph.ts)), the one spelled-out settings shape. A
delivered tool loads none of it: it holds no graph.

This is why the editor's `times.test.ts` can hold that a `GuiBuilder`'s run-time bar is
**empty**, and why [`runtime/boundary.test.ts`](../editor/src/runtime/boundary.test.ts) can
hold that no `GuiBuilder` class and neither editor registry (`elements/registry.ts`,
`elements/widgets/roster.ts`) is even *reachable* from the tool's entry point, nor
anything in `store/`, `canvas/`, `authoring/` or `app/`, nor a panel or the fields one is made of.

The **engine** is out of reach as well, but for the contract and a few value shapes. Which
block fires which start point, and which blocks a round is sent, are the graph's to say, and
the runtime API tells the page them by name (`/api/runtime/interface`: an event's
`fired_by` and `sends`, read by `page/pageInUse.ts`'s `connectionsOf`), so the page asks the
engine's element tree nothing. Of the engine it loads `host/api.ts` and the small modules a
view reads a value by — a chat's conversation (`widgets/chat/value.ts`), a dropdown's choice
(`widgets/select/choice.ts`), a slider's range (`widgets/slider/range.ts`), a text box's role
and text (`widgets/text_io/`), a text block's role (`widgets/text/role.ts`) — and nothing else
([`runtime/boundary.test.ts`](../editor/src/runtime/boundary.test.ts): "loads of the engine
only the contract and the shapes of the values its views read").

What the tests hold: every member stands under a bar; the build-time list is spelled out,
so moving a member across is a decision and not a bar that slipped; **no file the test
lists as a run's** (all of `execution/`, `elements/body.ts`, `folderListing.ts`, `images.ts`,
`authoring/logic.ts`, `host/serve.ts`, `session.ts`, `rounds.ts`, `core/node.ts`) **mentions a
build-time member**, and inside every element class nothing above its Build time bar reaches
below it; and nothing a tool's page can reach asks a `GuiBuilder` for anything at all.
`elements/page.ts` is not on that list: a round goes through it (`pageSends`, `settlePage`),
and it also holds what the graph prompt and a bundle ask of the page (`pageAuthorNote`,
`pageReferencedPaths`), which read build-time members. What is *not* carried at all:
`host/editor/` never enters a bundle, and a panel is a lazy chunk a tool never fetches.

**What runs.** `NodeRunner.whatRuns(node)` answers the question a node's folder could not:
which code runs when this node runs. Either a body in the folder (`code.js`), run
sandboxed — or this kind's `execute`, named by file, with one sentence
saying what it does. The same answer is shown at the foot of its panel and listed in
[graphs.md](graphs.md#what-runs-and-where); `elements/times.test.ts` ("what runs") checks
that the file and the method it names exist.

## Two processes, one contract

AI-Graph runs in two places: **Node**, which runs graphs and touches files, models and
programs, and **the browser**, which draws them. They talk over HTTP, and the whole
conversation is written down once, in [`engine/src/host/api.ts`](../engine/src/host/api.ts):
every route with its method, path, audience and the types going each way. Both ends are
built from that table, and mirror each other:

```
          browser (editor/src)                              Node (engine/src/host)
 ┌──────────────────────────────────┐              ┌──────────────────────────────────────┐
 │ app, canvas, page, runtime page  │              │ serve.ts     the server: page + table │
 │        │                         │              │   ├─ toolRoutes()   the `tool` rows    │
 │        ▼                         │              │   └─ editor/routes.ts  the `editor`    │
 │ api/client.ts                    │   HTTP/JSON  │        rows, loaded only for the editor│
 │   call('startRound', {event, …}) ┼──────────────┼──▶ handlers.startRound(request)        │
 │   ◀── ResponseOf<'startRound'>   │              │        │                               │
 └──────────────┬───────────────────┘              └────────┼──────────────────────────────┘
                │          ┌────────────────────────────┐   │
                └─imports─▶│ host/api.ts  API table,     │◀──┘ imports
                           │ Request/Response types,     │
                           │ matchRoute / pathFor        │
                           └────────────────────────────┘
```

- **The server serves exactly the table.** `serve.ts` refuses to start if a route has no
  handler. A `tool` route is answered by every server; an `editor` route only when the
  editor's handlers are loaded, and with 404 otherwise (`host/serve.test.ts`: "serves a
  deployed tool its own routes of the contract, and none of the editor's").
- **The page calls the table by name.** `call('round', { id })` — path, method and shapes come
  from the table, so the compiler checks both ends against the same types. A failure is an
  `ApiError` whose message is the server's own `detail`. Two answers are not JSON: `stream`
  is server-sent events (`EventStream`), and `bundle` is a file (`Download`).
- **The graph document is the engine's.** [`engine/src/graph.ts`](../engine/src/graph.ts)
  defines ports -- and which part of a start point's package an input takes
  (`Port.field`) --, edges, node types, widget kinds, the page (`Graph.page`) and a run's
  result; [`editor/src/graph.ts`](../editor/src/graph.ts) imports them and adds narrowings
  for its panels: each element's settings spelled out in `NodeConfig`, and a block's in
  `GuiWidget`.

The rows, by audience (`for` in the table) -- 32 routes, 12 for `tool` and 20 for `editor`,
counted from the table itself (`Object.keys(API)`, 2026-10-04):

| `for` | Routes (names in the table) | What they are |
|---|---|---|
| `tool` | `interface` `session` `stream` `requirements` `startRound` `round` `stopRound` `runRound` `reset` | the runtime API: a graph used by name, by any frontend — what it offers, what using it left behind, rounds started, watched and stopped |
| `tool` | `page` `toolAiSettings` `browse` | what the built-in page reads besides: its blocks, which model the tool calls (read-only), a file picker |
| `editor` | `runNode` `nodeInputs` `testNode` | one node: on given inputs, what would arrive at it, ▶ Try |
| `editor` | `keepRound` | a round of the session that ran through, kept as a test of the project (`tests/<name>.json`) |
| `editor` | `openGraph` `saveGraph` `findProjects` `findFile` `projectChanges` `openExternal` | a project folder or graph file, finding what a drop names, what changed on disk, a node's file in the person's own editor |
| `editor` | `generate` `generationProgress` `generateGraph` | ✨ and ✨ AI Graph, and the transcript of one in flight |
| `editor` | `holdGraph` `startApplication` `stopApplication` | the editor hands the server's session the graph being edited, and ▶ Run / ■ Stop |
| `editor` | `bundle` `aiSettings` `saveAiSettings` `providers` | Deploy's zip, the one AI setting and what is reachable |

What crosses to the outside -- the folder, the graph's names, the `tool` rows as the runtime
API, and the lines a body speaks -- is [connection-points.md](connection-points.md), with
the test behind each claim.

## Modules, by side

The wrapper (`host/`) runs every graph through a graph core (`core/`): in its own process, or a
program of its own on stdin and stdout. What each holds, the runtime API, the design API and the
core protocol are [wrapper.md](wrapper.md).

```
engine/src
  main.ts            the entry point: cli/cli.ts
  graph.ts           the document: ports, edges, node types, the page, a run's result
  errors.ts          NotFound · NotAGraph
  elements/          see above
  authoring/         what ✨ writes, and how it is read
    definition.ts    input.js / output.js: a typedef and one example, read without running anything
    prompts.ts  generation.ts  history.ts  logic.ts  handedOn.ts
    examples.ts      a node's example, tried (▶ Try, `test`)
  execution/         running a graph
    executor.ts      order · run · settle · one node alone (callNode, executeNode, inputsFor)
    triggers.ts      what starts a round            clock.ts   when a start point that starts itself is due
    latch.ts  reuse.ts  batching.ts  fileInputs.ts
    graphInterface.ts   what the graph offers by name, and what a round is sent
    interface.ts     what one node hands on         wiring.ts  whether the wiring holds together
  core/              the graph core: what the wrapper asks of whatever runs its graphs
    protocol.ts      the operations (round, node, example, test, arriving, …), and the wire
    localCore.ts     the JavaScript core: the executor and the elements, with the latch and the reuse cache
    stdio.ts         a core as a program of its own (`main.ts core`), and the wrapper's half of it
    node.ts          the Runtime the core's elements are handed: files, sandboxed code, models, tools
  project/           a graph on disk
    folder.ts        read · write · watch           flow.ts  flow.json: nodes and wires
    interfaceFile.ts a node's ports                 names.ts  changes.ts
    check.ts         what is wrong: no disk, the page asks it too
    folderCheck.ts   what a folder gets wrong
    keptRounds.ts    a round kept as a test, in tests/, and run again without a model
  host/              Node and HTTP
    api.ts           the contract
    serve.ts  http.ts  browse.ts       the server, its plumbing, the file picker's listing
    session.ts  rounds.ts              what using a graph leaves behind; the rounds in it
    lifecycle.ts     what is stopped, in order
    editor/          never bundled: routes · generate · brief · graphPrompt · settings · files · zip · mcpServer
  ai/                providers.ts · mcp.ts (the client) · settings.ts
  cli/               cli.ts · bundle.ts · launchers.ts

editor/src
  main.tsx  App.tsx  the editor's entry and shell
  graph.ts           the document, as the editor holds it (NodeConfig, GuiWidget)
  ui/                look: theme, tone, colour scheme, Modal, SidePanel
  document/          what a graph is to the editor: nodeKinds, page (what a block can connect to,
                     the points it names, what an input takes of a package), ports (derived ports),
                     layout (the grid), wires (a canvas wire as the saved edge)
  api/               client.ts (the contract's client) · session.ts (the session a page follows)
  store/             graphStore: the open graph and its page, undo, what a round shows on it
  dialogs/           FileBrowserDialog, PathField, RequirementsDialog
  elements/          see above
  authoring/         a node's text and what ✨ writes from it: NodeDefinition, ▶ Try, the live
                     transcript, the request (generation.ts), the page-wide sweep
  page/              the graph's one page: GuiPage (drawn by the editor and the tool alike),
                     the Gui tab (designer), ApplicationView (the running app), CallForms
                     (the caller of each start point a call starts)
  canvas/            the graph on screen: GraphCanvas, GraphNodeView, NodeEditor, ResultPreview
  app/               header, palette, the bar, dialogs, results, ▶ Run (application.ts)
  runtime/           the deployed tool's page: main.tsx → RuntimeApp.tsx
```

Within `editor/src` an import inside one area (`canvas/`, `page/`, …) is relative; one that
crosses areas goes through `@/`, and one into the engine through `@engine/` -- read off the
imports on 2026-10-04, with no exception; no test holds it.

**The editor has layers, and an area imports only from a lower one.** From the bottom:
`ui` (look, knowing no graph) · `graph` · `document` and `api` · `store` · `dialogs` ·
`elements` and `authoring` · `page` and `canvas` · `app` · `App` and `runtime` · `main`.
[`layers.test.ts`](../editor/src/layers.test.ts) reads the imports and fails on one that goes
up, or sideways between two areas of one rank. The single sideways pair is
`elements` ↔ `authoring`, on purpose: a panel is made of authoring editors, and an authoring
editor asks the registry what a node is. Panels are lazy chunks, so there is no static cycle.
`runtime` ranks with `App`, both being served, but reaches far less: nothing in `store/`,
`canvas/`, `authoring/` or `app/`, however indirectly -- a delivered tool holds no graph,
draws no canvas and writes no node. That is a rule on what is reached, not on one import, so
[`runtime/boundary.test.ts`](../editor/src/runtime/boundary.test.ts) holds it, walking the
imports from every file of `runtime/` and naming the chain that broke it.

The editor also runs engine code in the browser: the element registry (ports, previews, and
what a block can connect to, asked through `elements/page.ts`), `execution/triggers.ts`,
`wiring.ts`, `graphInterface.ts` (the App tab's names) and `fileInputs.ts`, the ordering
functions of `executor.ts`, `project/flow.ts` and `check.ts`, `authoring/definition.ts`. What
touches a disk is `project/folder.ts`, `folderCheck.ts` and `host/` (but `host/api.ts`), and
no source of the editor imports them (its tests do). Measured on the static value imports
(2026-10-04: every non-test module of both packages, an import of types only left out as
`runtime/boundary.test.ts` leaves it out, searched for strongly connected components), there
is no import cycle in either package and none from the engine into the editor; no test holds
that count.

## The surface

One window, three parts on the Graph tab, and nothing over them but a dialog asked for:

```
 header   AI-Graph · the graph's name · Graph | Page (| ● App)       File ▾ ↶ ↷ ▶ Run  Generate  Settings  Deploy
 ┌──────┬─────────────────────────────────────────┬──────────────────────────────┐
 │ pal- │ the canvas: a card per node              │ the panel of the node that   │
 │ ette │                                          │ is selected -- or, with none,│
 │      ├─────────────────────────────────────────┤ what the last run gave       │
 │      │ on: <node | the whole graph>  Say what to change…  Change            │
 └──────┴─────────────────────────────────────────┴──────────────────────────────┘
```

- **A node is a card** (`canvas/GraphNodeView.tsx`): its kind as a tag in the kind's own tint
  (`NodeGuiBuilder.color`, a scheme variable), its id, its heading and the first line of its
  text -- and after a run its status and a small picture of what it made (`portPreviews`).
  Its ports are dots on its edges, named on hover; a start point's port, where a round
  begins, is the amber diamond an event wears, and a start point has no ◆ of its own.
  Nothing is wired between the page and the graph, so a start point's card says which blocks
  of the page fire it and send to it, and an end point's which show it (`document/page.ts`'s
  `blocksAt`; `canvas/card.test.ts`). ReactFlow measures a card's handles again when its port
  ids change, or a renamed port's wire is not drawn. The card that is selected wears the
  accent, and so do its wires (`canvas/wireLook.ts`); the others are soft grey, and a wire
  into a ◆ is dashed amber whatever is selected.
- **Selecting a node opens its panel** docked on the right (`ui/SidePanel.tsx`,
  `canvas/NodeEditor.tsx`): at its top the node's kind and id, as on
  its card (`canvas/NodeKind.tsx`), and its heading below them (`authoring/HeadingField.tsx`,
  never empty); then the element's own `Panel` -- for a code, AI or data node
  `authoring/NodeDefinition.tsx`: its text, a row per ✨, ▶ Try and history.md -- and
  Advanced folded under it, with the ports of a node that `definesItself`; what is changed
  is written through, a step of undo at a time (`canvas/nodePanel.ts`). An input wired from
  a start point says there which part of the package it takes (`Port.field`), chosen from
  what the page's blocks send it or what a call sends it for example (`document/page.ts`'s
  `fieldChoices`); drawing the wire picks one where one is plain (`defaultField`). One click
  opens the panel, another node shows that one, and ✕, Escape or a click on the empty canvas
  close it, as `graphStore.clearSelection` does; a node added from the palette opens its
  panel too. What the view owes is kept in one place (`canvas/inView.ts` `viewDue`): another
  document -- New, Open, a level in or out -- is fitted whole; a node added is shown with the
  rest where they fit at a zoom that can be read (`READABLE_ZOOM`), else brought into sight
  alone, as a node whose panel opens is; each once its nodes are measured on a canvas that is
  on screen. Double-clicking a start or end point the page uses opens the Gui tab, where the
  page is built: a block's settings connect it by name -- "Its data goes to", "Using it
  fires", "It shows" (`page/WidgetEditor.tsx`) -- and a block put on the page is connected as
  one of its kind most often is, with a start or an end point made for it where the graph has
  none to give (`page/pageWrite.ts`). The node the person is on is `editingNodeId`, which the
  card, its wires and the bar all read. Delete on the canvas deletes only as pressed there
  (`deletes`): a key pressed in the panel is the panel's. It asks one question first where
  something goes with the nodes -- their wires, what the page's blocks connect to them -- as a
  card's ✕ does, and takes it all as one undo step (`askToDelete`; `canvas/nodeRemoval.test.ts`).
- **The bar under the canvas** (`app/ChangeBar.tsx`) says what to change, on the node that is
  selected or on the whole graph. On a node whose body ✨ writes, the words wait for its
  panel in the store (`pendingChange`, `askChange`, `clearChange`); the panel takes them up.
  On the whole graph -- and on a node whose settings are all it is, as a change of that
  node -- ✨ AI Graph is sent the graph (`generateGraph` with `graph`) and asked to change
  it, keeping its ids; each node's history comes back from the graph that was sent, and a
  node the change touched gets the exchange at the end of it. What comes back is shown with
  what it adds, removes and changes (`app/graphChange.ts`) and what `check` finds in it,
  and applied as one undo step of the same document (`graphStore.changeGraph`).
- **The header** (`app/Toolbar.tsx`) holds the app's name, the graph's name, the views
  (`app/ViewTabs.tsx`) and what is done to the graph as a whole: Undo and Redo as icons,
  ▶ Run, Generate, Settings, Deploy; the file actions and ✨ AI Graph, which designs a new
  graph, are its File menu (`app/FileMenu.tsx`). **▶ Run runs the application**
  (`app/application.ts`), as an IDE runs what it builds. With a page, the App tab opens on
  it -- `page/ApplicationView.tsx`, the delivered page attached to the document -- and the
  graph runs when the page is used. With a start point a call starts, the App tab opens as
  its caller: a box for every part the graph reads of what it is sent (the interface's
  `reads`), filled with what it was sent last, and a button per start point
  (`page/CallForms.tsx`, which the delivered page draws too). What starts by itself starts
  (`startEvents`: each start point set to start when the tool starts; a graph with no start
  point at all runs whole, once), and each clock keeps its time -- in the server's session,
  the one clock a served tool keeps too (`execution/clock.ts`, `Session.startApplication`),
  so a round comes due in the editor when it would there, and asks nobody anything. It is
  the document that runs: the editor hands it to the session as it is edited
  (`holdDocument`), it is ended by another document opened (`graphStore.opened`), not by a
  step into a node's graph, and a round waits while the canvas shows one. It is ■ Stop while
  it runs, and ends by itself where nothing is left to happen: no page to use, no call to
  make, no clock that ticks (`app/application.test.ts`). A delivered tool starts the same way
  when it is opened, and has no ▶ Run of its own; ⧉ Open as a tool is the same session in a
  window of its own, so it shows the same clock and the same rounds. Below 1280 pixels its
  buttons and the palette are their icons, and at 1024 nothing scrolls the page sideways.
  What Generate says stands whole in a line under it until dismissed; what it says of saving
  and opening is kept with the document it was said of, and goes when another is opened.

## Five rules

Decisions, each with its reason -- not laws. When one stands in the way, say so and
argue it: a rule changes when its reason no longer holds.

**1. An element owns everything about its kind.** Its settings (`config()`), its ports,
what it does (`execute`), what a block sends, fires and shows (`sends`, `event`,
`showsEnd`), how an AI writes its body (`generation()`) — in its own class. Adding a kind
adds one folder on each side, one line in each registry (`elements/registry.ts` for a
node, `elements/widgets/roster.ts` for a widget, in the engine and in the editor alike) and
its name in `NodeType` or `WidgetKind` (`graph.ts`); the rest it touches the compiler names,
since the editor's lists of kinds are `Record`s over those names -- a node's entry in
`document/nodeKinds.ts`, a widget's view in `page/blocks.ts`.
(`editor/src/elements/symmetry.test.ts` fails when the two sides disagree about a kind.)

**2. The executor owns everything about a run.** Ordering, fan-out over lists, handing an
input the part of what arrives that it takes (`Port.field`), reading the file on each input
that says so, catching failures, stopping, idle-skipping, holding what a shut ◆ leaves
standing and settling memory are done once, in `execution/executor.ts`, for every element
alike. An element declares (`fansOut` and `batchMode`, `readsFileInputs`, `catchesErrors`,
`needsInput`, `isMemory`, `eventPorts`, `readsOutside`); the executor carries out. What the page shows is the
session's, after the run: it hands what the end points handed back to the blocks that show
them (`settlePage` in `elements/page.ts`).

**3. Services are passed in.** An element touches the world only through the `Runtime` it
is handed. That is why the same element runs on the server, in the editor's browser tab
(for ports and previews) and in a test with fakes.

**4. The import graph is the deployment boundary.** A bundle (`cli/bundle.ts`) is the project
folder and a *copy* of `engine/src` -- minus `host/editor/` and every test -- with the page
files `runtime.html` references (`web/`), the project's own `frontend/` if it has one, the
files the graph starts on, and the launchers `run.cmd` and `run.sh`. The
engine contains no React at all. On the page side, a deployed tool draws widgets with
their views and never loads a panel: panels are registered with `lazy(() => import(…))`,
so each is a chunk of its own that only the editor fetches. Tests hold all of it:
`cli/bundle.test.ts`, `runtime/boundary.test.ts`, `strippable.test.ts` (no TypeScript
feature that needs a compiler: no enums, no parameter properties). What the tests share
sits beside `src`, not in it — `engine/test/fakes.ts` (a runtime with no world attached),
`editor/test/engineAnswers.ts` (what a run asks a node's element) — so no bundle, package
or layer rule has to be told to leave it out.

**5. One implementation, replayed — never two that agree.** Where one side needs what the
other knows, it imports it or replays its result:

| The browser needs | It gets it from |
|---|---|
| every route, request and response | `host/api.ts` |
| the graph's types | `graph.ts` |
| the ports a node's settings give it | `NodeRunner.derivedPorts`, via `document/ports.ts` (`derivedNodePorts`) |
| what a block can send, fire and show, and whether a person sets what it sends | `WidgetRunner.sends`, `event`, `showsEnd` and `takesValue`, via `document/page.ts` (`blockCan`, `widgetTakesValue`) |
| which block fires which start point, which blocks a round is sent, what a caller should send | the graph's interface (`interfaceOf`): the editor's App tab asks the engine, a delivered page is told it by name (`/api/runtime/interface`: `fired_by`, `sends`, `reads`) |
| what using the graph left behind, by name | the session (`SessionView`), told over `/api/runtime/stream` |
| what a block shows | the session's `shown`, by block id: what `settlePage` made of what its end point handed back (`WidgetRunner.settle`, `displayValue`) |
| the order to generate a graph in | `topologicalLevels` |

## A run

1. **Order.** Kahn's algorithm gives levels. A loop through a node that remembers (a data
   node) is legal: edges that close a loop into memory nodes are left out of the
   ordering (`memoryFeedbackEdges`, never by the order the wires are stored in) and settled
   after the round, port by port.
2. **What runs.** Everything — or, for an event (a start point), the nodes its `data` is
   wired to, what follows from them, and what those need upstream, including what computes
   a ◆ among them the event does not open itself (`triggers.ts`); a start point wired to
   nothing starts everything. The executor tells each start point whether this round began
   at it (`Runtime.fired`, asked of `NodeRunner.eventPorts`), and its package says so: `event`
   is set in the round it began and null in any other. A run no event started counts every
   event as fired.
   **The ◆ (`__run`) is a gate**: wired, the node runs only when this round opens it — the
   start point the round began at is wired to the node, or a node computed `true` onto it in
   this round; OR over several wires, only `true` opens. So a code node returning booleans is
   the filter and the router, and there is no node type for either. A node that stands still
   keeps what it made last (`execution/latch.ts`: meaning, not a cache — see its header for
   the difference from `reuse.ts` and from a data node); one fed only by nodes that stood
   still stands still too, unless it keeps something of its own (a data node, a start point);
   a start point's package is never handed back by `reuse.ts`; nothing is held inside a
   subgraph; what stood still is never settled into memory or shown a second time
   (`execution/gates.test.ts`).
3. **Per node.** Collect inputs -- an input with a `field` is handed that part of what
   arrives, a dotted path into a package's values (`fieldOf`, `collectInputs`) → idle-skip if
   a required or (for an AI node) every wired input came up empty → read the file on each
   input typed `file_path` (a code or AI node's "Read the file at this path"; never guessed
   from the wire) → run once, or once per item → record.
   A failure marks the node and skips its dependents; with `catch_errors` it becomes an
   `error` output instead. A node that holds a graph (`SubgraphNodeRunner`) runs it whole
   with the same `executeGraph`: what arrives on a port is sent to the start point of that
   name, under that name (`answerWith`, handed in as `given`); no event started that run, so
   every start point in there counts as fired, and one whose port nothing feeds hands on what
   its design says it was sent. At most `NESTING_LIMIT` (5) graphs deep.
4. **After the round.** `settleMemory` hands a data node what arrived at it, in the copy of
   the graph the round ran on -- the copy a session keeps. Then the session settles what the
   end points handed back into the blocks that show them, each block saying what arriving
   means (`settlePage`; `WidgetRunner.settle`: a chat adds the turn) and how it is drawn
   (`displayValue`: an image's path read into the picture); what stood still is left out.
5. **Watching and stopping.** A server holds one `Session` (`host/session.ts`): the graph in
   use and what using it leaves behind (see [State](#state)). Its `Rounds`
   (`host/rounds.ts`) start each round in the background, one at a time in the order asked
   -- the clock's, the page's and a caller's alike --, turn the executor's progress events
   into the `RoundSnapshot` a page is told over the session's stream, and abort a round on
   Stop. An `AbortSignal` reaches every model call and every sandboxed body.
6. **Shutting down.** A server holds a clock, runs in flight, the children those started,
   and a socket. `serve()` writes each into a `Lifecycle` (`host/lifecycle.ts`) as it starts
   it, and `shutdown()` stops them in that order — what makes work before what carries it:
   the clock, the rounds (`Session.stopAll`), then HTTP, which meanwhile still answers a
   page watching its run and refuses anything new with 503. Each step gets what is left of
   eight seconds; what would not stop is named. A round of the clock still waiting behind a
   page's run goes at once (`Rounds.start` is handed its signal). A round of the clock that
   was cut off commits nothing, so `state.json` keeps what the last round that finished
   left. The CLI maps
   Ctrl+C, SIGTERM, SIGHUP and Ctrl+Break to it (`untilStopped`); a second signal exits at
   once. `serve()` itself installs no signal handler: it is a library function.

`callNode` (one call of a node on its input.js example), `executeNode` (one node on given
inputs) and `inputsFor` (run what feeds a node, not the node) are the same machinery, and
are what the editor's **▶ Try** and **⟳ From the graph** use.

## Authoring: a node is its text

**A node says what should happen; everything else is generated, in files.** A code, an AI
or a data node is its heading and its text, and a ✨ for each file written from them: a
code or AI node's input definition (`input.js`), its output definition (`output.js`) and
its body -- `code.js`, or an AI node's `prompt.md` -- and a data node's data. A block on a
page writes nothing: a chart, a table or an image shows what arrives at the end point it
shows, a folder picker lists its folder, and what reshapes a value is a code node wired in
before that end point. The block's dialog is its settings, and for a display block one
sentence of what it shows (`DisplayWidgetRunner.draws`, the same words the node wired into
its end point is told). Nor do the nodes that are their settings: a start point says who
starts it, a folder node which folder it lists, an end point what the run hands back under
its label and where it writes it -- their panels are those settings.

```
heading · text ──✨ Input──▶ input.js   ◀── files: examples, a spec (⟳ · 📂 · dropped)
               ──✨ Output─▶ output.js  ◀── files it may be given
               ──✨ Code───▶ code.js / prompt.md ──▶ ▶ Try: one call on input.js's example,
                     ▲                                held to output.js ── ✨ Fix
                     └──────── "Say what to change" (the bar under the canvas)
```

**A definition** ([`authoring/definition.ts`](../engine/src/authoring/definition.ts)) is a
JSDoc typedef of what one call is handed or returns, then `module.exports = <one example as
plain JSON>;`. The engine reads the example without running anything (`definitionExample`);
a stub's `module.exports = null;` is no example. output.js's keys *are* the node's outputs --
✨ Output sets them, and the editor writes the ports from the file (`writtenInto`) -- and
input.js's keys must be its inputs (`check`). What a node hands on is the shape of its
output.js example (`NodeRunner.outputInterface`), held to every run (a message, not a
failure) and told to the nodes after it.

**The prompts are the node's, the frame the engine's**
([`authoring/prompts.ts`](../engine/src/authoring/prompts.ts)). Each ✨ has a standard prompt
naming variables -- `{Node Description}`, `{Input Definition}`, `{Output Definition}`,
`{Context}`, `{Example Files}`, `{Output Files}` (`VARIABLES` says what each is filled with)
-- and a node keeps its own where someone changed it (`config.prompts`). The engine fills
them from the request ([`host/editor/brief.ts`](../engine/src/host/editor/brief.ts)): a
definition as the file says it, where it is written, and after it -- always -- each port as
wired, as the editor says it (`authoring/generationContext.ts`): where an input comes from
and what arrives there (`input_sources`: the node before it says what it hands on,
`NodeGuiBuilder.describeOutput` -- a data node the start of what it holds, a start point what
the page's blocks send it or what a call sends it for example, as far as the input takes
it), where an output goes and what the node there wants (`output_targets`, `wantsOn` -- and at
an end point, what the block that shows it wants, at the size it is drawn: a chart its points
or a figure). ✨ Input's standard prompt names the one, ✨ Output's the other, and both say to
follow what is wired. The files ✨ is given are read here, sharing about 4 000 characters;
`{Context}`, the graph around the node, is the editor's to say
([`authoring/graphContext.ts`](../editor/src/authoring/graphContext.ts): the nodes in run
order, the wires, the page with each block as a person calls it (`WidgetGuiBuilder.called`),
its size and the start and end points it connects to). After the prompt comes
the engine's frame ([`host/editor/generate.ts`](../engine/src/host/editor/generate.ts)): the
file's format, the keys to return, that the input ids stay as they are named, and that an
empty input is answered with what to do rather than a failure.

**One request, built once** ([`authoring/generation.ts`](../editor/src/authoring/generation.ts)):
the panel, the toolbar's sweep and "What ✨ sends" build it with `generateRequest`, and
what comes back is written into the node by one pure function, `writtenInto` -- the file,
the outputs an output.js names, and the exchange at the end of the node's `history.md`
([`authoring/history.ts`](../engine/src/authoring/history.ts), about 500 KB kept). One press
of the body's ✨ writes what is missing of the definitions first (`writesFor`), and stops at
a definition that does not fit the node (`unfitDefinition`). The sweep writes each node
whole, in the order the graph runs (`graphSweep.ts`, `useGraphSweep.ts`).

**Generation** is: write → try once on input.js's example → hold it to the keys it must
return and to output.js (`misfits`) → repair once with the evidence. A definition is asked
again once when it cannot be read or names ports the node does not have. "Say what to
change" and ✨ Fix go through the same path with `refine`: the body as it is, its output.js,
what came of the last try, and the words -- none for a fix. The answer brings the node's
text back restated and, where the change needs other outputs than output.js describes, the
new output.js in a second block (`GenerateResponse.output_definition`): the body is held to
that one, and the panel writes body, output.js (and so the outputs) and text as one step
(`writtenInto`). **A change keeps its word:** without an output.js of its own it is held to
running and to returning every output, never repaired toward the output.js from before it,
so the attempt that holds the change is kept, and what does not fit is said. ✨ Fix where
output.js cannot be read asks for it corrected the same way. Every model call is recorded
(`AICall`) and can be watched while it runs.

**▶ Try, `test` and `run-node` are one call.** `callNode` runs a node's body once on the
example in its input.js -- no file read, nothing fanned out: the example is one item, as
a read file gives it -- and [`authoring/examples.ts`](../engine/src/authoring/examples.ts)
holds what comes back to output.js (`runExample`, `testGraph` at every depth). `executeNode`
runs a node on given inputs as a run does (`run-node` with inputs), and `inputsFor` runs
what feeds a node, not the node: ⟳ From the graph.

**A round that went as it should is the graph's test.** [`project/keptRounds.ts`](../engine/src/project/keptRounds.ts)
keeps one (`keptRound`, from the round's result and what began it): what its nodes made
that came from outside the graph or from before -- a start point's package, a model's
answer (`asksModel`), memory (`isMemory`), what stood still -- under `given`, and what
its end points handed back. `replayRound` runs the graph again with `given` handed in
through the executor's own `given` -- the way a subgraph's start points are answered --
and a runtime whose model refuses to be asked, and holds the outputs to what they were.
`test` and `test_graph` run every round a project keeps beside its nodes' examples
(`project/keptRounds.test.ts`; `cli/cli.test.ts`, "keeps a round that ran through as a
test of the project").

**Every file in sight.** Each row shows its file's content in a box -- `authoring/CodeField`,
CodeMirror loaded when first drawn (`CodeSurface`), JavaScript for the definitions and
code.js, Markdown for prompt.md; a data node's own box for what it holds -- edited there as
in the file, with a chip beside it that opens the file in the person's own editor
(`FileChip`, `openExternal`: VS Code, else a text editor -- never the system's "open",
which runs a .js on Windows).

**No Save.** What a node's panel changes is written into the graph a moment later
(`canvas/nodePanel.ts`), one undo step per field typed into (`graphStore.commit`'s
coalescing) -- the field on screen, not the setting it writes: two prompt boxes are two
fields of one setting. What is not typing -- a file dropped in, what ✨ wrote, a box ticked
-- is a step of its own (`UndoStep`), and a run that lands ends the step being typed. What a
field shows is what was typed, a space at its end included. What cannot be stored yet -- a
data node's structure that does not parse, a port name that is empty or taken -- stays in
its field with the reason (`useTyped`), and is never written. A port renamed carries its
key in input.js and output.js along (`authoring/definitionPorts.ts`).

**A dropped file.** A file dropped on a node on the canvas is given to it as the element
says (`NodeGuiBuilder.dropPort`, `withDropped`): one more file a code or AI node's ✨ Input
writes from, its path (`document/givenFiles.ts`), and what a data node holds. It is one
undo step, and opens the node's panel (`authoring/droppedFile.ts`).

**One way to run a body — on Node.** A code node's `code.js` is the one kind of body, and
`elements/body.ts` (`runBody`) is the only place in the engine that runs one: `async
function run(inputs, node)`, in a process of its own, returning an object keyed by output
port. The element decides *when*; what a failure costs is the executor's (`catch_errors`);
never *how*. Generated code is tried the same way, so code that asks a model is tried with a
node it can ask. On disk, code.js ends with a few lines that run it on input.js's example
when it is run by itself (`RUN_ON_ITS_OWN`): the folder writes them after the body and
takes them off when it reads the file. Nothing runs in the page: a node says *what* to plot
(`{kind, title, points}`, ordinary data on a wire, or finished SVG), and the chart draws it
at the block's real size (`plot_window/PlotChart.tsx`), redrawn on a resize with no run.

**A language is the node's.** Everything that is JavaScript about writing and trying a body
-- what the model is told, the empty `run` it completes, the fence, "only what Node has
built in", and how a written body is tried on its example -- is the code node's `Language`
(`nodes/code/javascript.ts`), declared in its `generation()`. The writer
(`host/editor/generate.ts`) names no language, and the files a person may open in their
own editor are the ones the nodes say they keep (`texts()`), so a node for another language
is one runner and its builder in the editor, registered on both sides
(`generate.test.ts`: "written and tried in the language its node declares"). What it would
still bring is a way to run its body: a `CodeService` that runs that language, beside the
one that runs JavaScript in a process of its own (`core/node.ts`).

**A body can ask.** `CodeService.run(body, inputs, signal, context)` hands a body a second
argument, `node`: `calls` — questions it may put to the process that holds the graph, over
its own stdin/stdout (`core/node.ts`). That is how a body asks a model without ever holding
a key: `node.llm` is answered by `askModel` (`nodes/ai/ask.ts`), the one way to ask, counted
per run. An AI node asks the same way, from the engine: its prompt.md -- or the standard
instructions -- filled in, then what arrived, each input under its port id where there are
several (`nodes/ai/prompt.ts`).

## A graph on disk

A graph is a folder, and **each fact is in one place**:

- `flow.json` — the graph's name and description, which nodes there are (`id → type`) and
  every wire, one line each: `"summarize.data -> reader.file"`
  ([`project/flow.ts`](../engine/src/project/flow.ts)). Nothing about any node, and nothing
  about the page.
- `nodes/<id>/node.json` — the node's heading, text and settings. `nodes/<id>/interface.json`
  — its ports, and for an input the part of a start point's package it takes (`field`)
  ([`project/interfaceFile.ts`](../engine/src/project/interfaceFile.ts)).
  Nothing about its neighbours: a node that needs to know what arrives follows the wire and
  reads the other node's output.js.
- Every piece of writing is a file of its own beside them. Which fields become which files
  is element knowledge, so each element declares it (`NodeRunner.texts`, `TextFile`).
- `page/page.json` — the page: its blocks, in order, each with what it connects to
  (`sends_to`, `fires`, `shows`). The page is no node, so it sits beside `nodes/`, not in
  it, and `flow.json` does not name it (`PAGE_FILE`). A graph has one page and it is what a
  person using the tool sees, so it is the one folder anybody opening the project looks for.
  A page of no blocks is no page, and has no file.

  ```
  nodes/<id>/
    input.js      what one call is handed, and an example        (code, AI node)
    output.js     what one call returns, and an example          (code, AI node)
    code.js       the code, and the lines that run it by itself  (code node)
    prompt.md     the instructions its model is given            (AI node)
    data.json     what it holds -- data.txt, for a text          (data node)
    history.md    every exchange with the model about it
  page/
    page.json     its blocks, in order, each with what it connects to
  ```

  **Every file is there from the start.** A text nothing has been written into is written
  as its stub (`TextFile.standard`): a comment saying what the file is and which ✨ writes
  it -- a definition's ends `module.exports = null;`, code.js's with a line that, run on
  its own, says it holds no code yet and fails -- and a stub read back is nothing
  written. `history.md` has no stub: it comes with the first exchange. What follows a body
  in its file only on disk -- code.js's lines that run it by itself -- is `TextFile.footer`,
  written after the body and taken off on the way in.
- `layout.json` — positions and sizes only.
- A node that holds a graph (`subgraph`) keeps it in its own folder, which is a project folder
  like any other (`flow.json` and `nodes/` beside its `node.json`; `nestedGraphs`): reading,
  writing, tidying and `check` recurse into it, and the graph in there runs on its own
  (`examples.test.ts`: "nested_statistics: the part runs inside the whole, and on its own").
- `frontend/` — a page of the project's own, written by hand against the runtime API, by
  name: served at `/` in place of the built page, and carried by a bundle
  ([deployment.md](deployment.md#a-page-of-your-own); `host/frontend.test.ts`).
- Not the project's: `state.json`, what a session of it keeps ([State](#state)).

[`project/folder.ts`](../engine/src/project/folder.ts) reads and writes a folder for everyone —
editor, CLI, a served tool, the MCP server — and never learns what a code node is. The graph
in memory is one document, whichever way it is stored; only the folder is laid out this way.
`graphFrom` puts it together from the files' contents without touching a disk, so a test
or a page that has them can do the same.

- **The file wins over the inline value.** A text is read from its file when there is one.
  That is why a graph pasted as JSON or kept as one `.json` file (everything inline) and a
  project folder open the same way. A folder is a project only when it has a `flow.json`.
- **Structure and writing never share a file**, and keys are sorted, so an unchanged
  save changes nothing and a moved node changes only `layout.json`.
- **Two editors, one folder.** Every file read or written is remembered by signature; a
  save that would overwrite a file changed since refuses (`FileChanged`) -- `flow.json` and
  `layout.json` too, so a node another writer added is not saved away -- and the editor
  asks every 1.5 s what changed (`changesOnDisk`) and takes it in as one undo step. A save
  tidies away only files it read or wrote itself that no node claims any more; a file it
  never saw is a person's, and a node of an unknown type keeps its folder.
- **A graph that is there is replaced only when said.** The editor's `saveGraph` route
  refuses (409, `Failure.taken`) to write over a project or graph file at the path
  (`graphAt`) unless the request says `replace`: Save of the open file does, and Save as
  after the person chose **Replace** in its dialog -- held by
  [`routes.test.ts`](../engine/src/host/editor/routes.test.ts).
- **`check`** ([`project/check.ts`](../engine/src/project/check.ts)) is the one list of
  problems: the CLI prints it and CI fails on it, the MCP server returns it before saving, and
  the editor says it before Load under a graph pasted as JSON and under one ✨ AI Graph
  designed, and before Apply under the graph it changed (`app/GraphProblems.tsx`). It reads
  no disk, so the page can ask it; what only a project folder gets wrong -- a folder or a
  file nothing claims -- is
  [`folderCheck.ts`](../engine/src/project/folderCheck.ts)'s. It finds
  what any node can get wrong -- among it a definition that cannot be read, names a port the
  node does not have, or leaves an output out, and a wire into a port that the node before
  it does not supply according to its output.js; what is wrong with *one kind* of node — a
  code node with no code, a start point that never starts, an end point set to write that
  names nowhere to write (`project/check.test.ts`: "what check finds of an end point that
  writes") — is that element's `problems()`, told which of the node's inputs are wired;
  what is wrong with the page — a block connected to nothing, a start or end point the graph
  does not have, a start point the page starts that nothing on it fires, an input taking a
  part of what the page sends that no block sends — is `pageProblems` (`elements/page.ts`;
  `elements/page.test.ts`: "what is wrong with a page"). A graph with no end point is a
  problem: nothing a person can see. Two end points sharing a label are a problem too; until
  it is fixed the run's result keeps the first under the label and the others under the
  label with their id (`NodeRunner.ts`'s `resultKeys`), and `check` names those keys. Ids a
  folder could not read back -- two differing only in case, a number, a "." or "->" -- are
  problems as well (`flow.ts`'s `unsavableIds`), and a save refuses them.

## State

**The design is the document. What using it leaves behind is state.** A graph is designed in
the editor and saved as a folder; it is *used* by a page, a clock, a command line, a model
over MCP. This section says what using a graph leaves behind, where it is kept, and the
rules it is kept by.

### Where it lives

| State | Lives in | Written by |
|---|---|---|
| what a person set on the page: a block's value -- typed text, a choice, a slider, a picked path, a chat's message in hand | the page, by block id, until a round the page starts takes it (`api/session.ts`); then the session's page slots, by block id ([`host/session.ts`](../engine/src/host/session.ts)) | the page (`setEdit`); a round the page starts is sent it as `values` by block id, and the "before running" dialog's answers go with it the same way, under the id of the block that asked |
| what a start point was sent last: the values of the last round it began | the start point's slot (`values`), in the session and its `state.json`; told by name as `SessionView.sent` | whoever started that round -- the page, a caller, its own clock (`NodeRunner.startWith`) |
| what a round handed back to the page: an end point's value, in each block that shows it -- a chat's reply joining its conversation, a chart's data, a box's text | the session's page slots, and its `state.json` | the session, into the working copy the round ran on (`settlePage`, `WidgetRunner.settle`); kept once the round ran to its end |
| what a round delivered to a data node | the node's slot (`data_value`), in the session and its `state.json` | the executor, into the working copy it ran (`NodeRunner.settleMemory`) |
| a message, once delivered | emptied in the session's page slots | the session: a block that holds a message (`WidgetRunner.clearsValueAfterRun` -- a box whose Enter fires a start point) |
| what every node made last, for the rounds its ◆ stays shut | `Latch` ([`execution/latch.ts`](../engine/src/execution/latch.ts)) in the session's graph core, keyed by the graph's name and shape and what each node is made from as written; what a round leaves in it is committed when the round ends, and written to `state.json` | the executor |
| what a node made from the same inputs | `LastOutputs` ([`execution/reuse.ts`](../engine/src/execution/reuse.ts)), in the session's graph core: an optimisation, which changes how long a round takes and nothing else | the executor |
| what the page shows | what each block that shows an end point shows (`SessionView.shown`) and what each end point handed back, by name (`SessionView.outputs`, `outputsOf`), every round laid over the ones before, in the session and its `state.json`; the editor's store shows a round on the graph as it goes and keeps none of it (`followRound`) | the session |
| a round in flight | the session's `Rounds` ([`host/rounds.ts`](../engine/src/host/rounds.ts)) | — |
| the clock of a tool that runs by itself | the session ([`execution/clock.ts`](../engine/src/execution/clock.ts), `Session.startApplication`) | a served tool starts it as it starts; the editor's ▶ Run starts it and ■ Stop ends it |

The one place a value set on a page is the document's is the Gui tab, where blocks are
designed: a value typed there is what the block is designed to hold. A chat's is not: a
conversation is always the session's (`WidgetRunner.valueIsDesign`).

### The rules

Each names the tests that hold it; `host/session.test.ts` holds them one by one.

1. **Using a graph does not change its design.** A **session** holds one graph as it was
   handed over -- by the editor, or loaded by a served tool -- and everything using it leaves
   behind. A value typed into the page, what a round settled, a message emptied after it was
   delivered: the session's, never the document's. Nothing of it marks the editor's document
   unsaved, Save writes none of it, Deploy ships none of it. (`store/graphStore.test.ts`:
   "shows what a round made, and keeps none of it in the document"; `masterExamples.test.ts`:
   the chat "remembers the turn for the next one -- in the session, not in the document".)
2. **What state is.** For each node, its *slots*: what it keeps between rounds -- a data
   node's `data_value`, a start point's `values`, what it was sent last. Which slots a node
   has is its element's to say (`NodeRunner.state` and `setState`), as where it settles
   memory is. Beside them, the page's: what each block that keeps something holds, by its
   id -- a value set, a conversation, what an end point handed back
   (`WidgetRunner.keepsState`; `pageState` and `setPageState` in `elements/page.ts`); a
   heading, a divider, a spacer are their design. Beside the slots: what each node made last
   (the latch), what the page shows, and how many rounds ran. Not state: the reuse cache,
   and a round in flight. ("a session": "keeps what a block holds by its id, and a heading
   not at all: that is its design")
3. **Where.** In the session, and in `state.json` beside the project's `flow.json` --
   `<file>.state.json` beside a single graph file; an unsaved graph's state is held in memory
   only. The file is not part of the project: `check` and a save leave it alone and a bundle
   never carries it. *Reset* empties the session and deletes the file: what it forgets is
   what the session says it keeps (`SessionView.kept`: each node's slots and the page's,
   where they differ from the design), which the App tab folds under *What using it keeps*,
   with ↺ Start over, as the delivered page has ↺ Start over. A document saved
   where it was not -- for the first time, or as another project -- keeps its session, and
   its state is written there from then on; only another document is a session of its own.
   ("what a session keeps on disk"; "the document the editor hands over")
4. **When.** A round runs on a working copy: the design, the slots put back into it, and
   what the round was sent put into the start point it fires -- for a round the page starts,
   what the blocks that send to it hold (`pageSends`). A round that ran to its end commits --
   its slots and the page's, what it left in the latch, the result it shows, the messages it
   delivered emptied -- and the file is written. A round that was stopped, or could not
   start, commits nothing: it was not a round, as a clock's round cut off by a shutdown never
   was one. What a failed node did not deliver is not settled: a chat whose model failed
   keeps its conversation and the message in hand, since its end point was handed nothing.
   ("commits nothing of a round that was stopped"; "a gate, round by round";
   `ChatWidgetRunner.test.ts`: "leaves the conversation alone when nothing came back")
5. **A design that changed wins.** Each slot is kept with the design value it started from.
   When a session loads its file, and whenever the editor hands it a changed graph, the
   slots of a node that is gone, of a block that is gone, and of a slot whose design value
   changed since, are dropped and said -- never guessed. A renamed node is one that is gone
   and one that is new. The latch needs no rule of its own: its keys are the nodes as written.
   ("a design that changed")
6. **One session per server.** Its id travels in every route of the runtime API, and in
   `page`, so a session per visitor would need no change to the contract; it is kept in
   `state.json`, so a restarted tool goes on with the same session. The editor hands its
   document over as the document of the session it holds; any other handover -- another
   document, or a second editor that took the server meanwhile -- is a session of its own,
   from its own file, so neither writes into the other's state. A page's stream follows the
   session the server holds. (`host/runtimeApi.test.ts`: "answers for its own session only";
   `host/session.test.ts`: "the document the editor hands over")
7. **Calling a graph keeps nothing.** `node engine/src/main.ts <graph>` and the MCP server's
   `run_graph` start from the design, put what they are given into the start point the event
   names, and return what it hands back: a function call. Rounds of one `--every` share their
   memory while the process lives. (`cli/cli.test.ts`: "runs what --event starts, on the
   values --value gives by name, as the page would send them", after which the graph is as it
   was and nothing is kept beside it; "runs one graph round after round: what a round leaves
   in a data node is what the next starts from")

### Not state of a graph

| What | Lives in | Travels as |
|---|---|---|
| keys, endpoints, MCP servers that start programs | `ai-settings.json`, machine-side, never in a graph | — |
| the one AI setting: what ✨, ▶ Try and every run call unless a node pins its own | `ai-settings.json`'s `ai` (or `AI_GRAPH_AI_PROVIDER`/`_MODEL`), read only by `aiSetting` in [`ai/settings.ts`](../engine/src/ai/settings.ts) | `ProviderStatus.target`, for the editor's "now: …" |
| a node's own model | the node's config (`ai_provider`, `ai_model`) | the graph |

## Security boundaries

- Everything binds to loopback. Nothing asks who is calling: bound wider -- a container's
  `0.0.0.0` -- every route of the table is open to whoever reaches the port, which is why
  the container is published on the host's loopback only (`docker-compose.yml`). File
  browsing, finding a dropped folder or file, and a file chip's opening of a node's file in
  the person's own editor switch off on such a bind (`loopback` in `serve.ts`, `editor/routes.ts`).
- The server answers its own page, not every page in the browser: a request must name
  127.0.0.1, localhost or [::1] (no DNS rebinding) -- with the server's port on loopback;
  bound wider, with any port, or the address it was bound to, or a name
  `AI_GRAPH_ALLOWED_HOSTS` lists. An API call that says where it comes from must come
  from the server's own origin, one the browser marks cross-site is refused, and a body is
  read only when it is sent as `application/json` (`foreignRequest` and `readJson` in
  `host/http.ts`).
- The `for` column of the contract is the line between a deployed tool and the editor: a
  deployed tool answers its graph, run/watch/stop, a file picker and a read-only view of
  its AI settings — no generation, no editing, no writing settings.
- A code body runs in a separate Node process under `--permission`: files yes; child
  processes, addons, workers no. The network is **not** closed (Node has no flag for it).
  Its process is handed no key: its environment is the engine's without a provider's
  credential or anything named like one (`bodyEnvironment` in `core/node.ts`), and a model
  call is *asked for* (`node.llm`) and made by the process that started it, at most 25
  times each time it runs. That is the process, not the disk: a body reads files, and
  `ai-settings.json`, keys and all, is a file. A `code.js` from a folder somebody handed
  you is never run in the trusted process.
- A graph can *name* an MCP tool server; only `ai-settings.json` can say which program a
  name starts. A URL is called directly.
- The MCP **server** (`host/editor/mcpServer.ts`) confines every path to one root and takes
  only a `.json` path -- a graph file, or a project's `flow.json`, whose nodes' files are
  written with it --, never reads settings, and filters keys out of everything it returns.

## Keeping it clean

- CI (`.github/workflows/ci.yml`) runs `npm run licenses`, `typecheck`, `lint`, `build` and
  `test`, then `check` and `test --offline` on every example folder, and the launcher and
  package tests (`node --test scripts/launcher.test.mjs`, `scripts/package.test.mjs`).
- Both packages compile with `noUnusedLocals` and `noUnusedParameters`: an unused import,
  variable or parameter is a build error, not a lint warning.
- Panels are typed (`NodePanelProps`, `WidgetPanelProps`), not `any`: a shell that stops
  handing a panel what it reads fails to compile.
- Build time and run time are kept apart inside each element class, and the tests read the
  bars that say which is which ([`times.test.ts`](../engine/src/elements/times.test.ts),
  [its mirror](../editor/src/elements/times.test.ts)).
- No code outside `elements/` compares a node type with a literal, in the editor (and a widget
  kind: [`shells.test.ts`](../editor/src/elements/shells.test.ts)) or in the engine
  ([`shells.test.ts`](../engine/src/shells.test.ts); `execution/triggers.ts` alone reads the
  document without asking, to list the start points that start themselves:
  `graphTriggers`). What such a comparison would decide is a member of the element's class —
  `NodeRunner.takesPackage`, `startedBy` and `boundaryRole`, `NodeRunner.isResult` and
  `resultLabel`, `NodeRunner.problems`, `NodeGuiBuilder.missingExample`, `WidgetRunner.sends`,
  `event`, `showsEnd` and `receives`, `graphAuthorNote` — so a new kind answers for itself.
  The prompt that designs a whole graph is assembled from the kinds' own `graphAuthorNote` --
  a folder node says its ports from its own `derivedPorts`, and the page's note
  (`pageAuthorNote`, `elements/page.ts`) lists every block kind with the block's own note --
  and keeps only the rules that span kinds; a node kind without a note (a subgraph) is not
  offered to the model (`host/editor/graphPrompt.test.ts`: "names every node type the
  registry knows, except the ones that say a graph is not built with them"; "lists every
  block kind there is, each with what it says of itself").
- The editor's layers are held by [`layers.test.ts`](../editor/src/layers.test.ts), see above.
- What two layers both say, one file says: `errors.ts` holds `NotFound` and `NotAGraph` for the
  project folder, the directory listing and the server that turns them into a status.

## Settled debt, and what is deliberately not there

Measured on 2026-10-04, at commit 9a493c0. A number here is a measurement, not a limit: a
test that reads the source is named where there is one, and where there is none the way it
was measured is said.

- **A few functions and files carry too much at once.** `editor/src/store/graphStore.ts` (1020
  lines: the document and its page, its normalisation, the ReactFlow adapter, what a round
  shows and undo), `App.tsx` (642), `app/Toolbar.tsx` (477), `host/editor/mcpServer.ts`'s
  `createGraphTools` (368 lines of 952), `host/editor/generate.ts` (960) and `executor.ts`'s
  `executeGraph` (238 lines of 996) -- a file's lines as it has them, a function's from its
  declaration to its closing brace in the TypeScript syntax tree. Each but `App.tsx` has
  tests of its own (`store/*.test.ts`, `host/editor/mcpServer.test.ts`,
  `host/editor/generate.test.ts`, `execution/executor.test.ts` with `run.test.ts` and
  `gates.test.ts`, `app/Toolbar.test.ts`); no test draws `App.tsx`.
- **The engine has no typed `NodeConfig`.** `GraphNode.config` is `RawConfig`
  (`Record<string, unknown>`); each element's `config()` types it field by field with no cast
  (`AiNodeRunner.config`), and is the one reader meant to. Outside the element folders 13
  places still read a raw field (a `.config.<key>` or `.config[…]` of a node or a block, in a
  source file outside `elements/nodes/` and `elements/widgets/`): the base classes' defaults
  among them (`catch_errors`, `batch_mode`, `batch_concurrency`, a block's `value`),
  `execution/triggers.ts` reading a start point's `started_by`, `on_start` and `every`, and
  `authoring/`, `host/editor/generate.ts` and `project/folder.ts` reading and clearing what a
  node's writing is kept under. `elements/page.ts` reads and writes a block's stored `value`
  itself as well (`pageState`, `setPageState`, `clearDeliveredPage`). The engine has 134 type
  assertions (`as T`, not `as const`: the `as` expressions in the syntax tree of every
  non-test source file of `engine/src`), 8 of them on a node's config. Nothing holds other
  callers to asking `config()` first.
- **Editor components are tested, unevenly.** 36 test files draw a component with
  `renderToStaticMarkup` (the panels, the views, the page, the bar, the header) and 9 render
  one into a DOM under happy-dom and drive it (`typedAsTyped.test.ts`, `askedChange.test.ts`,
  `canvas/NodeEditor.test.ts`, `canvas/GraphCanvas.test.ts`, …). Of the 83 component files
  (`.tsx`) in `editor/src`, 27 are named by none of the 96 test files (each file's name
  searched for across them): among them `app/SettingsDialog`, `app/ResultsPanel`,
  `dialogs/FileBrowserDialog`, `authoring/NodeDefinition` and the panels of the text,
  text_io, slider and select blocks. No test imports `App.tsx`.
- **There are no import cycles through values**, in either package, and none from the engine
  into the editor: 257 modules and 778 value imports between them, as "Modules, by side"
  measures them; no test holds the count.
- **A saved node carries only what differs from the default.** In memory every node has the
  full `NodeConfig`, so a panel can read any field with a type. `document/baseNodeConfig.ts`
  is each key's one default -- what the engine reads a missing key as. Loading fills a missing
  key from it, and `savedNode` writes only the keys that differ from it.
  [`savedConfig.test.ts`](../editor/src/elements/savedConfig.test.ts) asks the engine's element
  the questions a run asks, for every node type and mode, and holds the lean node to the full
  one's answers.
- **A run lands only in the graph it started on.** The store counts documents (`document`):
  every load and every step into or out of a node's graph is a new one. A run or a ✨ sweep notes
  the count it started with and drops what comes back for another; New, Open and Reload wait
  while either is going. A block is added, changed, moved or removed only through
  `page/pageWrite.ts`, which reads the page from the store when an edit lands; deleting a
  start or end point takes the blocks' connections to it in the same step
  (`graphStore.deleteNodes`, `withoutPoints`).
- **An event reuses what it only needs.** What the event is *for* — the nodes its start point
  is wired to and everything after them — runs fresh; a node upstream of that, run only as
  context, hands back its last outputs when its definition, every input (files already
  read) and the one AI setting are unchanged ([`execution/reuse.ts`](../engine/src/execution/reuse.ts)).
  A node with nothing wired in reads the outside world and always runs, and so does one that
  reads it whatever arrives: a folder node lists its folder every round
  (`NodeRunner.readsOutside`; `execution/reuse.test.ts`: "lists the folder again every round:
  a file added since is in it"). A start point's package is never handed back, and a
  whole-graph Run reuses nothing (`execution/triggers.test.ts`: "reusing context";
  `execution/gates.test.ts`: "an event is a moment").
- **A tool that runs by itself remembers what its rounds showed across restarts**, in its
  session's `state.json` ([State](#state)). It is still a clock around a run: no history
  and no ingest endpoint, because a monitoring system is a different product.
- **Not there, and said where it matters:** a check of who calls the server (see
  [Security boundaries](#security-boundaries)); a closed network for a code body (Node has no
  flag for it); more of MCP than tools in the client (`ai/mcp.ts`); a session per visitor
  (rule 6 of [State](#state)).
