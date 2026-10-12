// What a GUI does around the graph in use, as the host asks it.
//
// The host (`../host/session.ts`) holds a graph in use and runs its rounds; it
// knows no block. A GUI is a part it is handed: with one, a round a block of it
// starts is sent what the blocks hold, and what the end points hand back is
// settled into the blocks that show them (`gui/gui.ts` says how); without one
// -- a tool that has no GUI, or one with a page of its own written by hand --
// the host is a graph in use and nothing more (`NO_GUI`, in the host).

import type { Graph } from '../../../graph/graph.ts';
import { NotOffered, applySent, type GraphInterface } from '../../../graph/interface.ts';
import { graphCallsModel } from '../../../graph/usesModel.ts';
import { interfaceWithGui } from '../../../gui/interface.ts';
import { startEvents, type Trigger } from '../../../graph/triggers.ts';
import { registry } from '../../../graph/nodes/registry.ts';
import type { Runtime } from '../../../graph/nodes/Runtime.ts';
import { names } from '../../../graph/wiring.ts';
import {
  applyGuiValues, clearDeliveredGui, firedBy, guiBlock, guiBlocks, guiRequirements, guiSends, guiState, pathBlocks, sentBy, setGuiState, settleGui,
  shownFromState, startFromGui, takesGuiValue,
} from '../../../gui/gui.ts';
import type { RuntimeRequirement } from '../../../gui/widgets/WidgetDefinition.ts';

/** A round with a GUI around it: how it began, and how it ends. */
interface GuiRound {
  /** A block of the GUI started it, and its start point has been sent what the blocks hold: nothing else is sent. */
  sent: boolean;
  /** What the end points handed back reaches the blocks that show them; what was sent with the round is emptied. Returns what each block shows now. */
  settle(graph: Graph, outputs: Record<string, unknown>, runtime: Runtime): Promise<Record<string, unknown>>;
}

export interface GuiHooks {
  /** What the graph offers by name, with what the GUI adds: which blocks fire a start point, and what they send with it. */
  interfaceOf(graph: Graph): GraphInterface;
  /** What each block holds now, by the block's id. */
  state(graph: Graph): Record<string, unknown>;
  /** Put what the blocks held back into *graph*. */
  setState(graph: Graph, held: Record<string, unknown>): void;
  /** What each block that shows a memory node shows, from what the memory holds now. */
  shownFromState(graph: Graph, state: Record<string, unknown>): Record<string, unknown>;
  /** Which of the blocks named take a path of this machine: a picker's file or folder. */
  pathBlocks(graph: Graph, ids: string[]): string[];
  /** Whether a round for *trigger* is one the GUI starts: sent by one of its blocks, at a start point. */
  starts(graph: Graph, trigger: Trigger | null, by: string): boolean;
  /** Refuse a round the GUI could not have started: *by* does not fire the start point, or *values* name a block that takes none. */
  check(graph: Graph, trigger: Trigger, by: string, values: Record<string, unknown>): void;
  /** What a round the GUI starts still asks a person, once *values* are put in: a picker with nothing chosen. None, for a round it does not start. */
  requirements(graph: Graph, trigger: Trigger | null, by: string, values: Record<string, unknown>): RuntimeRequirement[];
  /**
   * Make *graph*, the working copy of a round, ready: for a round the GUI starts, put what the blocks hold
   * into them and the start point it fires is sent what the blocks that send to it hold; for a round of the
   * whole graph, the GUI's start points count as started.
   */
  before(graph: Graph, trigger: Trigger | null, by: string, values: Record<string, unknown>, answers: Record<string, unknown>, runtime: Runtime): Promise<GuiRound>;
}

function starts(graph: Graph, trigger: Trigger | null, by: string): boolean {
  if (!trigger || !guiBlock(graph, by)) return false;
  const node = graph.nodes.find((one) => one.id === trigger.node_id);
  return !!node && !!registry.node(node.node_type)?.takesPackage;
}

export const guiHooks: GuiHooks = {
  interfaceOf: (graph) => interfaceWithGui(graph, registry),
  state: guiState,
  setState: setGuiState,
  shownFromState,
  pathBlocks,
  starts,

  check(graph, trigger, by, values) {
    const firing = firedBy(graph, trigger.node_id).map((widget) => widget.id);
    if (!firing.includes(by)) {
      throw new NotOffered(`The block "${by}" does not fire "${trigger.node_id}"${firing.length ? `; it is fired by ${names(firing)}` : ''}.`);
    }
    const unknown = Object.keys(values).filter((id) => !takesGuiValue(graph, id));
    if (unknown.length) throw new NotOffered(`No block ${names(unknown)} on the GUI takes a value.`);
  },

  requirements(graph, trigger, by, values) {
    if (!starts(graph, trigger, by)) return [];
    applyGuiValues(graph, values);
    return guiRequirements(graph, trigger!.node_id);
  },

  async before(graph, trigger, by, values, answers, runtime) {
    const viaGui = starts(graph, trigger, by);
    // A round of everything counts the GUI's events as fired too.
    if (!viaGui && !trigger) await startFromGui(graph, runtime, registry);
    const delivered = viaGui ? sentBy(graph, trigger!.node_id).map((widget) => widget.id) : [];
    if (viaGui) {
      applyGuiValues(graph, { ...values, ...answers });
      applySent(graph, trigger, await guiSends(graph, trigger!.node_id, runtime), by, registry);
    }
    const sent = guiState(graph);
    return {
      sent: viaGui,
      async settle(done, outputs, services) {
        const shown = await settleGui(done, outputs, services);
        clearDeliveredGui(done, Object.fromEntries(Object.entries(sent).filter(([id]) => delivered.includes(id))));
        return shown;
      },
    };
  },
};

/** The GUI as it was designed, and no more of the graph: its blocks are what it draws, by the names they are called by. */
function guiView(session: { id: string; graph: Graph; designRevision: number }) {
  const { graph } = session;
  return {
    session: session.id,
    design_revision: session.designRevision,
    name: graph.metadata.name,
    description: graph.metadata.description ?? '',
    scheme: String(graph.metadata.gui_scheme ?? ''),
    blocks: guiBlocks(graph),
    starts_whole: startEvents(graph, registry).includes(null),
    uses_model: graphCallsModel(graph, registry),
  };
}

/** What a host is composed with to have a GUI (`serve`). */
export const guiPart = { hooks: guiHooks, view: guiView };
export type GuiPart = typeof guiPart;
