import { useRef, type CSSProperties, type ReactNode } from 'react';
import {
  addInput, addOutput, addStep, kindOfOutput, moveCell, patchInput, patchOutput, patchStep, patchWindow, removeCell, renameInput, renameStep,
  type CellRef,
} from '../../../gui/editor/windows/edit.ts';
import {
  SIZES, idOf, inBlock, mentions, outEnd, resultsOf,
  type InKind, type OutKind, type Window, type WindowIn, type WindowOut, type Windows,
} from '../../../gui/editor/windows/windows.ts';
import Button from '../../deployment/gui/kit/ui/Button';
import { ACCENT, ACCENT_FILL, ACCENT_TEXT, DANGER_TEXT, DIMMER, FIELD, LINE, MUTED, ON_ACCENT, SURFACE, TEXT } from '../../deployment/gui/kit/ui/theme';

/** What a hovered cell or element is called, to light up its other half: a block id, or the window's `_run`. */
export type Hot = string | null;

const IN_KINDS: [InKind, string][] = [['text', 'Text'], ['file', 'File'], ['folder', 'Folder'], ['number', 'Number'], ['choice', 'Choice'], ['from', 'From window']];
const OUT_KINDS: [OutKind, string][] = [['text', 'Text'], ['list', 'List'], ['table', 'Table'], ['chart', 'Chart'], ['image', 'Image']];
const SHARES: [string, number][] = [['¼', 0.25], ['⅓', 1 / 3], ['½', 0.5], ['⅔', 2 / 3], ['¾', 0.75], ['Full', 1]];

const field: CSSProperties = { ...FIELD, borderRadius: 8, padding: '5px 9px', fontSize: 13, minWidth: 0 };

/** The number an element of the interface is drawn with: the inputs first, then the outputs, as the window draws them. */
export function numbering(window: Window): Map<string, number> {
  const numbers = new Map<string, number>();
  window.inputs.forEach((one) => numbers.set(inBlock(window, one), numbers.size + 1));
  window.outputs.forEach((one) => numbers.set(outEnd(window, one), numbers.size + 1));
  return numbers;
}

/** The name a sentence points at *name* by: `@First_name`, since a mention has no spaces. */
export const tag = (name: string): string => name.trim().replace(/\s+/g, '_');

export default function CellList({ doc, window, hot, onHot, onChange }: {
  doc: Windows;
  window: Window;
  hot: Hot;
  onHot: (hot: Hot) => void;
  /** An edit of the document, named when it is typing (so a sentence typed is one undo step). */
  onChange: (change: (doc: Windows) => Windows, name?: string) => void;
}) {
  const id = window.id;
  const numbers = numbering(window);
  const others = doc.windows.filter((one) => one.id !== id && one.outputs.length);
  const hasFolder = window.inputs.some((one) => one.kind === 'folder');
  const results = window.steps.flatMap((step) => resultsOf(step));
  const move = (ref: CellRef, by: -1 | 1) => onChange((d) => moveCell(d, id, ref, by));
  const remove = (ref: CellRef) => onChange((d) => removeCell(d, id, ref));
  const lastOf = (list: 'inputs' | 'steps' | 'outputs') => window[list].length - 1;

  return (
    <div className="flex flex-col gap-5 pb-8">
      <Section title="In" hint="What the person puts in.">
        {window.inputs.map((one, at) => {
          const key = inBlock(window, one);
          return (
            <Row key={key + at} cellKey={key} badge={numbers.get(key)} hot={hot} onHot={onHot} first={at === 0} last={at === lastOf('inputs')}
              onUp={() => move({ list: 'inputs', at }, -1)} onDown={() => move({ list: 'inputs', at }, 1)} onRemove={() => remove({ list: 'inputs', at })}>
              <InputCell
                window={window} one={one} others={others}
                onName={(name) => onChange((d) => renameInput(d, id, at, name), `in-name-${at}`)}
                onPatch={(patch, name) => onChange((d) => patchInput(d, id, at, patch), name && `${name}-${at}`)}
              />
            </Row>
          );
        })}
        <Adds>
          {IN_KINDS.filter(([kind]) => kind !== 'from' || others.length > 0).map(([kind, label]) => (
            <Button key={kind} size="sm" variant="quiet" onClick={() => onChange((d) => addInput(d, id, kind))}>+ {label}</Button>
          ))}
        </Adds>
      </Section>

      <Section title="Starts when" hint="What sets the window going.">
        <TriggerCell window={window} hot={hot} onHot={onHot} onChange={onChange} />
      </Section>

      <Section title="Do" hint="Steps, one sentence each. A step takes what its sentence points at with @.">
        {window.steps.map((step, at) => (
          <Row key={step.name + at} cellKey={`step:${at}`} badge="▸" hot={hot} onHot={onHot} first={at === 0} last={at === lastOf('steps')}
            onUp={() => move({ list: 'steps', at }, -1)} onDown={() => move({ list: 'steps', at }, 1)} onRemove={() => remove({ list: 'steps', at })}>
            <StepCell
              window={window} at={at} hasFolder={hasFolder}
              onName={(name) => onChange((d) => renameStep(d, id, at, name), `step-name-${at}`)}
              onSentence={(sentence) => onChange((d) => patchStep(d, id, at, { sentence }), `step-${at}`)}
              onEach={(each) => onChange((d) => patchStep(d, id, at, { each }))}
            />
          </Row>
        ))}
        <Adds>
          <Button size="sm" variant="quiet" onClick={() => onChange((d) => addStep(d, id))}>+ Step</Button>
        </Adds>
      </Section>

      <Section title="Out" hint="What comes out, and how much room it has. The window never grows.">
        {window.outputs.map((one, at) => {
          const key = outEnd(window, one);
          return (
            <Row key={key + at} cellKey={key} badge={numbers.get(key)} hot={hot} onHot={onHot} first={at === 0} last={at === lastOf('outputs')}
              onUp={() => move({ list: 'outputs', at }, -1)} onDown={() => move({ list: 'outputs', at }, 1)} onRemove={() => remove({ list: 'outputs', at })}>
              <OutputCell
                window={window} one={one} results={results}
                onPatch={(patch, name) => onChange((d) => patchOutput(d, id, at, patch), name && `${name}-${at}`)}
                onKind={(kind) => onChange((d) => kindOfOutput(d, id, at, kind))}
              />
            </Row>
          );
        })}
        <Adds>
          {OUT_KINDS.map(([kind, label]) => (
            <Button key={kind} size="sm" variant="quiet" onClick={() => onChange((d) => addOutput(d, id, kind))}>+ {label}</Button>
          ))}
        </Adds>
      </Section>
    </div>
  );
}

// ---- the frame of a list -----------------------------------------------------------------------------

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: ACCENT_TEXT }}>{title}</h3>
        <span className="text-xs truncate" style={{ color: DIMMER }}>{hint}</span>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Adds({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1 -ml-1">{children}</div>;
}

/** A cell as the list shows it: the number it has on the interface, its controls, and where it can move. */
function Row({ cellKey, badge, hot, onHot, first, last, onUp, onDown, onRemove, children }: {
  cellKey: string;
  badge?: number | string;
  hot: Hot;
  onHot: (hot: Hot) => void;
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const lit = hot === cellKey;
  return (
    <div
      id={`cell-${cellKey}`}
      data-cell={cellKey}
      className="flex gap-3 rounded-xl px-3 py-2.5"
      style={{ background: SURFACE, border: `1px solid ${lit ? ACCENT : LINE}`, boxShadow: lit ? `0 0 0 2px ${ACCENT_FILL}` : undefined }}
      onMouseEnter={() => onHot(cellKey)}
      onMouseLeave={() => onHot(null)}
      onFocusCapture={() => onHot(cellKey)}
      onBlurCapture={() => onHot(null)}
    >
      <span
        aria-hidden
        className="shrink-0 flex items-center justify-center rounded-full text-xs font-semibold"
        style={{ width: 22, height: 22, marginTop: 2, background: lit ? ACCENT : ACCENT_FILL, color: lit ? ON_ACCENT : ACCENT_TEXT }}
      >
        {badge}
      </span>
      <div className="flex-1 min-w-0 flex flex-col gap-2">{children}</div>
      <div className="shrink-0 flex flex-col -mr-1">
        <Button size="sm" variant="quiet" aria-label="Move up" title="Move up" disabled={first} onClick={onUp}>▲</Button>
        <Button size="sm" variant="quiet" aria-label="Move down" title="Move down" disabled={last} onClick={onDown}>▼</Button>
        <Button size="sm" variant="danger" aria-label="Remove" title="Remove" onClick={onRemove}>✕</Button>
      </div>
    </div>
  );
}

// ---- small controls ----------------------------------------------------------------------------------

function Seg<T extends string | number>({ value, options, onPick, label }: { value: T | undefined; options: [string, T][]; onPick: (value: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg overflow-hidden" style={{ border: `1px solid ${LINE}` }}>
      {options.map(([text, option]) => {
        const on = typeof option === 'number' && typeof value === 'number' ? Math.abs(option - value) < 0.02 : option === value;
        return (
          <button
            key={String(option)} type="button" aria-pressed={on} onClick={() => onPick(option)}
            className="px-2 py-1 text-xs font-medium"
            style={{ background: on ? ACCENT : 'transparent', color: on ? ON_ACCENT : MUTED }}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[11px]" style={{ color: DIMMER }}>{label}</span>
      {children}
    </label>
  );
}

function Stepper({ value, min = 1, max = 20, onChange, label }: { value: number; min?: number; max?: number; onChange: (value: number) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center rounded-lg" style={{ border: `1px solid ${LINE}` }}>
      <button type="button" aria-label={`${label}: fewer`} disabled={value <= min} onClick={() => onChange(value - 1)} className="px-2 py-0.5 text-sm" style={{ color: MUTED }}>−</button>
      <span className="px-1 text-xs tabular-nums min-w-[1.5rem] text-center" style={{ color: TEXT }}>{value}</span>
      <button type="button" aria-label={`${label}: more`} disabled={value >= max} onClick={() => onChange(value + 1)} className="px-2 py-0.5 text-sm" style={{ color: MUTED }}>+</button>
    </div>
  );
}

// ---- the cells ---------------------------------------------------------------------------------------

function InputCell({ window, one, others, onName, onPatch }: {
  window: Window;
  one: WindowIn;
  others: Window[];
  onName: (name: string) => void;
  onPatch: (patch: Partial<WindowIn>, name?: string) => void;
}) {
  const source = others.find((other) => other.id === one.from?.window);
  const rows = one.rows ?? (one.kind === 'text' ? 2 : 1);
  return (
    <>
      <div className="flex gap-2">
        <input aria-label="Name" value={one.name} onChange={(event) => onName(event.target.value)} style={{ ...field, flex: 1 }} />
        <select
          aria-label="Kind" value={one.kind} style={field}
          onChange={(event) => {
            const kind = event.target.value as InKind;
            const from = kind === 'from' ? { window: others[0]?.id ?? '', output: others[0]?.outputs[0]?.name ?? '' } : undefined;
            onPatch({
              kind, from, value: undefined,
              ...(kind === 'choice' ? { options: one.options ?? ['short', 'long'] } : {}),
              ...(kind === 'number' ? { min: one.min ?? 1, max: one.max ?? 100, step: one.step ?? 1 } : {}),
            });
          }}
        >
          {IN_KINDS.filter(([kind]) => kind !== 'from' || others.length > 0 || one.kind === 'from').map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
        </select>
      </div>
      {one.kind === 'choice' && (
        <Labelled label="Choices, one per line (the first is where it starts)">
          <textarea
            aria-label="Choices" rows={2} style={{ ...field, resize: 'vertical' }}
            value={(one.options ?? []).join('\n')}
            onChange={(event) => onPatch({ options: event.target.value.split('\n').filter((line) => line.trim().length > 0), value: undefined }, 'options')}
          />
        </Labelled>
      )}
      {one.kind === 'number' && (
        <div className="flex gap-2">
          {(['min', 'max', 'step'] as const).map((part) => (
            <Labelled key={part} label={part}>
              <input
                aria-label={part} type="number" value={one[part] ?? ''} style={{ ...field, width: '100%' }}
                onChange={(event) => onPatch({ [part]: event.target.value === '' ? undefined : Number(event.target.value) }, part)}
              />
            </Labelled>
          ))}
          <Labelled label="starts at">
            <input aria-label="starts at" type="number" value={one.value ?? ''} style={{ ...field, width: '100%' }}
              onChange={(event) => onPatch({ value: event.target.value === '' ? undefined : Number(event.target.value) }, 'start')} />
          </Labelled>
        </div>
      )}
      {(one.kind === 'file' || one.kind === 'folder') && (
        <Labelled label="Only these file types, e.g. .txt, .md (blank: any)">
          <input aria-label="File types" value={one.extensions ?? ''} style={field} onChange={(event) => onPatch({ extensions: event.target.value }, 'extensions')} />
        </Labelled>
      )}
      {one.kind === 'text' && (
        <Labelled label="Starts with">
          <input aria-label="Starts with" value={String(one.value ?? '')} style={field} onChange={(event) => onPatch({ value: event.target.value }, 'value')} />
        </Labelled>
      )}
      {one.kind === 'from' && (
        <div className="flex gap-2">
          <Labelled label="Window">
            <select
              aria-label="From window" style={field} value={one.from?.window ?? ''}
              onChange={(event) => {
                const other = others.find((candidate) => candidate.id === event.target.value);
                onPatch({ from: { window: event.target.value, output: other?.outputs[0]?.name ?? '' } });
              }}
            >
              {others.map((other) => <option key={other.id} value={other.id}>{other.title}</option>)}
            </select>
          </Labelled>
          <Labelled label="Output">
            <select aria-label="From output" style={field} value={one.from?.output ?? ''} onChange={(event) => onPatch({ from: { window: one.from?.window ?? '', output: event.target.value } })}>
              {(source?.outputs ?? []).map((out) => <option key={out.name} value={out.name}>{out.name}</option>)}
            </select>
          </Labelled>
        </div>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <Seg label="Width" value={one.width ?? 1} options={SHARES} onPick={(width) => onPatch({ width })} />
        {one.kind === 'text' && <Stepper label="Rows" value={rows} max={8} onChange={(next) => onPatch({ rows: next })} />}
        <span className="text-[11px]" style={{ color: DIMMER }}>of {window.span} cells</span>
      </div>
    </>
  );
}

function TriggerCell({ window, hot, onHot, onChange }: {
  window: Window;
  hot: Hot;
  onHot: (hot: Hot) => void;
  onChange: (change: (doc: Windows) => Windows, name?: string) => void;
}) {
  const trigger = window.trigger ?? {};
  const button = trigger.button !== false;
  const key = `${window.id}_run`;
  const lit = hot === key;
  const set = (patch: NonNullable<Window['trigger']>, name?: string) => onChange((d) => patchWindow(d, window.id, { trigger: { ...trigger, ...patch } }), name);
  return (
    <div
      id={`cell-${key}`}
      className="rounded-xl px-3 py-2.5 flex flex-col gap-2"
      style={{ background: SURFACE, border: `1px solid ${lit ? ACCENT : LINE}`, boxShadow: lit ? `0 0 0 2px ${ACCENT_FILL}` : undefined }}
      onMouseEnter={() => onHot(key)}
      onMouseLeave={() => onHot(null)}
    >
      <label className="flex items-center gap-2 text-sm" style={{ color: TEXT }}>
        <input type="checkbox" checked={button} onChange={(event) => set({ button: event.target.checked })} />
        A button
        {button && (
          <input aria-label="Button words" placeholder="Run" value={trigger.label ?? ''} style={{ ...field, width: 140 }} onChange={(event) => set({ label: event.target.value }, 'trigger-label')} />
        )}
      </label>
      <label className="flex items-center gap-2 text-sm" style={{ color: TEXT }}>
        <input type="checkbox" checked={trigger.onChange === true} onChange={(event) => set({ onChange: event.target.checked })} />
        A change of an input
        <span className="text-xs" style={{ color: DIMMER }}>(a model costs money each time)</span>
      </label>
      {!button && !trigger.onChange && <span className="text-xs" style={{ color: DANGER_TEXT }}>Nothing starts this window yet.</span>}
    </div>
  );
}

function StepCell({ window, at, hasFolder, onName, onSentence, onEach }: {
  window: Window;
  at: number;
  hasFolder: boolean;
  onName: (name: string) => void;
  onSentence: (sentence: string) => void;
  onEach: (each: boolean) => void;
}) {
  const step = window.steps[at];
  const area = useRef<HTMLTextAreaElement>(null);
  // What the sentence can point at: the inputs, and what the steps before this one make.
  const available = [...window.inputs.map((one) => one.name), ...window.steps.slice(0, at).flatMap((one) => resultsOf(one))];
  const said = mentions(step.sentence);
  const known = new Set(available.map(idOf));
  const insert = (name: string) => {
    const box = area.current;
    const text = `@${tag(name)}`;
    if (!box) { onSentence(`${step.sentence} ${text}`.trim()); return; }
    const from = box.selectionStart ?? step.sentence.length;
    const to = box.selectionEnd ?? from;
    const before = step.sentence.slice(0, from);
    const spaced = before && !/\s$/.test(before) ? ' ' : '';
    onSentence(`${before}${spaced}${text}${step.sentence.slice(to)}`);
    box.focus();
  };
  return (
    <>
      <Labelled label="Result it makes">
        <input aria-label="Step name" value={step.name} onChange={(event) => onName(event.target.value)} style={field} />
      </Labelled>
      <Labelled label="What should be done">
        <textarea
          ref={area} aria-label="Sentence" rows={3} value={step.sentence} style={{ ...field, resize: 'vertical', lineHeight: 1.4 }}
          onChange={(event) => onSentence(event.target.value)}
        />
      </Labelled>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px]" style={{ color: DIMMER }}>takes:</span>
        {said.length === 0 && <span className="text-xs" style={{ color: MUTED }}>{at === 0 ? 'all inputs' : 'what comes right before'}</span>}
        {said.map((one, place) => (
          <span key={place} className="text-xs rounded-full px-2 py-0.5" style={known.has(idOf(one.name)) ? { background: ACCENT_FILL, color: ACCENT_TEXT } : { background: 'transparent', color: DANGER_TEXT, border: `1px solid ${DANGER_TEXT}` }}>
            {one.name}{one.part ? `.${one.part}` : ''}
          </span>
        ))}
        <span className="text-[11px] ml-2" style={{ color: DIMMER }}>point at:</span>
        {available.map((name) => (
          <button key={name} type="button" className="text-xs rounded-full px-2 py-0.5 hover-raise" style={{ border: `1px solid ${LINE}`, color: MUTED }} onClick={() => insert(name)}>
            @{name}
          </button>
        ))}
      </div>
      {hasFolder && (
        <label className="flex items-center gap-2 text-xs" style={{ color: MUTED }}>
          <input type="checkbox" checked={step.each === true} onChange={(event) => onEach(event.target.checked)} />
          Once for each file of the folder, a few at a time
        </label>
      )}
    </>
  );
}

function OutputCell({ window, one, results, onPatch, onKind }: {
  window: Window;
  one: WindowOut;
  results: string[];
  onPatch: (patch: Partial<WindowOut>, name?: string) => void;
  onKind: (kind: OutKind) => void;
}) {
  const sizes = SIZES[one.kind];
  const shown = one.of ?? resultsOf(window.steps[window.steps.length - 1] ?? { name: '', sentence: '', how: 'ai' })[0] ?? '';
  return (
    <>
      <div className="flex gap-2">
        <input aria-label="Name" value={one.name} onChange={(event) => onPatch({ name: event.target.value }, 'out-name')} style={{ ...field, flex: 1 }} />
        <select aria-label="Kind" value={one.kind} style={field} onChange={(event) => onKind(event.target.value as OutKind)}>
          {OUT_KINDS.map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
        </select>
      </div>
      <Labelled label="Shows the result of">
        <select aria-label="Shows" value={shown} style={field} onChange={(event) => onPatch({ of: event.target.value })}>
          {results.map((name) => <option key={name} value={name}>{name}</option>)}
          {!results.includes(shown) && <option value={shown}>{shown || '(nothing yet)'}</option>}
        </select>
      </Labelled>
      <div className="flex items-center gap-3 flex-wrap">
        <Seg
          label="Size" value={(['S', 'M', 'L'] as const).find((size) => sizes[size] === one.rows)}
          options={[['S', 'S'], ['M', 'M'], ['L', 'L']]} onPick={(size) => onPatch({ rows: sizes[size] })}
        />
        <Stepper label="Rows" value={one.rows} max={16} onChange={(rows) => onPatch({ rows })} />
        <Seg label="Width" value={one.width ?? 1} options={SHARES} onPick={(width) => onPatch({ width })} />
      </div>
    </>
  );
}
