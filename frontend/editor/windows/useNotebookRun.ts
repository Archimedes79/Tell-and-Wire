import { useMemo } from 'react';
import type { GuiWidget } from '../../deployment/gui/kit/guiWidget';
import { connectionsOf, type GuiDesign } from '../../deployment/gui/surface/guiInUse';
import { useRound } from '../../deployment/gui/surface/useRound';
import { useWindowFire } from '../../deployment/windows/LiveWindows';
import { interfaceWithGui } from '../../../gui/interface.ts';
import { registry } from '../../../graph/nodes/registry.ts';
import type { Windows } from '../../../gui/editor/windows/windows.ts';
import { compile, holdWindows, useNotebook } from './notebookStore';

/**
 * The page in use: the windows compiled to the gui a tool would have, and the means to run it.
 *
 * What is drawn is what a delivered tool draws (`LiveWindows`), from the same blocks and through the same
 * session; this only makes the blocks from the windows and hands them to the server before a round.
 * Running a window runs the ones it takes from first, when they are not current (`useWindowFire`).
 */
export function useNotebookRun(doc: Windows) {
  const design = useMemo<GuiDesign>(() => {
    const graph = compile(doc, useNotebook.getState().graph);
    const offered = interfaceWithGui(graph, registry);
    return {
      name: doc.name,
      description: doc.description,
      blocks: (graph.gui?.blocks ?? []) as unknown as GuiWidget[],
      ...connectionsOf(offered.events),
      outputs: offered.outputs.map(({ name, label }) => ({ name, label })),
    };
  }, [doc]);
  const round = useRound(holdWindows);
  const fireWindow = useWindowFire(design, round);
  return { design, round, fire: fireWindow };
}
