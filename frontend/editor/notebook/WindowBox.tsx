// A window on the page, to be used: its inputs, a button, and what came out -- at the size its elements give it.
//
// It never grows. An output has the height of its rows whatever arrives in it; a message about a run that came to
// nothing stands in the first output's place, not under it.

import { NO_CHAT, chatsOf, numbering, inBlock, outEnd, startValue } from './values';
import { runWindow, stopRuns } from './runs';
import { useNotebook } from './store';
import { chipClass, STATE_WORDS, windowState } from './status';
import { ChatBox, Input, Output } from './Widgets';
import { chatValue } from '../../../gui/widgets/chat/value.ts';
import type { Window } from '../../../gui/editor/windows/windows.ts';

/** The share of a line an element takes, as a flex basis that leaves room for the gap between elements. */
const basis = (share: number | undefined): React.CSSProperties => {
  const part = Math.min(1, Math.max(0.1, share ?? 1));
  return { flex: `${part >= 1 ? 1 : 0} 1 calc(${(part * 100).toFixed(2)}% - 10px)`, maxWidth: '100%' };
};

/** A change of an input starts a window that says so, once the typing has paused. */
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export default function WindowBox({ window, writing }: { window: Window; writing: boolean }) {
  const state = useNotebook((s) => windowState(s, window.id));
  const values = useNotebook((s) => s.values);
  const result = useNotebook((s) => s.results[window.id]);
  const hot = useNotebook((s) => s.hot);
  const titles = useNotebook((s) => s.doc?.windows);
  const open = useNotebook((s) => s.window === window.id);
  const going = useNotebook((s) => s.going.length > 0);
  const { setValue, show, edit } = useNotebook.getState();
  const numbers = writing && open ? numbering(window) : null;
  const trigger = window.trigger ?? {};
  const failed = result && (result.outcome === 'failed' || result.outcome === 'empty') ? result : undefined;

  const set = (blockId: string, value: unknown): void => {
    setValue(blockId, value);
    if (trigger.onChange) {
      clearTimeout(timers.get(window.id));
      timers.set(window.id, setTimeout(() => { void runWindow(window.id); }, 600));
    }
  };
  /** Say something in a chat: it stands in hand, with what was said before it, and is answered by a round of the window. */
  const send = (blockId: string, text: string): void => {
    const said = chatValue(useNotebook.getState().values[blockId]).messages;
    useNotebook.setState((state) => ({ values: { ...state.values, [blockId]: { messages: said, pending: text } } }));
    void runWindow(window.id);
  };
  const mark = (blockId: string) => (numbers?.has(blockId)
    ? <button type="button" className="nb-mark" title="Show its cell" onClick={() => document.getElementById(`cell-${blockId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })}>{numbers.get(blockId)}</button>
    : null);
  const lit = (blockId: string): string => (hot === blockId ? ' lit' : '');
  const pointing = (blockId: string) => (numbers ? { onMouseEnter: () => show({ hot: blockId }), onMouseLeave: () => show({ hot: null }) } : {});

  return (
    <section className={`nb-win${open ? ' open' : ''}`} aria-label={window.title} data-window={window.id}>
      <div className="nb-win-head">
        {writing
          ? <input className="nb-name nb-win-title" aria-label="Window title" value={window.title} onChange={(event) => edit((doc) => ({ ...doc, windows: doc.windows.map((one) => (one.id === window.id ? { ...one, title: event.target.value } : one)) }), `title-${window.id}`)} />
          : <h3>{window.title}</h3>}
        <span className={`nb-chip ${chipClass(state)}`} role="status">{STATE_WORDS[state]}</span>
        {writing && (
          <button className="nb-btn small" aria-pressed={open} onClick={() => {
              show(open ? { window: null, dockOpen: false } : { window: window.id, tab: 'cells', dockOpen: true });
              // The dock takes room from the page: the window stays in sight above it.
              setTimeout(() => document.querySelector(`[data-window="${window.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
            }} title="Open the cells of this window under the page">
            {open ? 'Close cells' : 'Cells'}
          </button>
        )}
      </div>

      {window.inputs.length > 0 && (
        <div className="nb-inputs">
          {window.inputs.map((one) => {
            const id = inBlock(window, one);
            return (
              <div key={id} className={`nb-field${lit(id)}`} style={basis(one.width)} {...pointing(id)}>
                <label htmlFor={`in-${one.name}`}>{one.kind === 'from' ? 'Takes' : one.name}</label>
                <Input one={one} fromTitle={titles?.find((other) => other.id === one.from?.window)?.title} value={id in values ? values[id] : startValue(one)} onChange={(value) => set(id, value)} onRun={() => { void runWindow(window.id); }} />
                {mark(id)}
              </div>
            );
          })}
        </div>
      )}

      {trigger.button !== false && !chatsOf(window).length && (
        <div className="nb-run" {...pointing(`${window.id}_run`)}>
          {state === 'running' || state === 'waiting'
            ? <button className="nb-btn" onClick={() => { void stopRuns(); }}>■ Stop</button>
            : <button className="nb-btn primary" disabled={going} onClick={() => { void runWindow(window.id); }}>{trigger.label?.trim() || 'Run'}</button>}
        </div>
      )}

      {window.outputs.length > 0 && (
        <div className="nb-outputs">
          {window.outputs.map((out, at) => {
            const id = outEnd(window, out);
            const shown = result?.shown[id];
            const height = Math.max(1, out.rows) * 30 + 12;
            return (
              <div key={id} className={`nb-field${lit(id)}`} style={basis(out.width)} {...pointing(id)}>
                <span className="nb-label">{out.name}</span>
                {out.kind === 'chat'
                  ? (
                    <>
                      <ChatBox value={values[id] ?? NO_CHAT} rows={out.rows} busy={state === 'running' || state === 'waiting'} error={failed?.message} onSend={(text) => send(id, text)} />
                      {failed && <div className={`nb-out msg ${failed.outcome}`} style={{ marginTop: 6 }}>{failed.message}</div>}
                    </>
                  )
                  : failed && at === 0 && shown === undefined
                  ? (
                    <div className={`nb-out msg ${failed.outcome}`} style={{ height }}>
                      <div>{failed.message}</div>
                      {writing && <button type="button" className="nb-link" onClick={() => show({ tab: 'debug', dockOpen: true, window: window.id })}>Show it in Debug</button>}
                    </div>
                  )
                  : <Output kind={out.kind} value={shown} rows={out.rows} />}
                {mark(id)}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
