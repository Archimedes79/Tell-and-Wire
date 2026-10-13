# Modern White

The look of the editor on the branch `modern-white`: a scheme of its own, **Modern White**, as the
default, and a few shapes that go with it. It was made on top of `main` at 0.7.5 (`814b9b1`). This
file says what it is and what it touched, so it can be put on a newer `main` later, or rebuilt if
the branch and `main` have drifted apart.

## What it is

Modern White is the White ground with the blue taken out. The main button is near-black, so the one
thing that is a colour is what the AI does -- orange. A chosen card has a black ring and its wires
are black; the rest is grey, thin frames and soft shadows.

It is a scheme beside the four of `main` (id `modern`), not a change of White: White, Night, Paper
and Graphite are as they were, and any of them can be chosen in **⚙ Settings**.

1. **Default.** The editor of a person who has chosen no scheme, a tool whose file names none, and the
   default of a new tool (`defaultMetadata`) are all Modern White. A saved choice (`localStorage`,
   key `tell-and-wire.editor-scheme`) and a tool's own `gui_scheme` still win.
2. **Buttons.** Every look has a one-pixel frame, so all are of one size:
   - `primary`: the accent as a fill: near-black here. ▶ Run, and the one action of a dialog.
   - `ai`: the AI's own colour as a fill. Auto generate, Rewrite all, Change, Send in a chat, Fix,
     Write it, Generate.
   - `secondary` (the default): the surface with a thin `line` frame. Cancel, Browse, Full screen.
   - `tint`: a choice that is on (the open row, the node's settings, a text role): the accent as a
     tint, with a frame.
   - `danger`, `quiet`: as before.
3. **The views are a segmented control** (Graph | GUI | App): one track, the chosen one lifts out.
4. **A node's row buttons** (Chat, File): the open one is tinted, with a ring, not filled.
5. **A card** is lifted by two thin shadows; its kind is its icon on a tile of its ink at 14 %; what
   it holds or made sits on a quiet band under a hairline. The chosen card has a ring of the accent
   and a soft glow.
6. **The ◆ gate** is drawn when a start point is wired to it, the card is chosen or under the pointer,
   or a wire is on its way. The handle is always there and takes a wire.
7. **A file is a card**: the code box is the surface with a frame, on the sunken pane.
8. **A GUI page is a surface** (designer, App tab, delivered tool); in the designer it is a rounded,
   framed sheet on the editor's ground. Its fields, which are sunken, sit in it.
9. **The canvas**: dots a little larger, the minimap's shade lighter, the zoom buttons and the map
   framed, rounded and lifted; a notice comes over the work on a larger shadow.
10. **A palette tile** is white with a frame; **the bar under the canvas** has a white field and an
    `ai` Change button. Titles (`h1`, `h2`) are set a little tighter.

## The values

From `frontend/deployment/gui/kit/ui/scheme.ts`, `id: 'modern'`. `scheme.test.ts` pins them: a test
fails when one changes, so a change is on purpose.

| Role | Value | Used for |
|---|---|---|
| `sunken` | `#f3f4f6` | canvas, panes, fields |
| `surface` | `#ffffff` | panels, cards, bars, code boxes, a GUI page |
| `line` | `#dde0e5` | frames and dividers |
| `text` / `muted` / `dim` / `dimmer` | `#16181d` / `#4f5562` / `#5b616e` / `#636a76` | headings and text, labels, help, hints |
| `accent`, `accentText` | `#16181d` | ▶ Run, the chosen card, its wires and dots, a lit row |
| `accentFill` | `rgba(22,24,29,0.06)` | a choice that is on |
| `ai`, `onAi` | `#c2410c`, `#ffffff` | what the AI does: its buttons and the sparkle |
| `plot` | `#2448a6` | the first colour of a chart (the accent would be black) |
| `success` / `danger` / `warning` | `#1f7a4d` / `#b42323` / `#b45309` | succeeded, failed, a warning |
| `event` | `#b45309` | the ◆ |
| `ink` | ai `#6d28d9`, code `#0f766e`, data `#be185d`, start and end `#b45309`, subgraph `#475569` | the icon of each kind |

The other schemes got an `ai` colour too (orange on the dark ones, their accent on Paper), because
the `ai` button asks for it; their other values are as on `main`. The type is the system's, 14 px
for text and buttons, 12 px for ports and help. No font is loaded.

Elevation is two constants in `ui/theme.ts`: `SHADOW_SOFT` (`0 1px 2px` at 5 % and `0 6px 16px` at
6 %) and `SHADOW_FLOAT` for a notice. The glow around a chosen card, `ACCENT_GLOW`, is the accent at
18 % -- it was 30 %, which is heavy with a black accent -- in every scheme.

## What the branch changes, by file

| File | Change |
|---|---|
| `frontend/deployment/gui/kit/ui/scheme.ts` | the `modern` scheme; `ai`, `onAi` and `plot` on every scheme; `DEFAULT_SCHEME = 'modern'` |
| `frontend/deployment/gui/kit/ui/theme.ts` | `AI`, `ON_AI`, `SHADOW_SOFT`, `SHADOW_FLOAT`; `ACCENT_GLOW` at 18 % |
| `graph/graph.ts` | `defaultMetadata().gui_scheme` is `'modern'` (the test keeps it equal to `DEFAULT_SCHEME`) |
| `frontend/editor/document/graph.ts` | `'modern'` among the scheme ids |
| `frontend/editor/document/store/editorScheme.ts` | no saved choice: the default; `auto` in the light: the default |
| `frontend/deployment/gui/kit/ui/Button.tsx`, `kit/index.css` | the looks above; hover for `secondary`, `tint`; the heading tracking |
| `frontend/editor/app/ViewTabs.tsx` | segmented control |
| `frontend/editor/graph/views/RowList.tsx` | the open row button is tinted |
| `frontend/editor/graph/views/ChatPane.tsx`, `graph/writing/TryExample.tsx`, `gui/GuiHeading.tsx`, `app/Toolbar.tsx` | Send, Fix, Write it, Generate are `ai`; the sparkle is the AI's colour |
| `frontend/editor/graph/node/NodeView.tsx` | Auto generate is `ai`; the settings toggle is `tint` when on |
| `frontend/editor/gui/widgets/text/TextWidgetPanel.tsx` | the chosen text role is `tint` |
| `frontend/editor/graph/canvas/GraphNodeView.tsx` | the icon tile, the shadow, the band, the ◆ where it matters |
| `frontend/editor/graph/canvas/GraphCanvas.tsx` | larger dots; the floating groups |
| `frontend/editor/graph/writing/CodeSurface.tsx` | the code box is the surface |
| `frontend/editor/gui/DesignerTab.tsx` | the GUI page is the surface, as a framed sheet (the element that scrolls and takes drops is unchanged) |
| `frontend/editor/gui/ApplicationView.tsx`, `frontend/deployment/gui/GuiApp.tsx` | a GUI page is the surface |
| `frontend/editor/app/ChangeBar.tsx`, `app/Notices.tsx`, `kit/index.css` (`.palette-tile`) | the bar, the notice, the palette tile |
| tests | `scheme.test.ts` (the pinned values, the default, the `ai` contrast), `editorScheme.test.ts` |

An existing tool whose file names no scheme now opens in Modern White; a tool that names one keeps it.

## Putting it on a newer `main`

1. `git fetch`, then `git rebase origin/main` on the branch, or cherry-pick the design commits onto
   a branch from `origin/main`. The files above are few and small; a conflict is the place to look.
2. If `main` changed `scheme.ts` or `theme.ts`, keep both: the `modern` entry and the constants are
   additions. `scheme.test.ts` fails if a value of Modern White changed; the table above is the design.
3. If `main` moved a file above, apply its row of the table again by hand: each is one change.
4. `npm run typecheck`, `lint`, `build`, `test`; then open Graph, the node view, GUI and App and look.

## Rebuilding without the branch

Everything is in the two tables: add the `modern` scheme with these values, give every scheme an
`ai` colour, add the `ai` look to `Button.tsx` and a frame to every look, make it the default
(`DEFAULT_SCHEME`, `defaultMetadata`, `editorScheme`), and make the small changes of the file table.
The design canvas this came from is private to its owner and is not part of the repository.
