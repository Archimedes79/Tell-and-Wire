import { useEffect, useState } from 'react';
import FileBrowserDialog from '../../deployment/gui/kit/dialogs/FileBrowserDialog';
import { roundGoing, stopRound, useSession } from '../../deployment/gui/kit/api/session';
import Button from '../../deployment/gui/kit/ui/Button';
import { SCHEMES, schemeVars } from '../../deployment/gui/kit/ui/scheme';
import {
  ACCENT_TEXT, DANGER_FILL, DANGER_TEXT, DIMMER, FIELD, LINE, MUTED, SUNKEN, SURFACE, TEXT, WARNING_FILL, WARNING_TEXT,
} from '../../deployment/gui/kit/ui/theme';
import { windowProblems } from '../../../gui/editor/windows/windows.ts';
import { browseStart, folderOf } from '../app/browseStart';
import { isDirty, useNotebook } from './notebookStore';
import StartScreen from './StartScreen';
import Workspace from './Workspace';

/**
 * The notebook: a tool said as a page of windows (`docs/notebook.md`).
 *
 * The page is the tool. This shell opens and keeps it as a project folder, the same one the graph editor
 * opens; everything that runs goes through the host the graph editor uses.
 */
export default function NotebookApp() {
  const doc = useNotebook((s) => s.doc);
  const path = useNotebook((s) => s.path);
  const stale = useNotebook((s) => s.stale);
  const error = useNotebook((s) => s.error);
  const taken = useNotebook((s) => s.taken);
  const busy = useNotebook((s) => s.busy);
  const dirty = useNotebook(isDirty);
  const canUndo = useNotebook((s) => s.past.length > 0);
  const canRedo = useNotebook((s) => s.future.length > 0);
  const { edit, undo, redo, open, save, clearError, start } = useNotebook.getState();
  const going = useSession(roundGoing);
  const [browsing, setBrowsing] = useState<'open' | 'save' | null>(null);
  const problems = doc ? windowProblems(doc) : [];

  // Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y and Ctrl+S, outside the boxes a person types in (whose own undo is the browser's).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const typing = (event.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]');
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        if (path) void useNotebook.getState().save(path); else setBrowsing('save');
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
  }, [path]);

  // Closing the tab on unsaved windows asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const lastFolder = folderOf(path);
  const saveHere = () => { if (path) void save(path); else setBrowsing('save'); };

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ ...schemeVars(doc?.scheme), background: SUNKEN, color: TEXT }}>
      <header className="flex items-center gap-2 px-4 py-2 flex-wrap" style={{ background: SURFACE, borderBottom: `1px solid ${LINE}` }}>
        <span className="text-xs font-semibold tracking-wide mr-1" style={{ color: ACCENT_TEXT }}>TELL &amp; WIRE · NOTEBOOK</span>
        {doc && (
          <>
            <input
              aria-label="Name of the tool" value={doc.name}
              onChange={(event) => edit((d) => ({ ...d, name: event.target.value }), 'tool-name')}
              className="rounded-lg px-2.5 py-1 text-sm font-semibold" style={{ ...FIELD, width: 220 }}
            />
            <select
              aria-label="Colour scheme" title="The colours of the tool. A model is told them too."
              value={doc.scheme ?? 'night'}
              onChange={(event) => edit((d) => ({ ...d, scheme: event.target.value }))}
              className="rounded-lg px-2 py-1 text-xs" style={FIELD}
            >
              {SCHEMES.map((one) => <option key={one.id} value={one.id}>{one.label}</option>)}
            </select>
            <Button size="sm" variant="quiet" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)" aria-label="Undo">↶</Button>
            <Button size="sm" variant="quiet" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">↷</Button>
          </>
        )}
        <span className="flex-1" />
        {going && <Button size="sm" onClick={() => { void stopRound(); }}>■ Stop</Button>}
        {problems.length > 0 && (
          <span className="text-xs rounded-full px-2 py-0.5" style={{ background: WARNING_FILL, color: WARNING_TEXT }} title={problems.map((p) => `${p.where}: ${p.problem}`).join('\n')}>
            {problems.length} to fix
          </span>
        )}
        {path && <span className="text-xs truncate max-w-[280px]" style={{ color: DIMMER }} title={path}>{path}</span>}
        {dirty && <span className="text-xs" style={{ color: MUTED }} aria-label="Unsaved changes">● unsaved</span>}
        {doc && (
          <>
            <Button size="sm" disabled={busy === 'saving' || problems.length > 0} onClick={saveHere} title={problems.length ? 'Fix what is marked first' : 'Save as a project folder (Ctrl+S)'}>
              {busy === 'saving' ? 'Saving…' : 'Save'}
            </Button>
            <Button size="sm" onClick={() => setBrowsing('save')}>Save as…</Button>
          </>
        )}
        <Button size="sm" onClick={() => setBrowsing('open')}>Open…</Button>
        {doc && <Button size="sm" variant="quiet" onClick={() => { if (!dirty || window.confirm('Leave this page without saving it?')) start({ name: 'My tool', description: '', windows: [] }); }}>New</Button>}
      </header>

      {error && (
        <div className="px-4 py-2 text-sm flex items-center gap-3" role="alert" style={{ background: DANGER_FILL, color: DANGER_TEXT }}>
          <span className="flex-1">{error}</span>
          <Button size="sm" variant="quiet" onClick={clearError}>Dismiss</Button>
        </div>
      )}
      {taken && doc && (
        <div className="px-4 py-2 text-sm flex items-center gap-3" role="alert" style={{ background: WARNING_FILL, color: WARNING_TEXT }}>
          <span className="flex-1">A project is already at {taken}. Replace it with this page, or save under another name.</span>
          <Button size="sm" variant="danger" onClick={() => { void save(taken, true); }}>Replace it</Button>
          <Button size="sm" onClick={() => { clearError(); setBrowsing('save'); }}>Another name…</Button>
          <Button size="sm" variant="quiet" onClick={clearError}>Cancel</Button>
        </div>
      )}
      {stale && doc && (
        <div className="px-4 py-2 text-sm flex items-center gap-3" style={{ background: WARNING_FILL, color: WARNING_TEXT }}>
          <span className="flex-1">The graph in this project was changed outside the notebook, so saving would write over that. Save under another name to keep both.</span>
          <Button size="sm" onClick={() => setBrowsing('save')}>Save as…</Button>
          <Button size="sm" variant="danger" onClick={() => { void save(path, true); }}>Write over it</Button>
        </div>
      )}

      {doc ? <Workspace doc={doc} /> : <StartScreen onOpen={() => setBrowsing('open')} />}

      {browsing && (
        <FileBrowserDialog
          title={browsing === 'open' ? 'Open a notebook project' : 'Save the notebook as'}
          mode={browsing === 'open' ? 'file' : 'save'}
          projects
          extensions=".json"
          {...browseStart(browsing === 'open' ? 'load' : 'save', path, lastFolder, 'my_tool')}
          onPick={async (picked) => {
            if (browsing === 'open') {
              await open(picked);
              if (useNotebook.getState().error) return Promise.reject(new Error(useNotebook.getState().error));
            } else if (!(await save(picked))) {
              // Refused because a project is already there: the banner above asks, not this dialog.
              if (!useNotebook.getState().taken) return Promise.reject(new Error(useNotebook.getState().error || 'It could not be saved.'));
            }
            setBrowsing(null);
          }}
          onClose={() => setBrowsing(null)}
        />
      )}
    </div>
  );
}
