import React, { useEffect, useId, useRef, useState } from 'react';
import Button from './Button';
import { LINE, PANEL, SCRIM, SUNKEN, TEXT } from './theme';

interface ModalProps {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  /** Buttons for the bottom bar. Omit for a modal with no actions of its own. */
  footer?: React.ReactNode;
  /** Tailwind max-width class. */
  maxWidth?: string;
  /**
   * Clicking the backdrop closes the modal. Turn this off where a stray click
   * would lose typed input (or while a request is in flight).
   */
  dismissOnBackdrop?: boolean;
  /** Escape closes the modal. Off while something is mid-flight. */
  dismissOnEscape?: boolean;
}

/**
 * Whether Escape is this dialog's to act on: only while it is the one on top
 * -- the last dialog drawn, whether it was opened inside this one (a file
 * browser in a node's dialog) or beside it (the file browser over the Save
 * dialog whose path box it fills). Every dialog hears Escape on the document,
 * and one Escape closed both, in the order the two happened to listen.
 */
function hearsEscape(panel: Element | null, page: Pick<Document, 'querySelectorAll'>): boolean {
  if (!panel) return false;
  const open = page.querySelectorAll('[role="dialog"]');
  return open[open.length - 1] === panel;
}

/**
 * The one modal shell: backdrop, panel, header and footer, Escape, and the
 * focus kept inside -- so every dialog agrees on z-index, on whether a
 * backdrop click closes it, and on keyboard and screen reader support.
 *
 * Anything genuinely per-modal is a prop; everything else lives here once, so
 * a fix to focus handling reaches every dialog in the app at the same time.
 *
 * It is capped at 90vh and scrolls its body: a dialog taller than the window
 * hides its own footer, so Save and Done cannot be reached and the ✕ has gone
 * off the top -- the settings dialog was 1109 pixels in a 720 pixel window.
 */
export default function Modal({
  title,
  onClose,
  children,
  footer,
  maxWidth = 'max-w-lg',
  dismissOnBackdrop = true,
  dismissOnEscape = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // What had the focus before the dialog, read as it is first drawn: a field
  // in it may take the focus (autoFocus) before the effect below runs.
  const [before] = useState(() => (typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null));

  useEffect(() => {
    const panel = panelRef.current;
    const focused = document.activeElement as HTMLElement | null;
    // A field in it that took the focus keeps it. Otherwise the
    // panel itself takes it, rather than a guessed first field: that puts the
    // screen reader inside the dialog and makes Escape work at once. Closed,
    // the focus goes back where it came from -- to the Save box, when this
    // was the file browser opened over it.
    const inside = !!panel && panel.contains(focused);
    const cameFrom = inside ? before : focused;
    if (!inside) panel?.focus();
    return () => cameFrom?.focus?.();
  }, [before]);

  useEffect(() => {
    if (!dismissOnEscape) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // One Escape, one dialog: the one on top takes it, and marks it taken
      // for a dialog under it that hears it after this one has closed.
      if (event.key !== 'Escape' || event.defaultPrevented || !hearsEscape(panelRef.current, document)) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dismissOnEscape, onClose]);

  // Focus that lands outside the dialog on top -- a Tab from the address bar,
  // a script -- is brought back: behind the backdrop, nothing can be clicked.
  useEffect(() => {
    const keepIn = (event: FocusEvent) => {
      const panel = panelRef.current;
      if (panel && !panel.contains(event.target as Node) && hearsEscape(panel, document)) panel.focus();
    };
    document.addEventListener('focusin', keepIn);
    return () => document.removeEventListener('focusin', keepIn);
  }, []);

  // Keep Tab inside the dialog: without this the next Tab lands on the canvas
  // behind the backdrop, where clicks do not even reach.
  const onKeyDownCapture = (event: React.KeyboardEvent) => {
    if (event.key !== 'Tab' || !panelRef.current) return;
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      event.preventDefault();
      last.focus();
    }
  };

  // `nokey`: a key pressed in a dialog is the dialog's. ReactFlow passes over
  // a key only in a text field or under `.nokey`, so Backspace on a focused
  // button deleted the node selected on the canvas behind the dialog.
  return (
    <div
      className="nokey fixed inset-0 flex items-center justify-center"
      style={{ background: SCRIM, zIndex: 50 }}
      onClick={dismissOnBackdrop ? onClose : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`rounded-xl overflow-hidden shadow-2xl w-full ${maxWidth} mx-4 outline-none flex flex-col`}
        style={{ ...PANEL, maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
        onKeyDownCapture={onKeyDownCapture}
      >
        <div
          className="flex items-center justify-between px-5 py-3 shrink-0"
          style={{ background: SUNKEN, borderBottom: `1px solid ${LINE}` }}
        >
          <span id={titleId} className="text-sm font-semibold" style={{ color: TEXT }}>{title}</span>
          <Button variant="quiet" size="sm" onClick={onClose} aria-label="Close" title="Close">✕</Button>
        </div>

        <div className="flex-1 overflow-y-auto">{children}</div>

        {footer && (
          <div
            className="flex items-center justify-end gap-2 px-5 py-3 shrink-0"
            style={{ borderTop: `1px solid ${LINE}` }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
