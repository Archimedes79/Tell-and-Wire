import { MUTED, SUCCESS_TEXT, SURFACE, TEXT } from '../../deployment/gui/kit/ui/theme';

export type EditorView = 'graph' | 'design' | 'app';

/** The views, by the one word each: the graph is nodes and wires, the GUI is blocks. */
const VIEW_TABS: { id: EditorView; label: string; hint: string }[] = [
  { id: 'graph', label: 'Graph', hint: 'Nodes and the wires between them' },
  { id: 'design', label: 'GUI', hint: 'The GUI this tool shows — build it here, block by block' },
  { id: 'app', label: 'App', hint: 'The tool, running: its GUI, as whoever gets it will use it. ■ Stop ends it' },
];

/**
 * Graph and GUI, side by side as two views of one document -- in the
 * header, beside the tool's name, since they are views of it.
 *
 * They are not separate documents: the GUI is the graph's own, its blocks
 * connected to the graph's start and end points by name -- a button that
 * fires one is a run that begins there.
 *
 * The third is there while the tool runs (▶ Run, `document/application.ts`):
 * its GUI, the component a deployed tool runs -- to go back to from the graph,
 * whose cards light up as the GUI is used. Stopped, it goes.
 */
export default function ViewTabs({
  view, onChange, running = false,
}: { view: EditorView; onChange: (view: EditorView) => void; running?: boolean }) {
  return (
    // A segmented control: the views are one choice, so they sit in one track and the chosen one lifts out of it.
    <nav
      className="flex items-center gap-0.5 shrink-0 p-[3px] rounded-[10px]"
      style={{ background: `color-mix(in srgb, ${TEXT} 7%, ${SURFACE})` }}
      aria-label="Views"
    >
      {VIEW_TABS.filter((tab) => tab.id !== 'app' || running).map((tab) => {
        const active = view === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className="h-[30px] px-4 rounded-lg text-sm whitespace-nowrap"
            style={{
              background: active ? SURFACE : 'transparent',
              color: active ? TEXT : MUTED,
              fontWeight: active ? 600 : 500,
              boxShadow: active ? '0 1px 2px rgba(16,24,40,0.14)' : undefined,
            }}
            onClick={() => onChange(tab.id)}
            title={tab.hint}
            aria-current={active ? 'page' : undefined}
          >
            {tab.id === 'app' && <span className="mr-1.5" style={{ color: SUCCESS_TEXT }} aria-hidden="true">●</span>}
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
