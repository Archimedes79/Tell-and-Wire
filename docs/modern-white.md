# Modern White

The look of the editor on the branch `modern-white`: the **White** scheme as the default, and a
few shapes that go with it. It was made on top of `main` at 0.7.5 (`814b9b1`). This file says what
it is and what it touched, so it can be put on a newer `main` later, or rebuilt if the branch and
`main` have drifted apart.

## What it is

1. **White is the default.** The editor of a person who has chosen no scheme, the page of a tool
   whose file names none, and the default of a new tool (`defaultMetadata`) are all White. A saved
   choice (`localStorage`, key `tell-and-wire.editor-scheme`) and a tool's own `gui_scheme` still win.
2. **Buttons.** Four looks and one more, all with a one-pixel frame so they are of one size:
   - `primary`: the accent as a fill. ▶ Run, and the one action of a dialog.
   - `secondary` (the default): the surface with a thin `line` frame. Cancel, Browse, Full screen.
   - `tint`: the accent as a tint with its own frame. What the AI does (Auto generate, Rewrite all),
     and a toggle that is on (the node's settings, a text role).
   - `danger`, `quiet`: as before.
3. **The views are a segmented control** (Graph | GUI | App): one track, the chosen one lifts out.
4. **A node's row buttons** (Chat, File): the open one is tinted with a ring, not filled.
5. **A card's kind** is its icon on a tile of its ink at 14 %.
6. **A file is a card**: the code box is the surface with a frame, on the sunken pane.
7. **A GUI page is a surface** (designer, App tab, delivered tool): its fields, which are sunken,
   sit in it.
8. **The canvas**: dots a little larger, the minimap's shade lighter.

## The White values

From `frontend/deployment/gui/kit/ui/scheme.ts`, `id: 'white'`. `scheme.test.ts` pins them: a test
fails when one changes, so a change is on purpose.

| Role | Value | Used for |
|---|---|---|
| `sunken` | `#f4f5f7` | canvas, panes, fields |
| `surface` | `#ffffff` | panels, cards, bars, code boxes, a GUI page |
| `line` | `#d8dbe0` | frames and dividers |
| `text` / `muted` / `dim` / `dimmer` | `#1a1d23` / `#4a515c` / `#585e6a` / `#63676f` | headings and text, labels, help, hints |
| `accent` | `#2563eb` | ▶ Run, the chosen card and its wires, a lit row |
| `accentText` | `#1d4ed8` | blue text and icons |
| `accentFill` | `rgba(37,99,235,0.08)` | tinted buttons |
| `success` / `danger` / `warning` | `#15803d` / `#b42318` / `#b45309` | succeeded, failed, a warning |
| `event` | `#b45309` | the ◆ |
| `ink` | ai `#6d28d9`, code `#0f766e`, data `#be185d`, start and end `#b45309`, subgraph `#475569` | the icon of each kind |

The type is the system's (`-apple-system, Segoe UI, Roboto, …`), 14 px for text and buttons, 12 px
for ports and help. No other font is loaded.

## What the branch changes, by file

| File | Change |
|---|---|
| `frontend/deployment/gui/kit/ui/scheme.ts` | `DEFAULT_SCHEME = 'white'`; `scheme()` falls back to it |
| `graph/graph.ts` | `defaultMetadata().gui_scheme` is `'white'` (the test keeps it equal to `DEFAULT_SCHEME`) |
| `frontend/editor/document/store/editorScheme.ts` | an editor with no saved choice starts in White |
| `frontend/deployment/gui/kit/ui/Button.tsx`, `kit/index.css` | the looks above; hover for `secondary` and `tint` |
| `frontend/editor/app/ViewTabs.tsx` | segmented control |
| `frontend/editor/graph/views/RowList.tsx` | the open row button is tinted |
| `frontend/editor/graph/node/NodeView.tsx` | Auto generate is `tint`; the settings toggle is `tint` when on |
| `frontend/editor/gui/widgets/text/TextWidgetPanel.tsx` | the chosen text role is `tint` |
| `frontend/editor/graph/canvas/GraphNodeView.tsx` | the kind's icon on a tile |
| `frontend/editor/graph/canvas/GraphCanvas.tsx` | larger dots |
| `frontend/editor/graph/writing/CodeSurface.tsx` | the code box is the surface |
| `frontend/editor/gui/DesignerTab.tsx`, `ApplicationView.tsx`, `frontend/deployment/gui/GuiApp.tsx` | a GUI page is the surface |
| tests | `scheme.test.ts` (the pinned values, the default), `editorScheme.test.ts` (starts in White) |

## Putting it on a newer `main`

1. `git fetch`, then `git rebase origin/main` on the branch, or cherry-pick the design commits onto
   a branch from `origin/main`. The files above are few and small; a conflict is the place to look.
2. If `main` changed the White values, `scheme.test.ts` fails. Decide which are meant: `main`'s are
   the scheme, the table above is the design. Change the table, or the code, so they agree.
3. If `main` moved a file above, apply its row of the table again by hand: each is one change.
4. `npm run typecheck`, `lint`, `build`, `test`; then open Graph, the node view, GUI and App in
   White and look at them.

## Rebuilding without the branch

Everything is in this table and the one above: the White scheme exists on `main` as it is; set it as
the default (`DEFAULT_SCHEME`, `defaultMetadata`, `editorScheme`), add the `tint` look to
`Button.tsx`, give `secondary` a frame, and make the six small changes of the table. The design
canvas this came from is private to its owner and is not part of the repository.
