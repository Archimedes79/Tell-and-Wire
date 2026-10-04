import { Suspense, useEffect, useId } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Graph, GraphNode, Port } from '../../app/graph';
import { call } from '../../app/api/client';
import { useGraphStore } from '../../app/store/graphStore';
import { derivedNodePorts } from '../../app/document/ports';
import { fieldChoices, takenAs } from '../../app/document/page';
import { headingFromText, isNumberedHeading } from '../../app/document/heading';
import PortsEditor, { TakesSelect } from './PortsEditor';
import { withPorts } from './nodeDraft';
import { useNodePanel } from './nodePanel';
import { NODE_BUILDERS } from '../../app/elements/registry';
import { ONCE, type NodeGuiBuilder, type NodePanelProps, type UndoStep } from '../nodes/NodeGuiBuilder';
import SidePanel from '../../app/ui/SidePanel';
import ErrorBoundary from '../../app/ui/ErrorBoundary';
import NodeKind from './NodeKind';
import { useGenerate } from '../authoring/useGenerate';
import {
  bodyOf, exchangeName, generateRequest, generationGuard, previewGeneration, resultMessage, unfitDefinition, withHistory, writeName, writesFor,
  writtenInto,
  type Press, type Refine, type Write,
} from '../authoring/generation';
import { inputSources, outputTargets } from '../authoring/generationContext';
import { fileFromTheGraph, inputFilesOf } from '../authoring/exampleFile';
import { runsPerItem } from '../authoring/perItem';
import { registry as runnerRegistry } from '../../../graph/nodes/registry.ts';
import { GenerationReport } from '../authoring/GenerationTranscript';
import HeadingField from '../authoring/HeadingField';
import WhatRuns from '../fields/WhatRuns';
import { FIELD, LINE, MUTED } from '../../app/ui/theme';

interface NodeEditorProps {
  nodeId: string;
  onClose: () => void;
}

/**
 * Whether each kind of node's Advanced section was left open, for as long as
 * the page is: a code or AI node keeps what each input takes in there -- its
 * name, the part of the package, reading the file -- and folded again on
 * every visit, reaching it was a click each time.
 */
const advancedOpen = new Map<string, boolean>();

/**
 * A node's panel, docked beside the canvas while the node is selected: the
 * same build for every kind. Its heading and kind on top, "What it does"
 * (the node's text), what the kind itself has -- its own panel (`Panel`),
 * with the ✨ rows of a code, ai or data node --, one folded Advanced section
 * (the ports where they are the person's, and the kind's `AdvancedPanel`),
 * and "What runs, technically" last. There is no Save and no Cancel: what is
 * changed here is in the graph a moment later, Undo takes it back, and ✕ or
 * Esc close it with nothing lost (`nodePanel.ts`) -- as does choosing another
 * node, whose panel it becomes.
 */
export default function NodeEditor({ nodeId, onClose }: NodeEditorProps) {
  const panel = useNodePanel(nodeId);
  // The nodes as their contents, compared one by one: a fresh list every time
  // the store changed drew the panel anew on every tick of a run and every
  // frame of a drag, when no node had changed.
  const graphNodes = useGraphStore(useShallow((s) => s.rfNodes.map((item) => item.data.graphNode)));
  const graphEdges = useGraphStore((s) => s.rfEdges);
  // The page's blocks: what a start point wired here is sent, what shows an end point it feeds.
  const page = useGraphStore((s) => s.page);
  // One state machine for every ✨ in this editor, kept outside it: closing the panel stops nothing.
  const generate = useGenerate(nodeId);
  const describing = useId();

  // Closed under the focus -- Esc, the ✕ -- the keyboard goes back to the
  // node's card, and goes on from there.
  useEffect(() => () => {
    if (document.activeElement === document.body) {
      document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(nodeId)}"]`)?.focus();
    }
  }, [nodeId]);

  const node = panel.node();
  if (!node) return null;

  const element: NodeGuiBuilder | undefined = NODE_BUILDERS[node.node_type];
  // A type this editor does not know is kept as it came (`normalizeGraphNode`): nothing here to change.
  if (!element) {
    return (
      <SidePanel kicker={<NodeKind node={node} />} title={node.label} onClose={onClose}>
        <p className="px-6 py-5 text-sm" style={{ color: MUTED }}>
          This editor does not know nodes of type "{node.node_type}". The node is kept, and saved, as it came.
        </p>
      </SidePanel>
    );
  }
  const caught = node.config.catch_errors === true;

  const setConfig: NodePanelProps['setConfig'] = (key, value, step) => panel.setConfig(key, value, step);
  const setDescription = (value: string) => panel.change((current) => ({ ...current, description: value }), { field: 'description' });
  /** A node ✨ writes for, while its heading is still the numbered one it was given, is headed from its text. */
  const headingFromTheText = () => {
    if (!isNumberedHeading(node.label)) return;
    const heading = headingFromText(node.description);
    if (heading) panel.change((current) => ({ ...current, label: heading }), ONCE);
  };

  // The graph on the canvas with this node in it as the panel shows it, read
  // when asked: what is tried, fetched from the graph and sent to ✨ is the
  // edit as it is then.
  const graph = (): Graph => {
    const whole = useGraphStore.getState().exportGraph();
    const current = panel.node() ?? node;
    whole.nodes = whole.nodes.map((candidate) => (candidate.id === current.id ? current : candidate));
    return whole;
  };
  // The graph around the node, read from the store when asked -- not as it
  // was when the panel was drawn: ✨ writes one file after another, each into
  // a graph that the one before it changed.
  const around = () => {
    const state = useGraphStore.getState();
    const current = panel.node() ?? node;
    return {
      nodes: state.rfNodes.map((item) => (item.id === current.id ? current : item.data.graphNode)),
      edges: state.rfEdges, metadata: state.metadata, page: state.page, executionResult: state.executionResult,
    };
  };
  const requestFor = (write: Write, refine?: Refine) => {
    const current = panel.node() ?? node;
    const { executionResult, ...rest } = around();
    return generateRequest(current, write, rest, inputFilesOf(current, rest.nodes, rest.edges, executionResult, rest.page), refine);
  };

  /**
   * ✨: *write* -- for the body, what is missing of the definitions first --
   * each through the one route, each written in as it comes, as an undo step
   * of its own, with the exchange at the end of the node's history.md. A
   * definition that does not fit the node stops it there (`unfitDefinition`):
   * what comes after would be written against it. A change or a fix is asked
   * of the body alone. Resolves to whether all of it was written.
   */
  const handleGenerate = async (write: Press, refine?: Refine): Promise<boolean> => {
    const start = panel.node();
    if (!start) return false;
    for (const one of refine ? ['body' as const] : writesFor(start, write)) {
      const current = panel.node();
      if (!current) return false;
      const name = exchangeName(current, one, refine);
      const request = requestFor(one, refine);
      let unfit: string | undefined;
      const written = await generate.run({
        guard: () => generationGuard(current),
        pending: `${writeName(current, one)}…`,
        run: (progressId?: string) => call('generate', { ...request, ...(progressId ? { progress_id: progressId } : {}) }),
        apply: (result) => {
          unfit = unfitDefinition(one, result.probe);
          panel.change((now) => writtenInto(now, one, result, name), ONCE);
        },
        success: (result) => resultMessage(writeName(current, one), result, refine),
        failure: `${writeName(current, one)} failed`,
        failed: (calls) => panel.change((now) => ({ ...now, config: { ...now.config, history: withHistory(now, `${name} (failed)`, calls) } }), ONCE),
      });
      if (!written || unfit) return false;
    }
    return true;
  };

  const Panel = element.Panel;

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
  const showPorts = ownPorts && (element.portEditing.inputs !== 'none' || element.portEditing.outputs !== 'none');
  const defined = element.definesItself && ownPorts;
  const shell: NodePanelProps['shell'] = bodyOf(node) ? {
    graph,
    preview: (write) => previewGeneration(requestFor(write)),
    graphFile: () => {
      const { nodes, edges, executionResult } = around();
      return fileFromTheGraph(panel.node() ?? node, nodes, edges, executionResult, graph);
    },
    flush: () => panel.write(),
  } : undefined;
  // Ports that follow from its settings are not the person's to name -- but
  // what one wired from a start point takes of its package is: a folder's
  // path, a subgraph's port.
  const taking = !ownPorts ? node.inputs.filter((port) => fromStart(port).length > 0) : [];

  return (
    <SidePanel
      kicker={<NodeKind node={node} />}
      title={
        <HeadingField heading={node.label} onChange={(label) => panel.change((current) => ({ ...current, label }))} />
      }
      onClose={onClose}
    >
      <div className="px-6 py-5">
        <GenerationReport calls={generate.transcript} live={generate.live}>
          <div className="space-y-4">
            {/* The node's text: what it should do, in words. Every kind has
                one; the nodes ✨ writes for write from it, and so do the
                nodes wired to this one (`wantsOn`). */}
            <div>
              <label htmlFor={describing} className="block text-xs font-medium mb-1" style={{ color: MUTED }}>What it does</label>
              <textarea
                id={describing}
                className="w-full rounded-lg px-3 py-2 text-sm resize-y"
                style={{ ...FIELD, minHeight: 72 }}
                value={node.description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={runnerRegistry.node(node.node_type)?.generation() ? headingFromTheText : undefined}
                placeholder={element.example}
              />
            </div>

            {/* What the kind has: a panel is its own chunk, loaded when a node is first opened. */}
            {Panel && <ErrorBoundary inline><Suspense fallback={null}><Panel
              node={node}
              setConfig={setConfig}
              updateNode={(change, step) => panel.change(change, step)}
              setDescription={setDescription}
              generating={generate.busy}
              message={generate.message}
              onGenerate={handleGenerate}
              onStop={generate.stop}
              shell={shell}
            /></Suspense></ErrorBoundary>}

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

            {/* Everything with a good default, folded away: a node should
                open on what it does, not on a form to fill in first. */}
            {(showPorts || element.AdvancedPanel) && (
              <details className="rounded-lg" style={{ border: `1px solid ${LINE}` }}
                open={advancedOpen.get(node.node_type) ?? false}
                onToggle={(e) => advancedOpen.set(node.node_type, e.currentTarget.open)}>
                <summary className="px-3 py-2 text-xs font-medium cursor-pointer select-none" style={{ color: MUTED }}>
                  Advanced{element.advancedSummary ? ` — ${element.advancedSummary}` : ''}
                </summary>
                <div className="px-3 pb-3 pt-1 space-y-4">
                  {showPorts && (
                    <PortsEditor
                      inputs={node.inputs}
                      outputs={node.outputs}
                      onChange={setPorts}
                      editing={element.portEditing}
                      hints={{ inputs: element.portHint('inputs', node), outputs: element.portHint('outputs', node) }}
                      wiring={wiring}
                      takes={takes}
                      readsFiles={runnerRegistry.node(node.node_type)?.readsFileInputs ?? false}
                      compact={defined}
                      perItem={defined && runsPerItem(node)}
                      caught={caught}
                    />
                  )}
                  {element.AdvancedPanel && (
                    <ErrorBoundary inline><Suspense fallback={null}>
                      <element.AdvancedPanel node={node} setConfig={setConfig} updateNode={(change, step) => panel.change(change, step)} />
                    </Suspense></ErrorBoundary>
                  )}
                </div>
              </details>
            )}
            {/* Where the work is done, technically: for the curious, so folded, and last. */}
            <WhatRuns node={node} />
          </div>
        </GenerationReport>
      </div>
    </SidePanel>
  );
}
