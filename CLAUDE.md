# Working on Tell & Wire

## Principles

- **Simple and short**: code, UI and documents. Delete before adding.
- **Argue** when you believe a decision is wrong: say why, once. Then the person you work
  with decides.

## The parts

Two products -- the editor and the notebook -- design a project (files) on common code; a deployment keeps one in use and
executes it; a package is a project with the deployment's code. The picture below is the target, and the folders follow it box by
box (`docs/architecture.md`, "The overview, block by block"; `backend/architecture/blocks.test.ts` keeps the two in step). Graph and
gui are apart all the way. Tier first, then role.

| Box of the picture | Folders |
|---|---|
| Editor: GUI editor, graph editor, their shell | `frontend/editor/{gui,graph,document,app,api}/` |
| Editor backend, and its part of the definitions | `backend/editor/{project,graph,settings,assistant,host}/`; `graph/editor/`, `gui/editor/` |
| Notebook: page, cells, shell | `frontend/notebook/{gui,graph,document,elements}/` |
| Notebook backend, and its model | `backend/notebook/`; `gui/notebook/` |
| Common code: the definitions of graph and gui, neutral | `graph/`, `gui/` |
| Common code: authoring, what both products write with | `graph/authoring/`, `gui/authoring/`, `backend/authoring/` |
| Common code: start-up, structure tests | `backend/cli/`, `backend/architecture/` |
| Use: browser | `frontend/deployment/{gui,windows}/` |
| Use: session host, engine, the project folder | `backend/deployment/{host,gui,runtime,project}/` |
| AI at run time: tool servers (MCP) | `mcp/web/`, `mcp/documents/` |

One rule: a package carries every path except those with a folder named `editor`, `notebook` or
`authoring`, and nothing outside such a folder imports from one; `authoring` (common to both products) imports
no product (`backend/architecture/layers.test.ts`). `graph/` and
`gui/` also import no Node and nothing of `backend/` or `frontend/`. Imports are relative. More in
`docs/architecture.md`.

Each server under `mcp/` is a package of its own, outside the workspace: its own `package.json`
and lockfile, nothing imported from the others (not from `graph/`, not from each other) and
nothing importing it. A folder with a `config.json` is a server the editor offers (**Add MCP
server** in an AI node): the editor knows only what that file says -- how it starts, and the
environment variables it reads -- and shows the server's own `settings.html` for its settings,
if it has one. Nothing of a server's settings is in the editor's code. The download carries the
servers with their packages, installed by `scripts/package.mjs` (it has Node and no npm), each
package with its own licence; a deployed tool carries none. Their checks (`npm test`,
`typecheck`, `licenses`) run inside each folder, in `.github/workflows/mcp.yml`.

## The picture to keep

![Design by two products on common code, the project as plain files, and use: three bands, and only files and a few named things cross between them](docs/images/overview.svg)

The picture (`docs/images/overview.svg`, in the README) is the target architecture, and the software is cut the same way: `docs/architecture.md` takes it apart box by box, and `backend/architecture/blocks.test.ts` holds the folders to it. "The files" in the same document says where each source file is and what it does, and `files.test.ts` fails on a file added, moved or removed without a row there. The detailed drawings -- the same picture with each box's folders and key files (`docs/images/overview-detail.svg`) and the file map by area (`docs/images/architecture-files-*.svg`) -- are made from those rows and from `backend/architecture/overviewDetail.ts`: after a change to a folder, a row, a box or the README's picture, run `node backend/architecture/draw.ts`; `drawings.test.ts` fails until you have. Code changes keep this layered modularity:

- **Three bands, files between them.** The editor designs and writes a project; a deployment reads
  it and runs it. What the editor knows must be in a file, in a plain format a person or git can
  read: the files are the contract, also for someone who edits them without the editor.
- **Two products over common code.** The editor and the notebook have their own folders, page and
  backend, and import nothing of each other (`backend/architecture/layers.test.ts`); what both
  need is common code underneath (`graph/`, `gui/`, authoring, host, runtime) and the files. A
  product's surface only *writes* the files -- an `@Name` is how the notebook writes a wire -- so
  the notebook keeps no file of its own. Code both products use is tested in both; code one
  product has its own copy of is tested in that product only.
- **The engine is handed the graph, never the GUI.** Nodes, their files and the wires -- that is
  all a core gets, through the core protocol. Session, state, clock, queue of rounds and HTTP are
  the host's; running nodes is the language-specific engine's. What depends on the language lives in
  the runtime, what does not in `graph/`, `gui/` or the host, so another language can be added
  without touching the rest.
- **Graph and GUI meet by name only**: a block fires a start point, shows an end point or a memory
  node. A block never reaches a node, and a block can read what a data node holds with no round.
- **Two models, two jobs**: the one that writes belongs to the editor; the one that runs the AI
  nodes is asked by the engine. Neither side imports the other's.
- A change that has to cross one of these lines the wrong way -- the editor into a deployment, the
  engine into the session or the GUI, a node into a block -- is a sign to move it, not to add the
  import. Say so in the plan.

## How a change is made

1. **Plan** the architecture for bigger changes, as modules: where it lives, what it
   replaces, what goes. Check it against the picture above.
2. **Code**: high-quality code whose working you understand. Simplify; remove what is not
   needed.
3. **Test**: write and run automated tests. Keep their number low; remove the least
   important. Also check that it builds and runs.
4. **Gui expert test**: in the built editor, with the mouse, rebuild examples and count the
   clicks. Is the workflow easy and clear without explanation? Is any button or element not
   needed? Does each do what it says? Is the usability consistent across elements, and top
   notch?
5. Repeat 2-4 (and 1 when the plan changes) until it is ready.

## Conventions

- Text in the UI and in the documents is English.
- No compatibility code for old formats: when a format changes, the code that read the old
  one goes.
- `ai-settings.json` can hold a real API key: it is gitignored; never commit or print it.
- Legal: `LICENSE` and the notices (`licenses.txt`, `node/LICENSE`) go with every copy; add
  no package, code, text, data or image that is not yours or that `npm run licenses` would
  refuse; no personal or real portfolio data in examples.
- Checks: `npm run typecheck`, `lint`, `build`, `test`, `licenses`. Work on a branch, let CI
  pass, then merge into `main`; a merge publishes the `latest` download.
