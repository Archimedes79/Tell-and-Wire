// The page: written like any page -- headings, text, bullets, gaps -- with windows standing in it to be used.
//
// The plainest editor of pages there is: a block is a box you type in, Enter starts the next block, `# `, `## ` and `- `
// at the start of a line make a heading or a list, and a small bar over a block (when the pointer or the cursor is in it)
// changes its kind or moves it. Written another way, the same page is Markdown to type (`Markdown`), and read, it is the
// web page the tool is (`As app`).

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { patchWindow, removeWindow } from '../../../gui/editor/windows/edit.ts';
import { addBlock, fromMarkdown, freshBlockId, moveBlock, pageOf, patchBlock, removeBlock, setKind, toMarkdown } from '../../../gui/editor/windows/page.ts';
import type { BlockKind, PageBlock, Windows } from '../../../gui/editor/windows/windows.ts';
import { useNotebook } from './store';
import WindowBox from './WindowBox';

const PLACEHOLDER: Record<string, string> = { h1: 'Title', h2: 'Heading', p: 'Write something, or type # for a heading and - for a list', ul: 'List item' };
const KIND_WORDS: [BlockKind, string][] = [['p', 'Text'], ['h1', 'Heading 1'], ['h2', 'Heading 2'], ['ul', 'Bullets'], ['space', 'Gap']];
const ADD_WORDS: [BlockKind, string][] = [...KIND_WORDS, ['window', 'Window']];

/** A box of text as tall as its text. */
function Text({ part, onChange, onKeyDown }: {
  part: PageBlock;
  onChange: (text: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  }, [part.text, part.kind]);
  return (
    <textarea
      ref={box} rows={1} className={`nb-text ${part.kind}`} value={part.text ?? ''} placeholder={PLACEHOLDER[part.kind]} spellCheck
      aria-label={KIND_WORDS.find(([kind]) => kind === part.kind)?.[1] ?? 'Text'}
      onChange={(event) => onChange(event.target.value)} onKeyDown={onKeyDown}
    />
  );
}

/** The place between two blocks where another is put. */
function AddRow({ onAdd, where }: { onAdd: (kind: BlockKind) => void; where: 'above' | 'below' }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`nb-add ${where}${open ? ' open' : ''}`} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="plus" aria-label="Add a block here" aria-expanded={open} onClick={() => setOpen(!open)}>+</button>
      {open && (
        <div className="menu" role="menu">
          {ADD_WORDS.map(([kind, label]) => <button key={kind} role="menuitem" className="nb-btn small" onClick={() => { setOpen(false); onAdd(kind); }}>{label}</button>)}
        </div>
      )}
    </div>
  );
}

export default function Page({ doc, writing }: { doc: Windows; writing: boolean }) {
  const source = useNotebook((s) => s.source);
  const { edit, show } = useNotebook.getState();
  const page = pageOf(doc);
  const focus = useRef<{ id: string; end: boolean } | null>(null);
  const [draft, setDraft] = useState<string | null>(null);

  // After a block is made or taken away, the cursor goes where the person is writing.
  useEffect(() => {
    const want = focus.current;
    if (!want) return;
    focus.current = null;
    const node = document.querySelector<HTMLTextAreaElement>(`[data-block="${want.id}"] textarea`);
    if (!node) return;
    node.focus();
    const at = want.end ? node.value.length : 0;
    node.setSelectionRange(at, at);
  });

  if (!writing) {
    return (
      <div className="nb-sheet nb-read">
        <div className="nb-flow">{page.map((part) => <Block key={part.id} part={part} index={0} doc={doc} writing={false} />)}</div>
      </div>
    );
  }

  if (source) {
    return (
      <div className="nb-sheet">
        <p className="nb-lead">The page as Markdown: <code># Title</code>, <code>## Heading</code>, <code>- bullet</code>, <code>[space]</code>, and <code>[window: id]</code> where a window stands.</p>
        <textarea
          className="nb-source" aria-label="Page as Markdown" spellCheck={false} value={draft ?? toMarkdown(doc)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => { if (draft !== null) { edit((one) => fromMarkdown(one, draft), 'markdown'); setDraft(null); } }}
        />
        <div style={{ marginTop: 10 }}><button className="nb-btn" onClick={() => { if (draft !== null) edit((one) => fromMarkdown(one, draft)); setDraft(null); show({ source: false }); }}>Back to the page</button></div>
      </div>
    );
  }

  const add = (kind: BlockKind, at: number): void => {
    if (kind === 'window') {
      edit((one) => addBlock(one, 'window', at));
      return;
    }
    focus.current = { id: freshBlockId(page), end: true };
    edit((one) => addBlock(one, kind, at));
  };

  const type = (part: PageBlock, text: string): void => {
    // Markdown as it is typed: a heading or a bullet begins a line.
    const made = part.kind === 'p' ? /^(#{1,2}) (.*)$/s.exec(text) ?? /^([-*]) (.*)$/s.exec(text) : null;
    if (made) {
      const kind: BlockKind = made[1] === '#' ? 'h1' : made[1] === '##' ? 'h2' : 'ul';
      focus.current = { id: part.id, end: true };
      edit((one) => patchBlock(setKind(one, part.id, kind), part.id, { text: made[2] }));
      return;
    }
    edit((one) => patchBlock(one, part.id, { text }), `text-${part.id}`);
  };

  const keys = (part: PageBlock, index: number) => (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const box = event.currentTarget;
    const text = part.text ?? '';
    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      if (part.kind === 'ul') {
        const lines = text.split('\n');
        const line = text.slice(0, box.selectionStart).split('\n').length - 1;
        // An empty last item ends the list, as it does in every editor.
        if (lines[line] === '' && line === lines.length - 1) {
          event.preventDefault();
          focus.current = { id: freshBlockId(page), end: true };
          edit((one) => addBlock(patchBlock(one, part.id, { text: lines.slice(0, -1).join('\n') }), 'p', index + 1));
        }
        return;
      }
      event.preventDefault();
      add('p', index + 1);
    } else if (event.key === 'Backspace' && text === '' && page.length > 1) {
      event.preventDefault();
      const before = page[index - 1];
      if (before && before.kind !== 'window') focus.current = { id: before.id, end: true };
      edit((one) => removeBlock(one, part.id));
    } else if (event.key === 'ArrowUp' && box.selectionStart === 0 && box.selectionEnd === 0) {
      neighbour(box, -1);
    } else if (event.key === 'ArrowDown' && box.selectionStart === text.length) {
      neighbour(box, 1);
    }
  };

  return (
    <div className="nb-sheet">
      <div className="nb-flow">
        {page.map((part, index) => (
          <Block
            key={part.id} part={part} index={index} doc={doc} writing
            last={index === page.length - 1} onType={(text) => type(part, text)} onKeys={keys(part, index)} onAdd={(kind) => add(kind, index + 1)} onAddAbove={(kind) => add(kind, index)}
          />
        ))}
      </div>
    </div>
  );
}

/** The cursor moves to the text before or after this one, as the arrow keys leave it. */
function neighbour(from: HTMLTextAreaElement, by: -1 | 1): void {
  const all = [...document.querySelectorAll<HTMLTextAreaElement>('.nb-sheet textarea.nb-text')];
  const next = all[all.indexOf(from) + by];
  if (!next) return;
  next.focus();
  const at = by < 0 ? next.value.length : 0;
  next.setSelectionRange(at, at);
}

function Block({ part, index, doc, writing, last, onType, onKeys, onAdd, onAddAbove }: {
  part: PageBlock;
  index: number;
  doc: Windows;
  writing: boolean;
  last?: boolean;
  onType?: (text: string) => void;
  onKeys?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onAdd?: (kind: BlockKind) => void;
  onAddAbove?: (kind: BlockKind) => void;
}) {
  const { edit } = useNotebook.getState();
  /** The width a window is being pulled to, before the pointer is let go. */
  const [preview, setPreview] = useState<number | null>(null);
  const window = part.kind === 'window' ? doc.windows.find((one) => one.id === part.window) : undefined;

  if (!writing) {
    if (part.kind === 'window') return window ? <div className="nb-block win" style={sizeOf(window.span)}><WindowBox window={window} writing={false} /></div> : null;
    if (part.kind === 'space') return <div className="nb-block"><div className="nb-space" /></div>;
    const text = part.text ?? '';
    return (
      <div className="nb-block">
        {part.kind === 'h1' ? <h1>{text}</h1> : part.kind === 'h2' ? <h2>{text}</h2>
          : part.kind === 'ul' ? <ul>{text.split('\n').filter(Boolean).map((line, at) => <li key={at}>{line}</li>)}</ul> : <p>{text}</p>}
      </div>
    );
  }

  return (
      <div className={`nb-block${window ? ' win' : ''}`} data-block={part.id} style={window ? sizeOf(preview ?? window.span) : undefined}>
        {index === 0 && <AddRow where="above" onAdd={onAddAbove!} />}
        <BlockMenu part={part} index={index} last={!!last} windowId={window?.id} />
        {window && <WindowBox window={window} writing />}
        {window && <Edge span={window.span} preview={preview} onPreview={setPreview} onSet={(span) => { setPreview(null); if (span !== window.span) edit((one) => patchWindow(one, window.id, { span })); }} />}
        {part.kind === 'space' && <div className="nb-space" aria-label="Gap" />}
        {part.kind !== 'window' && part.kind !== 'space' && <Text part={part} onChange={onType!} onKeyDown={onKeys!} />}
        <AddRow where="below" onAdd={onAdd!} />
      </div>
  );
}

/** The options of a block, behind a handle in the margin beside it, so that they never cover the words. */
function BlockMenu({ part, index, last, windowId }: { part: PageBlock; index: number; last: boolean; windowId?: string }) {
  const { edit } = useNotebook.getState();
  const [open, setOpen] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent): void => { if (!holder.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent): void => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', escape); };
  }, [open]);
  const then = (change: (doc: Windows) => Windows) => (): void => { setOpen(false); edit(change); };
  return (
    <div className={`nb-grip${open ? ' open' : ''}`} ref={holder}>
      <button type="button" className="handle" aria-label="Block options" aria-expanded={open} title="Options of this block" onClick={() => setOpen(!open)}>⋮⋮</button>
      {open && (
        <div className="nb-tools" role="toolbar" aria-label="Block">
          {part.kind !== 'window' && (
            <select aria-label="Kind of block" value={part.kind} onChange={(event) => { setOpen(false); edit((one) => setKind(one, part.id, event.target.value as BlockKind)); }}>
              {KIND_WORDS.map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
            </select>
          )}
          <button aria-label="Move up" disabled={index === 0} onClick={then((one) => moveBlock(one, part.id, -1))}>▲ Move up</button>
          <button aria-label="Move down" disabled={last} onClick={then((one) => moveBlock(one, part.id, 1))}>▼ Move down</button>
          <button aria-label={windowId ? 'Remove window' : 'Remove block'} className="remove" onClick={then((one) => (windowId ? removeWindow(one, windowId) : removeBlock(one, part.id)))}>✕ {windowId ? 'Remove window' : 'Remove'}</button>
        </div>
      )}
    </div>
  );
}

/** The cells a window takes (of 16), for a pointer at *x* when the window begins at *left* in a line *line* wide: a quarter at least, whole quarters. */
export const spanAt = (x: number, left: number, line: number): number => Math.min(16, Math.max(4, Math.round(((x - left) / Math.max(1, line)) * 4) * 4));

const FRACTION: Record<number, string> = { 4: '¼', 8: '½', 12: '¾', 16: 'full width' };

/** The right edge of a window: pulled, it makes the window wider or narrower; with the arrow keys, by a quarter. */
function Edge({ span, preview, onPreview, onSet }: { span: number; preview: number | null; onPreview: (span: number | null) => void; onSet: (span: number) => void }) {
  const drag = useRef<{ left: number; line: number } | null>(null);
  const shown = preview ?? span;
  const spanFor = (event: React.PointerEvent): number => spanAt(event.clientX, drag.current!.left, drag.current!.line);
  return (
    <div
      className={`nb-edge${preview !== null ? ' pulling' : ''}`} role="slider" tabIndex={0} aria-label="Window width" aria-orientation="horizontal"
      aria-valuemin={4} aria-valuemax={16} aria-valuenow={shown} aria-valuetext={FRACTION[shown] ?? `${shown} of 16`} title="Pull to change the width of the window"
      onPointerDown={(event) => {
        const block = event.currentTarget.parentElement!;
        drag.current = { left: block.getBoundingClientRect().left, line: block.parentElement!.clientWidth };
        event.currentTarget.setPointerCapture(event.pointerId);
        onPreview(span);
      }}
      onPointerMove={(event) => { if (drag.current) onPreview(spanFor(event)); }}
      onPointerUp={(event) => { if (!drag.current) return; const next = spanFor(event); drag.current = null; onSet(next); }}
      onPointerCancel={() => { drag.current = null; onPreview(null); }}
      onKeyDown={(event) => {
        const by = event.key === 'ArrowRight' ? 4 : event.key === 'ArrowLeft' ? -4 : 0;
        if (!by) return;
        event.preventDefault();
        onSet(Math.min(16, Math.max(4, span + by)));
      }}
    >
      {preview !== null && <span className="nb-edge-tip">{FRACTION[preview] ?? preview}</span>}
    </div>
  );
}

/** A window as wide as its share of the page: two of eight cells stand side by side. */
const sizeOf = (span: number): React.CSSProperties => (span >= 16 ? { flex: '0 0 100%' } : { flex: `0 0 calc(${((span / 16) * 100).toFixed(2)}% - 8px)` });
