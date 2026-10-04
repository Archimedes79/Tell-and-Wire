import type { GuiWidget } from '../../app/graph';
import type { RoundSnapshot } from '../../app/api/client';
import type { InterfaceEntry } from '../../../backend/gui-editor/graphInterface.ts';
import { heldValue, roundGoing, type PageSession } from '../../app/api/session';
import type { PageModel } from './GuiPage';

/**
 * A page as it was designed, and how it is connected to the graph: what a
 * host knows of it before anything is used. Which blocks start a round, at
 * which start point, and which a round is sent what they hold, is the
 * graph's to say (`InterfaceEntry.fired_by`, `sends`) -- the delivered tool
 * is told it by the runtime API, the editor asks the engine, and the page
 * asks neither (`connectionsOf`).
 */
export interface PageDesign {
  name: string;
  description: string;
  scheme: string;
  blocks: GuiWidget[];
  /** The start point each block that starts a round fires, by the block's id. */
  fires: Record<string, string>;
  /** The blocks a round the page starts is sent what they hold, by id. */
  sends: string[];
  /** The graph's outputs, each with its label: what a page without blocks shows under it. */
  outputs: { name: string; label: string }[];
  /** The graph has no nodes at all. */
  empty?: boolean;
}

/** How the page is connected, as the graph's interface says it: which block fires which start point, and which blocks are sent. */
export function connectionsOf(events: InterfaceEntry[]): Pick<PageDesign, 'fires' | 'sends'> {
  const fires: Record<string, string> = {};
  const sends = new Set<string>();
  for (const event of events) {
    for (const block of event.fired_by ?? []) fires[block] ??= event.name;
    for (const sent of event.sends ?? []) sends.add(sent.name);
  }
  return { fires, sends: [...sends] };
}

/** Why *round* failed, in its own words -- or nothing, for one that went, is going, or was stopped. */
function roundError(round: RoundSnapshot | null): string {
  if (!round?.done || round.cancelled) return '';
  if (round.result) return round.result.status === 'error' ? round.result.error ?? '' : '';
  return round.error ?? '';
}

/**
 * The page in use: *design*, with what the session says of each block by its
 * id -- what it holds, what it shows -- and whether a round is going.
 */
export function pageInUse(design: PageDesign, session: PageSession): PageModel {
  const outputs = session.view?.outputs ?? {};
  const shown = session.view?.shown ?? {};
  const sends = new Set(design.sends);
  return {
    name: design.name,
    description: design.description,
    scheme: design.scheme,
    blocks: design.blocks,
    valueOf: (block) => heldValue(session, block.id, block.value),
    shownOn: (block) => shown[block.id],
    fires: (block) => block.id in design.fires,
    takes: (block) => sends.has(block.id),
    busy: roundGoing(session),
    error: roundError(session.round),
    outputs: design.outputs.map((output) => ({ ...output, value: outputs[output.name] })),
    empty: design.empty,
  };
}
