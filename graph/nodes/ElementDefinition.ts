// What an element is: the half every package carries.
//
// One class per node type and per widget kind says what that kind is -- what it
// stores, which ports it contributes -- and answers whatever the graph asks of
// it while it is read and run. Two branches share this base: `NodeDefinition`
// for a node, `WidgetDefinition` for a block on a GUI. What they share is
// little: settings of their own.
//
// An element has more faces than this one, and the folder says which is which:
//
//   definition  what it is: neutral, shipped, here (`graph/nodes/`, `gui/widgets/`)
//   runner      what a node does when the graph runs: shipped, Node only
//               (`backend/deployment/runtime/nodes/`)
//   design      what only building asks: not shipped (`graph/editor/nodes/`,
//               `gui/editor/widgets/`)
//   builder     how a person edits it, in the browser: not shipped
//               (`frontend/editor/`)
//
// A face is named after its kind: `AiNodeDefinition`, `AiNodeRunner`,
// `AiNodeDesign`, `AiNodeGuiBuilder`. `frontend/editor/document/elements/symmetry.test.ts`
// holds the lists to each other, kind for kind.
//
// **The element owns its config.** `config(subject)` reads the stored record
// and returns this element's own settings, with defaults applied. Nothing else
// reads another element's fields.
//
// **Services arrive as a `Runtime`** (`Runtime.ts`), never as an import.

import type { RawConfig } from '../graph.ts';

/**
 * What a node and a block share: settings of their own.
 *
 * `S` is what this element is attached to — a node or a block — and `C` is the
 * settings it owns.
 */
export abstract class ElementDefinition<S extends { id: string; config: RawConfig }, C> {
  /**
   * This element's settings, defaulted. The only reader of `S.config`. An
   * element nobody asks for its settings keeps this one, which returns none.
   */
  config(_subject: S): C {
    return {} as C;
  }
}
