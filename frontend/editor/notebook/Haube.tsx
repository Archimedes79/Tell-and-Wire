// Under the hood: the same window as the graph it is, left to right -- what is asked, what is done, what is shown -- with
// what runs between them written on the wires. Nothing here is edited; the cells are where a window changes.

import { useMemo } from 'react';
import { columnsOf, parseTable } from '../../../graph/schedule.ts';
import { resultsOf, taken, type Window, type Windows } from '../../../gui/editor/windows/windows.ts';
import { compile, useNotebook } from './store';

export default function Haube({ doc, window }: { doc: Windows; window: Window }) {
  const graph = useNotebook((s) => s.graph);
  const made = useMemo(() => compile(doc, graph), [doc, graph]);
  const mine = made.nodes.filter((node) => node.id === window.id || node.id.startsWith(`${window.id}_`));
  const ids = new Set(mine.map((node) => node.id));
  const wires = made.edges.filter((edge) => ids.has(edge.source_node_id) && ids.has(edge.target_node_id));
  const column = made.schedule ? columnsOf(parseTable(made.schedule)) : new Map<string, number>();
  const names = window.inputs.map((one) => one.name);
  const from = window.inputs.filter((one) => one.kind === 'from');

  return (
    <div className="nb-wide">
      <p className="nb-lead" style={{ margin: 0 }}>This is the same window as a graph. You need it only when the flow branches or you want to see what runs; the chips of the cells are these wires.</p>
      <div className="nb-chain" aria-label="The window as a chain">
        <div className="nb-node ask"><span className="nb-tag">Ask</span><strong>{names.join(', ') || 'nothing'}</strong></div>
        {window.steps.map((step, at) => (
          <div key={at} style={{ display: 'contents' }}>
            <div className="nb-wire">{taken(window, at).map((one) => <div key={one.name + (one.part ?? '')}>{one.name}</div>)}</div>
            <div className="nb-node do"><span className="nb-tag">Do · {step.how === 'ai' ? 'model call' : 'code'}</span><strong>{step.name}</strong></div>
          </div>
        ))}
        <div className="nb-wire">{[...new Set(window.outputs.map((out) => out.of ?? resultsOf(window.steps[window.steps.length - 1] ?? { name: '', sentence: '', how: 'ai' })[0] ?? ''))].map((name) => <div key={name}>{name}</div>)}</div>
        <div className="nb-stack">{window.outputs.map((out) => <div className="nb-node show" key={out.name}><span className="nb-tag">Show · {out.kind}</span><strong>{out.name}</strong></div>)}</div>
      </div>
      {from.length > 0 && (
        <div className="nb-card">Takes from other windows: {from.map((one) => <b key={one.name}>“{one.from?.output}” of “{doc.windows.find((other) => other.id === one.from?.window)?.title}”. </b>)}</div>
      )}
      <details className="nb-card">
        <summary style={{ cursor: 'pointer' }}>The graph as it is stored: {mine.length} nodes, {wires.length} wires</summary>
        <div className="nb-kv" style={{ marginTop: 10 }}>
          {mine.map((node) => (
            <div key={node.id} style={{ display: 'contents' }}>
              <span className="nb-mono">{node.node_type}</span>
              <span className="nb-mono">{node.id} <span style={{ color: 'var(--muted)' }}>column {column.get(node.id) ?? '?'}</span></span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {wires.map((edge) => <span key={edge.id} className="nb-mono">{edge.source_node_id}.{edge.source_port_id} → {edge.target_node_id}.{edge.target_port_id}</span>)}
        </div>
      </details>
    </div>
  );
}
