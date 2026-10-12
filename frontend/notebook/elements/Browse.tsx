// Choosing a file or a folder on the machine the notebook runs on, and where a project is kept.
//
// A browser never says where a file it chose is, so this walks the server's own folders (`browse`). It is a dialog of its
// own: a path to type or to climb to, what is in it, and a button.

import { useEffect, useState } from 'react';
import type { BrowsePage } from '../../../backend/deployment/host/api.ts';
import { call, wordsOf } from '../document/api';

type Mode = 'file' | 'folder' | 'open' | 'save';

const separatorOf = (path: string): string => (path.includes('\\') ? '\\' : '/');

export default function Browse({ mode, title, start, extensions, suggested, onPick, onClose }: {
  mode: Mode;
  title: string;
  /** Where to open: a folder, or a file in one. */
  start?: string;
  /** The file types to list, `.txt, .md`; folders always. */
  extensions?: string;
  /** `save`: the name to start from. */
  suggested?: string;
  /** What choosing does; one that fails says why, and the dialog stays. */
  onPick: (path: string) => void | Promise<unknown>;
  onClose: () => void;
}) {
  const [page, setPage] = useState<BrowsePage | null>(null);
  const [typed, setTyped] = useState(start ?? '');
  const [chosen, setChosen] = useState('');
  const [name, setName] = useState(suggested ?? 'my_tool');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async (path: string): Promise<void> => {
    setError('');
    try {
      const next = await call('browse', { path, ...(mode === 'file' && extensions ? { extensions } : {}) });
      setPage(next);
      setTyped(next.path);
      setChosen('');
    } catch (failed) {
      setError(wordsOf(failed, 'That folder could not be read.'));
    }
  };
  useEffect(() => { void go(start ?? ''); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const here = page?.path ?? '';
  // Typed or climbed into a project itself: it is what Open opens, without being picked out of its parent.
  const hereIsProject = page?.entries.some((entry) => !entry.is_dir && (entry.name === 'graph-windows.json' || entry.name === 'graph-flow.json')) === true;
  const target = mode === 'save' ? `${here}${here.endsWith(separatorOf(here)) ? '' : separatorOf(here)}${name.trim()}` : mode === 'folder' ? (chosen || here) : mode === 'open' ? (chosen || (hereIsProject ? here : '')) : chosen;
  const pick = async (path: string): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      await onPick(path);
    } catch (failed) {
      setError(wordsOf(failed, 'That did not work.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nb-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="nb-dialog" role="dialog" aria-label={title}>
        <header>{title}<span className="nb-sp" /><button className="nb-btn quiet small" aria-label="Close" onClick={onClose}>✕</button></header>
        <div className="body">
          <form style={{ display: 'flex', gap: 8 }} onSubmit={(event) => { event.preventDefault(); void go(typed); }}>
            <button type="button" className="nb-btn small" disabled={!page?.parent} onClick={() => page?.parent && void go(page.parent)}>↑ Up</button>
            <input
              aria-label="Folder" value={typed} onChange={(event) => setTyped(event.target.value)}
              style={{ flex: 1, minWidth: 0, border: '1px solid var(--line2)', borderRadius: 8, padding: '4px 10px', fontFamily: 'var(--mono)', fontSize: 13 }}
            />
            <button type="submit" className="nb-btn small">Go</button>
          </form>
          {page && page.roots.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {page.roots.map((root) => <button key={root} className="nb-btn quiet small" onClick={() => void go(root)}>{root}</button>)}
            </div>
          )}
          <div className="nb-listing" role="listbox" aria-label="Contents">
            {page?.entries.length === 0 && <div style={{ padding: 14, color: 'var(--muted)' }}>This folder is empty.</div>}
            {page?.entries.map((entry) => {
              const isProject = entry.project === true;
              const enters = entry.is_dir && !(isProject && mode === 'open');
              const selectable = mode === 'open' ? isProject || !entry.is_dir : mode === 'folder' ? entry.is_dir : !entry.is_dir;
              return (
                <button
                  key={entry.path} role="option" aria-selected={chosen === entry.path}
                  onClick={() => { if (selectable) setChosen(entry.path); else if (enters) void go(entry.path); }}
                  onDoubleClick={() => { if (enters) void go(entry.path); else if (selectable && mode !== 'folder') void pick(entry.path); }}
                >
                  <span aria-hidden>{isProject ? '📦' : entry.is_dir ? '📁' : '📄'}</span>
                  <span style={{ flex: 1 }}>{entry.name}</span>
                  {isProject && <span className="nb-note">notebook or tool</span>}
                </button>
              );
            })}
          </div>
          {mode === 'save' && (
            <label className="nb-label" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Name of the project folder
              <input value={name} onChange={(event) => setName(event.target.value)} style={{ border: '1px solid var(--line2)', borderRadius: 8, padding: '6px 10px', fontSize: 15 }} />
            </label>
          )}
          {error && <div role="alert" className="nb-out msg failed" style={{ minHeight: 0 }}>{error}</div>}
        </div>
        <footer>
          <span className="nb-note" style={{ flex: 1, alignSelf: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={target}>{target}</span>
          <button className="nb-btn" onClick={onClose}>Cancel</button>
          <button className="nb-btn primary" disabled={busy || !target || (mode === 'save' && !name.trim())} onClick={() => void pick(target)}>
            {mode === 'save' ? 'Save here' : mode === 'folder' ? 'Choose this folder' : mode === 'open' ? 'Open' : 'Choose'}
          </button>
        </footer>
      </div>
    </div>
  );
}
