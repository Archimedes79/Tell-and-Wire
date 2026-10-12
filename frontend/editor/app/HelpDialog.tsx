import { useState } from 'react';
import Modal from '../../deployment/gui/kit/ui/Modal';
import Markdown from '../../deployment/gui/kit/ui/Markdown';
import { ACCENT, ACCENT_FILL, DIM, LINE, MUTED, TEXT } from '../../deployment/gui/kit/ui/theme';
import { CHAPTERS } from './help';

/**
 * Help: Getting started and the user guide, a chapter at a time. The list of chapters is always in
 * sight on the left, so the guide is read where it is needed and not scrolled through.
 */
export default function HelpDialog({ onClose }: { onClose: () => void }) {
  const [at, setAt] = useState(CHAPTERS[0].id);
  const chapter = CHAPTERS.find((one) => one.id === at) ?? CHAPTERS[0];
  return (
    <Modal title="Help" onClose={onClose} maxWidth="max-w-5xl">
      <div className="flex" style={{ height: '70vh' }}>
        <nav className="w-60 shrink-0 overflow-y-auto py-3 px-2" style={{ borderRight: `1px solid ${LINE}` }} aria-label="Chapters">
          {CHAPTERS.map((one, index) => (
            <div key={one.id}>
              {index === 1 && <div className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: DIM }}>User guide</div>}
              {one.id === 'about' && <div className="mx-3 my-2" style={{ borderTop: `1px solid ${LINE}` }} />}
              <button
                type="button"
                onClick={() => setAt(one.id)}
                aria-current={one.id === at ? 'true' : undefined}
                className="w-full rounded-md px-3 py-1.5 text-left text-sm hover-raise"
                style={{
                  color: one.id === at ? TEXT : MUTED,
                  background: one.id === at ? ACCENT_FILL : 'transparent',
                  boxShadow: one.id === at ? `inset 3px 0 0 ${ACCENT}` : undefined,
                  fontWeight: one.id === at ? 600 : 400,
                }}
              >
                {one.title}
              </button>
            </div>
          ))}
        </nav>
        <article key={chapter.id} className="min-w-0 flex-1 overflow-y-auto px-8 py-5" style={{ maxWidth: '48rem' }}>
          <Markdown source={chapter.body} />
        </article>
      </div>
    </Modal>
  );
}
