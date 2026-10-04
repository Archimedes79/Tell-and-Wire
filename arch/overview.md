<!-- last verified: 2026-10-04 -->
# AI-Graph — architecture diagrams

Five architecture diagrams and four class diagrams, each with a table that maps every box to
its files: [the whole](#the-whole), [elements](#elements), [run and disk](#run-and-disk),
[server](#server), [browser](#browser); [node runners](#class-diagram-node-runners),
[widget runners](#class-diagram-widget-runners), [the builder side](#class-diagram-the-builder-side),
[runs and their state](#class-diagram-runs-and-their-state). The prose that explains them
is [docs/architecture.md](../docs/architecture.md), whose last section says where the code
does not keep its own rules.

Every arrow is read off the source, never guessed from a name: in the whole, run and disk,
server and browser an import line of a file `git ls-files` lists in `engine/src` or
`editor/src`, tests left out (each diagram says which imports it draws), and in [elements](#elements) and the class
diagrams an `extends` clause -- or, for another relation, the field, the call or the test it
stands for (`symmetry.test.ts`, for "mirrors").

## The whole

Two processes: **Node** runs graphs, **the browser** draws them. They talk over HTTP,
and the conversation is one table both ends import: the contract.

```mermaid
flowchart LR
  subgraph browser["editor/src — the browser"]
    EditorPage["Editor page"]
    ToolPage["Deployed tool page"]
    Client["API client"]
  end

  subgraph engine["engine/src — Node"]
    subgraph host["host/"]
      Contract["Contract"]
      Server["Server"]
      Session["Session + rounds"]
      EditorHost["Editor routes + generation + MCP server"]
    end
    CLI["CLI"]
    Bundle["Bundle + launchers"]
    Core["Graph core"]
    Services["Runtime services"]
    Executor["Execution"]
    Authoring["Authoring"]
    Elements["Elements + registry"]
    Graph["Graph document"]
    Project["Project folder + check"]
    AI["AI providers + MCP client"]
  end

  EditorPage --> Client
  ToolPage --> Client
  ToolPage -->|"page/, the views, dialogs/, ui/"| EditorPage
  Client --> Contract
  Client -. "HTTP / JSON" .-> Server
  Server --> Contract
  Server --> Session
  Server -. "loaded only for the editor" .-> EditorHost
  Server --> Executor
  Server --> Elements
  Server --> Project
  Server --> AI
  Session --> Server
  Session --> Services
  Session --> Core
  Session --> Executor
  Session --> Elements
  Session --> Project
  Session --> Graph
  Session -. "types" .-> Contract
  EditorHost -. "types" .-> Contract
  EditorHost --> Server
  EditorHost --> Session
  EditorHost --> Services
  EditorHost --> Core
  EditorHost --> Executor
  EditorHost --> Authoring
  EditorHost --> Elements
  EditorHost --> Project
  EditorHost --> Bundle
  EditorHost --> Graph
  EditorHost --> AI
  CLI --> Server
  CLI --> Session
  CLI --> Services
  CLI --> Core
  CLI --> Executor
  CLI --> Authoring
  CLI --> Elements
  CLI --> Project
  CLI --> Bundle
  CLI -. "--mcp, setup lines" .-> EditorHost
  Bundle --> Project
  Bundle --> Elements
  Bundle --> Authoring
  Bundle --> AI
  Core --> Executor
  Core --> Authoring
  Core --> Elements
  Core --> Services
  Services --> AI
  Services --> Elements
  Executor --> Elements
  Elements --> Executor
  Elements --> Authoring
  Elements --> Graph
  Authoring --> Executor
  Authoring --> Elements
  Project --> Elements
  Project --> Executor
  Project --> Authoring
  Project --> Graph
  EditorPage -. "engine code in the browser" .-> Elements
  EditorPage -.-> Executor
  EditorPage -.-> Project
  EditorPage -.-> Authoring
  EditorPage -.-> Graph
  EditorPage -.-> AI
```

| Diagram node | Path | Notes |
|---|---|---|
| `Editor page` | [`editor/src/App.tsx`](../editor/src/App.tsx), [`app/`](../editor/src/app/), [`canvas/`](../editor/src/canvas/), [`page/`](../editor/src/page/), [`elements/`](../editor/src/elements/), [`authoring/`](../editor/src/authoring/), [`store/`](../editor/src/store/), [`document/`](../editor/src/document/), [`dialogs/`](../editor/src/dialogs/), [`ui/`](../editor/src/ui/) | canvas, node editor, page designer, and every element's builder, panels and views; entry `editor/src/main.tsx`; the areas are drawn in [the browser](#browser) |
| `Deployed tool page` | [`editor/src/runtime/`](../editor/src/runtime/) | entry `runtime/main.tsx` → `runtime.html`; draws its page with the editor page's own `page/`, element views, `dialogs/` and `ui/`, and of the engine loads only the contract and the six small modules a view reads a value by; reaches no store, canvas, authoring or editor shell (`runtime/boundary.test.ts`) |
| `API client` | [`editor/src/api/client.ts`](../editor/src/api/client.ts), [`session.ts`](../editor/src/api/session.ts) | `call(route, request)`; `ApiError`; the session a page follows (`useSession`); `EditorView` narrows returned graphs; `watchGeneration` (a generation's calls, polled while it runs; a signal stops the watch at once, and what comes back later is dropped); `downloadBundle` |
| `Contract` | [`engine/src/host/api.ts`](../engine/src/host/api.ts) | every route: method, path, `tool`/`editor`, request and response types; types and one table only, so either process imports it |
| `Server` | [`engine/src/host/serve.ts`](../engine/src/host/serve.ts), [`http.ts`](../engine/src/host/http.ts), [`browse.ts`](../engine/src/host/browse.ts) | serves the page and the `tool` rows; refuses to start if a route has no handler; the file picker's listing; `http.ts` also holds what the session and the editor's files answer with -- `Refusal` (thrown with a status), `Download`, `message` -- which is why they import it |
| `Session + rounds` | [`engine/src/host/session.ts`](../engine/src/host/session.ts), [`rounds.ts`](../engine/src/host/rounds.ts), [`lifecycle.ts`](../engine/src/host/lifecycle.ts) | the one session: the graph in use and what using it leaves behind, and what a round is sent put into the start point it fires; its rounds, one at a time; what a server stops, in order (`lifecycle.ts`, whose `untilStopped` the CLI uses) |
| `Editor routes + generation + MCP server` | [`engine/src/host/editor/`](../engine/src/host/editor/) | the `editor` rows (`routes.ts`), ✨ (`generate.ts`), settings, files, `mcpServer.ts`; dynamic import, never in a bundle |
| `Runtime services` | [`engine/src/core/node.ts`](../engine/src/core/node.ts) | files, sandboxed code, models, tools: the `Runtime` handed to elements |
| `CLI` | [`engine/src/main.ts`](../engine/src/main.ts), [`engine/src/cli/cli.ts`](../engine/src/cli/cli.ts) | run a folder or a file once / on a clock (`--every`, `--limit`) / at a start point, sent values by name (`--event`, `--value`; values only with an event -- `cli.test.ts`, "turns down a name the graph does not offer") / `--serve` / `--bundle` / `--mcp` / `--editor` / `check` / `test` / `run-node`; nothing is asked on the terminal |
| `Bundle + launchers` | [`engine/src/cli/bundle.ts`](../engine/src/cli/bundle.ts), [`launchers.ts`](../engine/src/cli/launchers.ts) | what Deploy and `--bundle` write: the project folder, a copy of the engine, the built page (`web/`), the project's `frontend/`, the files the graph and its page start on, `run.cmd` and `run.sh`; the same launchers the download ([`scripts/package.mjs`](../scripts/package.mjs)) carries |
| `Graph core` | [`engine/src/core/`](../engine/src/core/): `protocol.ts`, `localCore.ts`, `stdio.ts` | what the wrapper asks of whatever runs its graphs -- a round, one node, an example, a graph's examples, what would arrive at a node --, one per session, holding what every node made last and the reuse cache; the JavaScript core in this process, or a program of its own on stdin/stdout (`main.ts core`, chosen by `AI_GRAPH_CORE`); [wrapper.md](../docs/wrapper.md) defines it |
| `Execution` | [`engine/src/execution/`](../engine/src/execution/) | order, fan-out, memory, stopping, what starts a round, and what a graph offers by name; see [run and disk](#run-and-disk) |
| `Authoring` | [`engine/src/authoring/`](../engine/src/authoring/) | what ✨ writes and how it is read: definitions, prompts, history, a node's example tried; see [run and disk](#run-and-disk) |
| `Elements + registry` | [`engine/src/elements/`](../engine/src/elements/) | one class per node type and widget kind, mirrored file for file by the builders in [`editor/src/elements/`](../editor/src/elements/) (part of the editor page); the page and how its blocks connect (`page.ts`); see [elements](#elements) |
| `Graph document` | [`engine/src/graph.ts`](../engine/src/graph.ts), [`editor/src/graph.ts`](../editor/src/graph.ts) | the engine's types -- a graph's nodes, wires and page (`Page`, its blocks), a port and the part of a start point's package it takes (`Port.field`) --, `parseGraph`, `mergeResults` and `defaultMetadata()` (a graph's settings when nothing says otherwise: a new graph's, and what `flow.json` leaves out); the editor's file is types only: the typed `NodeConfig` view, and a block as the editor holds it (`GuiWidget`) |
| `Project folder + check` | [`engine/src/project/`](../engine/src/project/) | a graph as a folder, read and written for every caller; the one list of problems; see [run and disk](#run-and-disk) |
| `AI providers + MCP client` | [`engine/src/ai/`](../engine/src/ai/): `providers.ts`, `settings.ts`, `mcp.ts` | providers (a model call given ten minutes by default, `AI_GRAPH_TIMEOUT_MS`, and `TimedOutError` past it), `ai-settings.json` and the one AI setting (`aiSetting`), the MCP client (tools only) |

An arrow is a value import from one box into another: solid where it stays inside one
process, dotted where the browser runs engine code without HTTP -- ports, what a block can
connect to, previews, the graph's interface, `check`: the engine's answer, computed in the
page -- or where a module is loaded only when it is needed; `HTTP / JSON` is the wire itself,
the one arrow that is no import. The two `types` edges are imports of the contract's types
alone, without its table: by the session, and by the editor's half of the server
(`host/editor/`); every other import of types only is left out (nearly every box imports the graph's),
and so is `errors.ts` (`NotFound`, `NotAGraph`), which the project folder throws and the
server and the editor's routes turn into a status. The bundle a deployed tool ships is
`engine/src` minus every `editor/` folder and every test, plus the built `runtime.html` and
the files it references ([`engine/src/cli/bundle.ts`](../engine/src/cli/bundle.ts),
`cli/bundle.test.ts`).

## Elements

What a node or a widget *is*, and how it looks and is edited. Two class hierarchies, one per
side, mirrored level for level: every engine class ends in `Runner`, and its editor
counterpart swaps that for `GuiBuilder`, in the same folder. [`symmetry.test.ts`](../editor/src/elements/symmetry.test.ts)
compares the two lineages class by class.

```mermaid
flowchart LR
  subgraph NE["Nodes, engine: nodes/#lt;kind#gt;/#lt;Kind#gt;NodeRunner.ts"]
    direction TB
    ER1["ElementRunner"] --> NR["NodeRunner"] --> KNR["7 × #lt;Kind#gt;NodeRunner"]
  end
  subgraph NB["Nodes, editor: nodes/#lt;kind#gt;/#lt;Kind#gt;NodeGuiBuilder.ts"]
    direction TB
    EG1["ElementGuiBuilder"] --> NG["NodeGuiBuilder"] --> KNG["7 × #lt;Kind#gt;NodeGuiBuilder"]
  end
  subgraph WE["Widgets, engine: widgets/#lt;kind#gt;/#lt;Kind#gt;WidgetRunner.ts"]
    direction TB
    ER2["ElementRunner"] --> WR["WidgetRunner"]
    WR --> KWR["6 × #lt;Kind#gt;WidgetRunner"]
    WR --> SR["StaticWidgetRunner"] --> KSR["text, divider, spacer"]
    WR --> DR["DisplayWidgetRunner"] --> KTR["plot_window, table, image_view"]
  end
  subgraph WB["Widgets, editor: widgets/#lt;kind#gt;/#lt;Kind#gt;WidgetGuiBuilder.ts"]
    direction TB
    EG2["ElementGuiBuilder"] --> WG["WidgetGuiBuilder"]
    WG --> KWG["6 × #lt;Kind#gt;WidgetGuiBuilder"]
    WG --> SG["StaticWidgetGuiBuilder"] --> KSG["text, divider, spacer"]
    WG --> DG["DisplayWidgetGuiBuilder"] --> KTG["plot_window, table, image_view"]
  end
  NE -. mirrors .- NB
  WE -. mirrors .- WB
```

| Diagram node | Path | Notes |
|---|---|---|
| `ElementRunner` | [`engine/src/elements/ElementRunner.ts`](../engine/src/elements/ElementRunner.ts) | what a node and a block share: `config()`, `catchesErrors()`; services in [`Runtime.ts`](../engine/src/elements/Runtime.ts) (`files`, `code`, `ai`, `tools`, `subgraph`, `fired`); a port is made by [`port.ts`](../engine/src/elements/port.ts), which also keeps what each input takes of a start point's package when a node's ports are derived again (`keepingFields`) |
| `NodeRunner` | [`engine/src/elements/NodeRunner.ts`](../engine/src/elements/NodeRunner.ts) | what it is: `texts` (a node's files of its own), `logic` (its body), `derivedPorts`, `nestedGraph` (and its setter), `isResult`, `resultLabel`, `boundaryRole` (where a graph meets the one that holds it: a start point `in`, an end point `out`), `valuePorts`, `definitions` (a code or ai node's input.js and output.js) and `outputInterface` (the shape of its output.js example) ┊ run time: `execute`, `eventPorts`, `keepsTime`, `isMemory`, `settleMemory`, `state`/`setState` (the node's slots in a session), `fansOut`, `batchMode`/`batchConcurrency`, `readsFileInputs`, `readsOutside` (what it hands on comes from outside the graph each time -- a folder's files -- so a round never hands back what it made before), `needsInput`, `offers`/`shows` (what the graph offers by name, and what it hands back there), `startedBy` (the page, a call, or the graph itself), `takesPackage`/`startWith`/`lastSent` (a start point's package: what a round sends it, and what it was sent last), `answerWith` (what the graph above hands down) ┊ build time: `generation`, `deployNeeds`, `whatRuns` (a `WhatRuns`), `problems`, `graphAuthorNote`, `asksModel`, `referencedPaths`; the file also holds `resultKeys` (the key each result node is handed on under: the first under a label keeps it) |
| `7 × <Kind>NodeRunner` | [`engine/src/elements/nodes/`](../engine/src/elements/nodes/) | start, folder, ai, code, data, end, subgraph: `nodes/<kind>/<Kind>NodeRunner.ts`; listed in [`registry.ts`](../engine/src/elements/registry.ts) (`NODES`), in the order a person or a model is shown them |
| `WidgetRunner` | [`engine/src/elements/WidgetRunner.ts`](../engine/src/elements/WidgetRunner.ts) | what it is: `widgetKind`, and what a block can do with the graph -- `sends` (what it sends, a `Sent`: its type and, for an object, its parts), `event` (what using it is: a press, Enter, a choice, a message sent), `showsEnd` ┊ run time: `data` (what it sends, as a start point's package holds it), `keepsState`, `settle`, `clearsValueAfterRun`, `displayValue`, `runtimeRequirements` (what a block asks before a round it sends to -- a picker with nothing chosen), `takesValue` and `setValue` (a value, by the block's id) ┊ build time: `receives`, `graphAuthorNote`, `referencedPaths` (the file a picker starts on, for a bundle to carry), `valueIsDesign` (a conversation is the session's, never the design's); the file also holds `Widget`, a block as the page keeps it, with its connections by name (`WidgetConnections`: `sends_to`, `fires`, `shows`); a block writes nothing, so it has no body, no files and no ✨ |
| `6 × <Kind>WidgetRunner` | [`engine/src/elements/widgets/<kind>/<Kind>WidgetRunner.ts`](../engine/src/elements/widgets/) | input_picker, text_io, select, slider, button, chat; listed in [`widgets/roster.ts`](../engine/src/elements/widgets/roster.ts) (`WIDGETS`). A file picker sends the chosen file as `{path, content}`, read through [`documents.ts`](../engine/src/elements/documents.ts) -- or only its path, `send: "path"` --, and a folder picker its folder's files through [`folderListing.ts`](../engine/src/elements/folderListing.ts), the function the folder node lists with. The small modules a page's views read a value by (`chat/value.ts`, `slider/range.ts`, `text_io/role.ts`, `text_io/text.ts`, `select/choice.ts`, `text/role.ts`) are the only engine code besides `host/api.ts` that a deployed page loads (`runtime/boundary.test.ts`) |
| `StaticWidgetRunner` | [`widgets/StaticWidgetRunner.ts`](../engine/src/elements/widgets/StaticWidgetRunner.ts) | sends nothing, fires nothing, shows nothing: part of the page, not the graph; its kinds are `text`, `divider`, `spacer` (the diagram's list) |
| `DisplayWidgetRunner` | [`widgets/DisplayWidgetRunner.ts`](../engine/src/elements/widgets/DisplayWidgetRunner.ts) | shows an end point and does nothing else: runs no code, and says what it draws (`draws`, what the node wired into that end point `receives`); its kinds are `plot_window`, `table`, `image_view` (the diagram's list; an image reads a path into the picture, `displayValue`, through [`images.ts`](../engine/src/elements/images.ts), whose media types and size limit an ai node's pictures are held to as well, by way of `documents.ts`) |
| `ElementGuiBuilder` | [`editor/src/elements/ElementGuiBuilder.ts`](../editor/src/elements/ElementGuiBuilder.ts) | `Panel` (lazy) |
| `NodeGuiBuilder` | [`editor/src/elements/NodeGuiBuilder.ts`](../editor/src/elements/NodeGuiBuilder.ts) | `label`, `icon`, `color`, `hint`, `paletteGroup` (Input, Processing, Output, Structure), `AdvancedPanel` with `advancedSummary`, `describeOutput`/`canvasSummary` (what the canvas shows of the last result, beside which port, is [`resultPreview.ts`](../editor/src/elements/resultPreview.ts)'s `portPreviews`: it reads a value by its shape, and what an end point hands on under an input's name stands under that input); what the shells ask instead of naming a kind: `definesItself` (its ports under Advanced), `ownsDescription`, `portEditing`/`portHint`, `wantsOn`, `restingValue`, `missingExample`, `dropPort`/`withDropped` (what a file dropped on the node on the canvas gives it: one more file its ✨ Input writes from, or what a data node holds); `NodePanelProps`, and `UndoStep` (which undo step a change made in a panel is) |
| `7 × <Kind>NodeGuiBuilder` | [`editor/src/elements/nodes/`](../editor/src/elements/nodes/) | `nodes/<kind>/<Kind>NodeGuiBuilder.ts` beside `<Kind>NodePanel.tsx` (and, for an ai or a code node, `<Kind>NodeAdvancedPanel.tsx`); listed in [`registry.ts`](../editor/src/elements/registry.ts) (`NODE_BUILDERS`). A code, an ai and a data node's panel is `authoring/NodeDefinition.tsx` |
| `WidgetGuiBuilder` | [`editor/src/elements/WidgetGuiBuilder.ts`](../editor/src/elements/WidgetGuiBuilder.ts) | `create(id, label, mode)` (from `defaultSpan`, `defaultTone` and `initialSettings`), `label`, `defaultMode`, `initialLabel`, `paletteEntries` (what the Gui tab's palette offers of the kind), `called` (what a block is called in a sentence, as {Context} tells ✨ the page: "a file picker block"), `InlineEditor` (a block typed where it stands: the text kind's [`TextInPlace.tsx`](../editor/src/elements/widgets/text/TextInPlace.tsx)), `textShown` (the size it draws text at, told the node wired into the end point it shows), `firesHint` (said under "Using it fires"), `missingExample`; `WidgetPanelProps` |
| `6 × <Kind>WidgetGuiBuilder` | [`editor/src/elements/widgets/<kind>/<Kind>WidgetGuiBuilder.ts`](../editor/src/elements/widgets/) | beside `<Kind>WidgetView.tsx` -- each handed `WidgetViewProps` ([`widgets/WidgetView.ts`](../editor/src/elements/widgets/WidgetView.ts)) -- and, if it has settings, `<Kind>WidgetPanel.tsx`; listed in [`widgets/roster.ts`](../editor/src/elements/widgets/roster.ts) (`WIDGET_BUILDERS`) |
| `StaticWidgetGuiBuilder` | [`widgets/StaticWidgetGuiBuilder.ts`](../editor/src/elements/widgets/StaticWidgetGuiBuilder.ts) | starts unnamed (`initialLabel`): a heading, a rule or a gap is its design and nothing else |
| `DisplayWidgetGuiBuilder` | [`widgets/DisplayWidgetGuiBuilder.ts`](../editor/src/elements/widgets/DisplayWidgetGuiBuilder.ts) | owns the one panel of chart, table and image ([`DisplayWidgetPanel.tsx`](../editor/src/elements/widgets/DisplayWidgetPanel.tsx)): one sentence of what the kind's runner `draws`; it sends nothing and fires nothing, so a block's settings offer it only "It shows" |

Also related, not drawn:

- `page.ts`: [`engine/src/elements/page.ts`](../engine/src/elements/page.ts), the page: a graph's blocks, which are no node. Each is read out of the file (`parseWidget`) and its element, found by its kind (`widgetElement`), is asked what it can do. The file makes what a round the page starts sends the start point it fires (`pageSends`), settles what the end points hand back into the blocks that show them (`settlePage`), and says what the page asks first (`pageRequirements`), what is wrong with it (`pageProblems`) and how the model that designs a graph is told of it (`pageAuthorNote`). [`connections.test.ts`](../engine/src/elements/connections.test.ts) holds what each kind of block can connect to, [`page.test.ts`](../engine/src/elements/page.test.ts) the rest
- `body.ts`: [`engine/src/elements/body.ts`](../engine/src/elements/body.ts), `runBody`: the one way an authored body runs — `run(inputs, node)`, on Node, sandboxed, with `node.llm`. Only nodes have bodies: a block writes nothing
- `documents.ts`: [`engine/src/elements/documents.ts`](../engine/src/elements/documents.ts), what a node that reads a file, and a file picker that sends one, are handed for a file that is not plain text: a Word document as Markdown, a picture or a PDF as a `data:` URL (an ai node sends it to the model as the file it is, `nodes/ai/ask.ts`)
- `FolderListing.tsx`: [`editor/src/elements/fields/FolderListing.tsx`](../editor/src/elements/fields/FolderListing.tsx), what a folder adds to its path and file types, for the folder node and the folder picker alike: subfolders, the one line that choosing some files is a code node after it, and the list as a run makes it; the other shared settings are in [`fields/`](../editor/src/elements/fields/) (`RunOncePerItem`, `RunOptions`, `WhatRuns`, `ProviderModelSelect`)
- `download.ts`, `SaveButton.tsx`: [`editor/src/elements/widgets/`](../editor/src/elements/widgets/), "⤓ Save" on a block that shows something -- a text as .txt, a chart as .svg, a table as .csv -- in the browser, wherever the page is drawn
- `nodePorts.test.ts`: [`engine/src/elements/nodePorts.test.ts`](../engine/src/elements/nodePorts.test.ts), the ports a start point, a folder node and a subgraph derive, held to every example, both ways
- `times.test.ts`: [`engine/src/elements/times.test.ts`](../engine/src/elements/times.test.ts) · [`editor/…`](../editor/src/elements/times.test.ts), build time and run time inside one class: the bars, the order, and (in the engine) that no run reaches a build-time member; in the editor, that a `GuiBuilder`'s run-time bar is empty, with `runtime/boundary.test.ts` holding that a tool never loads one
- `shells.test.ts`: [`engine/src/shells.test.ts`](../engine/src/shells.test.ts) · [`editor/…`](../editor/src/elements/shells.test.ts), no code outside `elements/` compares a node type with a literal (in the editor, nor a widget kind) -- but `execution/triggers.ts`, which reads a graph's start points that start themselves from the document (`graphTriggers`)

Shared by elements, not drawn: [`authoring/generation.ts`](../engine/src/authoring/generation.ts) (a node's `Generation`),
[`authoring/logic.ts`](../engine/src/authoring/logic.ts),
[`authoring/definition.ts`](../engine/src/authoring/definition.ts) (input.js and output.js: a
typedef, then one example as plain JSON, read without running anything -- code.js's lines
that run it on its own run input.js apart, in `node:vm` -- and `textOutput`: one output that
holds text is an ai node's answer as it came),
[`authoring/prompts.ts`](../engine/src/authoring/prompts.ts) (the standard prompts and their
variables), [`authoring/history.ts`](../engine/src/authoring/history.ts) (history.md) and
[`authoring/handedOn.ts`](../engine/src/authoring/handedOn.ts) (`withoutAuthoring`: a graph
as it leaves the project -- a bundle, a served tool's page, a run the editor posts, an answer
over MCP, a model asked to change the graph -- without any node's history) on the engine
side;
[`elements/fields/`](../editor/src/elements/fields/) (settings several panels share),
and, one layer down in [`document/`](../editor/src/document/), [`baseNodeConfig.ts`](../editor/src/document/baseNodeConfig.ts)
(every node's starting config), [`nodeKinds.ts`](../editor/src/document/nodeKinds.ts) (`NODE_KINDS`: each node type's
`create`, and `savedNode`, which keeps only what differs from `baseNodeConfig`),
[`page.ts`](../editor/src/document/page.ts) (what a block can do with the graph, asked of the
engine's element: `blockCan`) and [`ports.ts`](../editor/src/document/ports.ts) (`derivedNodePorts`:
a node's ports where they follow from its settings, as the engine derives them).

## Class diagram: node runners

The engine's half of a node kind. `NodeRunner`'s members are the ones a kind answers for
itself: each is overridden by at least one of the seven. In the tables, `┊` separates what an
element is, its run time and its build time, as the bars in each file do
([docs/architecture.md](../docs/architecture.md#build-time-and-run-time-in-one-class)).
Checked against the `extends` clauses in the source.

```mermaid
classDiagram
  class ElementRunner {
    <<abstract>>
    config()
    catchesErrors()
  }
  class NodeRunner {
    <<abstract>>
    nodeType
    texts()
    logic()
    definitions()
    derivedPorts()
    nestedGraph()
    setNestedGraph()
    isResult
    resultLabel()
    valuePorts()
    boundaryRole()
    answerWith()
    execute()
    isMemory
    settleMemory()
    state()
    setState()
    fansOut readsFileInputs readsOutside
    needsInput()
    eventPorts()
    keepsTime()
    startedBy()
    takesPackage
    startWith()
    lastSent()
    offers()
    shows()
    generation()
    deployNeeds()
    referencedPaths()
    graphAuthorNote()
    whatRuns()
    problems()
  }
  ElementRunner <|-- NodeRunner
  NodeRunner <|-- StartNodeRunner
  NodeRunner <|-- FolderNodeRunner
  NodeRunner <|-- AiNodeRunner
  NodeRunner <|-- CodeNodeRunner
  NodeRunner <|-- DataNodeRunner
  NodeRunner <|-- EndNodeRunner
  NodeRunner <|-- SubgraphNodeRunner
```

| Diagram node | Path | Notes |
|---|---|---|
| `ElementRunner` | [`engine/src/elements/ElementRunner.ts`](../engine/src/elements/ElementRunner.ts) | what a node and a block share |
| `NodeRunner` | [`engine/src/elements/NodeRunner.ts`](../engine/src/elements/NodeRunner.ts) | its members in three bars; `Logic` ([`authoring/logic.ts`](../engine/src/authoring/logic.ts)) is what `logic()` returns, `Definitions` ([`authoring/definition.ts`](../engine/src/authoring/definition.ts)) what `definitions()` does; `problems()` -- told which of the node's inputs are wired, as a wire can stand in for a setting -- is answered by code, data, end, start and subgraph; `offers()` (what the graph offers by name) by start and end; `readsOutside` by folder; `startedBy()`, `takesPackage`, `startWith()`, `lastSent()` and `answerWith()` by start alone. The members no kind answers itself -- `outputInterface`, `batchMode`, `batchConcurrency`, `asksModel` -- are not drawn |
| `StartNodeRunner` … `SubgraphNodeRunner` | [`engine/src/elements/nodes/<kind>/<Kind>NodeRunner.ts`](../engine/src/elements/nodes/) | `StartNodeRunner` also holds `SENDERS` (who a package says sent it when no block did) and the `Package` it hands on; `AiNodeRunner` has `prompt.ts`, `ask.ts`; `SubgraphNodeRunner` has `boundary.ts`, where its ports are its graph's start and end points |

## Class diagram: widget runners

```mermaid
classDiagram
  class WidgetRunner {
    <<abstract>>
    widgetKind
    sends()
    event()
    showsEnd()
    data()
    settle()
    setValue()
    clearsValueAfterRun()
    displayValue()
    runtimeRequirements()
    receives()
    graphAuthorNote()
    referencedPaths()
    valueIsDesign()
  }
  class StaticWidgetRunner {
    <<abstract>>
  }
  class DisplayWidgetRunner {
    <<abstract>>
    draws()
  }
  class page {
    <<module>>
    widgetElement()
    pageSends()
    settlePage()
    pageRequirements()
    pageProblems()
  }
  ElementRunner <|-- WidgetRunner
  WidgetRunner <|-- InputPickerWidgetRunner
  WidgetRunner <|-- TextIoWidgetRunner
  WidgetRunner <|-- SelectWidgetRunner
  WidgetRunner <|-- SliderWidgetRunner
  WidgetRunner <|-- ButtonWidgetRunner
  WidgetRunner <|-- ChatWidgetRunner
  WidgetRunner <|-- StaticWidgetRunner
  WidgetRunner <|-- DisplayWidgetRunner
  StaticWidgetRunner <|-- TextWidgetRunner
  StaticWidgetRunner <|-- DividerWidgetRunner
  StaticWidgetRunner <|-- SpacerWidgetRunner
  DisplayWidgetRunner <|-- PlotWindowWidgetRunner
  DisplayWidgetRunner <|-- TableWidgetRunner
  DisplayWidgetRunner <|-- ImageViewWidgetRunner
  WidgetRunner <.. page : asks each block
```

This one has 17 boxes instead of 12: it is a plain tree, and cutting it in two would hide the
point, which is that two abstract levels carry what 12 kinds share -- and that one module,
the page, is what asks them.

| Diagram node | Path | Notes |
|---|---|---|
| `WidgetRunner` | [`engine/src/elements/WidgetRunner.ts`](../engine/src/elements/WidgetRunner.ts) | its members are the ones a kind answers for; `keepsState()` and `takesValue()` follow from `sends()` and `showsEnd()`, and no kind answers them itself. No block writes a body: `logic()`, `texts()` and `generation()` are a node's (`NodeRunner`), and a block has none of them |
| `StaticWidgetRunner`, `DisplayWidgetRunner` | [`engine/src/elements/widgets/`](../engine/src/elements/widgets/) | sends, fires and shows nothing · shows an end point and nothing else, and says what it draws |
| `<Kind>WidgetRunner` | [`engine/src/elements/widgets/<kind>/<Kind>WidgetRunner.ts`](../engine/src/elements/widgets/) | listed in [`widgets/roster.ts`](../engine/src/elements/widgets/roster.ts); how a chart is laid out, margins and all, is the page's ([`PlotChart.tsx`](../editor/src/elements/widgets/plot_window/PlotChart.tsx)), at the block's real size |
| `page` | [`engine/src/elements/page.ts`](../engine/src/elements/page.ts) | a module, not a class: it finds each block's element by its kind (`widgetElement`) and asks it what it sends, fires and shows -- for what a round the page starts is sent, what a round hands back, what is asked first and what is wrong; the executor never sees a block |

## Class diagram: the builder side

Every engine class above -- the page is a module, and has none -- has a counterpart in the browser that swaps `Runner` for `GuiBuilder`, in the same
relative folder and with the same inheritance; [`symmetry.test.ts`](../editor/src/elements/symmetry.test.ts) compares
the lineages class by class. Only the abstract levels are drawn; below them the trees are the ones above.

```mermaid
classDiagram
  class ElementGuiBuilder {
    <<abstract>>
    Panel
  }
  class NodeGuiBuilder {
    <<abstract>>
    label icon color hint
    paletteGroup
    AdvancedPanel advancedSummary
    describeOutput()
    canvasSummary()
    definesItself ownsDescription portEditing
    portHint()
    dropPort()
    withDropped()
    wantsOn()
    restingValue()
    missingExample()
  }
  class WidgetGuiBuilder {
    <<abstract>>
    label defaultMode firesHint
    InlineEditor
    create(id, label, mode)
    defaultSpan()
    defaultTone()
    initialSettings()
    initialLabel()
    paletteEntries()
    called()
    textShown()
    missingExample()
  }
  class StaticWidgetGuiBuilder {
    <<abstract>>
    initialLabel()
  }
  class DisplayWidgetGuiBuilder {
    <<abstract>>
    runner
  }
  ElementGuiBuilder <|-- NodeGuiBuilder
  ElementGuiBuilder <|-- WidgetGuiBuilder
  WidgetGuiBuilder <|-- StaticWidgetGuiBuilder
  WidgetGuiBuilder <|-- DisplayWidgetGuiBuilder
  ElementRunner .. ElementGuiBuilder : mirrors
  NodeRunner .. NodeGuiBuilder : mirrors
  WidgetRunner .. WidgetGuiBuilder : mirrors
```

| Diagram node | Path | Notes |
|---|---|---|
| `ElementGuiBuilder` | [`editor/src/elements/ElementGuiBuilder.ts`](../editor/src/elements/ElementGuiBuilder.ts) | `Panel`, loaded lazily |
| `NodeGuiBuilder` | [`editor/src/elements/NodeGuiBuilder.ts`](../editor/src/elements/NodeGuiBuilder.ts) | builder only: what a node *is* on creation and save is [`document/nodeKinds.ts`](../editor/src/document/nodeKinds.ts), and how its body is written is the engine's `NodeRunner.generation()` -- no block has a body to write |
| `WidgetGuiBuilder` | [`editor/src/elements/WidgetGuiBuilder.ts`](../editor/src/elements/WidgetGuiBuilder.ts) | what the *page* draws is in [`page/blocks.ts`](../editor/src/page/blocks.ts) and the `<Kind>WidgetView.tsx` files; what a block can do with the graph is the engine's answer, asked in [`document/page.ts`](../editor/src/document/page.ts) (`blockCan`) |
| `StaticWidgetGuiBuilder` | [`editor/src/elements/widgets/StaticWidgetGuiBuilder.ts`](../editor/src/elements/widgets/StaticWidgetGuiBuilder.ts) | `initialLabel` is empty: page furniture starts unnamed |
| `DisplayWidgetGuiBuilder` | [`editor/src/elements/widgets/DisplayWidgetGuiBuilder.ts`](../editor/src/elements/widgets/DisplayWidgetGuiBuilder.ts) | owns the one panel of chart, table and image: one sentence of what its `runner` draws |

## Class diagram: runs and their state

The classes that are not elements: what the server keeps while graphs run. `serve()` opens one `Session` --
the graph in use and what using it leaves behind -- or, for the editor, holds none until a graph is handed
over (`SessionHolder`, an interface made by `holderOf`). The session keeps the clock too: its rounds are rounds like any other.

```mermaid
classDiagram
  class Lifecycle {
    own(name, stop)
    shutdown(graceMs)
    stopping
  }
  class SessionHolder {
    <<interface>>
    session
    hold(graph, handover)
    asked(id)
    watch(listener)
  }
  class Session {
    id
    graph
    designRevision
    stateFile
    dropped
    open(graph, options)$
    hold(graph)
    moveTo(file)
    start(trigger, ask)
    run(trigger, ask, signal)
    requirements(trigger, ask)
    snapshot(id)
    stop(id)
    stopAll()
    startApplication()
    stopApplication()
    reset()
    kept()
    view()
    watch(listener)
  }
  class RoundAsk {
    <<interface>>
    values
    answers
    by
  }
  class Rounds {
    start(total, labelOf, work)
    exclusive(work)
    snapshot(id)
    stop(id)
    stopAll()
  }
  class Round {
    id
    total
    completed
    result
    snapshot()
    halt()
  }
  class Clock {
    <<interface>>
    runsByItself
    ticks
    started
    problem()
    nextAt()
    stop()
  }
  class GraphCore {
    <<interface>>
    open(held)
    round(asked)
    node() example() test() arriving()
    forget()
    close()
  }
  class Latch {
    key()
    get()
    set()
    heldBy(nodes)
    restore(held)
  }
  class RoundLatch {
    commit()
  }
  class LastOutputs {
    key()
    get()
    set()
  }
  SessionHolder o-- Session : one per server
  Session ..> RoundAsk : what a round is asked with
  Session *-- Rounds : one at a time
  Rounds "1" *-- "0..*" Round : going, or ended 5 min ago
  Session *-- GraphCore : runs its rounds
  GraphCore *-- Latch : what each node made last
  GraphCore *-- LastOutputs
  Session o-- Clock : while the application runs
  Latch <|-- RoundLatch : held back until a round ends
  GraphCore ..> RoundLatch : one per round
  Lifecycle ..> Session : stops the clock, then the rounds
```

| Diagram node | Path | Notes |
|---|---|---|
| `Lifecycle` | [`engine/src/host/lifecycle.ts`](../engine/src/host/lifecycle.ts) | what a server stops, in order, once, within a grace period (8 s); `untilStopped` maps Ctrl+C, SIGTERM, SIGHUP and Ctrl+Break to it for the CLI |
| `GraphCore`, `RoundLatch` | [`engine/src/core/protocol.ts`](../engine/src/core/protocol.ts), [`localCore.ts`](../engine/src/core/localCore.ts) | what runs a session's rounds, in its process or as a program of its own ([wrapper.md](../docs/wrapper.md)); a round hands back what every node keeps after it and what every node was last left holding, and leaves nothing in the latch when it was stopped (`core/core.test.ts`) |
| `Session`, `SessionHolder` | [`engine/src/host/session.ts`](../engine/src/host/session.ts) | the application's clock (`startApplication`, [`execution/clock.ts`](../engine/src/execution/clock.ts)); a round runs on a working copy -- the design, each node's slots and the page's blocks put back (`NodeRunner.state`/`setState`, `setPageState`), and what the round is sent put into the start point it fires (`applySent`) -- and commits only when it ran to its end; a round the page starts (*by* a block) is sent what the blocks that send to its start point hold, and is refused unless that block fires it (`checkPageRound`); an answer goes to the block that asked, and one nobody asked for is refused (`checkAnswers`); slots are kept with the design value they started from and dropped, said, when their node, block or design changed; `state.json` ([`stateFileOf`](../engine/src/project/folder.ts)) after every round, read back by `open`, moved by `moveTo` when the document is saved elsewhere, deleted by `reset`; `holderOf` makes the `SessionHolder`: `hold` hands over the editor's document (the same session when it is the same document, else a session of its own), `watch` follows whichever session is held. `session.test.ts` holds each of these, a round the page starts and a round a call starts among them |
| `RoundAsk` | [`engine/src/host/session.ts`](../engine/src/host/session.ts) | what a round is asked with: `values` (for a round the page starts, what its blocks hold, by block id; for another round of a start point, its package's values, under the sender's names), `answers` (to what the page asked, by block id), `by` (a block of the page, or one of `SENDERS`; a call when left out); `RoundRequest` in [`host/api.ts`](../engine/src/host/api.ts) is the same on the wire, with the event and the session |
| `Rounds`, `Round` | [`engine/src/host/rounds.ts`](../engine/src/host/rounds.ts) | the rounds of one session: queued in the order asked, watched (`RoundSnapshot`), stopped -- a waiting one at once; `exclusive` for a reset; forgets a round 5 minutes after it ended |
| `Clock` | [`engine/src/execution/clock.ts`](../engine/src/execution/clock.ts) | `startClock`: when each start point that starts itself is due, and each round handed to the session |
| `Latch` | [`engine/src/execution/latch.ts`](../engine/src/execution/latch.ts) | what every node made last, for rounds its ◆ stays shut, kept under the graph and what the node is made from as written; one entry a node is written to `state.json` (`heldBy`) |
| `LastOutputs` | [`engine/src/execution/reuse.ts`](../engine/src/execution/reuse.ts) | outputs a round an event started may hand back for the nodes it runs only as context; the file is not named after the class; not kept beyond the process |

Not drawn: the error classes (`Refusal`, `NotFound`, `NotAGraph`, `NotOffered`, `FileChanged`, …), spread over the
files that throw them; `errors.ts` holds `NotFound` and `NotAGraph`, the two more than one file needs.

## Run and disk

What runs a graph, what a graph is on disk, and what ✨ writes into it: the three folders of the
engine that are not elements, and the element files they import values from. Edges are the
value imports among the files drawn, from the three folders; what the element files import in
turn is not drawn. A dotted edge is an import of types only, drawn where it says something:
what the session passes the executor, and what a `Generation` names. The other imports of
types only -- the `Runners` type most files name, the `Trigger` and `StartedBy` that
`triggers.ts` and `graphInterface.ts` take from each other -- are not drawn.

```mermaid
flowchart TD
  subgraph execution["execution/"]
    Executor["executor.ts"]
    Triggers["triggers.ts"]
    Clock["clock.ts"]
    Latch["latch.ts"]
    Reuse["reuse.ts"]
    Batching["batching.ts"]
    FileInputs["fileInputs.ts"]
    GraphInterface["graphInterface.ts"]
    Interface["interface.ts"]
    Wiring["wiring.ts"]
  end
  subgraph project["project/"]
    Folder["folder.ts"]
    Flow["flow.ts"]
    InterfaceFile["interfaceFile.ts"]
    Names["names.ts"]
    Changes["changes.ts"]
    Check["check.ts"]
    FolderCheck["folderCheck.ts"]
    KeptRounds["keptRounds.ts"]
  end
  subgraph authoring["authoring/"]
    Definition["definition.ts"]
    Prompts["prompts.ts"]
    Examples["examples.ts"]
    HandedOn["handedOn.ts"]
    Logic["logic.ts"]
    Generation["generation.ts"]
    History["history.ts"]
  end
  subgraph elements["elements/"]
    Registry["registry.ts"]
    Page["page.ts"]
    NodeRunner["NodeRunner.ts"]
    Port["port.ts"]
    Body["body.ts"]
    Documents["documents.ts"]
  end

  Executor --> Batching
  Executor --> FileInputs
  Executor --> Triggers
  Executor --> Interface
  Executor --> Wiring
  Executor --> NodeRunner
  Executor -. "passed in" .-> Latch
  Executor -. "passed in" .-> Reuse
  Clock --> Triggers
  Latch --> Triggers
  Batching --> Wiring
  FileInputs --> Batching
  FileInputs --> Documents
  GraphInterface --> Wiring
  GraphInterface --> Page
  Interface --> Wiring
  Wiring --> Triggers
  Wiring --> Port

  Flow --> InterfaceFile
  Flow --> Names
  Folder --> Flow
  Folder --> InterfaceFile
  Folder --> Names
  Folder --> Changes
  Folder --> Registry
  Folder --> Port
  Check --> Flow
  Check --> Executor
  Check --> Triggers
  Check --> Wiring
  Check --> Interface
  Check --> Definition
  Check --> Registry
  Check --> Page
  Check --> NodeRunner
  FolderCheck --> Folder
  FolderCheck --> Check
  FolderCheck --> InterfaceFile
  FolderCheck --> Wiring
  FolderCheck --> Registry
  KeptRounds --> Executor
  KeptRounds --> GraphInterface

  Definition --> Interface
  Prompts --> Definition
  Examples --> Definition
  Examples --> Executor
  HandedOn --> Registry
  Logic --> Body
  Generation -. "types" .-> Logic
```

| Diagram node | Path | Notes |
|---|---|---|
| `executor.ts` | [`engine/src/execution/executor.ts`](../engine/src/execution/executor.ts) | `executeGraph`: order (`topologicalLevels`, `memoryFeedbackEdges`), what runs, per node, after the round; `collectInputs` (what the wires deliver: an input that takes a `field` of what arrives is handed that part alone, `fieldOf` -- `triggers.test.ts`, "hands the first node the one value its port takes of the package"); `callNode` (one call of a node on its input.js example), `executeNode` (one node on given inputs), `inputsFor` (run what feeds a node), `runNodeAlone`; a node that holds a graph runs it with the same function, at most `NESTING_LIMIT` deep |
| `triggers.ts` | [`engine/src/execution/triggers.ts`](../engine/src/execution/triggers.ts) | what starts a round: `Trigger`, the ◆ port (`RUN_PORT`), a start point's one output (`START_PORT`), `graphTriggers` (the start points that start themselves, read from the document), `startEvents` (what starting the application runs: what starts itself; a graph the page or a call starts waits for them, and only one with no start point at all runs whole once -- `triggers.test.ts`, "starting the application"), `pageStarts`, `triggeredNodes`/`firedNodes`/`neededFor` (the slice an event runs), `parseInterval`, `after` |
| `clock.ts` | [`engine/src/execution/clock.ts`](../engine/src/execution/clock.ts) | `startClock`, `Clock`: when a start point that starts itself is due; the one clock, kept by the server's session for a served tool and for the editor's ▶ Run alike |
| `latch.ts`, `reuse.ts` | [`engine/src/execution/latch.ts`](../engine/src/execution/latch.ts), [`reuse.ts`](../engine/src/execution/reuse.ts) | what a node stood still with (meaning); what a context-only node made from the same inputs (an optimisation), never for a start point -- an event is a moment -- nor a node that reads outside the graph (`readsOutside`: a folder's files): the session holds both and hands them to the executor |
| `batching.ts`, `fileInputs.ts` | [`engine/src/execution/batching.ts`](../engine/src/execution/batching.ts), [`fileInputs.ts`](../engine/src/execution/fileInputs.ts) | fan-out over a list and merging what the items made; reading the file on each input that says so (a Word document or a PDF as [`documents.ts`](../engine/src/elements/documents.ts) says) |
| `graphInterface.ts` | [`engine/src/execution/graphInterface.ts`](../engine/src/execution/graphInterface.ts) | what the whole graph offers by name -- its start points and its end points (`NodeRunner.offers`): `interfaceOf` (each start point with who starts it and what the graph reads of what it is sent, `reads`; one the page starts with the blocks that fire it and what they send, `fired_by` and `sends`), `eventOf`, `checkSent` (values for a round of the whole graph are refused: no start point takes them), `applySent` (what a round is sent, into the start point it fires, as its package), `sentOf`, `outputsOf`; `NotOffered`. `graphInterface.test.ts` holds each |
| `interface.ts` | [`engine/src/execution/interface.ts`](../engine/src/execution/interface.ts) | what one node hands on: the shape of its output.js example (a JSON Schema subset), every run held to it, a wire into a port that takes something else found before anything runs |
| `wiring.ts` | [`engine/src/execution/wiring.ts`](../engine/src/execution/wiring.ts) | whether the wiring holds together (`wiringProblems`; `fatalProblems` is what a run refuses on); `ERROR_PORT` and `errorOutput`, the error output spelled once |
| `folder.ts` | [`engine/src/project/folder.ts`](../engine/src/project/folder.ts) | a graph as a folder: `loadGraph`, `readProject`, `writeProject`, `saveGraph`, `graphAt` (the graph a save to a path would write over, which the editor's save route replaces only when told), `nodeFolder` (a node in `nodes/<id>/`), `PAGE_FILE` (the page's blocks in `page/page.json`, beside the nodes, which `flow.json` does not name), `nestedGraphs` (a node's graph is a project folder in its own folder), `frontendOf` (`frontend/`), `stateFileOf` (`state.json`), `nodeFileOf`, `changesOnDisk` (what changed since last asked), `FileChanged` (a save that would overwrite a file changed since refuses); every file there from the start, a stub until something is written into it |
| `flow.ts` | [`engine/src/project/flow.ts`](../engine/src/project/flow.ts) | `flow.json`: the graph's name, which nodes there are and every wire; `graphFrom` puts a graph together from files' contents without a disk; `unsavableIds` |
| `interfaceFile.ts`, `names.ts`, `changes.ts` | [`engine/src/project/`](../engine/src/project/) | `interface.json`, a node's ports, an input's `field` among them; `folderName`, what an id is called on disk; `TextChange`, what changed in a folder as whoever has it open is told -- a node's file, or the page's blocks (a leaf: the browser takes it too) |
| `check.ts`, `folderCheck.ts` | [`engine/src/project/check.ts`](../engine/src/project/check.ts), [`folderCheck.ts`](../engine/src/project/folderCheck.ts) | the one list of problems, the page's among them (`pageProblems`); `problemsIn` reads no disk: the CLI's `check`, MCP, and the editor before it loads a graph pasted in or designed by ✨ AI Graph; what only a folder gets wrong (`folderProblems`, `checkPath`) |
| `keptRounds.ts` | [`engine/src/project/keptRounds.ts`](../engine/src/project/keptRounds.ts) | a round kept as a test in the project's `tests/`: `keptRound` (what came from outside or from before, `given`, and what the end points handed back), `replayRound` (run again through the executor's `given`, no model asked, held to what came back), `readKeptRounds`, `writeKeptRound` -- for `test`, `test_graph`, `--keep` and the editor's `keepRound` (`keptRounds.test.ts`) |
| `definition.ts` | [`engine/src/authoring/definition.ts`](../engine/src/authoring/definition.ts) | input.js and output.js: a typedef, then one example as plain JSON, read without running anything (`definitionExample`); `misfits` holds a result to an output.js; `textOutput` |
| `prompts.ts` | [`engine/src/authoring/prompts.ts`](../engine/src/authoring/prompts.ts) | the standard prompts and their variables (`VARIABLES`); filled by [`host/editor/brief.ts`](../engine/src/host/editor/brief.ts) |
| `generation.ts`, `logic.ts` | [`engine/src/authoring/generation.ts`](../engine/src/authoring/generation.ts), [`logic.ts`](../engine/src/authoring/logic.ts) | how an element says its body is written (`Generation`); where a node's body is kept and how it runs (`Logic`, through [`elements/body.ts`](../engine/src/elements/body.ts)) |
| `examples.ts` | [`engine/src/authoring/examples.ts`](../engine/src/authoring/examples.ts) | a node's example tried and held to its output.js: `runExample`, `testGraph` at every depth -- for ▶ Try, the CLI's `test` and MCP alike |
| `history.ts`, `handedOn.ts` | [`engine/src/authoring/history.ts`](../engine/src/authoring/history.ts), [`handedOn.ts`](../engine/src/authoring/handedOn.ts) | history.md (about 500 KB kept; it imports only the contract's `AICall` type); `withoutAuthoring`: a graph as it leaves the project -- a bundle, a run the editor posts, an answer over MCP -- without any node's history, prompts or example files |
| `registry.ts`, `page.ts`, `NodeRunner.ts`, `port.ts`, `body.ts`, `documents.ts` | [`engine/src/elements/`](../engine/src/elements/) | what the three folders import of the elements -- the registry, the page, `resultKeys`, `port` and `keepingFields`, `runBody`, `fileContent`; see [elements](#elements) |

## Server

The Node side of the wire. `serve.ts` answers the routes of the contract; the `tool` rows
live beside it, the `editor` rows in `host/editor/`, which is loaded only when the server
is the editor and is never copied into a bundle.

```mermaid
flowchart TD
  subgraph cliFolder["cli/"]
    Cli["cli.ts"]
    Bundle["bundle.ts"]
    Launchers["launchers.ts"]
  end
  subgraph core["core/"]
    Protocol["protocol.ts — GraphCore"]
    LocalCore["localCore.ts"]
    Stdio["stdio.ts"]
    Node["node.ts — Runtime"]
  end
  subgraph host["host/"]
    Api["api.ts — contract"]
    Http["http.ts"]
    Serve["serve.ts"]
    Browse["browse.ts"]
    Session["session.ts — Session"]
    Rounds["rounds.ts — Rounds"]
    Lifecycle["lifecycle.ts"]
    subgraph editor["host/editor/ — never bundled"]
      Routes["routes.ts"]
      Generate["generate.ts"]
      Brief["brief.ts"]
      GraphPrompt["graphPrompt.ts"]
      Settings["settings.ts"]
      Files["files.ts"]
      Zip["zip.ts"]
      Mcp["mcpServer.ts"]
    end
  end

  Cli --> Serve
  Cli --> Lifecycle
  Cli --> Node
  Cli --> Bundle
  Cli -. "await import (--mcp)" .-> Mcp
  Cli -. "await import (setup lines)" .-> Settings
  Bundle --> Launchers
  Serve --> Http
  Serve --> Browse
  Serve --> Session
  Serve --> Lifecycle
  Serve -. "await import (editor only)" .-> Routes
  Serve --> Api
  Http -. "types" .-> Api
  Browse -. "types" .-> Api
  Session -. "types" .-> Api
  Rounds -. "types" .-> Api
  Routes -. "types" .-> Api
  Generate -. "types" .-> Api
  Brief -. "types" .-> Api
  Settings -. "types" .-> Api
  Session --> Rounds
  Session --> Node
  Session --> Http
  Session --> Stdio
  Routes --> Stdio
  Mcp --> Stdio
  Cli --> Stdio
  Stdio --> LocalCore
  LocalCore --> Node
  Session -. "types" .-> Protocol
  Stdio -. "types" .-> Protocol
  LocalCore -. "types" .-> Protocol
  Routes --> Session
  Routes --> Http
  Routes --> Node
  Routes --> Generate
  Routes --> Settings
  Routes --> Files
  Routes --> Zip
  Routes --> Bundle
  Routes --> Launchers
  Generate --> Brief
  Generate --> GraphPrompt
  Settings --> Http
  Mcp --> Generate
  Mcp --> GraphPrompt
  Mcp --> Node
  Mcp --> Http
```

The dotted `types` edges are the files that import only the contract's types; `serve.ts`
imports its `API` table as a value (the dispatch, and the check that every route has a
handler).

| Diagram node | Path | Notes |
|---|---|---|
| `api.ts — contract` | [`engine/src/host/api.ts`](../engine/src/host/api.ts) | `API` table, `RequestOf`/`ResponseOf`, `matchRoute`, `pathFor`; wire types (`RoundRequest` -- a round asked for by its event, with what it is sent, the answers and who sends it --, `RoundOutcome`, `RoundSnapshot`, `SessionView`, `InterfaceView`, `PageView`, `AICall`, `SettingsStatus`, …) |
| `http.ts` | [`engine/src/host/http.ts`](../engine/src/host/http.ts) | `Refusal` (thrown with a status), `Download`, `EventStream`, `Handler`/`Handlers`, JSON (only as `application/json`) and byte bodies, static page; `foreignRequest`: a loopback host -- with the server's port on a loopback bind; bound wider, on any port, or the address bound to, or a name `AI_GRAPH_ALLOWED_HOSTS` lists (`namesFor`) -- and no foreign origin or cross-site call |
| `serve.ts` | [`engine/src/host/serve.ts`](../engine/src/host/serve.ts) | `serve()`: dispatch by the table, one session held (`holderOf`), a deployed tool's started with the server; `toolRoutes()`: the runtime API -- interface, session and its stream, page, requirements, rounds started, watched and stopped, run, reset; each round's request handed to the session as it came -- AI settings (read-only), browse; serves the editor's build, else the project's own `frontend/`, else `runtime.html`. `runtimeApi.test.ts` holds the runtime API |
| `browse.ts` | [`engine/src/host/browse.ts`](../engine/src/host/browse.ts) | what `serve.ts`'s browse route lists a folder with -- saying which folders in it are projects, and whether the folder shown is one; loopback only |
| `protocol.ts — GraphCore` | [`engine/src/core/protocol.ts`](../engine/src/core/protocol.ts) | the operations a graph core answers and the wire: one JSON object per line, events then a reply or an error |
| `localCore.ts` | [`engine/src/core/localCore.ts`](../engine/src/core/localCore.ts) | the JavaScript core: the executor and the elements, the latch (what a round leaves in it committed once the round ran to its end) and the reuse cache |
| `stdio.ts` | [`engine/src/core/stdio.ts`](../engine/src/core/stdio.ts) | `serveCore` (a core as a program: `main.ts core`), `processCore` (the wrapper's half), `chosenCore` (`AI_GRAPH_CORE`, else the core in this process) |
| `session.ts — Session` | [`engine/src/host/session.ts`](../engine/src/host/session.ts) | the graph in use and what using it leaves behind, the clock's rounds, the page's and a call's alike, each run by the session's graph core: see the class diagram above |
| `rounds.ts — Rounds` | [`engine/src/host/rounds.ts`](../engine/src/host/rounds.ts) | the rounds of one session, one at a time: start, snapshot, stop, `stopAll` for a shutdown, forget after 5 min |
| `lifecycle.ts` | [`engine/src/host/lifecycle.ts`](../engine/src/host/lifecycle.ts) | `Lifecycle`: what a server must stop, in order, once, within a grace period; `untilStopped`: signals → shutdown → exit code, used by [`cli/cli.ts`](../engine/src/cli/cli.ts) |
| `node.ts — Runtime` | [`engine/src/core/node.ts`](../engine/src/core/node.ts) | `nodeFiles`, `nodeCode` (sandboxed `node --permission`, an environment without keys, `bodyEnvironment`; a body may ask this process for what it may not do itself — `BodyContext.calls`, how `node.llm` works), `nodeRuntime()` |
| `routes.ts` | [`engine/src/host/editor/routes.ts`](../engine/src/host/editor/routes.ts) | `editorRoutes(held)`: try a node, and what would arrive at one -- the page's start points sent what the page holds (`startFromPage`) --, open/save a project or file (reload is an open again) and what changed on disk (through [`project/folder.ts`](../engine/src/project/folder.ts)), finding dropped folders and files, open in the person's own editor, generation + live transcripts, bundle, settings, and the graph handed to the session (`holdGraph`, `startApplication`, `stopApplication`) |
| `generate.ts` | [`engine/src/host/editor/generate.ts`](../engine/src/host/editor/generate.ts) | a node's `prompt.md`, filled, and the frame: write → run on a sample → check → repair once; `write`: the body, an example with its files, or the output definition; `refine`: the body there is changed as said (the text restated with it, and the new output.js where the change needs other outputs -- the body held to it, never repaired back toward the old one), or repaired from how it failed (an output.js that cannot be read, corrected with it); `generateGraph` with [`graphPrompt.ts`](../engine/src/host/editor/graphPrompt.ts), which tells the model the start points, the kinds' own notes and the page (`pageAuthorNote`) |
| `brief.ts` | [`engine/src/host/editor/brief.ts`](../engine/src/host/editor/brief.ts) | the variables of a ✨'s prompt, filled -- a definition with its ports as wired after it -- and cut to a budget; what is JavaScript about writing a body -- the empty `run` ✨ Code completes, the fence, how it is tried -- is the code node's `Language` ([`javascript.ts`](../engine/src/elements/nodes/code/javascript.ts)) |
| `settings.ts` | [`engine/src/host/editor/settings.ts`](../engine/src/host/editor/settings.ts) | the settings dialog's view of `ai-settings.json`: keys, endpoints, and saving the one AI setting |
| `files.ts` | [`engine/src/host/editor/files.ts`](../engine/src/host/editor/files.ts) | finding projects and dropped files (by name and size), open in own editor |
| `zip.ts` | [`engine/src/host/editor/zip.ts`](../engine/src/host/editor/zip.ts) | a zip archive written by hand (Deploy, and `scripts/package.mjs`) |
| `mcpServer.ts` | [`engine/src/host/editor/mcpServer.ts`](../engine/src/host/editor/mcpServer.ts) | `--mcp`: graph tools for Claude (`authoring_guide`, `generate_graph`, `validate_graph`, `save_graph`, `run_graph`, `describe_graph`, `run_node`, `test_graph`, `list_graphs`), confined to one folder, reading and writing projects through [`project/folder.ts`](../engine/src/project/folder.ts) and checking with [`project/check.ts`](../engine/src/project/check.ts) and [`folderCheck.ts`](../engine/src/project/folderCheck.ts); `run_graph` sends its values to the start point its event names, and only with one (`mcpServer.test.ts`); started from [`cli/cli.ts`](../engine/src/cli/cli.ts) |
| `cli.ts` | [`engine/src/cli/cli.ts`](../engine/src/cli/cli.ts) | the command line: see [the whole](#the-whole) |
| `bundle.ts` | [`engine/src/cli/bundle.ts`](../engine/src/cli/bundle.ts) | what `routes.ts`'s bundle route and `--bundle` write: see [the whole](#the-whole) |
| `launchers.ts` | [`engine/src/cli/launchers.ts`](../engine/src/cli/launchers.ts) | `run.sh` and `run.cmd`, and which entries of a zip are executable (`zipMode`): a bundle's, the editor's Deploy zip's, and the download's |

Not drawn: what these files import from the rest of the engine, which [the whole](#the-whole)
draws box by box. `serve.ts` takes the graph's interface and `startEvents`
(`execution/graphInterface.ts`, `triggers.ts`), the page's blocks (`elements/page.ts`),
`registry.ts`, the one AI setting and `project/folder.ts`; `session.ts` runs rounds through its
graph core and reads `execution/` (`triggers`, `graphInterface`, `wiring`, `clock`, `latch`),
`registry.ts`, `elements/page.ts` and `project/folder.ts`; `routes.ts`, `mcpServer.ts` and
`cli.ts` run graphs through a graph core and reach the page, `project/folder.ts` and
`project/keptRounds.ts` (and `mcpServer.ts` `check.ts` and `folderCheck.ts`, `cli.ts`
`folderCheck.ts`); `generate.ts` and
`brief.ts` reach `authoring/`, `registry.ts`, `execution/batching.ts` and `wiring.ts`, and
`generate.ts` also what it runs a body and asks a model through (`elements/body.ts`,
`nodes/ai/ask.ts`, `documents.ts`, `execution/fileInputs.ts`); `node.ts` the AI providers and
the MCP client; `bundle.ts` the page, `authoring/handedOn.ts` and
`project/folder.ts`.

## Browser

The page side of the wire. The areas stand in layers, and [`layers.test.ts`](../editor/src/layers.test.ts)
fails on an import that goes up: `ui` · `graph` · `document`, `api` · `store` · `dialogs` ·
`elements`, `authoring` · `page`, `canvas` · `app` · `App`, `runtime` · `main`. Two entry points share one set of modules: the editor
(`main.tsx` → `App.tsx`) and the deployed tool's page (`runtime/main.tsx` →
`RuntimeApp.tsx`), which reaches element views but never a panel or an editing module, and
nothing in `store/`, `canvas/`, `authoring/` or `app/` (`runtime/boundary.test.ts`).

```mermaid
flowchart TD
  subgraph src["editor/src/"]
    Shell["App.tsx — editor shell"]
    Tool["runtime/ — tool page"]
    AppDir["app/"]
    Canvas["canvas/"]
    Page["page/"]
    Elements["elements/"]
    Authoring["authoring/"]
    Dialogs["dialogs/"]
    Store["store/"]
    Document["document/"]
    Client["api/"]
    Graph["graph.ts"]
  end

  Shell --> AppDir
  Shell --> Canvas
  Shell --> Page
  Shell --> Dialogs
  Shell --> Store
  Shell --> Document
  Shell --> Client
  Tool --> Page
  Tool --> Dialogs
  Tool --> Client
  AppDir --> Authoring
  AppDir --> Elements
  AppDir --> Page
  AppDir --> Dialogs
  AppDir --> Store
  AppDir --> Document
  AppDir --> Client
  Canvas --> Authoring
  Canvas --> Elements
  Canvas --> Store
  Canvas --> Document
  Canvas --> Client
  Page --> Elements
  Page --> Dialogs
  Page --> Store
  Page --> Document
  Page --> Client
  Elements <--> Authoring
  Elements --> Dialogs
  Elements --> Store
  Elements --> Document
  Elements --> Client
  Authoring --> Dialogs
  Authoring --> Store
  Authoring --> Document
  Authoring --> Client
  Dialogs --> Client
  Store --> Document
  Store --> Client
  Document -. "types" .-> Graph
  Client -. "types" .-> Graph
```

Not drawn: [`ui/`](../editor/src/ui/), which every area above `document` and `api` imports,
and `main.tsx` → `App.tsx`. The solid edges are the value imports between areas
(`layers.test.ts` holds that none goes up); elements and authoring import each other on
purpose, and a panel is a lazy chunk, so there is no static cycle. `graph.ts` holds types
only, which every area imports: the two dotted edges stand for all of them.

| Diagram node | Path | Notes |
|---|---|---|
| `App.tsx — editor shell` | [`editor/src/App.tsx`](../editor/src/App.tsx), [`main.tsx`](../editor/src/main.tsx) | views (Graph · Page, and App while the application runs), open/save, drop a file, taking in what changed on disk (every 1.5 s it asks `projectChanges`, says what it took as "↻ From disk: …", and holds what the open graph cannot yet take in [`app/diskChanges.ts`](../editor/src/app/diskChanges.ts)) |
| `runtime/ — tool page` | [`editor/src/runtime/`](../editor/src/runtime/) | `RuntimeApp.tsx` (holds no graph: asks the server for its page and interface, follows the session, starts rounds by name -- at the start point a block fires, and, for a start point a call starts, from [`page/CallForms.tsx`](../editor/src/page/CallForms.tsx) -- and starts over with ↺ Start over), `RuntimeAISettings.tsx` (read-only); [`boundary.test.ts`](../editor/src/runtime/boundary.test.ts) keeps panels, editing modules, the store, the canvas, authoring and the shell out |
| `app/` | [`editor/src/app/`](../editor/src/app/) | `Toolbar.tsx`, the header (the app's and the graph's name -- inside a node's graph the trail names where you are instead --, `ViewTabs.tsx`; Undo and Redo as icons; the one ▶ Run, on every tab, which runs the application -- [`application.ts`](../editor/src/app/application.ts): with a page, the App tab, and the graph runs when the page is used; with a start point a call starts, the App tab as its caller; otherwise what starts itself starts, and a graph with no start point runs whole once; ■ Stop ends it --; Generate, Settings, Deploy: the zip; below 1280 pixels its buttons are their icons), [`FileMenu.tsx`](../editor/src/app/FileMenu.tsx) (New, ✨ AI Graph -- a new graph from a description --, Open, Save, Save as…, Reload, JSON: `fileActions`, each saying why it waits during a run), [`ChangeBar.tsx`](../editor/src/app/ChangeBar.tsx) (the bar under the canvas: say what to change on the node selected -- a code, ai or data node's panel takes it up (`askChange`) -- or on the whole graph, which ✨ AI Graph changes, each node's history kept, and the bar shows before Apply) and [`graphChange.ts`](../editor/src/app/graphChange.ts) (what the bar is on, where a change goes, and what a changed graph adds, removes and changes), [`lastAsked.ts`](../editor/src/app/lastAsked.ts) (of requests that take a while, only the last is still wanted), `Sidebar.tsx` (the palette: every node kind, under the heading it says it goes under, `paletteGroup` -- Input, Processing, Output, Structure; its icons below 1280 pixels), `SettingsDialog.tsx` with `AICredentialsSection.tsx`, `ResultsPanel.tsx` (beside the canvas while no node's panel is open); [`SubgraphTrail.tsx`](../editor/src/app/SubgraphTrail.tsx) (the breadcrumb into a node's graph and back out, which waits for a run in flight); [`GraphProblems.tsx`](../editor/src/app/GraphProblems.tsx) (what the engine's `check` finds in a graph about to be taken in from outside, said before Load or Apply); [`windowDrops.ts`](../editor/src/app/windowDrops.ts) (what is dropped anywhere on the window: which project a folder is, said with where the engine looked when it is none -- and a file dropped into a code box is the box's, typed in by its editor); [`browseStart.ts`](../editor/src/app/browseStart.ts) (where Open's and Save as's file browser opens: a bare name in the folder last used, a saved graph beside itself under its own name) |
| `canvas/` | [`editor/src/canvas/GraphCanvas.tsx`](../editor/src/canvas/GraphCanvas.tsx), [`GraphNodeView.tsx`](../editor/src/canvas/GraphNodeView.tsx) | ReactFlow; a node is a card -- [`NodeKind.tsx`](../editor/src/canvas/NodeKind.tsx) (its kind as a tag in its tint, and its id: on the card and atop its panel), its heading and its text's first line, its ports as dots on its edges (measured again when their ids change; a start point's is the amber diamond an event wears); a start or end point says which blocks of the page fire it, send to it or show it, and a double click on one the page uses opens the Gui tab -- and one click opens its panel, as a palette click or drop does for the node it adds; [`inView.ts`](../editor/src/canvas/inView.ts) (`viewDue`: another document fitted whole, a node added shown with the rest where they fit readably, one opened brought into sight, once measured on screen); [`wireLook.ts`](../editor/src/canvas/wireLook.ts) (soft grey wires, the selected node's in the accent, a ◆'s amber and dashed); a file dropped on a node is one more file its ✨ Input writes from -- or what a data node holds -- where the element takes one (`dropPort`, `authoring/droppedFile.ts`); [`ResultPreview.tsx`](../editor/src/canvas/ResultPreview.tsx) (what a node made last, drawn small on its card: a line, a count and its first row, a sketch, a thumbnail, or its error's first line), `nodeRemoval.ts` (Delete only as pressed on the canvas; one question -- the wires, and what the blocks of the page lose with a start or end point -- for Delete and a card's ✕ alike, and one undo step), `PortsEditor.tsx` (a node's ports, and what each input wired from a start point takes of its package: `TakesSelect`), [`portIds.ts`](../editor/src/canvas/portIds.ts) (the port names a node's panel will not store: none, twice, the error port's) |
| `canvas/` (node panel) | [`editor/src/canvas/NodeEditor.tsx`](../editor/src/canvas/NodeEditor.tsx) | a node's panel, docked beside the canvas while the node is selected (`ui/SidePanel`), with no Save: at its top the node's kind and id (`NodeKind.tsx`, as on its card) and its heading below them (`authoring/HeadingField.tsx`, never empty), then the element's own `Panel` — for a code, ai or data node `authoring/NodeDefinition.tsx`: its text, a row per ✨, ▶ Try and history.md —, then its ports -- or, where they follow from its settings, what each input wired from a start point takes of its package -- and `AdvancedPanel` folded under it, with the ports of a node that `definesItself`; the one ✨ handler: what is missing first (`writesFor`), each written in as it comes; [`nodePanel.ts`](../editor/src/canvas/nodePanel.ts) (what is changed is shown at once and written a moment later, one undo step per field typed into, and on close; a change from outside is taken with what waits kept on top); [`nodeDraft.ts`](../editor/src/canvas/nodeDraft.ts) (`withSetting`: a setting's change, its ports following -- or a function of the setting, for a write that lands after a wait; `withPorts`: a ports edit, the keys of input.js and output.js following the ports; `saveDraft`: the write, the wires following the ports) |
| `page/` | [`editor/src/page/`](../editor/src/page/) | `GuiPage.tsx` draws a page (shared with the tool page) -- or, while it has no blocks, the tool without one: what it does and `RunResult.tsx`, the run's result, each output under its label -- from a `PageModel`, never the store: the design with what the session says of each block by its id ([`pageInUse.ts`](../editor/src/page/pageInUse.ts)); [`blocks.ts`](../editor/src/page/blocks.ts) (what the page draws for each block kind: its view, whether it owns its value); `DesignerTab.tsx` with `DesignerSurface.tsx` (the grid the blocks are placed on) and `QuickInsert.tsx` (`/` on the page: type what you want, Enter), `DesignerPalette.tsx` (where each block kind's own `paletteEntries` stand, and `newBlock`: the block an entry adds, its id its kind, numbered where taken, its label the palette's word), `WidgetEditor.tsx` (a block's settings, and how it connects -- "Its data goes to", "Using it fires", "It shows": only what the block can do, and a new start or end point one choice away), `pageWrite.ts` (the one way a block is added, changed, moved or removed, on the page as the store holds it when the change lands: the page is the document's list of blocks, beside its nodes; `insertBlock` connects a new block as its kind is most often wanted -- the page's start point for what it sends and fires, an end point for what it shows, made with it in its undo step --; `patchBlock`, one block changed, set in its panel or typed into on the Gui tab); [`PageHeading.tsx`](../editor/src/page/PageHeading.tsx) (above the page, the graph's name and description: the tool is called what the graph is, and the delivered header shows the same) and `DeliveredHeader.tsx` (how a round went, in a word); `ApplicationView.tsx` (the running application: the delivered page, against the session the document is handed to; for a start point a call starts, [`CallForms.tsx`](../editor/src/page/CallForms.tsx), a box for every part the graph reads of what it is sent and a button that sends it -- `CallForms.test.ts` --; the last round in a line, with why each node that did not run did not ([`roundWords.ts`](../editor/src/page/roundWords.ts)); what using it keeps, folded, with ↺ Start over ([`KeptFold.tsx`](../editor/src/page/KeptFold.tsx)); Keep as a test; and the pop-out ⧉ Open as a tool); [`TopGraphOnly.tsx`](../editor/src/page/TopGraphOnly.tsx) (the designer and the running page only in the graph at the top, where a page can be); [`typedValues.ts`](../editor/src/page/typedValues.ts) (what was typed into a live block, shown while the block still holds it); [`useRound.ts`](../editor/src/page/useRound.ts) (a round at a start point: what it asks first, the session's `requirements`, then the round with the answers -- by the block that fired it, or as a call -- for the tool page, the running application and the rounds ▶ Run starts alike); `useContainerCell.ts` and `useSchemeOnRoot.ts` (the cell size and the colour scheme, the same in the designer and the delivered page) |
| `elements/` | [`editor/src/elements/`](../editor/src/elements/) | `registry.ts`, `ElementGuiBuilder.ts`, one folder per element — see [elements](#elements). A chart's view, `plot_window/PlotWindowWidgetView.tsx`, measures the block and hands what arrived to `PlotChart.tsx`, which lays a figure `{kind, title, points}` out at that size (or shows finished SVG), redrawn on a resize with no run. [`resultPreview.ts`](../editor/src/elements/resultPreview.ts) reads a value small, by its shape, for the canvas |
| `authoring/` | [`editor/src/authoring/`](../editor/src/authoring/) | a node's text and what ✨ writes from it: `NodeDefinition.tsx` (its text, a row per ✨ -- the button, the prompt it is written with, its file's content in a box (`CodeField`/`CodeSurface`, CodeMirror, lazy) and a chip beside it that opens the file (`FileChip.tsx`) -- the files ✨ Input and ✨ Output write from, ▶ Try (`TryExample.tsx`) and history.md; a change said in the bar for the node, `pendingChange`, is made here), `HeadingField.tsx`; the request and what comes back written in (`generation.ts`: `generateRequest`, `writtenInto`, `writesFor`, `unfitDefinition`), {Context} (`graphContext.ts`: the graph, its nodes in the order they run, its wires, and the page -- each block with its size and the points it connects to), the wiring ✨ is told (`generationContext.ts`), the files ✨ Input reads from the graph (`exampleFile.ts`: for an input wired from a start point, the file the block its field names starts on, or the path in what a call sends it for example), a port's keys in the definitions (`definitionPorts.ts`), "Run once per item" and "whole list" (`perItem.ts`); a dropped file (`droppedFile.ts`) and a folder's listing read as a run reads it (`readAsRun.ts`); `useGenerate` (the ✨ state machine, and its Stop), `LiveGeneration`, `GenerationTranscript`; the graph-wide sweep over the nodes (`graphSweep.ts`, `useGraphSweep.ts`); `useTyped.ts` (a box keeps what is typed while its stored form comes back tidied) |
| `store/` | [`editor/src/store/graphStore.ts`](../editor/src/store/graphStore.ts) | the open graph, undo, a new one (`newGraph`, from the engine's `defaultMetadata`), which document is open (`document`, `opened`), the page beside the nodes (`page`, `setPage`: one undo step, with the start or end point a new block is given), the node the person is on (`editingNodeId`, `clearSelection`), a change said for a node's panel (`pendingChange`, `askChange`, `clearChange`), a wire from a start point taking, unless said otherwise, one part of its package (`connect`, with `document/page.ts`'s `defaultField`: of what the one block sending there sends, the part the input is named after, else the part a node works on, else all of it; with no block, the part of a call's example the input is named after, or its one part; with several blocks, nothing, and the input takes the whole package), a node deleted taking its connections off the blocks (`deleteNodes`), the graph changed as one undo step (`changeGraph`), saving it (`save`: what counts as saved is what was sent), the document handed to the server's session (`holdDocument`) and what a round shows on the graph as the session tells it, kept nowhere (`followRound`); `nodeData.ts`, `executionStatus.ts`; [`portRenames.ts`](../editor/src/store/portRenames.ts) (which port became which across an edit of a node's ports, so a renamed port keeps its wires -- and, edit by edit, its keys in input.js and output.js: `renamedPorts`) |
| `api/` | [`editor/src/api/client.ts`](../editor/src/api/client.ts), [`session.ts`](../editor/src/api/session.ts) | the contract's client: `call(route, request)`, `ApiError`, `watchGeneration`, `downloadBundle`; `errorText.ts`; the session a page follows over its stream (`useSession`, `watchSession`), what was set on a page, by block id, until a round takes it (`setEdit`, `heldValue`), and rounds at a start point, asked with what they are sent, the answers and the block that fired them (`RoundAsk`; `startRound`, `stopRound`), and `forgetSession` when another document is opened |
| `document/` | [`editor/src/document/`](../editor/src/document/) | what a graph is to the editor: [`nodeKinds.ts`](../editor/src/document/nodeKinds.ts) (`NODE_KINDS`: a node of each type -- a start point made inside a node's graph is started by a call and sent `{<its id>: ""}` for example, `placedInside` --, `savedNode`: what a save keeps -- a new code or ai node runs once, on what arrives whole; a new one's numbered heading, `heading.ts`, and its id, `ids.ts`), `baseNodeConfig.ts`, `givenFiles.ts` (the files a node's ✨ Input and ✨ Output are given), [`page.ts`](../editor/src/document/page.ts) (what a block can do with the graph, the engine's answer -- `blockCan` --; the start and end points a block may name; what an input wired from a start point can take of its package -- `fieldChoices`, `defaultField`, `takenAs`, `page.test.ts` --; and which blocks fire, send to and show a point, `blocksAt`), [`ports.ts`](../editor/src/document/ports.ts) (`derivedNodePorts`: the ports that follow from a node's settings, as the engine derives them, each input keeping its field), `layout.ts` (the grid), [`wires.ts`](../editor/src/document/wires.ts) (`graphEdge`: a canvas wire as the saved edge, for every place that asks the wiring as a file has it) |
| `dialogs/` | [`editor/src/dialogs/`](../editor/src/dialogs/) | `FileBrowserDialog`; `PathField`, a path box with 📂 Browse… wherever a path is asked for, and `FileTypesField`; `RequirementsDialog` ("before running": what a round the page starts asks first) |
| `graph.ts` | [`editor/src/graph.ts`](../editor/src/graph.ts) | types only: the engine's, plus the typed `NodeConfig` view, a block as the editor holds it (`GuiWidget`) and the page of them |

Not drawn: [`ui/`](../editor/src/ui/) (theme, `tone.ts`, `scheme.ts`, `Modal` with `hearsEscape`, `SidePanel` with `panelHearsEscape`, `Markdown`, `ToolbarButton`), used from every layer above `document` and `api`; and
the direct imports of engine code in the store, `document/`, `authoring/`, `canvas/`, `elements/`,
`app/` and `page/` (`@engine/elements/registry.ts`, `@engine/elements/page.ts`, `@engine/execution/triggers.ts`,
`wiring.ts`, `graphInterface.ts`, `@engine/project/flow.ts`, `check.ts`, `@engine/authoring/definition.ts`, …) --
ports, what a block can connect to, triggers and `check` are the engine's answer, computed in the browser, not a copy of it.
