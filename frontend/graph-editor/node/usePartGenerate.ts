import { useGenerate } from '../authoring/useGenerate';
import { previewGeneration, writesFor, type Press, type Write } from '../authoring/generation';
import type { useNodePanel } from './nodePanel';
import { graphOf, pullInput, pullOutput, requestFor, writeFile, type Say } from './writeFile';

/**
 * Everything the node view asks of the model, once: one state machine for the
 * whole node, kept outside the view (`useGenerate`) -- closing the view stops
 * nothing -- and the one way to write a file or the whole node.
 */
export function usePartGenerate(nodeId: string, panel: ReturnType<typeof useNodePanel>) {
  const generate = useGenerate(nodeId);

  /** Pull *which* definition off the graph: what feeds the node, or what its outputs are written into. */
  const pull = (which: 'input' | 'output' = 'input'): Promise<boolean> => (which === 'output' ? pullOutput(nodeId, panel) : pullInput(nodeId, panel));

  /**
   * Write *write*, or -- for 'all' -- the whole node: for a body, what is
   * missing of the definitions first (`writeFile`). *say* is what was said to
   * the chat of the file *write* names: it goes with that file alone. Resolves
   * to whether all of it was written.
   */
  const press = async (write: Press, say: Say = {}): Promise<boolean> => {
    const start = panel.node();
    if (!start) return false;
    for (const one of say.refine && write !== 'all' ? [write] : writesFor(start, write)) {
      if (!(await writeFile(nodeId, panel, one, one === write ? say : {}))) return false;
    }
    return true;
  };

  return {
    generate,
    press,
    pull,
    graph: () => graphOf(panel),
    /** What a chat would send for *write*, without sending it. */
    preview: (write: Write) => previewGeneration(requestFor(panel, write)),
  };
}
