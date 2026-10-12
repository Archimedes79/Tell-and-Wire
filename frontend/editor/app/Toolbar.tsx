import { useEffect, useId, useRef, useState } from 'react';
import { say } from '../document/store/noticeBoard';
import { runReport } from './runReport';
import { BookOpen, Play, Redo2, Settings, Square, Undo2, Wand2 } from 'lucide-react';
import ToolbarButton from '../../deployment/gui/kit/ui/ToolbarButton';
import Button from '../../deployment/gui/kit/ui/Button';
import { useGoingRound, useGraphStore } from '../document/store/graphStore';
import { downloadBundle } from '../api/client';
import { errorText } from '../../deployment/gui/kit/api/errorText';
import type { Graph } from '../document/graph';
import { useRound } from '../../deployment/gui/surface/useRound';
import RequirementsDialog from '../../deployment/gui/kit/dialogs/RequirementsDialog';
import { flushPanels } from '../document/store/flushPanels';
import { useGraphSweep } from '../graph/node/useGraphSweep';
import Modal from '../../deployment/gui/kit/ui/Modal';
import LiveGeneration from '../graph/writing/LiveGeneration';
import { useGraphAsk } from '../document/graphAsk';
import SubgraphTrail from './SubgraphTrail';
import GraphProblems from './GraphProblems';
import ViewTabs, { type EditorView } from './ViewTabs';
import { opensApp, startApplication, stopApplication, useApplication, useTopOpensApp } from '../document/application';
import FileMenu, { fileActions } from './FileMenu';
import { ACCENT_FILL, ACCENT_TEXT, DANGER_FILL, DANGER_TEXT, DIM, DIMMER, FIELD, LINE, MUTED, SUCCESS_TEXT, SURFACE } from '../../deployment/gui/kit/ui/theme';

/**
 * How long a node may go without producing anything before the toolbar says so.
 *
 * A local model thinking for twenty seconds is normal and needs no commentary;
 * one silent for a minute is the case where the only question a user has is
 * "is this still alive or do I reload the page?".
 */
const STALLED_AFTER_SECONDS = 45;

/**
 * Why New, Open and Reload wait, or null when they need not: a ✨ sweep is
 * going, and what it brings back belongs to the graph it started on. (A run
 * is stopped with the graph it belongs to: `loadGraph`.)
 */
function graphBusy(sweeping: boolean): string | null {
  return sweeping ? '✨ Generate all is writing this graph: stop it, or wait for it, before opening another.' : null;
}

interface ToolbarProps {
  onNewGraph: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  /** Re-read the node files of the open graph. */
  onReloadProject: () => void;
  onLoad: () => void;
  onInjectJson: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  /** What happened in the last run, node by node. */
  onOpenReport: () => void;
  /** Make the document the graph ✨ designed, after asking about unsaved work; whether it was. */
  onLoadDesigned: (graph: Graph) => Promise<boolean>;
  view: EditorView;
  onViewChange: (view: EditorView) => void;
}

/**
 * The header: the app's name, the tool's -- its views -- and on the
 * right what is done to the tool as a whole: ▶ Run first, then Generate all
 * and Settings (the gear). What is done now and then is in the File menu (New,
 * ✨ Describe a graph, Open, Save, Save as…, Reload, JSON, Deploy); Undo and Redo are icons.
 * Changing the graph as said is the bar under the canvas.
 */
export default function Toolbar({
  onNewGraph, onSave, onSaveAs, onReloadProject, onLoad, onInjectJson, onOpenSettings, onOpenHelp, onOpenReport, onLoadDesigned,
  view, onViewChange,
}: ToolbarProps) {
  const metadata = useGraphStore((s) => s.metadata);
  const currentFilePath = useGraphStore((s) => s.currentFilePath);
  const inside = useGraphStore((s) => s.subgraphStack.length > 0);
  const sweep = useGraphSweep();
  // One answer, which the header is drawn anew by when it turns: the unsaved
  // dot, and the "✅ Saved" line below, which must not claim what is no longer
  // true. Asked once: each answer is a whole serialised document.
  const dirty = useGraphStore((s) => s.isDirty());
  const setMetadata = useGraphStore((s) => s.setMetadata);
  // Whether a run goes, and how far, is the session's alone (`goingRound`).
  const going = useGoingRound();
  const isExecuting = going !== null;
  const heldElsewhere = useGraphStore((s) => s.heldElsewhere);
  const isProject = useGraphStore((s) => s.isProject);
  const undo = useGraphStore((s) => s.undo);
  const redo = useGraphStore((s) => s.redo);
  // Subscribe to the stack lengths, not to a function that reads them: selecting
  // a function never changes identity, so the buttons would never re-enable.
  const undoAvailable = useGraphStore((s) => s.past.length > 0);
  const redoAvailable = useGraphStore((s) => s.future.length > 0);
  const executionResult = useGraphStore((s) => s.executionResult);

  const [deployBusy, setDeployBusy] = useState('');
  // Asking what the graph needs, then running: the delivered GUI's own steps.
  // The document is handed over by ▶ Run just before (`startApplication`).
  const delivered = useRound();

  const [showDescribe, setShowDescribe] = useState(false);
  const [description, setDescription] = useState('');
  const { ask, send, reset } = useGraphAsk();
  const asking = ask.phase === 'asking';
  const describeId = useId();

  // What ✨ Generate all says goes where everything else is said, whole: going on while it writes, a card of its own when it ends.
  useEffect(() => {
    say('sweep', sweep.message, { sticky: sweep.busy || undefined });
  }, [sweep.message, sweep.busy]);

  // A run that failed says so where everything else is said, with the way to the report: where it stopped, and why in words.
  const told = useRef<unknown>(null);
  useEffect(() => {
    if (!executionResult || executionResult === told.current) return;
    told.current = executionResult;
    if (executionResult.status !== 'error' && executionResult.status !== 'partial') {
      say('run', '');
      return;
    }
    const labels = useGraphStore.getState().rfNodes.map((item) => item.data.graphNode);
    say('run', runReport(executionResult, labels).summary, {
      level: executionResult.status === 'error' ? 'error' : 'warning',
      action: { label: 'Report', run: onOpenReport },
    });
  }, [executionResult, onOpenReport]);

  /** Why another graph cannot be opened now, or null when it can. */
  const busyWith = graphBusy(sweep.busy);

  /**
   * ▶ Run: the tool, run as whoever gets it will run it -- one button,
   * the same on every tab (`document/application.ts`). With a GUI, the GUI opens
   * (the App tab) and the graph runs when it is used; without one, what starts
   * the graph starts it. While it runs the button is ■ Stop, which ends it.
   *
   * It is the document that runs: from inside a node's graph, the canvas goes
   * back up to the top first, where the GUI is and where the results land.
   * A graph run whole at start goes through the delivered tool's own steps
   * (`useRound`), as every run does.
   */
  const appRunning = useApplication((s) => s.running);
  const opensTab = useTopOpensApp();
  // Where the App tab goes back to: the view ▶ Run was pressed on.
  const ranFrom = useRef<EditorView>('graph');
  const handleRun = () => {
    flushPanels();
    const store = useGraphStore.getState();
    if (store.subgraphStack.length) store.closeSubgraphsTo(0);
    const graph = useGraphStore.getState().rootGraph();
    if (opensApp(graph)) {
      if (view !== 'app') ranFrom.current = view;
      onViewChange('app');
    }
    say('run', '');
    startApplication(graph, () => delivered.run(null))
      .catch((error) => say('run', errorText(error, 'The tool could not be started.'), { level: 'error' }));
  };
  // Stopped -- by ■ Stop, or by itself, having nothing left to do -- or its
  // gui gone, it takes its tab with it.
  useEffect(() => {
    if (view === 'app' && !(appRunning && opensTab)) onViewChange(ranFrom.current);
  }, [appRunning, opensTab, view, onViewChange]);
  // Another graph opened, or started anew: the application was the last one's.
  // Not a step into a node's graph and out, which is the same document.
  const opened = useGraphStore((s) => s.opened);
  useEffect(() => () => { void stopApplication(); }, [opened]);

  // A busy state and the error, said: without them a slow or rejecting
  // backend looks exactly like a dead button.
  const runDeployAction = async (label: string, action: () => Promise<string>) => {
    setDeployBusy(label);
    say('deploy', 'Making the zip…');
    try {
      // Said when it is done: the browser saves a download without a word, and nothing else says it came.
      say('deploy', `✅ ${await action()} is made, as a program of its own: your browser has saved it with your downloads.`);
    } catch (error) {
      say('deploy', errorText(error, `${label} failed.`), { level: 'error' });
    } finally {
      setDeployBusy('');
    }
  };

  const handleDownloadBundle = () =>
    runDeployAction('Bundle download', async () => {
      // The tool someone is handed is the whole thing, not the level that is open.
      flushPanels();
      const { rootGraph, currentFilePath } = useGraphStore.getState();
      return downloadBundle({ graph: rootGraph(), path: currentFilePath });
    });

  const handleOpenDescribe = () => {
    setDescription('');
    reset();
    setShowDescribe(true);
  };

  const handleCloseDescribe = () => {
    // What is still on its way is no longer wanted: nothing it brings is shown.
    reset();
    setShowDescribe(false);
  };

  const handleLoadDescribed = async () => {
    // The user came here to explore an idea; loading the result must not
    // silently destroy the graph they already had open.
    if (ask.phase === 'ready' && await onLoadDesigned(ask.graph)) handleCloseDescribe();
  };

  const statusColor = executionResult
    ? executionResult.status === 'success' ? SUCCESS_TEXT : DANGER_TEXT
    : DIMMER;
  // The last run's word, not said while the next one goes: "6/18" and "cancelled" side by side
  // read as if the run going had been stopped.
  const statusLabel = executionResult && !isExecuting ? executionResult.status : '';

  // The bar fits the window: below 1280 pixels its buttons are their icons
  // (`ToolbarButton`), and what it says -- a status, a sweep's progress -- is
  // cut to the room there is, whole in its tooltip. What still does not fit
  // scrolls inside the bar: overflowing into the page, it would slide the page
  // sideways and take the palette and the tabs out of view.
  return (
    <>
      <header
        className="flex items-center gap-2 xl:gap-3 px-3 xl:px-5 h-14 flex-shrink-0 min-w-0 overflow-x-auto overflow-y-hidden"
        style={{ background: SURFACE, borderBottom: `1px solid ${LINE}`, scrollbarWidth: 'thin' }}
      >
        <span className="shrink-0 whitespace-nowrap text-base font-bold" style={{ color: ACCENT_TEXT }}>Tell & Wire</span>

        {/* The tool's name; where it is saved is its tooltip and the File menu's first line.
            Inside a node's graph the trail names where you are, the top graph first. */}
        {!inside && (
          <input
            className="bg-transparent border-none outline-none text-sm w-44 min-w-[5rem] flex-shrink"
            // Dashed underneath: it is a name to type over, not a label.
            style={{ color: MUTED, borderBottom: `1px dashed ${LINE}`, paddingBottom: 2 }}
            value={metadata.name}
            onChange={(e) => setMetadata({ name: e.target.value })}
            aria-label="The tool's name"
            title={currentFilePath ?? 'Not saved to a file yet'}
          />
        )}
        {dirty && (
          <span className="shrink-0 text-xs" style={{ color: DIM }} title="Unsaved changes" role="img" aria-label="Unsaved changes">●</span>
        )}

        <SubgraphTrail />

        <ViewTabs view={view} onChange={onViewChange} running={appRunning && opensTab} />

        {/* What is going on, cut to the room between the tabs and the actions. */}
        <div className="flex flex-1 min-w-0 items-center justify-end gap-2 overflow-hidden">
          {going && (
            <span
              className="text-xs tabular-nums truncate"
              style={{ color: MUTED }}
              title={
                'Nodes finished, of the total in this graph'
                + (going.item_total > 1 ? '; then items finished within the running node' : '')
              }
            >
              {going.completed}/{going.total}
              {going.current_label ? ` · ${going.current_label}` : ''}
              {/* Only worth showing for a real batch: "1/1" on every single-item
                  node is noise that makes the useful case harder to spot. */}
              {going.item_total > 1 ? ` · ${going.item_done}/${going.item_total}` : ''}
            </span>
          )}
          {/* Said only once it is worth saying. Below the threshold a run is
              visibly working, and a ticking "1s… 2s…" would be pure anxiety;
              above it, silence is the thing the user cannot otherwise tell from
              a hang. */}
          {going && going.idle_seconds !== null && going.idle_seconds > STALLED_AFTER_SECONDS && (
            <span
              className="text-xs tabular-nums whitespace-nowrap"
              style={{ color: DIM }}
              title="No output from the model since this long. The run is still waiting, not stopped."
            >
              ⏳ {Math.round(going.idle_seconds)}s
            </span>
          )}
          {heldElsewhere && (
            <span
              className="text-xs font-medium truncate"
              style={{ color: DANGER_TEXT }}
              title="Another tab or window opened a graph on this editor's server, or the server was started again: what it runs now is not this graph. ▶ Run hands it this one again."
            >
              ⚠ The server runs another graph now
            </span>
          )}
          {statusLabel && !heldElsewhere && (
            <button
              type="button"
              onClick={onOpenReport}
              className="text-xs font-medium whitespace-nowrap hover:underline"
              style={{ color: statusColor }}
              title="The run report: what happened, node by node, and what to look at first"
            >
              {statusLabel} · Report
            </button>
          )}
        </div>

        <FileMenu
          where={currentFilePath ?? 'Not saved to a file yet'}
          actions={fileActions({
            busyWith, isProject, deploying: !!deployBusy,
            onNew: onNewGraph, onDesign: handleOpenDescribe, onOpen: onLoad, onSave, onSaveAs, onReload: onReloadProject, onJson: onInjectJson, onDeploy: handleDownloadBundle,
          })}
        />
        <div className="flex shrink-0 items-center">
          <ToolbarButton icon={Undo2} title="Undo (Ctrl+Z)" onClick={undo} disabled={!undoAvailable} />
          <ToolbarButton icon={Redo2} title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!redoAvailable} />
        </div>

        {appRunning || isExecuting ? (
          <Button
            variant="danger"
            className="h-9 shrink-0 flex items-center gap-2"
            onClick={() => { void stopApplication(); }}
            title="Stop the tool: its clocks, and the run in flight"
          >
            <Square size={13} strokeWidth={2.5} aria-hidden="true" />
            Stop
          </Button>
        ) : (
          <Button
            variant="primary"
            className="h-9 shrink-0 flex items-center gap-2"
            onClick={handleRun}
            title={opensTab
              ? 'Run the tool: it opens as whoever gets it uses it -- its GUI, or a call to each start point a call starts -- and the graph runs when it is used'
              : 'Run the tool: what starts the graph starts it -- its start points that start themselves, or, with none, the whole graph once'}
          >
            <Play size={13} strokeWidth={2.5} aria-hidden="true" />
            Run
          </Button>
        )}

        {/* Front to back through the graph: each node is generated against what
            the node before it turned out to return, so only the first one is
            written against a description rather than against data. */}
        <ToolbarButton
          icon={sweep.busy ? Square : Wand2}
          label={sweep.busy ? 'Stop' : 'Generate all'}
          title={sweep.busy
            ? 'Stop after the node in flight'
            : 'Write every empty node, in the order the graph runs'}
          onClick={sweep.busy ? sweep.stop : sweep.run}
          framed
        />

        <ToolbarButton
          icon={BookOpen}
          label="Help"
          title="Help: getting started, and the user guide"
          onClick={onOpenHelp}
        />

        {/* The gear alone: its title names what is inside, and an API key lives
            here, under "Keys". */}
        <ToolbarButton
          icon={Settings}
          title="Settings: the AI that generates, tests and runs, its API keys and server addresses"
          onClick={onOpenSettings}
          framed
        />
      </header>

      <RequirementsDialog
        requirements={delivered.requirements}
        onSubmit={delivered.submit}
        onCancel={delivered.cancel}
      />

      {/* Describe-a-graph dialog */}
      {showDescribe && (
        <Modal
          title="✨ Describe a graph"
          onClose={handleCloseDescribe}
          maxWidth="max-w-2xl"
          dismissOnBackdrop={!asking}
          dismissOnEscape={!asking}
          footer={
            <>
              <Button onClick={handleCloseDescribe}>Cancel</Button>
              {ask.phase === 'ready' ? (
                <Button variant="primary" onClick={() => { void handleLoadDescribed(); }}>Load graph</Button>
              ) : (
                <Button variant="primary" onClick={() => { void send(description, description); }} disabled={asking || !description.trim()}>
                  {asking ? '⏳ Generating…' : 'Generate'}
                </Button>
              )}
            </>
          }
        >
          <div className="p-5 flex flex-col gap-3">
            <label htmlFor={describeId} className="text-xs font-medium" style={{ color: MUTED }}>
              Describe the graph you want
            </label>
            <textarea
              id={describeId}
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg p-3 text-sm resize-y outline-none"
              style={{ ...FIELD, minHeight: 100 }}
              placeholder="e.g. Read a text file, summarize it with AI, and show the result on a GUI."
              disabled={asking}
            />
            <p className="text-xs" style={{ color: DIM }}>
              To change the graph that is open instead, say it in the bar under the canvas.
            </p>

            {(ask.phase === 'asking' || (ask.phase === 'failed' && ask.calls.length > 0)) && (
              <div className="mt-3">
                <LiveGeneration calls={ask.calls} minHeight={140} />
              </div>
            )}
            {ask.phase === 'failed' && (
              <div className="text-xs px-3 py-2 rounded" style={{ background: DANGER_FILL, color: DANGER_TEXT }}>
                ❌ {ask.error}
              </div>
            )}

            {ask.phase === 'ready' && (
              <div className="text-xs px-3 py-2 rounded" style={{ background: ACCENT_FILL, color: ACCENT_TEXT }}>
                {ask.explanation || 'Graph generated.'} ({ask.graph.nodes.length} node{ask.graph.nodes.length === 1 ? '' : 's'},{' '}
                {ask.graph.edges.length} wire{ask.graph.edges.length === 1 ? '' : 's'})
              </div>
            )}
            {ask.phase === 'ready' && <GraphProblems graph={ask.graph} />}
          </div>
        </Modal>
      )}
    </>
  );
}
