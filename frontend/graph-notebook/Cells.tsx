// The cells of a window, as the design of the list (A2) has them: Ask, Do, Show, one white card each, a sentence in each.
//
// This is where a window is built. What it asks of the person is the first card, what is done is a card for each step, and
// what comes out is a card for each output. A step takes what its sentence points at with `@Name`, and the chips say so; the
// wires of the graph are these chips, and nothing else is drawn.

import { useLayoutEffect, useRef, useState } from 'react';
import {
  addInput, addOutput, addStep, kindOfOutput, moveCell, patchInput, patchOutput, patchStep, patchWindow, removeCell, renameInput, renameStep, setHow,
  type CellRef,
} from '../../gui/notebook/edit.ts';
import {
  SIZES, idOf, mentions, resultsOf, taken, windowProblems,
  type InKind, type OutKind, type Window, type WindowIn, type WindowOut, type Windows,
} from '../../gui/notebook/windows.ts';
import { chipClass, STATE_WORDS, stepStatus, windowState } from '../notebook/document/status';
import { runWindow } from '../notebook/document/runs';
import { useNotebook } from '../notebook/document/store';
import { inBlock, outEnd, spoken, tag } from '../notebook/document/values';
import { Output } from '../notebook/elements/Widgets';
import Browse from '../notebook/elements/Browse';

const IN_KINDS: [InKind, string][] = [['text', 'Text'], ['file', 'File'], ['folder', 'Folder'], ['number', 'Number'], ['choice', 'Choice'], ['from', 'From window']];
const OUT_KINDS: [OutKind, string][] = [['text', 'Text'], ['list', 'List'], ['table', 'Table'], ['chart', 'Chart'], ['image', 'Image'], ['chat', 'Chat']];
const SHARES: [string, number][] = [['¼', 0.25], ['⅓', 1 / 3], ['½', 0.5], ['⅔', 2 / 3], ['¾', 0.75], ['Full', 1]];
const KIND_WORD: Record<OutKind, string> = { text: 'text', list: 'a list', table: 'a table', chart: 'a chart', image: 'an image', chat: 'a chat' };

type Change = (change: (doc: Windows) => Windows, name?: string) => void;

const Play = () => <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5 L19 12 L7 19.5 Z" fill="currentColor" /></svg>;

/** A sentence, as tall as it is. */
function Sentence({ value, label, readOnly, onChange }: { value: string; label: string; readOnly?: boolean; onChange?: (value: string) => void }) {
  const box = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);
  return <textarea ref={box} rows={1} className="nb-sentence" aria-label={label} value={value} readOnly={readOnly} onChange={(event) => onChange?.(event.target.value)} />;
}

function Seg<T extends string | number>({ label, value, options, onPick }: { label: string; value: T | undefined; options: [string, T][]; onPick: (value: T) => void }) {
  return (
    <div className="nb-mini" role="group" aria-label={label}>
      {options.map(([text, option]) => {
        const on = typeof option === 'number' && typeof value === 'number' ? Math.abs(option - value) < 0.02 : option === value;
        return <button key={String(option)} type="button" aria-pressed={on} onClick={() => onPick(option)}>{text}</button>;
      })}
    </div>
  );
}

function Stepper({ label, value, min = 1, max = 9, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (value: number) => void }) {
  return (
    <div className="nb-mini" role="group" aria-label={label}>
      <button type="button" aria-label={`${label}: fewer`} disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <span>{value}</span>
      <button type="button" aria-label={`${label}: more`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

function Tools({ first, last, onUp, onDown, onRemove }: { first: boolean; last: boolean; onUp: () => void; onDown: () => void; onRemove: () => void }) {
  return (
    <div className="nb-cell-tools">
      <button aria-label="Move up" title="Move up" disabled={first} onClick={onUp}>▲</button>
      <button aria-label="Move down" title="Move down" disabled={last} onClick={onDown}>▼</button>
      <button aria-label="Remove" title="Remove" onClick={onRemove}>✕</button>
    </div>
  );
}

const Pill = ({ children, bad }: { children: React.ReactNode; bad?: boolean }) => <span className={`nb-pill${bad ? ' bad' : ''}`}>{children}</span>;

export default function Cells({ doc, window }: { doc: Windows; window: Window }) {
  const id = window.id;
  const edit: Change = useNotebook.getState().edit;
  const hot = useNotebook((s) => s.hot);
  const state = useNotebook((s) => windowState(s, id));
  const results = useNotebook((s) => s.results[id]);
  const stepWords = useNotebook((s) => window.steps.map((_, at) => stepStatus(s, window, at)));
  const busy = useNotebook((s) => s.busy);
  const [wish, setWish] = useState('');
  const problems = windowProblems(doc).filter((one) => one.where === `window "${id}"`);
  const lastOf = (list: 'inputs' | 'steps' | 'outputs') => window[list].length - 1;
  const move = (ref: CellRef, by: -1 | 1) => edit((one) => moveCell(one, id, ref, by));
  const remove = (ref: CellRef) => edit((one) => removeCell(one, id, ref));
  const pointAt = (key: string | null) => useNotebook.getState().show({ hot: key });
  const names = window.inputs.map((one) => one.name);
  const trigger = window.trigger ?? {};
  const talks = window.outputs.some((one) => one.kind === 'chat');
  const askedFor = window.ask ?? `Ask for ${names.length ? names.join(', ').replace(/, ([^,]*)$/, ' and $1') : talks ? 'what is said in the chat' : 'nothing'}.`;
  const results$ = window.steps.flatMap((step) => resultsOf(step));
  const hasFolder = window.inputs.some((one) => one.kind === 'folder');
  const others = doc.windows.filter((one) => one.id !== id && one.outputs.length > 0);

  return (
    <div className="nb-narrow">
      {problems.length > 0 && (
        <ul className="nb-problems" role="alert">{problems.map((one) => <li key={one.problem}>{one.problem} <span style={{ opacity: 0.8 }}>{one.fix}</span></li>)}</ul>
      )}
      <p className="nb-lead">From top to bottom, this is how the window runs. Every cell is a sentence, and under the page its result stands.</p>

      {/* ---- Ask ---- */}
      <article className="nb-cell" aria-label="Ask">
        <div className="nb-cell-head">
          <span className="nb-tag ask">Ask</span>
          <span className={`nb-status ${chipClass(state)}`}>{STATE_WORDS[state]}</span>
          <button className="nb-play" aria-label="Run this window" title="Run this window" disabled={state === 'running' || state === 'waiting'} onClick={() => { void runWindow(id); }}><Play /></button>
        </div>
        <Sentence label="What the window asks" value={askedFor} onChange={(ask) => edit((one) => patchWindow(one, id, { ask }), `ask-${id}`)} />
        <div className="nb-chips">
          <Pill>gives: {names.map((name, at) => <b key={name + at}>{at ? ', ' : ''}{name}</b>)}</Pill>
          <span className="nb-sp" />
          <span className="nb-note" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Window width
            <Seg label="Window width" value={window.span} options={[['¼', 4], ['½', 8], ['¾', 12], ['Full', 16]]} onPick={(span) => edit((d) => patchWindow(d, id, { span }))} />
          </span>
        </div>
        <div className="nb-form">
          {window.inputs.map((one, at) => {
            const key = inBlock(window, one);
            return (
              <InputRow
                key={at} cellKey={key} one={one} others={others} lit={hot === key} first={at === 0} last={at === lastOf('inputs')} point={pointAt}
                onName={(name) => edit((d) => renameInput(d, id, at, name), `in-name-${at}`)}
                onPatch={(patch, name) => edit((d) => patchInput(d, id, at, patch), name && `${name}-${at}`)}
                onUp={() => move({ list: 'inputs', at }, -1)} onDown={() => move({ list: 'inputs', at }, 1)} onRemove={() => remove({ list: 'inputs', at })}
              />
            );
          })}
          <div className="nb-chips">
            {IN_KINDS.filter(([kind]) => kind !== 'from' || others.length > 0).map(([kind, label]) => (
              <button key={kind} className="nb-btn small" onClick={() => edit((d) => addInput(d, id, kind))}>+ {label}</button>
            ))}
          </div>
        </div>
        <div className={`nb-chips${hot === `${id}_run` ? ' lit' : ''}`} id={`cell-${id}_run`} onMouseEnter={() => pointAt(`${id}_run`)} onMouseLeave={() => pointAt(null)}>
          <span className="nb-label">Starts when</span>
          <label className="nb-pill" style={{ borderStyle: 'solid' }}>
            <input type="checkbox" checked={trigger.button !== false} onChange={(event) => edit((d) => patchWindow(d, id, { trigger: { ...trigger, button: event.target.checked } }))} />
            a button
            {trigger.button !== false && <input aria-label="Button words" placeholder="Run" value={trigger.label ?? ''} onChange={(event) => edit((d) => patchWindow(d, id, { trigger: { ...trigger, label: event.target.value } }), `label-${id}`)} style={{ width: 90 }} />}
          </label>
          <label className="nb-pill" style={{ borderStyle: 'solid' }}>
            <input type="checkbox" checked={trigger.onChange === true} onChange={(event) => edit((d) => patchWindow(d, id, { trigger: { ...trigger, onChange: event.target.checked } }))} />
            a change of an input <span>(costs a model call each time)</span>
          </label>
          {trigger.button === false && !trigger.onChange && <span className="nb-status failed" style={{ marginLeft: 0 }}>Nothing starts this window yet.</span>}
        </div>
      </article>

      {/* ---- Do ---- */}
      {window.steps.map((step, at) => {
        const available = [...names, ...window.steps.slice(0, at).flatMap((one) => resultsOf(one))];
        const known = new Set(available.map(idOf));
        const said = mentions(step.sentence);
        const takes = taken(window, at);
        const status = stepWords[at];
        return (
          <div key={at}>
            <div className="nb-join" aria-hidden />
            <StepCell
              window={window} at={at} status={status} takes={takes.map((one) => one.name)} bad={said.filter((one) => !known.has(idOf(one.name))).map((one) => one.name)}
              available={available} hasFolder={hasFolder} first={at === 0} last={at === lastOf('steps')}
              onUp={() => move({ list: 'steps', at }, -1)} onDown={() => move({ list: 'steps', at }, 1)} onRemove={() => remove({ list: 'steps', at })}
              onName={(name) => edit((d) => renameStep(d, id, at, name), `step-name-${at}`)}
              onSentence={(sentence) => edit((d) => patchStep(d, id, at, { sentence }), `step-${at}`)}
              onCode={(code) => edit((d) => patchStep(d, id, at, { code }), `code-${at}`)}
              onHow={(how) => edit((d) => setHow(d, id, at, how))}
              onEach={(each) => edit((d) => patchStep(d, id, at, { each }))}
            />
          </div>
        );
      })}

      {/* ---- Show ---- */}
      {window.outputs.map((out, at) => {
        const key = outEnd(window, out);
        const shown = results?.shown[key];
        return (
          <div key={at}>
            <div className="nb-join" aria-hidden />
            <ShowCell
              cellKey={key} window={window} out={out} shown={shown} results={results$} lit={hot === key} first={at === 0} last={at === lastOf('outputs')} point={pointAt}
              onUp={() => move({ list: 'outputs', at }, -1)} onDown={() => move({ list: 'outputs', at }, 1)} onRemove={() => remove({ list: 'outputs', at })}
              onPatch={(patch, name) => edit((d) => patchOutput(d, id, at, patch), name && `${name}-${at}`)}
              onKind={(kind) => edit((d) => kindOfOutput(d, id, at, kind))}
            />
          </div>
        );
      })}

      <div className="nb-addrow">
        <span className="nb-note">Add a cell</span>
        <button className="nb-btn" style={{ color: 'var(--blue)' }} onClick={() => edit((d) => addInput(d, id, 'text'))}>+ Ask</button>
        <button className="nb-btn" style={{ color: 'var(--purple)' }} onClick={() => edit((d) => addStep(d, id))}>+ Do</button>
        <button className="nb-btn" style={{ color: 'var(--purple)' }} title="A small program does this one: counting, parsing a table, making a figure" onClick={() => edit((d) => addStep(d, id, 'code'))}>+ Do with code</button>
        <button className="nb-btn" style={{ color: 'var(--green)' }} onClick={() => edit((d) => addOutput(d, id, 'text'))}>+ Show</button>
      </div>

      <form className="nb-ai" onSubmit={(event) => { event.preventDefault(); if (wish.trim()) void useNotebook.getState().describe(wish.trim()).then((ok) => { if (ok) setWish(''); }); }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 L13.8 9.2 L20 11 L13.8 12.8 L12 19 L10.2 12.8 L4 11 L10.2 9.2 Z" stroke="var(--purple)" strokeWidth="1.8" strokeLinejoin="round" /></svg>
        <input aria-label="Say what should change" placeholder="Say what should change. For example: let the language be chosen." value={wish} disabled={busy === 'describing'} onChange={(event) => setWish(event.target.value)} />
        <button type="submit" disabled={!wish.trim() || busy === 'describing'}>{busy === 'describing' ? 'Working…' : 'Change'}</button>
      </form>
    </div>
  );
}

// ---- the fields of Ask ----------------------------------------------------------------------------------

function PathSetting({ kind, value, extensions, onChange }: { kind: 'file' | 'folder'; value: string; extensions?: string; onChange: (path: string) => void }) {
  const [browsing, setBrowsing] = useState(false);
  return (
    <>
      <input aria-label="Starts at" placeholder="(none)" value={value} onChange={(event) => onChange(event.target.value)} />
      <button type="button" className="nb-btn small" onClick={() => setBrowsing(true)}>Browse…</button>
      {browsing && <Browse mode={kind} title={kind === 'file' ? 'Starts at this file' : 'Starts at this folder'} start={value} extensions={extensions} onPick={(path) => { onChange(path); setBrowsing(false); }} onClose={() => setBrowsing(false)} />}
    </>
  );
}

/** The choices as typed: a new line stays while it is typed into, and only the lines with words in them are the choices. */
function Choices({ options, onChange }: { options: string[]; onChange: (options: string[]) => void }) {
  const lines = (text: string): string[] => text.split('\n').filter((line) => line.trim());
  const [raw, setRaw] = useState(options.join('\n'));
  // Changed from elsewhere (undo): what is shown follows.
  if (lines(raw).join('\n') !== options.join('\n')) setRaw(options.join('\n'));
  return <textarea aria-label="Choices" rows={2} value={raw} onChange={(event) => { setRaw(event.target.value); onChange(lines(event.target.value)); }} />;
}

function InputRow({ cellKey, one, others, lit, first, last, point, onName, onPatch, onUp, onDown, onRemove }: {
  cellKey: string; one: WindowIn; others: Window[]; lit: boolean; first: boolean; last: boolean;
  point: (key: string | null) => void;
  onName: (name: string) => void; onPatch: (patch: Partial<WindowIn>, name?: string) => void;
  onUp: () => void; onDown: () => void; onRemove: () => void;
}) {
  const source = others.find((other) => other.id === one.from?.window);
  return (
    <div className={`nb-row${lit ? ' lit' : ''}`} id={`cell-${cellKey}`} onMouseEnter={() => point(cellKey)} onMouseLeave={() => point(null)}>
      <label className="grow">Name<input aria-label="Name" value={one.name} onChange={(event) => onName(event.target.value)} /></label>
      <label>Kind
        <select
          aria-label="Kind" value={one.kind}
          onChange={(event) => {
            const kind = event.target.value as InKind;
            onPatch({
              kind, value: undefined, from: kind === 'from' ? { window: others[0]?.id ?? '', output: others[0]?.outputs[0]?.name ?? '' } : undefined,
              ...(kind === 'choice' ? { options: one.options ?? ['short', 'long'] } : {}),
              ...(kind === 'number' ? { min: one.min ?? 1, max: one.max ?? 100, step: one.step ?? 1 } : {}),
            });
          }}
        >
          {IN_KINDS.filter(([kind]) => kind !== 'from' || others.length > 0 || one.kind === 'from').map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
        </select>
      </label>
      {one.kind === 'text' && <label className="grow">Starts with<input aria-label="Starts with" value={String(one.value ?? '')} onChange={(event) => onPatch({ value: event.target.value }, 'value')} /></label>}
      {one.kind === 'choice' && (
        <label className="grow">Choices, one a line (the first is where it starts)
          <Choices options={one.options ?? []} onChange={(options) => onPatch({ options, value: undefined }, 'options')} />
        </label>
      )}
      {one.kind === 'number' && (['min', 'max', 'step'] as const).map((part) => (
        <label key={part} style={{ width: 70 }}>{part}<input aria-label={part} type="number" value={one[part] ?? ''} onChange={(event) => onPatch({ [part]: event.target.value === '' ? undefined : Number(event.target.value) }, part)} /></label>
      ))}
      {one.kind === 'number' && <label style={{ width: 80 }}>starts at<input aria-label="starts at" type="number" value={one.value ?? ''} onChange={(event) => onPatch({ value: event.target.value === '' ? undefined : Number(event.target.value) }, 'start')} /></label>}
      {(one.kind === 'file' || one.kind === 'folder') && (
        <>
          <label style={{ width: 130 }}>Only these types<input aria-label="File types" placeholder=".txt, .md" value={one.extensions ?? ''} onChange={(event) => onPatch({ extensions: event.target.value }, 'extensions')} /></label>
          <label className="grow">Starts at<span style={{ display: 'flex', gap: 6 }}><PathSetting kind={one.kind} extensions={one.extensions} value={String(one.value ?? '')} onChange={(path) => onPatch({ value: path }, 'start-path')} /></span></label>
        </>
      )}
      {one.kind === 'from' && (
        <>
          <label>Window
            <select aria-label="From window" value={one.from?.window ?? ''} onChange={(event) => onPatch({ from: { window: event.target.value, output: others.find((other) => other.id === event.target.value)?.outputs[0]?.name ?? '' } })}>
              {others.map((other) => <option key={other.id} value={other.id}>{other.title}</option>)}
            </select>
          </label>
          <label>Output
            <select aria-label="From output" value={one.from?.output ?? ''} onChange={(event) => onPatch({ from: { window: one.from?.window ?? '', output: event.target.value } })}>
              {(source?.outputs ?? []).map((out) => <option key={out.name} value={out.name}>{out.name}</option>)}
            </select>
          </label>
        </>
      )}
      <Seg label="Width" value={one.width ?? 1} options={SHARES} onPick={(width) => onPatch({ width })} />
      {one.kind === 'text' && <Stepper label="Rows" value={one.rows ?? 2} onChange={(rows) => onPatch({ rows })} />}
      <Tools first={first} last={last} onUp={onUp} onDown={onDown} onRemove={onRemove} />
    </div>
  );
}

// ---- Do -------------------------------------------------------------------------------------------------

function StepCell({ window, at, status, takes, bad, available, hasFolder, first, last, onUp, onDown, onRemove, onName, onSentence, onCode, onHow, onEach }: {
  window: Window; at: number; status: { word: string; kind: string }; takes: string[]; bad: string[]; available: string[]; hasFolder: boolean; first: boolean; last: boolean;
  onUp: () => void; onDown: () => void; onRemove: () => void;
  onName: (name: string) => void; onSentence: (sentence: string) => void; onCode: (code: string) => void; onHow: (how: 'ai' | 'code') => void; onEach: (each: boolean) => void;
}) {
  const step = window.steps[at];
  const [open, setOpen] = useState(step.how === 'code');
  const area = useRef<HTMLDivElement>(null);
  const insert = (name: string): void => {
    const box = area.current?.querySelector('textarea');
    const text = `@${tag(name)}`;
    if (!box) { onSentence(`${step.sentence} ${text}`.trim()); return; }
    const from = box.selectionStart ?? step.sentence.length;
    const to = box.selectionEnd ?? from;
    const before = step.sentence.slice(0, from);
    onSentence(`${before}${before && !/\s$/.test(before) ? ' ' : ''}${text}${step.sentence.slice(to)}`);
    box.focus();
  };
  return (
    <article className="nb-cell" aria-label={`Do: ${step.name}`}>
      <div className="nb-cell-head">
        <span className="nb-tag do">Do</span>
        <span className={`nb-status ${status.kind}`}>{status.word}</span>
        <Tools first={first} last={last} onUp={onUp} onDown={onDown} onRemove={onRemove} />
      </div>
      <div ref={area}><Sentence label="What should be done" value={step.sentence} onChange={onSentence} /></div>
      <div className="nb-chips">
        <Pill>takes: {takes.length ? takes.map((name, i) => <b key={name + i}>{i ? ', ' : ''}{name}</b>) : <b>nothing</b>}</Pill>
        {bad.map((name) => <Pill key={name} bad>@{name}: nothing of that name before this</Pill>)}
        <Pill>gives: <input aria-label="Name of the result" value={step.name} onChange={(event) => onName(event.target.value)} /></Pill>
        <span className="nb-sp" />
        <span className="nb-note" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          Done by
          <div className="nb-mini" role="group" aria-label="Done by">
            <button type="button" aria-pressed={step.how === 'ai'} onClick={() => onHow('ai')}>A model</button>
            <button type="button" aria-pressed={step.how === 'code'} onClick={() => { setOpen(true); onHow('code'); }}>Code</button>
          </div>
        </span>
      </div>
      <div className="nb-chips">
        <span className="nb-label">point at</span>
        {available.map((name) => <button key={name} type="button" className="nb-pill" onClick={() => insert(name)}>@{name}</button>)}
        {hasFolder && <label className="nb-pill" style={{ borderStyle: 'solid' }}><input type="checkbox" checked={step.each === true} onChange={(event) => onEach(event.target.checked)} /> once for each file of the folder</label>}
      </div>
      <div>
        <button className="nb-link" aria-expanded={open} onClick={() => setOpen(!open)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ transform: open ? 'rotate(90deg)' : undefined }}><path d="M8 5l8 7-8 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {step.how === 'code' ? (open ? 'Hide the code' : 'Show the code') : (open ? 'Hide what the model is told' : 'Show what the model is told')}
        </button>
        {open && (step.how === 'code'
          ? <textarea className="nb-pre" aria-label="Code" spellCheck={false} value={step.code ?? ''} onChange={(event) => onCode(event.target.value)} />
          : <pre className="nb-pre">{`${spoken(step.sentence)}\n\nInput: ${takes.map((name) => `“${name}”`).join(', ') || 'none'}`}</pre>)}
      </div>
    </article>
  );
}

// ---- Show -----------------------------------------------------------------------------------------------

function ShowCell({ cellKey, window, out, shown, results, lit, first, last, point, onUp, onDown, onRemove, onPatch, onKind }: {
  cellKey: string; window: Window; out: WindowOut; shown: unknown; results: string[]; lit: boolean; first: boolean; last: boolean; point: (key: string | null) => void;
  onUp: () => void; onDown: () => void; onRemove: () => void;
  onPatch: (patch: Partial<WindowOut>, name?: string) => void; onKind: (kind: OutKind) => void;
}) {
  const sizes = SIZES[out.kind];
  const of = out.of ?? resultsOf(window.steps[window.steps.length - 1] ?? { name: '', sentence: '', how: 'ai' })[0] ?? '';
  const has = shown !== undefined && shown !== null && shown !== '';
  return (
    <article className={`nb-cell${lit ? ' lit' : ''}`} id={`cell-${cellKey}`} aria-label={`Show: ${out.name}`} onMouseEnter={() => point(cellKey)} onMouseLeave={() => point(null)}>
      <div className="nb-cell-head">
        <span className="nb-tag show">Show</span>
        <span className="nb-status">{has ? 'done' : 'waits'}</span>
        <Tools first={first} last={last} onUp={onUp} onDown={onDown} onRemove={onRemove} />
      </div>
      <p className="nb-sentence" style={{ margin: 0 }}>Show “{of}” as {KIND_WORD[out.kind]}.</p>
      <div className="nb-chips"><Pill>takes: <b>{of}</b></Pill></div>
      <div className="nb-row">
        <label className="grow">Name<input aria-label="Name" value={out.name} onChange={(event) => onPatch({ name: event.target.value }, 'out-name')} /></label>
        <label>Kind
          <select aria-label="Kind" value={out.kind} onChange={(event) => onKind(event.target.value as OutKind)}>
            {OUT_KINDS.map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
          </select>
        </label>
        <label>Shows
          <select aria-label="Shows" value={of} onChange={(event) => onPatch({ of: event.target.value })}>
            {results.map((name) => <option key={name} value={name}>{name}</option>)}
            {!results.includes(of) && <option value={of}>{of || '(nothing yet)'}</option>}
          </select>
        </label>
        <Seg label="Size" value={(['S', 'M', 'L'] as const).find((size) => sizes[size] === out.rows)} options={[['S', 'S'], ['M', 'M'], ['L', 'L']]} onPick={(size) => onPatch({ rows: sizes[size] })} />
        <Stepper label="Rows" value={out.rows} onChange={(rows) => onPatch({ rows })} />
        <Seg label="Width" value={out.width ?? 1} options={SHARES} onPick={(width) => onPatch({ width })} />
      </div>
      {has
        ? <Output kind={out.kind} value={shown} rows={Math.min(out.rows, 6)} />
        : <div className="nb-result none">No result yet. Press ▶ on the first cell to try the window.</div>}
    </article>
  );
}
