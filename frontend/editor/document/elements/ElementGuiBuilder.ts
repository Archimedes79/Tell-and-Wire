// The face of an element that exists so a person can build with it.
//
// The mirror of `graph/nodes/ElementDefinition.ts`, class for class: every
// element class there ends in `Definition`, and its counterpart here swaps that
// for `GuiBuilder` -- `ElementDefinition` / `ElementGuiBuilder`, `NodeDefinition` /
// `NodeGuiBuilder`, `AiNodeDefinition` / `AiNodeGuiBuilder` -- in the same folder,
// under the same name.
//
// **The name is the whole point.** `Definition` says what an element is, and a
// tool carries it; `GuiBuilder` says how a person edits it. `Gui` in the middle
// is *where it lives*: everything a person clicks is in the browser, and the
// editor's part of it is not carried -- see `deployment/gui/surface/blocks.ts`
// for the part of the browser a tool does carry.
//
// What a builder adds to its element is the editor's part: its panel (the
// settings), and what the editor's shells ask of it, so no shell switches on a
// type name. A panel is registered with `lazy(() => import(…))`: its own chunk,
// loaded when the element is opened in the editor and never by a deployed tool.

import type { ComponentType } from 'react';

/** `PanelProps` is what its panel is handed. */
export abstract class ElementGuiBuilder<PanelProps> {
  /** The element's settings panel. Absent for an element with nothing to set: a rule, a gap. */
  readonly Panel?: ComponentType<PanelProps>;
}
