// The page: written like any page -- headings, text, bullets, gaps -- with windows standing in it to be used.
//
// The plainest editor of pages there is: a block is a box you type in, Enter starts the next block, `# `, `## ` and `- `
// at the start of a line make a heading or a list, and a small bar over a block (when the pointer or the cursor is in it)
// changes its kind or moves it. Written another way, the same page is Markdown to type (`Markdown`), and read, it is the
// web page the tool is (`As app`).

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { removeWindow } from '../../../gui/editor/windows/edit.ts';
import { addBlock, fromMarkdown, freshBlockId, moveBlock, pageOf, patchBlock, removeBlock, setKind, toMarkdown } from '../../../gui/editor/windows/page.ts';
import type { BlockKind, PageBlock, Windows } from '../../../gui/editor/windows/windows.ts';
import { useNotebook } from './store';
import WindowBox from './WindowBox';

const PLACEHOLDER: Record<string, string> = { h1: 'Title', h2: 'Heading', p: 'Write something, or type # for a heading and - for a list', ul: 'List item' };
const KIND_WORDS: [BlockKind, string][] = [['p', 'Text'], ['h1', 'Heading 1'], ['h2', 'Heading 2'], ['ul', 'Bullets'], ['space', 'Gap']];
const ADD_WORDS: [BlockKind, string][] = [...KIND_WORDS, ['window', 'Window']];

/** A box of text as tall as its text. */
function Text({ block, onChange, onKeyDown }: {
  block: PageBlock;
  onChange: (text: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  }, [block.text, block.kind]);
  return (
    <textarea
      ref={box} rows={1} className={`nb-text ${block.kind}`} value={block.text ?? ''} placeholder={PLACEHOLDER[block.kind]} spellCheck
      aria-label={KIND_WORDS.find(([kind]) => kind === block.kind)?.[1] ?? 'Text'}
      onChange={(event) => onChange(event.target.value)} onKeyDown={onKeyDown}
    />
  );
}

/** The place between two blocks where another is put. */
function AddRow({ onAdd }: { onAdd: (kind: BlockKind) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`nb-add${open ? ' open' : ''}`} onMouseLeave={() => setOpen(false)}>
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
        <div className="nb-flow">{page.map((block) => <Block key={block.id} block={block} index={0} doc={doc} writing={false} />)}</div>
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

  const type = (block: PageBlock, text: string): void => {
    // Markdown as it is typed: a heading or a bullet begins a line.
    const made = block.kind === 'p' ? /^(#{1,2}) (.*)$/s.exec(text) ?? /^([-*]) (.*)$/s.exec(text) : null;
    if (made) {
      const kind: BlockKind = made[1] === '#' ? 'h1' : made[1] === '##' ? 'h2' : 'ul';
      focus.current = { id: block.id, end: true };
      edit((one) => patchBlock(setKind(one, block.id, kind), block.id, { text: made[2] }));
      return;
    }
    edit((one) => patchBlock(one, block.id, { text }), `text-${block.id}`);
  };

  const keys = (block: PageBlock, index: number) => (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const box = event.currentTarget;
    const text = block.text ?? '';
    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      if (block.kind === 'ul') {
        const lines = text.split('\n');
        const line = text.slice(0, box.selectionStart).split('\n').length - 1;
        // An empty last item ends the list, as it does in every editor.
        if (lines[line] === '' && line === lines.length - 1) {
          event.preventDefault();
          focus.current = { id: freshBlockId(page), end: true };
          edit((one) => addBlock(patchBlock(one, block.id, { text: lines.slice(0, -1).join('\n') }), 'p', index + 1));
        }
        return;
      }
      event.preventDefault();
      add('p', index + 1);
    } else if (event.key === 'Backspace' && text === '' && page.length > 1) {
      event.preventDefault();
      const before = page[index - 1];
      if (before && before.kind !== 'window') focus.current = { id: before.id, end: true };
      edit((one) => removeBlock(one, block.id));
    } else if (event.key === 'ArrowUp' && box.selectionStart === 0 && box.selectionEnd === 0) {
      neighbour(box, -1);
    } else if (event.key === 'ArrowDown' && box.selectionStart === text.length) {
      neighbour(box, 1);
    }
  };

  return (
    <div className="nb-sheet">
      <div className="nb-flow">
        <AddRow onAdd={(kind) => add(kind, 0)} />
        {page.map((block, index) => (
          <Block
            key={block.id} block={block} index={index} doc={doc} writing
            last={index === page.length - 1} onType={(text) => type(block, text)} onKeys={keys(block, index)} onAdd={(kind) => add(kind, index + 1)}
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

function Block({ block, index, doc, writing, last, onType, onKeys, onAdd }: {
  block: PageBlock;
  index: number;
  doc: Windows;
  writing: boolean;
  last?: boolean;
  onType?: (text: string) => void;
  onKeys?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onAdd?: (kind: BlockKind) => void;
}) {
  const { edit } = useNotebook.getState();
  const window = block.kind === 'window' ? doc.windows.find((one) => one.id === block.window) : undefined;

  if (!writing) {
    if (block.kind === 'window') return window ? <div className="nb-block win" style={sizeOf(window.span)}><WindowBox window={window} writing={false} /></div> : null;
    if (block.kind === 'space') return <div className="nb-block"><div className="nb-space" /></div>;
    const text = block.text ?? '';
    return (
      <div className="nb-block">
        {block.kind === 'h1' ? <h1>{text}</h1> : block.kind === 'h2' ? <h2>{text}</h2>
          : block.kind === 'ul' ? <ul>{text.split('\n').filter(Boolean).map((line, at) => <li key={at}>{line}</li>)}</ul> : <p>{text}</p>}
      </div>
    );
  }

  const bar = (
    <div className="nb-tools" role="toolbar" aria-label="Block">
      {block.kind !== 'window' && (
        <select aria-label="Kind of block" value={block.kind} onChange={(event) => edit((one) => setKind(one, block.id, event.target.value as BlockKind))}>
          {KIND_WORDS.map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
        </select>
      )}
      <button aria-label="Move up" title="Move up" disabled={index === 0} onClick={() => edit((one) => moveBlock(one, block.id, -1))}>▲</button>
      <button aria-label="Move down" title="Move down" disabled={last} onClick={() => edit((one) => moveBlock(one, block.id, 1))}>▼</button>
      <button aria-label={window ? 'Remove window' : 'Remove block'} title={window ? 'Remove this window' : 'Remove'} onClick={() => edit((one) => (window ? removeWindow(one, window.id) : removeBlock(one, block.id)))}>✕</button>
    </div>
  );

  return (
    <>
      <div className={`nb-block${window ? ' win' : ''}`} data-block={block.id} style={window ? sizeOf(window.span) : undefined}>
        {bar}
        {window && <WindowBox window={window} writing />}
        {block.kind === 'space' && <div className="nb-space" aria-label="Gap" />}
        {block.kind !== 'window' && block.kind !== 'space' && <Text block={block} onChange={onType!} onKeyDown={onKeys!} />}
      </div>
      <AddRow onAdd={onAdd!} />
    </>
  );
}

/** A window as wide as its share of the page: two of eight cells stand side by side. */
const sizeOf = (span: number): React.CSSProperties => (span >= 16 ? { flex: '0 0 100%' } : { flex: `0 0 calc(${((span / 16) * 100).toFixed(2)}% - 8px)` });
