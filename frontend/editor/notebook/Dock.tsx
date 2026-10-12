// Under the page: the cells of the open window (the list, A2), the window as a graph, and the debug window.
//
// A bar that is always there, and a body that opens when a tab is chosen -- as tall as the person pulls it.

import { useRef, useState } from 'react';
import Cells from './Cells';
import Debug from './Debug';
import Haube from './Haube';
import { useNotebook, type DockTab } from './store';
import type { Windows } from '../../../gui/editor/windows/windows.ts';

const TABS: [DockTab, string][] = [['cells', 'List'], ['hood', 'Under the hood'], ['debug', 'Debug']];

export default function Dock({ doc }: { doc: Windows }) {
  const open = useNotebook((s) => s.dockOpen);
  const tab = useNotebook((s) => s.tab);
  const selected = useNotebook((s) => s.window);
  const failures = useNotebook((s) => Object.values(s.results).filter((one) => one.outcome === 'failed').length);
  const { show } = useNotebook.getState();
  const [height, setHeight] = useState(() => Math.min(440, Math.max(200, Math.round(window.innerHeight * 0.42))));
  const drag = useRef<{ y: number; h: number } | null>(null);
  const window$ = doc.windows.find((one) => one.id === selected);

  const press = (event: React.PointerEvent): void => {
    drag.current = { y: event.clientY, h: height };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pull = (event: React.PointerEvent): void => {
    if (!drag.current) return;
    setHeight(Math.max(160, Math.min(window.innerHeight - 140, drag.current.h + (drag.current.y - event.clientY))));
  };

  return (
    <section className="nb-dock" aria-label="Under the page" style={open ? { height } : undefined}>
      <div className="nb-dock-bar">
        <div className="nb-seg" role="tablist" aria-label="Under the page">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={open && tab === id} aria-pressed={open && tab === id} onClick={() => show(open && tab === id ? { dockOpen: false } : { tab: id, dockOpen: true })}>
              {label}{id === 'debug' && failures > 0 ? ` (${failures})` : ''}
            </button>
          ))}
        </div>
        <span className="nb-note">{window$ ? <>Window: <b>{window$.title}</b></> : 'No window open. Press Cells on a window.'}</span>
        {open
          ? <div className="nb-dock-grip" onPointerDown={press} onPointerMove={pull} onPointerUp={() => { drag.current = null; }} aria-hidden />
          : <span className="nb-sp" />}
        {open && <button className="nb-btn quiet small" aria-label="Close" onClick={() => show({ dockOpen: false })}>✕</button>}
        {open && <button className="nb-btn small nb-dock-back" onClick={() => show({ dockOpen: false })}>← Back to the page</button>}
      </div>
      {open && (
        <div className="nb-dock-body">
          {tab === 'debug' ? <Debug /> : !window$
            ? <p className="nb-lead">Open a window with its <b>Cells</b> button to see its list of cells or its graph.</p>
            : tab === 'cells' ? <Cells doc={doc} window={window$} /> : <Haube doc={doc} window={window$} />}
        </div>
      )}
    </section>
  );
}
