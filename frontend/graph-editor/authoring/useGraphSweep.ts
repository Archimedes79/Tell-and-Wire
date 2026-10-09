// The toolbar's Generate: every node of the graph written, front to back.
//
// `graphSweep.ts` decides the order and the rules; this assembles one node's
// writing the way the node's view does -- the same request (`generateRequest`),
// the same answer written in (`writtenInto`), what is missing first
// (`writesFor`) -- and writes what comes back into the store, file by file.
// What the graph says is not asked of a model, as in the node's view: an output
// into a memory is pulled, and an input is, by a run of what feeds it -- where
// no model is among that, which a sweep would ask once more for every node after it.

import { useCallback, useRef, useState } from 'react';
import type { GraphEdge, GraphNode } from '../../app/graph';
import { ApiError, call } from '../../app/api/client';
import { useGraphStore } from '../../app/store/graphStore';
import { portRenames } from '../../app/store/portRenames';
import { graphEdge } from '../../app/document/wires';
import {
  bodyOf, exchangeName, generateRequest, generationGuard, isWritten, outputsAsDefined, unfitDefinition, withHistory, writeName, writesFor, writtenInto,
  type Write,
} from './generation';
import { inputFilesOf } from './exampleFile';
import { arrivedAt, modelsBefore, pullGap, pullable, pullableOutput, pulledOutputs, pulledPorts } from './pull';
import { inputFile, outputFile } from '../../../graph/authoring/pull.ts';
import { missingExamples, sweep, type SweepUnit } from './graphSweep';

interface SweepState {
  run: () => Promise<void>;
  stop: () => void;
  busy: boolean;
  message: string;
  /** What it said has been read: it goes. */
  dismiss: () => void;
}

/** Said when what came back belongs to a graph that is no longer open. */
export const ANOTHER_GRAPH = 'another graph was opened, and what came back is not written into it';

/**
 * What a sweep writes of *node*: what one press of its body's ✨ writes
 * (`writesFor`) -- its input definition where it takes something in, its
 * output definition, its body -- less what it holds already: never what
 * somebody wrote.
 */
export function missingOf(node: GraphNode): Write[] {
  if (!bodyOf(node)) return [];
  return writesFor(node, 'body').filter((write) => !isWritten(node, write));
}

/**
 * Write every node of the open graph that is missing something, front to back,
 * saying how it goes through *say*. Written into the graph that was open when
 * it started, and only while it still is: node ids repeat from graph to graph,
 * and a body that came back for one graph's node is not the next graph's.
 */
export async function sweepGraph({ say, stopped }: { say: (message: string) => void; stopped: () => boolean }): Promise<void> {
  // Read through `getState` rather than a subscription: the sweep writes into
  // the store as it goes, and every node after the first wants what the one
  // before it just wrote.
  const live = () => useGraphStore.getState();
  const started = live().document;
  const stillOpen = () => live().document === started;
  const nodesOf = () => live().rfNodes.map((item) => item.data.graphNode);
  const dslEdges = (): GraphEdge[] => live().rfEdges.map(graphEdge);
  const nodeNow = (id: string) => nodesOf().find((node) => node.id === id);

  const missing = missingExamples(nodesOf(), dslEdges(), live().page);
  if (missing.length) {
    say(`❌ ${missing.map((n) => n.label || n.id).join(', ')}: give it a file or folder to read by default. `
      + 'Without one, the first node is written against nothing and every node after it inherits the guess.');
    return;
  }

  /** *node* with *next* written in, its wires following its outputs. */
  const put = (before: GraphNode, next: GraphNode) => live().updateNode(before.id, next, portRenames(before, next));

  const unitFor = (node: GraphNode): SweepUnit | undefined => {
    const current = nodeNow(node.id) ?? node;
    const writes = missingOf(current);
    if (!writes.length) return undefined;
    return {
      guard: () => generationGuard(current),
      write: async () => {
        for (const write of writes) {
          const now = nodeNow(node.id);
          if (!now || !stillOpen()) throw new Error(ANOTHER_GRAPH);
          const around = { nodes: nodesOf(), edges: live().rfEdges, metadata: live().metadata, page: live().page };
          if (write === 'output' && pullableOutput(now, around.nodes, around.edges)) {
            put(now, outputsAsDefined({ ...now, config: { ...now.config, output_definition: outputFile(pulledOutputs(now, around.nodes, around.edges)!) } }));
            continue;
          }
          if (write === 'input' && pullable(now, around.edges) && !modelsBefore(now, around.nodes, around.edges).length) {
            const arrived = await arrivedAt(now, live().exportGraph());
            const latest = nodeNow(node.id);
            if (!latest || !stillOpen()) throw new Error(ANOTHER_GRAPH);
            const ports = pulledPorts(latest, nodesOf(), live().rfEdges, arrived);
            put(latest, { ...latest, config: { ...latest.config, input_definition: inputFile(ports) } });
            // Written, to be seen; what comes after it would be written against what is missing.
            const gap = pullGap(latest, ports, live().rfEdges, arrived);
            if (gap) throw new Error(`input.js pulled, but ${gap}`);
            continue;
          }
          const request = generateRequest(now, write, around, inputFilesOf(now, around.nodes, around.edges, live().executionResult, around.page));
          try {
            const response = await call('generate', request);
            const latest = nodeNow(node.id);
            if (!latest || !stillOpen()) throw new Error(ANOTHER_GRAPH);
            put(latest, writtenInto(latest, write, response, exchangeName(latest, write)));
            // Written, to be seen; the rest of the node would be written against it.
            const unfit = unfitDefinition(write, response.probe);
            if (unfit) throw new Error(`${writeName(latest, write)}: ${unfit}`);
          } catch (error) {
            // A failed exchange is history too, where it is still this graph's.
            const calls = error instanceof ApiError ? error.body.calls : undefined;
            const latest = nodeNow(node.id);
            if (calls?.length && latest && stillOpen()) {
              live().updateNode(node.id, { config: { ...latest.config, history: withHistory(latest, exchangeName(latest, write, { failed: true }), calls) } });
            }
            throw error;
          }
        }
      },
    };
  };

  let written = 0;
  const held: string[] = [];
  try {
    for await (const step of sweep(nodesOf(), dslEdges(), { unitFor, stopped: () => stopped() || !stillOpen() })) {
      if (step.status === 'failed') {
        say(`⚠️ Stopped at ${step.label}: ${step.message}`);
        return;
      }
      if (step.status === 'generated') {
        written += 1;
        say(`Generating… ${step.label} written`);
      }
      if (step.status === 'blocked') held.push(`${step.label} (${step.message})`);
    }
    if (!stillOpen()) {
      say(`⚠️ Stopped: ${ANOTHER_GRAPH}.`);
      return;
    }
    const rest = held.length ? ` ${held.length} left alone: ${held.join(', ')}` : '';
    say(written ? `✅ ${written} written.${rest}` : `Nothing to generate.${rest}`);
  } catch (error) {
    say(`⚠️ ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function useGraphSweep(): SweepState {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const stopping = useRef(false);

  const run = useCallback(async () => {
    stopping.current = false;
    setBusy(true);
    try {
      await sweepGraph({ say: setMessage, stopped: () => stopping.current });
    } finally {
      setBusy(false);
    }
  }, []);

  const stop = useCallback(() => { stopping.current = true; }, []);
  const dismiss = useCallback(() => setMessage(''), []);

  return { run, stop, busy, message, dismiss };
}
