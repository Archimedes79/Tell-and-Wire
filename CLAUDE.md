# Working on Tell & Wire

## Principles

- **Simple and short**: code, UI and documents. Delete before adding.
- **Argue** when you believe a decision is wrong: say why, once. Then the person you work
  with decides.

## The parts

| Part | Folder |
|---|---|
| Graph editor, frontend | `frontend/graph-editor/` |
| Graph editor, backend | `backend/graph-editor/` |
| The graph's code (JavaScript) and its execution | `graph/` |
| Gui editor, frontend | `frontend/gui-editor/` |
| Gui editor, backend | `backend/gui-editor/` |
| The shell around them | `frontend/app/`, `backend/app/` |
| Optional tool servers (MCP) | `mcp/web/`, `mcp/documents/` |

`graph/` imports nothing from the others; a deployed tool carries `graph/`, `backend/app/`
and `backend/gui-editor/`. Imports are relative. More in `docs/architecture.md`.

Each server under `mcp/` is a package of its own, outside the workspace: its own `package.json`
and lockfile, nothing imported from the others (not from `graph/`, not from each other) and
nothing importing it. A folder with a `config.json` is a server the editor offers (**Add MCP
server** in an AI node): the editor knows only what that file says -- how it starts, and the
environment variables it reads -- and shows the server's own `settings.html` for its settings,
if it has one. Nothing of a server's settings is in the editor's code. The download carries the
servers with their packages, installed by `scripts/package.mjs` (it has Node and no npm), each
package with its own licence; a deployed tool carries none. Their checks (`npm test`,
`typecheck`, `licenses`) run inside each folder, in `.github/workflows/mcp.yml`.

## How a change is made

1. **Plan** the architecture for bigger changes, as modules: where it lives, what it
   replaces, what goes.
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
