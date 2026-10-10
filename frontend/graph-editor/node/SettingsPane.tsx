import { Suspense } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { GraphNode, Port } from '../../app/graph';
import { useGraphStore } from '../../app/store/graphStore';
import { derivedNodePorts } from '../../app/document/ports';
import { fieldChoices, takenAs } from '../../app/document/page';
import ErrorBoundary from '../../app/ui/ErrorBoundary';
import { MUTED, SUNKEN, LINE, TEXT } from '../../app/ui/theme';
import { registry as runnerRegistry } from '../../../graph/nodes/registry.ts';
import { ONCE, type NodeGuiBuilder, type UndoStep } from '../nodes/NodeGuiBuilder';
import { inputSources, outputTargets } from '../authoring/generationContext';
import { bodyOf } from '../authoring/generation';
import { runsPerItem } from '../authoring/perItem';
import FileChip from '../authoring/FileChip';
import WhatRuns from '../fields/WhatRuns';
import { PaneHeader } from '../views/NodeViewLayout';
import PortsEditor, { TakesSelect } from './PortsEditor';
import { withPorts } from './nodeDraft';
import type { useNodePanel } from './nodePanel';

/**
 * Everything about a node that is set and not written: what the kind itself
 * has (a folder, a starter, a file to write), the ports where they are the
 * person's to name, the switches with good defaults -- once per item, catching
 * failures, the model --, and last, for the curious, where the work is done.
 * Every setting is in the graph a moment after it is changed (`nodePanel.ts`).
 */
export default function SettingsPane({ node, builder, panel }: {
  node: GraphNode;
  builder: NodeGuiBuilder;
  panel: ReturnType<typeof useNodePanel>;
}) {
  // The nodes as their contents, compared one by one: a fresh list every time
  // the store changed drew the pane anew on every tick of a run and every
  // frame of a drag, when no node had changed.
  const graphNodes = useGraphStore(useShallow((s) => s.rfNodes.map((item) => item.data.graphNode)));
  const graphEdges = useGraphStore((s) => s.rfEdges);
  // The page's blocks: what a start point wired here is sent, what shows an end point it feeds.
  const page = useGraphStore((s) => s.page);

  const { setConfig, change: updateNode } = panel;
  const Panel = builder.Panel;
  const Advanced = builder.AdvancedPanel;

  // What each port is wired to, in words, shown under the port -- and for an
  // output, what the node there wants of it: what the graph says it must be.
  const wiring = {
    inputs: inputSources(node.id, graphNodes, graphEdges, false, page),
    outputs: outputTargets(node.id, graphNodes, graphEdges, true, page),
  };
  // What an input wired from a start point can take of its package: what a
  // block of the page sends it, or a part of what a call sends it.
  const fromStart = (port: Port) => graphEdges
    .filter((edge) => edge.target === node.id && edge.targetHandle === port.id)
    .map((edge) => graphNodes.find((candidate) => candidate.id === edge.source))
    .filter((source): source is GraphNode => !!source && runnerRegistry.node(source.node_type)?.takesPackage === true);
  const takes = Object.fromEntries(node.inputs.map((port) => [port.id, fromStart(port).flatMap((source) => fieldChoices(page, source))]));
  const setPorts = (ports: { inputs: Port[]; outputs: Port[] }, step?: UndoStep) => panel.change((current) => withPorts(current, ports), step);
  // Whether the ports are the person's to name, rather than following a
  // setting -- the element is what knows, so the question is asked, never
  // switched on a type -- and whether there are any to show: an end point's
  // outputs are none, and its inputs are.
  const ownPorts = derivedNodePorts(node) === null;
  const showPorts = ownPorts && (builder.portEditing.inputs !== 'none' || builder.portEditing.outputs !== 'none');
  const defined = builder.definesItself && ownPorts;
  // Ports that follow from its settings are not the person's to name -- but
  // what one wired from a start point takes of its package is: a folder's
  // path, a subgraph's port.
  const taking = !ownPorts ? node.inputs.filter((port) => fromStart(port).length > 0) : [];
  const history = String(node.config.history ?? '');

  return (
    <div className="flex flex-col gap-5">
      <PaneHeader title="Settings" />

      {/* What the kind has: a panel is its own chunk, loaded when a node is first opened. */}
      {Panel && <ErrorBoundary inline><Suspense fallback={null}><Panel node={node} setConfig={setConfig} updateNode={updateNode} /></Suspense></ErrorBoundary>}

      {taking.length > 0 && (
        <div className="space-y-1">
          {taking.map((port) => (
            <TakesSelect key={port.id} port={port} takes={takes[port.id] ?? []} label={port.name || port.id}
              onTake={(choice) => panel.change((current) => ({
                ...current, inputs: current.inputs.map((one) => (one.id === port.id ? takenAs(one, choice, false) : one)),
              }), ONCE)} />
          ))}
        </div>
      )}

      {showPorts && (
        <PortsEditor
          inputs={node.inputs}
          outputs={node.outputs}
          onChange={setPorts}
          editing={builder.portEditing}
          hints={{ inputs: builder.portHint('inputs', node), outputs: builder.portHint('outputs', node) }}
          wiring={wiring}
          takes={takes}
          readsFiles={runnerRegistry.node(node.node_type)?.readsFileInputs ?? false}
          compact={defined}
          perItem={defined && runsPerItem(node)}
          caught={node.config.catch_errors === true}
        />
      )}

      {Advanced && (
        <div className="space-y-4 rounded-lg px-3 py-3" style={{ background: SUNKEN, border: `1px solid ${LINE}` }}>
          <ErrorBoundary inline><Suspense fallback={null}><Advanced node={node} setConfig={setConfig} updateNode={updateNode} /></Suspense></ErrorBoundary>
        </div>
      )}

      {/* Where the work is done, technically: for the curious, so folded, and last. */}
      <WhatRuns node={node} />

      {bodyOf(node) && (
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <span style={{ color: MUTED }}>Every exchange with the model about it:</span>
            <FileChip nodeId={node.id} file="history.md" written={!!history.trim()} before={() => panel.write()} />
          </div>
          {/* Read here too: in a tool not saved to a folder the chip opens nothing. */}
          {history.trim() && (
            <details>
              <summary className="cursor-pointer select-none" style={{ color: MUTED }}>Show it here</summary>
              <pre className="mt-1 rounded px-2 py-1.5 whitespace-pre-wrap overflow-auto font-mono" style={{ background: SUNKEN, color: TEXT, maxHeight: 260 }}>
                {history}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
