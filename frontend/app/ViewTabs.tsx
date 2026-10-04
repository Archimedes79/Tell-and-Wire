import Button from './ui/Button';
import { SUCCESS } from './ui/theme';

export type EditorView = 'graph' | 'design' | 'app';

/** The views, by the one word each: the graph is nodes and wires, the page is blocks. */
const VIEW_TABS: { id: EditorView; label: string; hint: string }[] = [
  { id: 'graph', label: 'Graph', hint: 'Nodes and the wires between them' },
  { id: 'design', label: 'Page', hint: 'The page this tool shows — build it here, block by block' },
  { id: 'app', label: 'App', hint: 'The tool, running: its page, as whoever gets it will use it. ■ Stop ends it' },
];

/**
 * Graph and page, side by side as two views of one document -- in the
 * header, beside the tool's name, since they are views of it.
 *
 * They are not separate documents: the page is the graph's own, its blocks
 * connected to the graph's start and end points by name -- a button that
 * fires one is a run that begins there. The Page tab exists because
 * designing a page through a keyhole, inside a node's dialog, was what it
 * replaced.
 *
 * The third is there while the tool runs (▶ Run, `app/application.ts`):
 * its page, the component a deployed tool runs -- to go back to from the graph,
 * whose cards light up as the page is used. Stopped, it goes.
 */
export default function ViewTabs({
  view, onChange, running = false,
}: { view: EditorView; onChange: (view: EditorView) => void; running?: boolean }) {
  return (
    <nav className="flex items-center gap-1 shrink-0" aria-label="Views">
      {VIEW_TABS.filter((tab) => tab.id !== 'app' || running).map((tab) => {
        const active = view === tab.id;
        return (
          <Button
            key={tab.id}
            variant={active ? 'secondary' : 'quiet'}
            className="h-9 whitespace-nowrap"
            onClick={() => onChange(tab.id)}
            title={tab.hint}
            aria-current={active ? 'page' : undefined}
          >
            {tab.id === 'app' && <span className="mr-1.5" style={{ color: SUCCESS }} aria-hidden="true">●</span>}
            {tab.label}
          </Button>
        );
      })}
    </nav>
  );
}
