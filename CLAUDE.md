# Working on Tell-and-Wire

## Principles

- **Keep it simple.** Code, UI and documents: the simplest thing that works. Delete before
  adding.
- **Argue, then follow.** If a rule, test or request here looks wrong, say so once with
  the reason. Then the person you work with decides.

## Where things live

| Part | Frontend (`editor/src/`) | Backend (`engine/src/`) |
|---|---|---|
| Graph editor | `canvas/`, `elements/nodes/` | `host/editor/` (save, ✨, deploy), `project/` |
| Gui editor | `page/`, `elements/widgets/` | `elements/widgets/`, `host/session.ts` |
| Graph execution | -- | `core/`, `execution/`, `elements/nodes/` |
| A delivered tool | `runtime/` | `host/` (server, runtime API) |

`examples/` are the project folders the tests and CI run. Documents: `README.md` (what it
is, how to start), `docs/user-guide.md` (how to build a tool), `docs/architecture.md` (how
it is built).

## How a change is made

One iteration: **(1) 2 3 4**, repeated until all say yes. A different agent per role
where possible; the User never reads the code.

1. **Architect** (bigger changes only: a new kind, format, route or concept): a short plan
   -- where it lives, what it replaces, what goes. Surface or concept changes: a mockup the
   owner has seen.
2. **Coder**: readable, high-quality code in the style around it; then review it -- what
   can be simpler, what can be removed.
3. **Tester**: tests for the rules and bugs that matter, not the implementation. Keep them
   few: extend before adding, delete duplicates. Fewer tests is a risk we take on purpose.
4. **User**: in the built editor, with the mouse, rebuild an example. Is the workflow
   short and obvious? Any button or element not needed? Does it do what it says?

## Conventions

- English in UI and documents. No compatibility code for old formats.
- Never commit or print `ai-settings.json` (real keys). Leave `examples/test/` and
  `examples/data/words/` alone (someone else's).
- Checks: `npm run typecheck`, `lint`, `build`, `test`, `licenses`; CI runs them.
- Branch, CI green, merge into `main`. A merge publishes (`latest` download).
