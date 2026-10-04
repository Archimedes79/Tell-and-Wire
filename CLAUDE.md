# Working on Tell-and-Wire

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

`graph/` imports nothing from the others; a deployed tool carries `graph/`, `backend/app/`
and `backend/gui-editor/`. Imports are relative. More in `docs/architecture.md`.

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
- Checks: `npm run typecheck`, `lint`, `build`, `test`, `licenses`. Work on a branch, let CI
  pass, then merge into `main`; a merge publishes the `latest` download.
