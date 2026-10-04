import { useCallback, useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { ApiError, call, type BrowseEntry, type BrowsePage } from '../api/client';
import { errorText } from '../api/errorText';
import {
  ACCENT_TEXT, DANGER_TEXT, DIMMER, FIELD, LINE, MUTED, SUNKEN, TEXT,
} from '../ui/theme';

interface FileBrowserDialogProps {
  /**
   * `file` picks an existing file, `directory` the folder currently open, and
   * `save` picks a folder plus a name to write into it.
   */
  mode: 'file' | 'directory' | 'save';
  /** Verb and object, "Open a tool"; else what the mode says. */
  title?: string;
  /** `save` only: the filename to start from. */
  defaultName?: string;
  /** Where to open. A file path opens its containing folder. */
  initialPath?: string;
  /** Comma-separated extension filter, e.g. ".md, .txt" — files only. */
  extensions?: string;
  /** Graphs are being opened or saved: a project folder is a thing to choose, like a file. */
  projects?: boolean;
  /**
   * What choosing does. One that takes a while or can fail returns a promise:
   * the dialog waits, stays open and says why when it is rejected -- and is
   * closed by whoever opened it when it is not.
   */
  onPick: (path: string) => void | Promise<unknown>;
  onClose: () => void;
}

/** Whether two paths name one place, whichever way they are written. */
const sameFolder = (a: string, b: string): boolean => {
  const plain = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return plain(a) === plain(b);
};

/**
 * A file/directory picker that browses the machine the GRAPH runs on.
 *
 * The obvious implementation — `<input type="file">` — cannot work here: a
 * browser deliberately never reveals a chosen file's location, only its name,
 * while the server resolves real absolute paths. The native dialog
 * therefore produced a name that failed later with a file-not-found from
 * whatever the working directory happened to be. This walks the server's
 * filesystem over `/api/files/browse` instead, so what it returns is a path the
 * server can actually open.
 */
export default function FileBrowserDialog({
  mode, title, initialPath, extensions, defaultName, projects, onPick, onClose,
}: FileBrowserDialogProps) {
  const [path, setPath] = useState('');
  const [parent, setParent] = useState<string | null>(null);
  const [entries, setEntries] = useState<BrowseEntry[]>([]);
  const [roots, setRoots] = useState<string[]>([]);
  // The folder shown is a project itself (`BrowsePage.project`).
  const [inProject, setInProject] = useState(false);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  // `save` only: the folder in the path box is not there yet. "Save here"
  // makes it, so it is said as that -- in red, "Directory not found" read as
  // a folder that could not be saved to.
  const [toBeMade, setToBeMade] = useState(false);
  // It reads its first folder as it opens: until then it is loading, not a folder with nothing in it.
  const [loading, setLoading] = useState(true);
  const [fileName, setFileName] = useState(defaultName ?? '');
  // What choosing is doing, and why it could not (`onPick`).
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState('');

  /** Choose *chosen*: what the owner of this dialog does with it, waited for. */
  const pick = async (chosen: string) => {
    setPicking(true);
    setPickError('');
    try {
      await onPick(chosen);
    } catch (e) {
      setPickError(errorText(e, 'That could not be done.'));
    } finally {
      setPicking(false);
    }
  };
  const close = () => { if (!picking) onClose(); };

  /** Shows *target*; the page it showed, or null when it could not. */
  const load = useCallback(async (target: string): Promise<BrowsePage | null> => {
    setLoading(true);
    setError('');
    setToBeMade(false);
    try {
      // The filter applies to files only; in directory mode it would just hide
      // the folders the user is trying to navigate through.
      const data = await call('browse', { path: target, extensions: mode === 'file' ? extensions ?? '' : '' });
      setPath(data.path);
      setParent(data.parent);
      setEntries(data.entries);
      setRoots(data.roots);
      setInProject(!!data.project);
      setSelected('');
      return data;
    } catch (e) {
      if (mode === 'save' && e instanceof ApiError && e.status === 404) {
        setEntries([]);
        setSelected('');
        setToBeMade(true);
      } else {
        setError(errorText(e, 'Could not read that directory.'));
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, [extensions, mode]);

  // A folder remembered from before may be gone: then it starts where the server was started.
  useEffect(() => {
    void load(initialPath || '').then((shown) => { if (!shown && initialPath) void load(''); });
  }, [load, initialPath]);

  /**
   * Go to what the person typed in the path box -- and where it names a file,
   * choose that file, where choosing one is the point: a path pasted in is a
   * path chosen, not a folder to look at.
   */
  const go = async (typed: string) => {
    const page = await load(typed);
    const name = typed.trim().split(/[\\/]/).pop()?.toLowerCase();
    const file = page && name && sameFolder(typed.trim().replace(/[\\/][^\\/]*$/, ''), page.path)
      ? page.entries.find((entry) => !entry.is_dir && entry.name.toLowerCase() === name) : undefined;
    if (!file) return;
    if (mode === 'file') void pick(file.path);
    else if (mode === 'save') { setSelected(file.path); setFileName(file.name); }
  };

  /** A project folder, where projects are what is being chosen. */
  const isProject = (entry: BrowseEntry) => !!projects && !!entry.project;

  const activate = (entry: BrowseEntry) => {
    if (isProject(entry) && mode !== 'directory') void pick(entry.path);
    else if (entry.is_dir) void load(entry.path);
    else if (mode === 'file') void pick(entry.path);
  };

  /** Join with the separator the server itself used, rather than guessing. */
  const join = (dir: string, name: string) => {
    const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/';
    return dir.endsWith(sep) ? `${dir}${name}` : `${dir}${sep}${name}`;
  };

  // Opened inside a project with nothing selected, the project shown is what
  // is chosen: "Select" stood there disabled, and said nothing of why.
  const openShown = mode === 'file' && !!projects && inProject && !selected;
  const confirmLabel = mode === 'directory' ? 'Use this folder' : mode === 'save' ? 'Save here' : openShown ? 'Open this tool' : 'Select';
  const canConfirm =
    mode === 'directory' ? !!path : mode === 'save' ? !!path && !!fileName.trim() : !!selected || openShown;
  const confirmTitle = !canConfirm
    ? (mode === 'save' ? 'Give it a name first' : projects ? 'Select a graph file or a 📦 tool first' : 'Select a file first')
    : openShown ? `Open the tool this folder is: ${path}`
      : mode === 'directory' ? `Use ${path}` : mode === 'save' ? `Save as ${fileName.trim()} in ${path}` : `Choose ${selected}`;

  // Its Enter keys are its own and go no further: opened from "Before
  // running…", an Enter typed here to open a folder also started the run.
  const confirm = () => {
    if (mode === 'directory') return pick(path);
    if (mode === 'save') return pick(join(path, fileName.trim()));
    if (openShown) return pick(path);
    // A plain folder selected and confirmed is a folder to go into, not a choice.
    const entry = entries.find((candidate) => candidate.path === selected);
    if (entry?.is_dir && !isProject(entry)) return load(entry.path);
    return pick(selected);
  };

  return (
    <Modal
      title={title ?? (mode === 'directory' ? 'Choose a folder' : mode === 'save' ? 'Choose where to save' : 'Choose a file')}
      onClose={close}
      dismissOnBackdrop={!picking}
      dismissOnEscape={!picking}
      maxWidth="max-w-2xl"
      footer={
        <>
          <Button onClick={close} disabled={picking}>Cancel</Button>
          <Button variant="primary" disabled={!canConfirm || picking} onClick={() => { void confirm(); }} title={confirmTitle}>
            {picking ? '…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2 p-5">
        <div className="flex items-center gap-2">
          {/* Worded, not just an arrow. A bare ↑ next to a path field reads as
              part of the field's decoration, and it was reported as a picker
              with no way back up the tree -- in the deployed tool it *was*
              one, because the server sent no parent and the button was drawn
              permanently disabled. */}
          <Button
            className="shrink-0"
            disabled={!parent}
            onClick={() => parent && load(parent)}
            title={parent ? `Up to ${parent}` : 'This is the top'}
            aria-label="Up one level"
          >
            <span aria-hidden="true">↑</span> Up
          </Button>
          {/* Back to where the tool lives, from wherever you have wandered to. */}
          <Button className="shrink-0" onClick={() => load('')} title="Back to this tool's own folder" aria-label="Home folder">
            ⌂
          </Button>
          <input
            className="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-sm font-mono"
            style={FIELD}
            value={path}
            onChange={(e) => setPath(e.target.value)}
            // Enter goes to what was typed -- and a file typed is chosen.
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); void go(path); } }}
            aria-label="Current path"
            placeholder="Type a folder or a file"
          />
          <Button className="shrink-0" onClick={() => go(path)}>Go</Button>
        </div>

        {roots.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {roots.map((root) => (
              <Button key={root} variant="quiet" onClick={() => load(root)}>{root}</Button>
            ))}
          </div>
        )}

        <div
          className="rounded-lg overflow-y-auto"
          style={{ background: SUNKEN, border: `1px solid ${LINE}`, height: 320 }}
        >
          {loading && <div className="p-3 text-sm" style={{ color: MUTED }}>Loading…</div>}
          {!loading && error && <div className="p-3 text-sm" style={{ color: DANGER_TEXT }}>{error}</div>}
          {!loading && !error && entries.length === 0 && (
            <div className="p-3 text-sm" style={{ color: toBeMade ? MUTED : DIMMER }}>
              {toBeMade ? 'This folder is not there yet: Save here makes it.'
                : mode === 'file' && extensions ? `No folders, and no files matching ${extensions}.` : 'This folder is empty.'}
            </div>
          )}
          {!loading && !error && entries.map((entry) => {
            const choosable = !entry.is_dir || isProject(entry);
            const isSelected = selected === entry.path;
            return (
              <button
                type="button"
                key={entry.path}
                className="w-full text-left px-3 py-1.5 text-sm font-mono flex items-center gap-2"
                style={{ background: isSelected ? LINE : 'transparent', color: entry.is_dir ? ACCENT_TEXT : TEXT }}
                // One click selects, a double-click opens -- a folder too. A folder
                // that opened on the first click put a different row under the
                // pointer for the second, and a double-click on "examples" opened
                // whichever project had slid into its place.
                onClick={() => {
                  setSelected(entry.path);
                  if (mode === 'save' && choosable) setFileName(entry.name);
                }}
                onDoubleClick={() => activate(entry)}
                title={entry.path}
              >
                <span aria-hidden="true">{isProject(entry) ? '📦' : entry.is_dir ? '📁' : '📄'}</span>
                <span className="truncate">{entry.name}</span>
                {isProject(entry) && <span className="text-xs flex-shrink-0" style={{ color: DIMMER }}>tool</span>}
              </button>
            );
          })}
        </div>

        {mode === 'save' && (
          <div className="flex items-center gap-2">
            <label className="text-xs flex-shrink-0" style={{ color: MUTED }} htmlFor="save-file-name">
              File name
            </label>
            <input
              id="save-file-name"
              className="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-sm font-mono"
              style={FIELD}
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); if (canConfirm && !picking) void confirm(); } }}
              placeholder={projects ? 'my_tool  (or my_tool.json for one file)' : 'my_graph.json'}
            />
          </div>
        )}

        {pickError && <p className="text-xs" style={{ color: DANGER_TEXT }} role="alert">{pickError}</p>}
        <p className="text-xs" style={{ color: DIMMER }}>
          {mode === 'directory'
            ? 'Double-click a folder to go into it. '
            : mode === 'save'
              ? projects ? 'A name makes a tool folder; a name ending in .json makes one file. ' : 'Clicking an existing file reuses its name. '
              : projects ? 'Double-click a 📦 tool or a graph file to open it. ' : 'Double-click a file to choose it. '}
          Paths are on the machine the tool runs on.
        </p>
      </div>
    </Modal>
  );
}
