import type { Graph, GraphNode } from '../../app/graph';
import { call } from '../../app/api/client';
import { useGraphStore } from '../../app/store/graphStore';
import { ONCE } from '../nodes/NodeGuiBuilder';
import { useGenerate } from '../authoring/useGenerate';
import {
  exchangeName, generateRequest, generationGuard, previewGeneration, resultMessage, unfitDefinition, withHistory, writeName, writesFor,
  writtenInto, type Press, type Refine, type Write,
} from '../authoring/generation';
import { inputFilesOf } from '../authoring/exampleFile';
import { arrivedAt, pullable, pulledPorts, type Arrived } from '../authoring/pull';
import { inputFile } from '../../../graph/authoring/pull.ts';
import type { useNodePanel } from './nodePanel';

/** What the person said to a chat: the words for a file not written yet (`ask`), or the change to the file there is (`refine`). */
interface Say { refine?: Refine; ask?: string }

/**
 * Everything the node view asks of the model, once: one state machine for the
 * whole node, kept outside the view (`useGenerate`) -- closing the view stops
 * nothing -- and the one way to write a file or the whole node.
 */
export function usePartGenerate(nodeId: string, panel: ReturnType<typeof useNodePanel>) {
  const generate = useGenerate(nodeId);

  /** The graph on the canvas with this node in it as the view shows it, read when asked: what is tried and sent is the edit as it is then. */
  const graph = (): Graph => {
    const whole = useGraphStore.getState().exportGraph();
    const current = panel.node();
    if (current) whole.nodes = whole.nodes.map((candidate) => (candidate.id === current.id ? current : candidate));
    return whole;
  };

  /**
   * The graph around the node, read from the store when asked -- not as it
   * was when the view was drawn: one file is written after another, each into
   * a graph that the one before it changed.
   */
  const around = () => {
    const state = useGraphStore.getState();
    const current = panel.node();
    return {
      nodes: state.rfNodes.map((item) => (item.id === current?.id ? current : item.data.graphNode)),
      edges: state.rfEdges, metadata: state.metadata, page: state.page, executionResult: state.executionResult,
    };
  };

  const requestFor = (write: Write, say?: Say) => {
    const current = panel.node();
    if (!current) throw new Error('This node is not in the graph any more.');
    const { executionResult, ...rest } = around();
    return generateRequest(current, write, rest, inputFilesOf(current, rest.nodes, rest.edges, executionResult, rest.page), say);
  };

  /**
   * Pull input.js off the graph (`authoring/pull.ts`): what the nodes before it
   * say they hand on, and an example from running them. No model is asked of it
   * -- unless a node before it asks one to run. Written in as an undo step of
   * its own. Resolves to whether it was written *and* every wired input has an
   * example: what a press writes after it is written against it, and against
   * none is written against nothing.
   */
  const pull = async (): Promise<boolean> => {
    const start = panel.node();
    if (!start) return false;
    const portsOf = (node: GraphNode, arrived: Arrived) => {
      const { nodes, edges } = around();
      return pulledPorts(node, nodes, edges, arrived);
    };
    let complete = false;
    const written = await generate.run({
      pending: 'Running what feeds it…',
      run: () => arrivedAt(panel.node() ?? start, graph()),
      apply: (arrived) => {
        panel.change((now) => ({ ...now, config: { ...now.config, input_definition: inputFile(portsOf(now, arrived)) } }), ONCE);
      },
      success: (arrived) => {
        const now = panel.node() ?? start;
        const wired = new Set(around().edges.filter((edge) => edge.target === now.id).map((edge) => edge.targetHandle));
        const bare = portsOf(now, arrived).filter((port) => port.example === undefined && wired.has(port.id)).map((port) => `"${port.id}"`);
        complete = !arrived.error && !bare.length;
        if (arrived.error) return `⚠️ input.js pulled from what the nodes before it say, but there is no example from a run: ${arrived.error}`;
        const why = arrived.unread.length ? 'the file it reads could not be read' : 'nothing reached it when what feeds it ran';
        if (bare.length) return `⚠️ input.js pulled, but there is no example for ${bare.join(', ')}: ${why} -- choose a file on the page, or give a start point an example, and pull again.`;
        return '✅ input.js pulled: its definition from the nodes before it, its example from running them.';
      },
      failure: 'Pulling input.js failed',
    });
    return written && complete;
  };

  /**
   * Write *write*, or -- for 'all' -- the whole node: for a body, what is
   * missing of the definitions first, each through the one route, each written
   * in as it comes, as an undo step of its own, with the exchange at the end of
   * the node's history.md. The input is pulled where something is wired to it,
   * and written from the text where nothing is. A definition that does not fit
   * the node stops it there (`unfitDefinition`): what comes after would be
   * written against it. *say* is what was said to the chat of the file *write*
   * names: it goes with that file alone. Resolves to whether all of it was written.
   */
  const press = async (write: Press, say: Say = {}): Promise<boolean> => {
    const start = panel.node();
    if (!start) return false;
    for (const one of say.refine && write !== 'all' ? [write] : writesFor(start, write)) {
      const current = panel.node();
      if (!current) return false;
      if (one === 'input' && pullable(current, around().edges)) {
        if (!(await pull())) return false;
        continue;
      }
      const mine = one === write ? say : {};
      const request = requestFor(one, mine);
      let unfit: string | undefined;
      const written = await generate.run({
        guard: () => generationGuard(current),
        pending: `${writeName(current, one)}…`,
        run: (progressId?: string) => call('generate', { ...request, ...(progressId ? { progress_id: progressId } : {}) }),
        apply: (result) => {
          unfit = unfitDefinition(one, result.probe);
          panel.change((now) => writtenInto(now, one, result, exchangeName(now, one, mine)), ONCE);
        },
        success: (result) => resultMessage(writeName(current, one), result, mine.refine),
        failure: `${writeName(current, one)} failed`,
        failed: (calls) => panel.change((now) => ({
          ...now, config: { ...now.config, history: withHistory(now, exchangeName(now, one, { ...mine, failed: true }), calls) },
        }), ONCE),
      });
      if (!written || unfit) return false;
    }
    return true;
  };

  return {
    generate,
    press,
    pull,
    graph,
    /** What a chat would send for *write*, without sending it. */
    preview: (write: Write) => previewGeneration(requestFor(write)),
  };
}
