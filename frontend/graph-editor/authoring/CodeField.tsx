import React, { Suspense, useLayoutEffect, type ReactNode } from 'react';
import Button from '../../app/ui/Button';
import { FIELD, LINE, MUTED, SUNKEN, SCRIM, SURFACE, TEXT } from '../../app/ui/theme';

export type CodeLanguage = 'javascript' | 'markdown';

// Loaded when a body is first drawn, never before: see CodeSurface.
const Surface = React.lazy(() => import('./CodeSurface'));

/**
 * What marks a code box on the page, for whoever must know that a drop landed
 * in one: its editor types in the text of a file dropped into it, where it was
 * dropped, and the drop is the box's (`app/windowDrops.ts`).
 */
export const CODE_FIELD = '[data-code-field]';

interface CodeFieldProps {
  value: string;
  onChange: (value: string) => void;
  language: CodeLanguage;
  placeholder?: string;
  minHeight?: number;
  /** How tall the box grows before it scrolls, as a CSS length. */
  maxHeight?: string;
  /** What the enlarged editor is called: "Draw chart -- code.js". */
  title?: string;
  /** The editor across the window is open. Opened and closed from outside: the file's chip opens it. */
  large: boolean;
  onLarge: (open: boolean) => void;
  /** Stands in the large window's header, beside Done. */
  header?: ReactNode;
}

/**
 * Where a node's files are written in its panel: a real editor in place of a
 * textarea.
 *
 * CodeMirror: syntax colours, line
 * numbers, bracket matching, search (Ctrl+F), multiple cursors, undo that
 * belongs to the box rather than to the browser -- and the large window opens
 * the same document across the whole screen, because the honest fix for a
 * small window is a big one. Tab indents there; in the box it moves on to the
 * next field, as everywhere in the panel, and Escape in it leaves the panel
 * open.
 *
 * For anything longer-lived there is still the other way out: "Open in my
 * editor", in the large window's header, opens the file in your own editor.
 * The two compose -- this is for the edit you make here, that is for the
 * afternoon you spend in VS Code.
 */
export default function CodeField({
  value, onChange, language, placeholder, minHeight = 160, maxHeight = '46vh', title, large, onLarge, header,
}: CodeFieldProps) {
  // What is there for the moment the editor takes to arrive: the same text in
  // a plain box, editable, so nothing about the panel waits on a download.
  const plain = (
    <textarea
      className="w-full rounded-lg px-3 py-2 text-sm font-mono resize-none"
      style={{ ...FIELD, minHeight }}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      spellCheck={false}
      aria-label={title}
    />
  );

  // A layout effect: the opener is read before the editor in the window takes the focus.
  useLayoutEffect(() => {
    if (!large) return undefined;
    // The focus goes back to what opened the window when it closes.
    const opener = document.activeElement as HTMLElement | null;
    // Escape closes the large editor and nothing else: left to bubble, it
    // would reach the node's panel underneath and close it.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onLarge(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      opener?.focus?.();
    };
  }, [large, onLarge]);

  return (
    <div className="relative" data-code-field="">
      <Suspense fallback={plain}>
        <Surface
          value={value} onChange={onChange} language={language} placeholder={placeholder}
          height={{ min: minHeight, max: maxHeight }}
        />
      </Suspense>

      {large && (
        <div
          className="fixed inset-0 flex flex-col"
          style={{ zIndex: 200, background: SCRIM, padding: '3vh 3vw' }}
          role="dialog"
          aria-modal="true"
          aria-label={title ?? 'Editor'}
        >
          <div
            className="flex items-center gap-3 px-4 py-2 rounded-t-lg"
            style={{ background: SURFACE, borderBottom: `1px solid ${LINE}` }}
          >
            <span className="text-sm font-semibold" style={{ color: TEXT }}>{title ?? 'Editor'}</span>
            <span className="text-xs" style={{ color: MUTED }}>
              Ctrl+F search · Ctrl+D next match · Alt+↑↓ move line · Esc done
            </span>
            <span className="flex-1" />
            {header}
            <Button variant="primary" size="sm" onClick={() => onLarge(false)}>Done</Button>
          </div>
          <div className="flex-1 min-h-0 rounded-b-lg overflow-hidden" style={{ background: SUNKEN }}>
            <Suspense fallback={plain}>
              <Surface
                value={value} onChange={onChange} language={language} placeholder={placeholder}
                height={{ min: 200, fill: true }} autoFocus tabIndents
              />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
