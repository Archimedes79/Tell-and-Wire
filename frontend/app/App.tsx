import { useCallback, useEffect, useRef, useState } from 'react';
import { slugOf } from './document/ids';
import { ReactFlowProvider } from 'reactflow';

import Toolbar from './Toolbar';
import Sidebar from './Sidebar';
import GraphCanvas from '../graph-editor/canvas/GraphCanvas';
import DesignerTab from '../gui-editor/page/DesignerTab';
import ApplicationView from '../gui-editor/page/ApplicationView';
import TopGraphOnly from '../gui-editor/page/TopGraphOnly';
import type { EditorView } from './ViewTabs';
import NodeView from '../graph-editor/node/NodeView';
import ChangeBar from './ChangeBar';

import SettingsDialog from './SettingsDialog';
import JsonDialog, { parseGraphJson } from './JsonDialog';
import { DiskChanges } from './diskChanges';
import { droppedProject, landedInCodeField } from './windowDrops';
import { browseStart, folderOf } from './browseStart';
import FileBrowserDialog from './dialogs/FileBrowserDialog';
import { useDialogs } from './dialogs/useDialogs';

import { useGraphStore } from './store/graphStore';
import { placement } from './document/placement';
import { ApiError, call } from './api/client';
import { errorText } from './api/errorText';
import type { NodeType, Graph } from './graph';
import { defaultMetadata } from '../../graph/graph.ts';
import { SUNKEN } from './ui/theme';

const FOLDER_KEY = 'tell-and-wire.last-folder';

/** The folder a graph was last opened from or saved to, as this browser remembers it -- '' where it cannot. */
function rememberedFolder(): string {
  try {
    return localStorage.getItem(FOLDER_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberFolder(folder: string): void {
  try {
    localStorage.setItem(FOLDER_KEY, folder);
  } catch {
    // A browser that keeps nothing starts where the server was started.
  }
}

export default function App() {
  const addNode = useGraphStore((s) => s.addNode);
  // The node open in place of the canvas, while it is there.
  const openNodeId = useGraphStore((s) => (s.rfNodes.some((n) => n.id === s.editingNodeId) ? s.editingNodeId : null));
  const setEditingNode = useGraphStore((s) => s.setEditingNode);
  const closeNode = useCallback(() => setEditingNode(null), [setEditingNode]);
  const loadGraph = useGraphStore((s) => s.loadGraph);
  // Saving, exporting and running are about the whole document, whichever
  // level of it the canvas is showing.
  const rootGraph = useGraphStore((s) => s.rootGraph);
  const newGraph = useGraphStore((s) => s.newGraph);
  const currentFilePath = useGraphStore((s) => s.currentFilePath);
  const setCurrentFilePath = useGraphStore((s) => s.setCurrentFilePath);
  const isDirty = useGraphStore((s) => s.isDirty);
  const save = useGraphStore((s) => s.save);
  const isProject = useGraphStore((s) => s.isProject);
  const insideSubgraph = useGraphStore((s) => s.subgraphStack.length > 0);
  const takeDiskChanges = useGraphStore((s) => s.takeDiskChanges);
  const dialogs = useDialogs();

  // The browser's own "leave site?" prompt. Nothing else stands between an
  // hour of wiring and an accidental Cmd-R or tab close: the graph lives only
  // in memory until it is written to a file.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const [showSettings, setShowSettings] = useState(false);
  const [view, setView] = useState<EditorView>('graph');

  // What the header says of saving and opening, kept with the graph it was
  // said of: another one opened or started (`document` moved on) leaves it
  // unsaid. "✅ Saved to …\capitals-table" stood over three graphs opened after it.
  // A *problem* stays said while the graph is unsaved -- which a save that failed leaves it.
  const [said, setSaid] = useState({ text: '', problem: false, document: 0 });
  const say = useCallback((text: string, problem = false) => setSaid({ text, problem, document: useGraphStore.getState().document }), []);
  const documentOpen = useGraphStore((s) => s.document);
  const heard = said.document === documentOpen ? said : { text: '', problem: false };

  // Editing the page means the Page tab -- at the size it will really be, next
  // to the blocks it will really sit beside -- which a start or end point the
  // page uses offers from its own view.
  const openPage = useCallback(() => setView('design'), []);

  // The folder the last graph was opened from or saved to -- '' before one
  // was: the folder the server was started in. Where the file browser starts
  // when the path box holds a bare name (`browseStart`). Kept in the browser,
  // so a restart of the server does not send the person back to the folder it
  // was started in.
  const [lastFolder, setLastFolder] = useState(rememberedFolder);
  useEffect(() => {
    if (!currentFilePath) return;
    const folder = folderOf(currentFilePath);
    setLastFolder(folder);
    rememberFolder(folder);
  }, [currentFilePath]);

  // A project folder by default: a name without .json. Typing .json saves one file instead.
  const suggestedName = () => slugOf(rootGraph().metadata.name) || 'my_tool';

  /**
   * Make *graph* the document and say how it went -- what it could not hold,
   * a wire to a node that is not there, included. *file*: where it came from.
   * *unsaved*: it came from nowhere (✨ designed it).
   */
  const replaceWith = (graph: Graph, ok: string, file?: { path: string; project: boolean }, unsaved = false) => {
    const { dropped } = loadGraph(graph, { unsaved });
    if (file) setCurrentFilePath(file.path, file.project);
    if (dropped.length) say(`⚠ Left out ${dropped.length === 1 ? 'a wire' : `${dropped.length} wires`} to nodes that are not there: ${dropped.join(', ')}`, true);
    else say(ok);
  };

  /** Open the tool at *path*; throws what the server refused. */
  const openPath = async (path: string, ok = `✅ Opened ${path}`) => {
    const result = await call('openGraph', { path });
    replaceWith(result.graph, ok, { path: result.path, project: result.project });
  };

  /** Write the tool to *path* -- where it is, without one. False where a save is going already; throws what the server refused. */
  const saving = useRef(false);
  const write = async (path?: string, as?: { replace?: boolean; name?: string }): Promise<boolean> => {
    if (saving.current) return false;
    saving.current = true;
    say('Saving…');
    try {
      const saved = await save(path, as);
      say(`✅ Saved to ${saved.path}`);
      return true;
    } catch (error) {
      say('');
      throw error;
    } finally {
      saving.current = false;
    }
  };

  /**
   * Save to *path*, where the tool is not. A tool still untitled is called what
   * it is saved as -- reopened, it should not say "Untitled tool" above a
   * folder named word_stats -- and one already at *path* is replaced only when
   * the person says so, in a click.
   */
  const writeAs = async (path: string): Promise<boolean> => {
    const name = rootGraph().metadata.name === defaultMetadata().name
      ? (path.split(/[\\/]/).filter(Boolean).pop() ?? '').replace(/\.json$/i, '') || undefined
      : undefined;
    try {
      return await write(path, { name });
    } catch (error) {
      if (!(error instanceof ApiError && error.body.taken === true)) throw error;
      const replace = await dialogs.ask({
        title: 'Replace the tool?',
        text: `A tool is already at ${path}.`,
        answers: [{ value: true, label: 'Replace', variant: 'primary' }],
      });
      return replace ? write(path, { name, replace: true }) : false;
    }
  };

  // Open and Save as go straight to the file browser: choosing a file is what
  // they are for, and a path box first -- "/path/to/my_graph" -- asked the
  // one question a newcomer cannot answer. Typing a path in the browser's own
  // box does the same. Picking is the choice: it is opened, or saved to, at once.
  const browse = <T,>(mode: 'file' | 'save', title: string, onPick: (path: string, done: (result: T) => void) => Promise<void>, none: T): Promise<T> =>
    dialogs.show<T>((done) => (
      <FileBrowserDialog
        title={title}
        mode={mode}
        projects
        extensions=".json"
        {...browseStart(mode === 'file' ? 'load' : 'save', currentFilePath ?? '', lastFolder, suggestedName())}
        onPick={(path) => onPick(path, done)}
        onClose={() => done(none)}
      />
    ));

  /** Save as: the tool where the person chooses; whether it was saved. */
  const saveAs = () => browse<boolean>('save', 'Save the tool as', async (path, done) => { if (await writeAs(path)) done(true); }, false);

  /** Save to where the tool is -- or, at no file yet, as: whether it was saved. */
  const saveTool = async (): Promise<boolean> => {
    if (!useGraphStore.getState().currentFilePath) return saveAs();
    try {
      return await write();
    } catch (error) {
      say(`❌ ${errorText(error, 'Save failed')}`, true);
      return false;
    }
  };

  /**
   * Whether the document may be replaced: it is, when it holds nothing unsaved
   * -- or the person saves it, or lets it go. Everything that loads a graph
   * asks first: New, Open, Reload, a drop, pasted JSON and ✨ Describe a graph
   * destroy unsaved work otherwise.
   */
  const mayReplace = async (): Promise<boolean> => {
    if (!isDirty()) return true;
    const answer = await dialogs.ask<'save' | 'discard'>({
      title: `Save changes to "${rootGraph().metadata.name}"?`,
      text: 'They are lost if you discard them.',
      answers: [{ value: 'discard', label: 'Discard', variant: 'danger' }, { value: 'save', label: 'Save', variant: 'primary' }],
    });
    return answer === 'discard' || (answer === 'save' && await saveTool());
  };

  /**
   * Load a graph JSON dropped anywhere on the window.
   *
   * Registered on the window rather than on the canvas for two reasons: a file
   * dropped just outside the canvas would otherwise make the BROWSER open it,
   * navigating away and taking the unsaved graph with it -- and having to hit
   * the canvas exactly is a poor way to load a file. Palette drags are
   * untouched: this only ever reacts to a real file.
   *
   * The browser does not reveal where a dropped file lives, so the loaded graph
   * has no file path and Save will ask for one, exactly as after Paste JSON.
   */
  const dropGraphFile = async (file: File) => {
    if (!/\.json$/i.test(file.name)) {
      say(`❌ ${file.name} is not a .json graph file.`, true);
      return;
    }
    // A project's flow.json is its wiring only: the nodes are in files beside
    // it, which a browser does not hand over.
    if (file.name === 'flow.json') {
      say('❌ This is a tool\'s flow.json: its nodes are in files beside it, which a browser '
        + 'does not hand over. Drop the tool\'s folder, or open it with File → Open….', true);
      return;
    }
    let graph: Graph;
    try {
      graph = parseGraphJson(await file.text());
    } catch (error) {
      say(`❌ ${errorText(error, `Could not read ${file.name}`)}`, true);
      return;
    }
    if (await mayReplace()) replaceWith(graph, `✅ Loaded ${file.name}`);
  };

  /**
   * A dropped folder: a tool, most likely, opened when the editor's server
   * finds exactly one of that name (`droppedProject`).
   */
  const dropToolFolder = async (name: string) => {
    if (!(await mayReplace())) return;
    try {
      await openPath(await droppedProject(name));
    } catch (error) {
      say(`❌ ${errorText(error, `Could not open ${name}`)}`, true);
    }
  };

  useEffect(() => {
    const onDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (event: DragEvent) => {
      const file = event.dataTransfer?.files?.[0];
      // A palette drag is the canvas's. A file dropped on a node or on an
      // example field is theirs, and does not arrive here: they stop it.
      if (!file) return;
      event.preventDefault();
      // One dropped into a code box arrives, and its editor has typed it in.
      if (landedInCodeField(event.target)) return;
      // Only answerable while the event lasts: afterwards the item is gone.
      if (event.dataTransfer?.items?.[0]?.webkitGetAsEntry()?.isDirectory) void dropToolFolder(file.name);
      else void dropGraphFile(file);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  });

  // Add a node from a palette click: beside what is already there, and chosen
  // -- a double-click opens it. The canvas brings it into sight (`viewDue`).
  const handleAddNode = useCallback(
    (nodeType: NodeType) => {
      addNode(nodeType, placement(useGraphStore.getState().rfNodes));
    },
    [addNode]
  );

  const handleNewGraph = async () => {
    if (await mayReplace()) newGraph();
  };

  const handleOpen = async () => {
    if (await mayReplace()) await browse<void>('file', 'Open a tool', async (path, done) => { await openPath(path); done(); }, undefined);
  };

  /**
   * Open the tool again from disk: for the flow, or a node's settings or
   * ports, changing outside -- a git pull, a merge. Code and prompts need no
   * such thing: they are watched (below). It is Open, of the same path.
   */
  const handleReloadProject = async () => {
    if (!currentFilePath || !(await mayReplace())) return;
    say('Reloading…');
    try {
      await openPath(currentFilePath, '✅ Reloaded from disk');
    } catch (error) {
      say(`❌ ${errorText(error, 'Reload failed')}`, true);
    }
  };

  const disk = useRef(new DiskChanges());
  // A project's code and prompts are files, and files get edited elsewhere:
  // in VS Code, by git, by an assistant. The folder is asked every second and
  // a half what changed, and what did comes in without a reload or a button,
  // and nothing typed here is lost (see takeDiskChanges, and the
  // node's panel, which keeps what it has not written yet on top of a change from outside). Only while the page is
  // looked at: a hidden tab has nobody to show a change to.
  useEffect(() => {
    // Not while a node is open from the inside: a change down there arrives as
    // "that whole graph changed", which is the graph being edited right now.
    if (!isProject || !currentFilePath || insideSubgraph) return;
    let alive = true;
    const look = async () => {
      if (document.hidden) return;
      try {
        // Kept whatever happens to this look: the server reports a change once.
        disk.current.arrived(currentFilePath, (await call('projectChanges', { path: currentFilePath })).changes);
        if (!alive) return;
        const changes = disk.current.due(currentFilePath);
        if (!changes.length) return;
        // Named: the nodes whose change was taken -- not one gone since, or one that held it already.
        const { taken, refused } = takeDiskChanges(changes);
        if (taken.length) say(`↻ From disk: ${taken.join(', ')}`);
        // A graph inside a node changed on disk while there is unsaved work
        // here. Taking it would replace that graph whole, so it waits.
        if (refused.length) {
          say(`⚠ The graph inside ${[...new Set(refused)].join(', ')} changed on disk. `
            + 'Save or undo your changes, then reload the tool to take it.', true);
        }
      } catch {
        // Half-written by the other editor, most likely: the next look gets it.
      }
    };
    const timer = window.setInterval(look, 1500);
    return () => { alive = false; window.clearInterval(timer); };
  }, [isProject, currentFilePath, insideSubgraph, takeDiskChanges, say]);

  // Ctrl/Cmd+S, because the only other way to save is a trip to the toolbar,
  // and Ctrl/Cmd+Z / Shift+Z / Y for undo and redo.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();

      if (key === 's') {
        event.preventDefault();
        void saveTool();
        return;
      }

      // While the caret is in a field, Ctrl+Z belongs to that field's own text
      // history -- taking it would undo a graph change the user cannot see
      // instead of the word they just typed.
      const target = event.target as HTMLElement | null;
      const typing = !!target && (
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      );
      if (typing) return;

      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        useGraphStore.getState().undo();
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        useGraphStore.getState().redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <ReactFlowProvider>
      {/* Clipped, not hidden: a box that hides its overflow can still be
          scrolled, and focus moving to a control past the right edge slid
          the whole page sideways. What does not fit scrolls where it is. */}
      <div className="flex flex-col h-screen overflow-clip" style={{ background: SUNKEN }}>
        <Toolbar
          onNewGraph={() => { void handleNewGraph(); }}
          onSave={() => { void saveTool(); }}
          onSaveAs={() => { void saveAs(); }}
          onReloadProject={() => { void handleReloadProject(); }}
          onLoad={() => { void handleOpen(); }}
          onInjectJson={() => {
            void dialogs.show<void>((done) => (
              <JsonDialog
                graph={rootGraph()}
                onLoad={async (graph) => {
                  if (!(await mayReplace())) return false;
                  replaceWith(graph, '✅ Loaded the pasted graph');
                  return true;
                }}
                onClose={done}
              />
            ));
          }}
          onOpenSettings={() => setShowSettings(true)}
          onLoadDesigned={async (graph) => {
            if (!(await mayReplace())) return false;
            replaceWith(graph, '', undefined, true);
            return true;
          }}
          saveStatus={heard.problem ? '' : heard.text}
          problem={heard.problem ? heard.text : ''}
          view={view}
          onViewChange={setView}
        />

        {/* Both views stay mounted: the graph keeps its ReactFlow viewport, and
            switching back does not reset the canvas or lose a selection. A node
            opened takes the canvas's place, hidden and not unmounted for the
            same reason. */}
        <div className="flex flex-1 min-h-0 overflow-hidden" style={{ display: view === 'graph' ? 'flex' : 'none' }}>
          <div className="flex flex-1 min-w-0 min-h-0" style={{ display: openNodeId ? 'none' : 'flex' }}>
            <Sidebar onAddNode={handleAddNode} />
            <div className="flex flex-col flex-1 min-w-0">
              <GraphCanvas active={view === 'graph' && !openNodeId} />
              <ChangeBar />
            </div>
          </div>
          {openNodeId && <NodeView key={openNodeId} nodeId={openNodeId} onClose={closeNode} onOpenPage={openPage} />}
        </div>
        {/* The page is the top graph's: inside a node's graph there is none to
            build or try, and these would act on the graph in there. */}
        {view === 'design' && <TopGraphOnly><DesignerTab /></TopGraphOnly>}
        {view === 'app' && <TopGraphOnly><ApplicationView /></TopGraphOnly>}

        {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
        {dialogs.dialogs}
      </div>
    </ReactFlowProvider>
  );
}
