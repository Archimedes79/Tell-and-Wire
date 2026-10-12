import { useEffect } from 'react';
import { useGraphStore } from '../document/store/graphStore';
import Button from '../../deployment/gui/kit/ui/Button';
import { ACCENT, DANGER, DANGER_TEXT, LINE, MUTED, SUCCESS, SUCCESS_TEXT, SURFACE, TEXT, WARNING, WARNING_TEXT } from '../../deployment/gui/kit/ui/theme';
import { DONE_FOR_MS, useNotices, type Notice, type NoticeLevel } from '../document/store/noticeBoard';

const LOOK: Record<NoticeLevel, { color: string; ink: string; mark: string; label: string }> = {
  done: { color: SUCCESS, ink: SUCCESS_TEXT, mark: '✓', label: 'Done' },
  info: { color: ACCENT, ink: MUTED, mark: 'i', label: 'Note' },
  warning: { color: WARNING, ink: WARNING_TEXT, mark: '!', label: 'Warning' },
  error: { color: DANGER, ink: DANGER_TEXT, mark: '✕', label: 'Error' },
};

/** One card: its mark in the colour of its level, what is said whole, what to do about it, and ✕. */
function Card({ notice }: { notice: Notice }) {
  const dismiss = useNotices((s) => s.dismiss);
  const look = LOOK[notice.level];
  // What went well, and what is only said, goes by itself; the next of the same key starts the time over.
  useEffect(() => {
    if (notice.sticky) return undefined;
    const timer = setTimeout(() => dismiss(notice.key), DONE_FOR_MS);
    return () => clearTimeout(timer);
  }, [notice.at, notice.sticky, notice.key, dismiss]);
  return (
    <div
      role={notice.level === 'error' ? 'alert' : 'status'}
      className="flex items-start gap-3 rounded-lg px-3 py-2.5 text-sm shadow-2xl"
      style={{ background: SURFACE, border: `1px solid ${LINE}`, borderLeft: `3px solid ${look.color}`, color: TEXT }}
    >
      <span
        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold leading-none"
        style={{ background: look.color, color: SURFACE }}
        aria-label={look.label}
        role="img"
      >
        {look.mark}
      </span>
      <span className="min-w-0 flex-1 break-words" style={notice.level === 'error' ? { color: look.ink } : undefined}>{notice.text}</span>
      {notice.action && (
        <Button size="sm" className="shrink-0" onClick={() => { notice.action?.run(); dismiss(notice.key); }}>{notice.action.label}</Button>
      )}
      <Button variant="quiet" size="sm" className="-mr-1 shrink-0" onClick={() => dismiss(notice.key)} aria-label="Dismiss" title="Dismiss">✕</Button>
    </div>
  );
}

/**
 * What the editor says, in a corner under the header, over the page and not in it: a notice never
 * moves what is under it. Only those of the document that is open (`Notice.document`).
 */
export default function Notices() {
  const notices = useNotices((s) => s.notices);
  const document = useGraphStore((s) => s.document);
  const here = notices.filter((notice) => notice.document === document);
  if (!here.length) return null;
  return (
    <div className="pointer-events-none fixed right-4 top-16 z-40 flex w-[min(26rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {here.map((notice) => (
        <div key={notice.key} className="pointer-events-auto"><Card notice={notice} /></div>
      ))}
    </div>
  );
}
