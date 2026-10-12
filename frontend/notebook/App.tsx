// The notebook: a page to write on and use, and under it the cells of a window, the window as a graph, and the debug window.
//
// Served by the notebook's own server (`backend/notebook/main.ts`), on a port of its own. What it opens and saves is a project folder the graph
// editor opens too; what it runs goes through the same host.

import { useEffect, useState } from 'react';
import './notebook.css';
import Browse from './elements/Browse';
import Dock from '../graph-notebook/Dock';
import Page from '../gui-notebook/Page';
import Start from './Start';
import { runAll, stopRuns } from './document/runs';
import { saveNote } from './document/status';
import { folderName } from './document/values';
import { isDirty, useNotebook } from './document/store';
import { startPage } from '../../gui/notebook/page.ts';
import { DEFAULT_SCHEME, windowProblems } from '../../gui/notebook/windows.ts';

/** The looks a delivered tool can have (the gui's colour schemes), by their ids. */
const LOOKS: [string, string][] = [['white', 'White'], ['paper', 'Paper'], ['night', 'Night'], ['graphite', 'Graphite']];

const folderOf =(path: string): string => path.replace(/[\\/]+$/, '').replace(/[\\/][^\\/]*$/, '');

export default function App() {
  const doc = useNotebook((s) => s.doc);
  const path = useNotebook((s) => s.path);
  const stale = useNotebook((s) => s.stale);
  const error = useNotebook((s) => s.error);
  const taken = useNotebook((s) => s.taken);
  const busy = useNotebook((s) => s.busy);
  const mode = useNotebook((s) => s.mode);
  const source = useNotebook((s) => s.source);
  const going = useNotebook((s) => s.going.length > 0);
  const dirty = useNotebook(isDirty);
  const savedAt = useNotebook((s) => s.savedAt);
  const docked = useNotebook((s) => s.dockOpen);
  const canUndo = useNotebook((s) => s.past.length > 0);
  const canRedo = useNotebook((s) => s.future.length > 0);
  const { edit, undo, redo, open, save, clearError, start, show } = useNotebook.getState();
  const [browsing, setBrowsing] = useState<'open' | 'save' | null>(null);
  const problems = doc ? windowProblems(doc) : [];
  const writing = mode === 'write';
  const note = saveNote({ path, dirty, savedAt });

  // Ctrl+S saves; Ctrl+Z and Ctrl+Shift+Z step through what was done, outside the boxes whose own undo is the browser's.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      const typing = (event.target as HTMLElement | null)?.closest?.('input, textarea, select');
      if (key === 's') {
        event.preventDefault();
        const now = useNotebook.getState();
        if (now.path) void now.save(now.path); else setBrowsing('save');
      } else if (!typing && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) useNotebook.getState().redo(); else useNotebook.getState().undo();
      } else if (!typing && key === 'y') {
        event.preventDefault();
        useNotebook.getState().redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The tab says when there is something to save, as an editor's tab does.
  useEffect(() => { document.title = `${dirty ? '● ' : ''}${doc?.name || 'Notebook'} — Tell & Wire`; }, [dirty, doc?.name]);

  // Leaving a page that is not saved asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent): void => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const saveHere = (): void => { if (path) void save(path); else setBrowsing('save'); };

  return (
    <div className={`nb-app${doc && writing && docked ? ' dock-open' : ''}`}>
      <header className="nb-top">
        <span className="nb-brand">
          <svg width="26" height="26" viewBox="0 0 28 28" fill="none" aria-hidden="true"><circle cx="6" cy="8" r="3.5" stroke="#151a23" strokeWidth="2" /><circle cx="22" cy="20" r="3.5" stroke="#151a23" strokeWidth="2" /><path d="M9.5 8 C16 8 12 20 18.5 20" stroke="#1f4fbf" strokeWidth="2" strokeLinecap="round" /></svg>
          Tell &amp; Wire
        </span>
        {doc && (
          <>
            <span className="nb-note">/</span>
            <input className="nb-name" aria-label="Name of the tool" value={doc.name} onChange={(event) => edit((one) => ({ ...one, name: event.target.value }), 'name')} />
            <div className="nb-seg" role="group" aria-label="View">
              <button aria-pressed={writing && !source} onClick={() => show({ mode: 'write', source: false })}>Write</button>
              <button aria-pressed={writing && source} onClick={() => show({ mode: 'write', source: true })} title="The page as Markdown to type">Markdown</button>
              <button aria-pressed={!writing} onClick={() => show({ mode: 'app', source: false })} title="The page as the people who use the tool see it">As app</button>
            </div>
            <select
              className="nb-select" aria-label="Look of the delivered tool" title="The colours of the tool when it is delivered; the model is told them too"
              value={doc.scheme ?? DEFAULT_SCHEME} onChange={(event) => edit((one) => ({ ...one, scheme: event.target.value }), 'scheme')}
            >
              {LOOKS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <button className="nb-btn quiet" disabled={!canUndo} onClick={undo} aria-label="Undo" title="Undo (Ctrl+Z)">↶</button>
            <button className="nb-btn quiet" disabled={!canRedo} onClick={redo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">↷</button>
          </>
        )}
        <span className="nb-sp" />
        {doc && (going
          ? <button className="nb-btn" onClick={() => { void stopRuns(); }}>■ Stop</button>
          : <button className="nb-btn primary" disabled={problems.length > 0} onClick={() => { void runAll(); }} title="Run every window that is not current, in order">▶ Run all</button>)}
        {problems.length > 0 && (
          <button className="nb-btn small" style={{ background: 'var(--amber-bg)', color: 'var(--amber)', borderColor: 'transparent' }} title={problems.map((one) => `${one.where}: ${one.problem}`).join('\n')}
            onClick={() => { const id = doc?.windows.find((one) => problems[0].where === `window "${one.id}"`)?.id; if (id) show({ window: id, tab: 'cells', dockOpen: true }); }}>
            {problems.length} to fix
          </button>
        )}
        {path && <span className="nb-note nb-path-note" title={path}>{path}</span>}
        {note.words && <span className={`nb-save ${note.kind}`} role="status" title={note.kind === 'saved' ? path : 'Press Ctrl+S to save'}>{note.kind === 'saved' ? '✓ ' : '● '}{note.words}</span>}
        {doc && <button className={`nb-btn${dirty ? ' attention' : ''}`} disabled={busy === 'saving' || problems.length > 0} onClick={saveHere} title="Save as a project folder (Ctrl+S)">{busy === 'saving' ? 'Saving…' : 'Save'}</button>}
        {doc && <button className="nb-btn" onClick={() => setBrowsing('save')}>Save as…</button>}
        <button className="nb-btn" onClick={() => setBrowsing('open')}>Open…</button>
        {doc && <button className="nb-btn quiet" onClick={() => { if (!dirty || window.confirm('Leave this page without saving it?')) start(startPage()); }}>New</button>}
      </header>

      {error && <div className="nb-banner error" role="alert"><span>{error}</span><button className="nb-btn small quiet" onClick={clearError}>Dismiss</button></div>}
      {taken && doc && (
        <div className="nb-banner warn" role="alert">
          <span>A project is already at {taken}. Replace it with this page, or save under another name.</span>
          <button className="nb-btn small danger" onClick={() => { void save(taken, true); }}>Replace it</button>
          <button className="nb-btn small" onClick={() => { clearError(); setBrowsing('save'); }}>Another name…</button>
          <button className="nb-btn small quiet" onClick={clearError}>Cancel</button>
        </div>
      )}
      {stale && doc && (
        <div className="nb-banner warn">
          <span>The graph in this project was changed outside the notebook, so saving would write over that. Save under another name to keep both.</span>
          <button className="nb-btn small" onClick={() => setBrowsing('save')}>Save as…</button>
          <button className="nb-btn small danger" onClick={() => { void save(path, true); }}>Write over it</button>
        </div>
      )}

      {doc ? (
        <>
          <div className="nb-doc"><Page doc={doc} writing={writing} /></div>
          {writing && <Dock doc={doc} />}
        </>
      ) : <Start onOpen={() => setBrowsing('open')} />}

      {browsing && (
        <Browse
          mode={browsing} title={browsing === 'open' ? 'Open a notebook project' : 'Save the notebook as'} start={browsing === 'open' ? folderOf(path) : path ? folderOf(path) : ''}
          suggested={folderName(doc?.name ?? '') || 'my_tool'}
          onPick={async (picked) => {
            if (browsing === 'open') {
              if (!(await open(picked))) throw new Error(useNotebook.getState().error || 'It could not be opened.');
            } else if (!(await save(picked)) && !useNotebook.getState().taken) {
              throw new Error(useNotebook.getState().error || 'It could not be saved.');
            }
            setBrowsing(null);
          }}
          onClose={() => setBrowsing(null)}
        />
      )}
    </div>
  );
}
