import type { GuiWidget } from '../kit/guiWidget';
import type { RoundSnapshot } from '../kit/api/client';
import type { InterfaceEntry } from '../../../../graph/interface.ts';
import { heldValue, type GuiSession } from '../kit/api/session';
import type { GuiModel } from './GuiSurface';

/**
 * A GUI as it was designed, and how it is connected to the graph: what a
 * host knows of it before anything is used. Which blocks start a round, at
 * which start point, and which a round is sent what they hold, is the
 * graph's to say (`InterfaceEntry.fired_by`, `sends`) -- the delivered tool
 * is told it by the runtime API, the editor asks the backend, and the GUI
 * asks neither (`connectionsOf`).
 */
export interface GuiDesign {
  name: string;
  description: string;
  blocks: GuiWidget[];
  /** The start point each block that starts a round fires, by the block's id. */
  fires: Record<string, string>;
  /** The blocks a round the GUI starts is sent what they hold, by id. */
  sends: string[];
  /** The graph's outputs, each with its label: what a GUI without blocks shows under it. */
  outputs: { name: string; label: string }[];
  /** The graph has no nodes at all. */
  empty?: boolean;
}

/** How the GUI is connected, as the graph's interface says it: which block fires which start point, and which blocks are sent. */
export function connectionsOf(events: InterfaceEntry[]): Pick<GuiDesign, 'fires' | 'sends'> {
  const fires: Record<string, string> = {};
  const sends = new Set<string>();
  for (const event of events) {
    for (const block of event.fired_by ?? []) fires[block] ??= event.name;
    for (const sent of event.sends ?? []) sends.add(sent.name);
  }
  return { fires, sends: [...sends] };
}

/** Why *round* failed, in its own words -- or nothing, for one that went, is going, or was stopped. */
export function roundError(round: RoundSnapshot | null): string {
  if (!round?.done || round.cancelled) return '';
  if (round.result) return round.result.status === 'error' ? round.result.error ?? '' : '';
  return round.error ?? '';
}

/**
 * The GUI in use: *design*, with what the session says of each block by its
 * id -- what it holds, what it shows -- and whether a round is going, and how
 * the last one failed.
 */
export function guiInUse(design: GuiDesign, session: Pick<GuiSession, 'view' | 'edits'> & { busy: boolean; error: string }): GuiModel {
  const outputs = session.view?.outputs ?? {};
  const shown = session.view?.shown ?? {};
  const sends = new Set(design.sends);
  return {
    name: design.name,
    description: design.description,
    blocks: design.blocks,
    valueOf: (block) => heldValue(session, block.id, block.value),
    shownOn: (block) => shown[block.id],
    fires: (block) => block.id in design.fires,
    takes: (block) => sends.has(block.id),
    busy: session.busy,
    error: session.error,
    outputs: design.outputs.map((output) => ({ ...output, value: outputs[output.name] })),
    empty: design.empty,
  };
}
