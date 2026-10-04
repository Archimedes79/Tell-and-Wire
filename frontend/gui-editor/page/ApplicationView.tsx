import { useMemo, useState } from 'react';
import type { GraphNode } from '../../app/graph';
import { GuiSurfacePage } from './GuiPage';
import { connectionsOf, pageInUse } from './pageInUse';
import { useRound } from './useRound';
import DeliveredHeader from './DeliveredHeader';
import CallForms from './CallForms';
import { roundExplained } from './roundWords';
import KeptFold from './KeptFold';
import RequirementsDialog from '../../app/dialogs/RequirementsDialog';
import { useGraphStore } from '../../app/store/graphStore';
import { graphEdge } from '../../app/document/wires';
import { setEdit, startOver, useSession } from '../../app/api/session';
import { errorText } from '../../app/api/errorText';
import { call } from '../../app/api/client';
import { interfaceOf } from '../../../backend/gui-editor/graphInterface.ts';
import { pageStarts } from '../../../graph/execution/triggers.ts';
import { registry as engineRegistry } from '../../../graph/nodes/registry.ts';
import { DANGER_TEXT, DIMMER, LINE, MUTED, NEUTRAL_BUTTON, SUNKEN } from '../../app/ui/theme';

/** Hand the server the document, so what runs is what is being edited. */
const holdDocument = () => useGraphStore.getState().holdDocument();

/**
 * The application, running (▶ Run, `app/application.ts`): its page, as the
 * deployed tool draws it -- the same component, not a rendition.
 *
 * `GuiSurfacePage` is what `runtime/RuntimeApp.tsx` renders when a bundle is
 * opened on someone else's machine, under the same `DeliveredHeader`, and
 * each round goes through the same `useRound` against the same session. So
 * what is seen here is what they get: a block unreadable, mis-sized or
 * missing in the bundle is so here, because there is nothing else to be.
 *
 * It is the tool in use, not the document: what is set on its page is the
 * session's, never an edit of the graph -- nothing to undo, nothing to save.
 * What the page starts lights up the nodes on the graph next door. The graph
 * runs when the page is used -- a block that fires a start point -- and when
 * it is called: for a start point a call starts, this tab is the caller
 * (`CallForms`), as a script or a frontend would be.
 */
export default function ApplicationView() {
  const metadata = useGraphStore((s) => s.metadata);
  const nodes = useGraphStore((s) => s.rfNodes);
  const wires = useGraphStore((s) => s.rfEdges);
  const widgets = useGraphStore((s) => s.page);
  // What starts a round and what one hands back are the nodes' to say, and
  // which block fires which the page's; what a call is sent that the graph
  // reads, the wires out of each start point's.
  const graph = useMemo(
    () => ({ metadata, nodes: nodes.map((node) => node.data.graphNode as GraphNode), edges: wires.map(graphEdge), page: { blocks: widgets } }),
    [metadata, nodes, wires, widgets],
  );
  // Whether using the page starts the graph -- or only shows what its start
  // points that start themselves, or its one run at start, made.
  const starts = pageStarts(graph, engineRegistry);
  // The graph's names, as the runtime API tells a delivered tool them: which
  // block fires which start point, which blocks a round is sent, and what a
  // page without blocks shows -- the outputs, under their labels.
  const offered = useMemo(() => interfaceOf(graph, engineRegistry), [graph]);
  const called = offered.events.some((event) => event.started_by === 'call');
  const session = useSession();
  const round = useRound(holdDocument);
  // What the last round did, and why each node that did not run did not -- by the names on the canvas.
  const nameOf = (id: string): string => {
    const node = nodes.find((one) => one.id === id)?.data.graphNode as GraphNode | undefined;
    return node?.label || widgets.find((block) => block.id === id)?.label || id;
  };
  const explained = roundExplained(session.round, nameOf);
  // A round that went as it should, kept as a test of the project: run again by `test`, asking no model.
  const project = useGraphStore((s) => (s.isProject ? s.currentFilePath : null));
  const [keeping, setKeeping] = useState<{ round: string; said: string } | null>(null);
  const keepable = !!project && session.round?.done && session.round.result?.status === 'success';
  const keep = async () => {
    const id = session.round!.round_id;
    setKeeping({ round: id, said: 'Keeping…' });
    try {
      const { file } = await call('keepRound', { id, path: project! });
      setKeeping({ round: id, said: `Kept as ${file} -- the test command runs it again, asking no model.` });
    } catch (error) {
      setKeeping({ round: id, said: errorText(error, 'It could not be kept.') });
    }
  };
  const [opening, setOpening] = useState('');

  /**
   * The tool as it is delivered, in a window of its own: the document is
   * handed to the server and `runtime.html` is opened against it -- the same
   * page, the same entry point and the same routes a bundle serves, with no
   * editor in the window, and the same session as this tab.
   */
  const openAsTool = async () => {
    setOpening('Opening…');
    try {
      await holdDocument();
      // Named, so pressing it again reloads the tool's own window instead of
      // leaving a trail of them.
      const opened = window.open('runtime.html', 'ai-graph-tool');
      setOpening(opened ? '' : 'The browser blocked the window. Allow pop-ups for this page.');
    } catch (error) {
      setOpening(errorText(error, 'The tool could not be opened.'));
    }
  };

  const design = {
    name: metadata.name,
    description: metadata.description,
    scheme: metadata.gui_scheme,
    blocks: widgets,
    ...connectionsOf(offered.events),
    outputs: offered.outputs.map(({ name, label }) => ({ name, label })),
    empty: nodes.length === 0,
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: SUNKEN }}>
      <DeliveredHeader
        name={metadata.name}
        description={metadata.description}
        round={session.round}
        tools={(
          <>
            {opening && opening !== 'Opening…' && (
              <span className="text-xs" style={{ color: DANGER_TEXT }}>{opening}</span>
            )}
            <button
              onClick={() => { void openAsTool(); }}
              disabled={opening === 'Opening…'}
              className="px-3 py-1.5 text-xs rounded-lg shrink-0"
              style={NEUTRAL_BUTTON}
              title="A window of its own, served exactly as a bundle serves it. Nothing is written to disk."
            >
              ⧉ Open as a tool
            </button>
          </>
        )}
      />
      <div className="px-8 py-1.5 flex items-center gap-3" style={{ borderBottom: `1px solid ${LINE}` }}>
        <span className="text-xs" style={{ color: MUTED }}>
          Running
        </span>
        <span className="text-xs" style={{ color: DIMMER }}>
          {starts
            ? 'As whoever gets it will use it: the graph runs when you use the page. ■ Stop ends it.'
            : called
              ? 'As whoever gets it will use it: it runs when it is called -- here, as a script would call it. ■ Stop ends it.'
              : 'As whoever gets it will use it: what starts the graph starts it, and the page shows what it makes. ■ Stop ends it.'}
        </span>
        {explained && (
          <span className="text-xs ml-auto truncate" style={{ color: MUTED }}
            title={explained.why.length ? explained.why.join('\n') : 'Every node it touched ran.'}>
            {explained.line}
          </span>
        )}
        {keepable && keeping?.round !== session.round!.round_id && (
          <button type="button" onClick={() => { void keep(); }} className="px-2 py-0.5 text-xs rounded-lg shrink-0" style={NEUTRAL_BUTTON}
            title="Keep this round as a test of the project: what it was sent, what its models answered and what came back, in tests/ -- run again by test, asking no model">
            Keep as a test
          </button>
        )}
        {keeping && keeping.round === session.round?.round_id && (
          <span className="text-xs shrink-0" style={{ color: DIMMER }}>{keeping.said}</span>
        )}
      </div>

      <KeptFold kept={session.view?.kept} nameOf={nameOf} onStartOver={() => { void startOver(); }} />

      <CallForms
        events={offered.events}
        sent={session.view?.sent ?? {}}
        onCall={(event, values) => { void round.run(event, undefined, values); }}
      />

      <GuiSurfacePage
        page={pageInUse(design, session)}
        onValue={(block, value) => setEdit(block.id, value)}
        onEvent={(block) => { void round.run(design.fires[block.id], block.id); }}
      />

      <RequirementsDialog
        requirements={round.requirements}
        onSubmit={round.submit}
        onCancel={round.cancel}
      />
    </div>
  );
}
