import type { ReactNode } from 'react';
import { LINE, SUNKEN, SURFACE, TEXT } from '../../app/ui/theme';

/** What a pane is called, with what goes beside it: the file's chip, a way to open it. */
export function PaneHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <h2 className="text-base font-semibold" style={{ color: TEXT }}>{title}</h2>
      {children}
    </div>
  );
}

/**
 * The node view's frame: a header, the column to choose in on the left, and
 * the pane to work in beside it. Drawing only -- what the rows and the panes
 * do is the container's (`node/NodeView.tsx`).
 */
export default function NodeViewLayout({ header, left, children }: { header: ReactNode; left: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0" style={{ background: SUNKEN }}>
      <header className="flex items-center gap-3 px-4 shrink-0" style={{ height: 44, background: SURFACE, borderBottom: `1px solid ${LINE}` }}>
        {header}
      </header>
      <div className="flex flex-1 min-h-0">
        <aside className="flex flex-col gap-4 overflow-y-auto shrink-0 p-5" style={{ width: 320, background: SURFACE, borderRight: `1px solid ${LINE}` }}>
          {left}
        </aside>
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="mx-auto flex flex-col gap-3 px-6 py-5" style={{ maxWidth: 880 }}>{children}</div>
        </main>
      </div>
    </div>
  );
}
