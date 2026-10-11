import { useEffect, useRef, useState } from 'react';
import {
  addWindow, moveWindow, patchWindow, removeWindow,
} from '../../../gui/editor/windows/edit.ts';
import { windowContext, windowProblems, windowRows, type Window, type Windows } from '../../../gui/editor/windows/windows.ts';
import type { PageWindow } from '../../deployment/windows/windowsInUse';
import type { Decoration } from '../../deployment/windows/WindowsSurface';
import LiveWindows from '../../deployment/windows/LiveWindows';
import RequirementsDialog from '../../deployment/gui/kit/dialogs/RequirementsDialog';
import { GUI_GAP, GUI_MAX_CELL } from '../../deployment/gui/kit/layout';
import { roundGoing, stopRound, useSession } from '../../deployment/gui/kit/api/session';
import Button from '../../deployment/gui/kit/ui/Button';
import {
  ACCENT, ACCENT_FILL, ACCENT_TEXT, DIMMER, FIELD, LINE, MUTED, ON_ACCENT, SURFACE, SUNKEN, TEXT, WARNING_FILL, WARNING_TEXT,
} from '../../deployment/gui/kit/ui/theme';
import CellList, { numbering, type Hot } from './CellList';
import { useNotebook } from './notebookStore';
import { useNotebookRun } from './useNotebookRun';

/** The largest a cell is drawn when a window is fitted to its pane: more than a tool's own, to be read at a glance. */
const FIT_CELL = 84;

/** The page of windows and, when one is chosen, that window beside its cells. */
export default function Workspace({ doc }: { doc: Windows }) {
  const selected = useNotebook((s) => s.selected);
  const run = useNotebookRun(doc);
  const window = doc.windows.find((one) => one.id === selected);
  return (
    <>
      {window
        ? <SplitView doc={doc} window={window} run={run} />
        : <PageView doc={doc} run={run} />}
      <RequirementsDialog requirements={run.round.requirements} onSubmit={run.round.submit} onCancel={run.round.cancel} />
    </>
  );
}

type Run = ReturnType<typeof useNotebookRun>;

// ---- the page ----------------------------------------------------------------------------------------

function PageView({ doc, run }: { doc: Windows; run: Run }) {
  const edit = useNotebook((s) => s.edit);
  const select = useNotebook((s) => s.select);
  const describe = useNotebook((s) => s.describe);
  const busy = useNotebook((s) => s.busy);
  const [change, setChange] = useState('');
  const making = busy === 'describing';

  const problems = windowProblems(doc);
  const mine = (id: string): string[] => problems.filter((one) => one.where === `window "${id}"`).map((one) => one.problem);
  const decorate: Decoration = {
    window: (window: PageWindow) => ({
      children: (
        <div style={{ position: 'absolute', top: 8, right: 112, zIndex: 3 }} className="flex items-center gap-2">
          {mine(window.id).length > 0 && (
            <Button size="sm" variant="quiet" title={mine(window.id).join('\n')} onClick={() => select(window.id)}>
              <span style={{ color: WARNING_TEXT }}>⚠ {mine(window.id).length} to fix</span>
            </Button>
          )}
          <Button size="sm" aria-label={`Edit ${window.title}`} title="Open this window beside its cells" onClick={() => select(window.id)}>
            ✎ Edit
          </Button>
        </div>
      ),
    }),
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-8 pt-4 pb-1 flex items-center gap-2 flex-wrap" style={{ borderBottom: `1px solid ${LINE}` }}>
        <input
          aria-label="Ask for a change to the page"
          value={change}
          disabled={making}
          placeholder="Ask for a change to the page, e.g. “add a window that translates the summary into French”"
          onChange={(event) => setChange(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && change.trim() && !making) void describe(change.trim()).then((ok) => { if (ok) setChange(''); }); }}
          className="flex-1 min-w-[260px] rounded-lg px-3 py-1.5 text-sm"
          style={FIELD}
        />
        <Button variant="secondary" size="sm" disabled={!change.trim() || making} onClick={() => { void describe(change.trim()).then((ok) => { if (ok) setChange(''); }); }}>
          {making ? 'Working…' : '✨ Change'}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => edit((d) => addWindow(d))}>+ New window</Button>
        <span className="pb-1" />
      </div>
      <LiveWindows design={run.design} onEvent={run.fire} decorate={decorate} />
      {doc.windows.length === 0 && (
        <p className="px-8 text-sm" style={{ color: MUTED }}>The page is empty. Add a window, or ask for one above.</p>
      )}
    </div>
  );
}

// ---- one window beside its cells ---------------------------------------------------------------------

function SplitView({ doc, window, run }: { doc: Windows; window: Window; run: Run }) {
  const edit = useNotebook((s) => s.edit);
  const select = useNotebook((s) => s.select);
  const [hot, setHot] = useState<Hot>(null);
  // As large as the pane lets it be, or at the size a delivered tool draws it.
  const [fit, setFit] = useState(true);
  const left = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ width: 560, height: 640 });
  const going = useSession(roundGoing);
  const problems = windowProblems(doc).filter((problem) => problem.where === `window "${window.id}"`);
  const numbers = numbering(window);
  const index = doc.windows.findIndex((one) => one.id === window.id);

  useEffect(() => {
    const node = left.current;
    if (!node) return;
    const measure = () => setRoom({ width: node.clientWidth, height: node.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // The cell it is drawn at: the product's, or -- fitted -- as large as the pane lets the whole window be, across and down.
  const rows = windowRows(window);
  const across = Math.floor((Math.max(120, room.width - 64) + GUI_GAP) / window.span - GUI_GAP);
  const down = Math.floor((Math.max(160, room.height - 150) - 28 + GUI_GAP) / rows - GUI_GAP);
  const cell = Math.max(16, Math.min(fit ? FIT_CELL : GUI_MAX_CELL, across, fit ? down : Infinity));

  const jump = (key: string) => {
    const row = document.getElementById(`cell-${key}`);
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    (row?.querySelector('input, textarea, select') as HTMLElement | null)?.focus();
  };

  const decorate: Decoration = {
    block: (block) => {
      const number = numbers.get(block.id);
      const isRun = block.id === `${window.id}_run`;
      const key = number !== undefined || isRun ? block.id : null;
      if (!key) return undefined;
      const lit = hot === key;
      return {
        frame: {
          onMouseEnter: () => setHot(key),
          onMouseLeave: () => setHot(null),
        },
        children: (
          <>
            {/* An overlay, not a style on the block: what the frame carries replaces the block's own style, its place on the grid. */}
            {lit && <span aria-hidden className="absolute inset-0 rounded-xl pointer-events-none" style={{ border: `2px solid ${ACCENT}`, zIndex: 2 }} />}
            <button
            type="button"
            aria-label={isRun ? 'Starts when' : `Element ${number}`}
            title="Show its cell"
            onClick={() => jump(key)}
            className="absolute flex items-center justify-center rounded-full text-[11px] font-semibold"
            style={{ top: 4, right: 4, minWidth: 18, height: 18, padding: '0 5px', zIndex: 3, background: lit ? ACCENT : ACCENT_FILL, color: lit ? ON_ACCENT : ACCENT_TEXT }}
          >
              {isRun ? '▶' : number}
            </button>
          </>
        ),
      };
    },
  };

  const shift = (by: -1 | 1) => edit((d) => moveWindow(d, window.id, by));

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-6 py-2 flex items-center gap-3 flex-wrap" style={{ borderBottom: `1px solid ${LINE}`, background: SURFACE }}>
        <Button size="sm" variant="quiet" onClick={() => select(null)} title="Back to the whole page">← Page</Button>
        <input
          aria-label="Window title" value={window.title} style={{ ...FIELD, borderRadius: 8, padding: '4px 10px', fontSize: 14, fontWeight: 600, width: 220 }}
          onChange={(event) => edit((d) => patchWindow(d, window.id, { title: event.target.value }), 'window-title')}
        />
        <label className="flex items-center gap-2 text-xs" style={{ color: MUTED }}>
          Width
          <input
            aria-label="Window width in cells" type="range" min={4} max={16} value={window.span}
            onChange={(event) => edit((d) => patchWindow(d, window.id, { span: Number(event.target.value) }), 'window-span')}
          />
          <span className="tabular-nums" style={{ color: TEXT }}>{window.span} of 16 cells · {windowRows(window)} rows</span>
        </label>
        <span className="flex-1" />
        <Button size="sm" variant="quiet" disabled={index <= 0} onClick={() => shift(-1)} title="Earlier on the page">◀</Button>
        <Button size="sm" variant="quiet" disabled={index >= doc.windows.length - 1} onClick={() => shift(1)} title="Later on the page">▶</Button>
        <Button
          size="sm" variant="danger"
          onClick={() => { select(null); edit((d) => removeWindow(d, window.id)); }}
          title="Remove this window from the page"
        >
          Remove window
        </Button>
      </div>

      <div className="flex-1 min-h-0 flex">
        <div ref={left} className="min-w-0 overflow-auto flex flex-col" style={{ flex: '1 1 0', background: SUNKEN }} data-pane="interface">
          <div className="px-8 pt-3 flex items-center gap-3">
            <span className="text-[11px] uppercase tracking-wider" style={{ color: DIMMER }}>The window, as it will be used</span>
            <span className="flex-1" />
            <Button size="sm" variant={fit ? 'primary' : 'quiet'} aria-pressed={fit} onClick={() => setFit(true)} title="As large as this pane allows">Fit</Button>
            <Button size="sm" variant={fit ? 'quiet' : 'primary'} aria-pressed={!fit} onClick={() => setFit(false)} title="The size a delivered tool draws it at">Real size</Button>
          </div>
          <LiveWindows design={run.design} onEvent={run.fire} cell={cell} only={window.id} decorate={decorate} />
          {going && (
            <div className="px-8 pb-4">
              <Button size="sm" onClick={() => { void stopRound(); }}>■ Stop</Button>
            </div>
          )}
          <AiContext text={windowContext(doc, window.id)} />
        </div>
        <div style={{ width: 1, background: LINE }} aria-hidden />
        <div className="min-w-0 overflow-auto px-6 py-4" style={{ flex: '1 1 0' }} data-pane="cells">
          {problems.length > 0 && (
            <ul className="mb-4 rounded-lg px-4 py-3 text-xs flex flex-col gap-1" style={{ background: WARNING_FILL, color: WARNING_TEXT }}>
              {problems.map((problem) => <li key={problem.problem}>{problem.problem} <span style={{ opacity: 0.8 }}>{problem.fix}</span></li>)}
            </ul>
          )}
          <CellList doc={doc} window={window} hot={hot} onHot={setHot} onChange={edit} />
        </div>
      </div>
    </div>
  );
}

/** What a model is told about this window (room, outputs, the other windows): shown, since it is part of what the tool is. */
function AiContext({ text }: { text: string }) {
  return (
    <details className="mx-8 mb-6 text-xs" style={{ color: MUTED }}>
      <summary className="cursor-pointer select-none" style={{ color: ACCENT_TEXT }}>What the AI is told about this window</summary>
      <pre className="mt-2 whitespace-pre-wrap rounded-lg px-3 py-2" style={{ background: SURFACE, border: `1px solid ${LINE}`, color: TEXT, fontFamily: 'inherit' }}>{text}</pre>
    </details>
  );
}
