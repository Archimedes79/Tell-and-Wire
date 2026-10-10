// What the designer shows in a block somebody has typed into.
//
// The blocks stay live while a page is designed, and a text block that both
// takes a message and shows a reply would put the reply over the words being
// typed. So what was typed is remembered and shown in its place -- but only
// while the block still holds it: a run that sent the message empties the box,
// and a new default path in the panel replaces the picker's path.
//
// A plain function beside the designer, as `pageWrite.ts` is, so a test can
// say what it does.
import type { GuiWidget } from '../../app/graph';

/** The typed values that still hold: each one only while its block's stored value is that text. */
export function liveTypedValues(typed: Record<string, string>, widgets: GuiWidget[]): Record<string, string> {
  const held = new Map(widgets.map((widget) => [widget.id, widget.value]));
  return Object.fromEntries(Object.entries(typed).filter(([id, text]) => held.get(id) === text));
}
