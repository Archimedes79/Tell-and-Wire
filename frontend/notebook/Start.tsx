// The first page (A1): one sentence about what the tool should do, and the tool is built from it.

import { useEffect, useRef, useState } from 'react';
import { startPage } from '../../gui/notebook/page.ts';
import { useNotebook } from './document/store';
import ModelSaid from './elements/ModelSaid';

const EXAMPLES = [
  'Summarize a text I paste, in one, three or ten sentences',
  'Read a CSV file of countries and plot the populations as bars',
  'Summarize every text file of a folder, one entry for each',
];

export default function Start({ onOpen }: { onOpen: () => void }) {
  const [said, setSaid] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  // The cursor is in the box from the start, and the page stays where it is: the question above it is read first (autoFocus scrolled it away).
  useEffect(() => { box.current?.focus({ preventScroll: true }); }, []);
  const busy = useNotebook((s) => s.busy);
  const error = useNotebook((s) => s.error);
  const making = busy === 'describing';
  const build = (): void => { if (said.trim() && !making) void useNotebook.getState().describe(said.trim()); };

  return (
    <main className="nb-start">
      <div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h1>What should the tool do?</h1>
          <p style={{ margin: 0, fontSize: 19, color: 'var(--muted)' }}>Describe it in a sentence. A page is built from it, with the windows to use it; every cell stays yours to change.</p>
        </div>
        <div className="nb-ask">
          <textarea
            ref={box} aria-label="What should the tool do?" value={said} disabled={making}
            placeholder="For example: Read a text file and summarize it in as many sentences as I say."
            onChange={(event) => setSaid(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) build(); }}
          />
          <footer>
            <span className="nb-note" role="status">
              {making ? 'The model is writing the page…' : 'The model chooses itself whether a step is code or a call to a model.'}
            </span>
            <span className="nb-sp" />
            <button className="nb-btn primary" style={{ minHeight: 44, padding: '0 22px', fontSize: 16 }} disabled={!said.trim() || making} onClick={build}>
              {making ? 'Building…' : 'Build the tool →'}
            </button>
          </footer>
        </div>
        {error && <div className="nb-banner error" role="alert" style={{ borderRadius: 10 }}><span>{error}</span><button className="nb-btn small quiet" onClick={() => useNotebook.getState().clearError()}>Dismiss</button></div>}
        {error && <ModelSaid />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span className="nb-note">Or start with an example</span>
          <div className="nb-examples">{EXAMPLES.map((one) => <button key={one} disabled={making} onClick={() => setSaid(one)}>{one}</button>)}</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="nb-btn" disabled={making} onClick={() => useNotebook.getState().start(startPage())}>Start with an empty page</button>
            <button className="nb-btn" disabled={making} onClick={onOpen}>Open a project…</button>
          </div>
        </div>
        <div className="nb-three">
          <div><span className="nb-note">1</span><b>You describe</b>One sentence is enough.</div>
          <div><span className="nb-note">2</span><b>The model builds</b>A page with windows. Under it, a list of cells: Ask, Do, Show.</div>
          <div><span className="nb-note">3</span><b>You try it</b>Use a window on the page. Under it, the debug window shows what ran.</div>
        </div>
      </div>
    </main>
  );
}
