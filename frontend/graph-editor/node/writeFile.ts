// Writing one file of a node -- input.js, output.js or its body -- the way the
// node's view and the toolbar's Generate all do: pull it off the graph where the
// graph says it, else ask the model; write the result in; stop at a definition
// that does not fit; keep a failed exchange in the node's history.
//
// A file is written into a node through a panel (`NodePanel`): the node as it is,
// and a change that says whether it landed.

import type { Graph, GraphNode } from '../../app/graph';
import { call } from '../../app/api/client';
import { useGraphStore } from '../../app/store/graphStore';
import { ONCE } from '../nodes/NodeGuiBuilder';
import { runGenerate } from '../authoring/useGenerate';
import {
  exchangeName, generateRequest, generationGuard, outputsAsDefined, resultMessage, unfitDefinition, withHistory, writeName, writtenInto,
  type Refine, type Write,
} from '../authoring/generation';
import { inputFilesOf } from '../authoring/exampleFile';
import { arrivedAt, modelsBefore, pullGap, pullable, pullableOutput, pulledOutputs, pulledPorts, type Arrived } from '../authoring/pull';
import { inputFile, outputFile } from '../../../graph/authoring/pull.ts';
import type { NodePanel } from './nodePanel';

/** What the person said to a chat: the words for a file not written yet (`ask`), or the change to the file there is (`refine`). */
export interface Say { refine?: Refine; ask?: string }

/** The node a file is written into, and how: a panel's two members. */
type Target = Pick<NodePanel, 'node' | 'change'>;

/** Said when the node is gone, or another graph was opened: nothing is written into a stranger. */
export const ANOTHER_GRAPH = 'This node is not in the graph any more, or another graph was opened: what came back is not written.';

/**
 * The graph on the canvas with the node as *target* has it, read when asked:
 * what is tried and sent is the edit as it is then, and one file is written
 * after another, each into a graph that the one before it changed.
 */
export function graphOf(target: Target): Graph {
  const whole = useGraphStore.getState().exportGraph();
  const current = target.node();
  if (current) whole.nodes = whole.nodes.map((candidate) => (candidate.id === current.id ? current : candidate));
  return whole;
}

function around(target: Target) {
  const { nodes, metadata, page } = graphOf(target);
  const { rfEdges, executionResult } = useGraphStore.getState();
  return { nodes, edges: rfEdges, metadata, page: page?.blocks ?? [], executionResult };
}

/** What a chat would send for *write*, or what ✨ sends. */
export function requestFor(target: Target, write: Write, say?: Say) {
  const current = target.node();
  if (!current) throw new Error(ANOTHER_GRAPH);
  const { executionResult, ...rest } = around(target);
  return generateRequest(current, write, rest, inputFilesOf(current, rest.nodes, rest.edges, executionResult, rest.page), say);
}

/** Change the node, or say it is gone: a result is never reported written when it was not. */
function change(target: Target, edit: (node: GraphNode) => GraphNode): void {
  if (!target.change(edit, ONCE)) throw new Error(ANOTHER_GRAPH);
}

/**
 * Pull input.js off the graph (`authoring/pull.ts`): what the nodes before it
 * say they hand on, and an example from running them. No model is asked of it
 * -- unless a node before it asks one to run. Resolves to whether it was
 * written *and* every wired input has an example: what is written after it is
 * written against it, and against none is written against nothing.
 */
export async function pullInput(nodeId: string, target: Target): Promise<boolean> {
  const start = target.node();
  if (!start) return false;
  const portsOf = (node: GraphNode, arrived: Arrived) => {
    const { nodes, edges } = around(target);
    return pulledPorts(node, nodes, edges, arrived);
  };
  let complete = false;
  const written = await runGenerate(nodeId, {
    pending: 'Running what feeds it…',
    run: () => arrivedAt(target.node() ?? start, graphOf(target)),
    apply: (arrived) => change(target, (now) => ({ ...now, config: { ...now.config, input_definition: inputFile(portsOf(now, arrived)) } })),
    success: (arrived) => {
      const now = target.node() ?? start;
      const gap = pullGap(now, portsOf(now, arrived), around(target).edges, arrived);
      complete = !gap;
      return gap ? `⚠️ input.js pulled, but ${gap}` : '✅ input.js pulled: its definition from the nodes before it, its example from running them.';
    },
    failure: 'Pulling input.js failed',
  });
  return written && complete;
}

/**
 * Pull output.js off the memory each output is written into: the field's type,
 * and an example of what it holds filled. No model is asked, nothing is run.
 */
export function pullOutput(nodeId: string, target: Target): Promise<boolean> {
  const start = target.node();
  if (!start) return Promise.resolve(false);
  return runGenerate(nodeId, {
    pending: 'Reading what the memory holds…',
    run: async () => {
      const { nodes, edges } = around(target);
      const ports = pulledOutputs(target.node() ?? start, nodes, edges);
      if (!ports) throw new Error('Not every output goes into a memory: say in the chat what it hands on.');
      return ports;
    },
    apply: (ports) => change(target, (now) => outputsAsDefined({ ...now, config: { ...now.config, output_definition: outputFile(ports) } })),
    success: '✅ output.js pulled: each output typed, and shown an example, as the memory field it is written into.',
    failure: 'Pulling output.js failed',
  });
}

/**
 * Write file *write* of the node: pulled where the graph says it, else asked of
 * the model, written in as an undo step of its own with the exchange at the end of
 * the node's history.md. *say* is what was said to the chat of this file: it goes
 * with this file alone, and an output that was spoken of is not pulled. *noModels*:
 * an input is not pulled when a model is among what feeds it, which running would
 * ask once more. Resolves to whether it was written and fits: a definition that
 * does not stops what comes after it, which would be written against it.
 */
export async function writeFile(nodeId: string, target: Target, write: Write, say: Say = {}, noModels = false): Promise<boolean> {
  const current = target.node();
  if (!current) return false;
  const { nodes, edges } = around(target);
  if (write === 'input' && pullable(current, edges) && !(noModels && modelsBefore(current, nodes, edges).length)) {
    return pullInput(nodeId, target);
  }
  if (write === 'output' && !(say.ask || say.refine) && pullableOutput(current, nodes, edges)) return pullOutput(nodeId, target);
  const request = requestFor(target, write, say);
  let unfit: string | undefined;
  const written = await runGenerate(nodeId, {
    guard: () => generationGuard(current, say),
    pending: `${writeName(current, write)}…`,
    run: (progressId?: string) => call('generate', { ...request, ...(progressId ? { progress_id: progressId } : {}) }),
    apply: (result) => {
      unfit = unfitDefinition(write, result.probe);
      change(target, (now) => writtenInto(now, write, result, exchangeName(now, write, say)));
    },
    success: (result) => resultMessage(writeName(current, write), result, say.refine),
    failure: `${writeName(current, write)} failed`,
    failed: (calls) => target.change((now) => ({
      ...now, config: { ...now.config, history: withHistory(now, exchangeName(now, write, { ...say, failed: true }), calls) },
    }), ONCE),
  });
  return written && !unfit;
}
