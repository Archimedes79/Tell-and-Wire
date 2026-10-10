import { useCallback, useEffect, useRef, useState } from 'react';
import type { GuiWidget } from '../../app/graph';
import LivePage from '../page/LivePage';
import { useRound } from '../page/useRound';
import CallForms from '../page/CallForms';
import type { InterfaceEntry } from '../../../backend/gui-editor/graphInterface.ts';
import { connectionsOf, type PageDesign } from '../page/pageInUse';
import RequirementsDialog from '../../app/dialogs/RequirementsDialog';
import DeliveredHeader from '../page/DeliveredHeader';
import RuntimeAISettings from './RuntimeAISettings';
import { call } from '../../app/api/client';
import { roundGoing, startOver, useSession, watchSession } from '../../app/api/session';
import { errorText } from '../../app/api/errorText';
import Button from '../../app/ui/Button';
import { schemeVars } from '../../app/ui/scheme';
import { DANGER_FILL, DANGER_TEXT, DIM, SUNKEN } from '../../app/ui/theme';

/** Which design of which session: what a drawn page was drawn from. */
const designOf = (session: string, revision: number): string => `${session}#${revision}`;

/**
 * The deployed graph's front-end.
 *
 * It knows the graph only as the runtime API says it: the page as it was
 * designed (`page`), what the graph offers by name (`interface`) -- which
 * block fires which start point, what it hands back -- and the session, which
 * the server tells as it changes (`stream`): what each block holds and shows,
 * what each output showed, the round going or gone. A block used sets what
 * it holds by its id; one that fires a start point starts a round there. What using it leaves behind is the server's, so a page reloaded, or
 * opened in a second window, shows what the first one did. The design is
 * loaded again whenever the server holds another one -- the editor's
 * document, edited while the tool is open beside it.
 *
 * Every block is drawn through the component the editor used -- `GuiPage`,
 * each widget's `View` -- so a deployed tool cannot look or behave
 * differently from what was designed.
 *
 * Served by the bundle's `backend/app/serve.ts` at `runtime.html`.
 */
export default function RuntimeApp() {
  const [design, setDesign] = useState<(PageDesign & { scheme: string; startsWhole: boolean; drawn: string; events: InterfaceEntry[] }) | null>(null);
  const [loadError, setLoadError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const view = useSession((s) => s.view);
  const current = useSession((s) => s.round);
  const busy = useSession(roundGoing);

  const load = useCallback(() => {
    Promise.all([call('page'), call('interface')])
      .then(([page, offered]) => setDesign({
        name: page.name,
        description: page.description,
        scheme: page.scheme,
        blocks: page.blocks as unknown as GuiWidget[],
        ...connectionsOf(offered.events),
        outputs: offered.outputs.map(({ name, label }) => ({ name, label })),
        startsWhole: page.starts_whole,
        drawn: designOf(page.session, page.design_revision),
        events: offered.events,
      }))
      .catch((error) => setLoadError(errorText(error, 'Could not load the tool.')));
  }, []);
  useEffect(() => {
    load();
    return watchSession();
  }, [load]);
  // Another design than the one drawn: another session, or this one's edited.
  const held = view ? designOf(view.session, view.design_revision) : null;
  useEffect(() => {
    if (design && held && held !== design.drawn) load();
  }, [design, held, load]);

  // What the page still needs before a round it starts can run -- a file
  // nobody chose on a picker -- is asked for in the same window the editor
  // uses (`useRound`).
  const round = useRound();

  // Opened, a tool that nothing on its page and no start point of its own starts runs
  // whole once, as ▶ Run starts it in the editor and a program runs when it is
  // started. Its start points that start themselves are the server's: they run on its clock
  // whether or not a page is open.
  const started = useRef(false);
  const start = useRef(round.run);
  start.current = round.run;
  useEffect(() => {
    if (!design?.startsWhole || started.current) return;
    started.current = true;
    void start.current(null);
  }, [design]);

  const clock = view?.clock;
  const finishedAt = view?.finished_at;
  const fire = useCallback((block: GuiWidget) => { if (design) void start.current(design.fires[block.id], block.id); }, [design]);

  return (
    // A deployed tool looks like the thing that was designed, scheme included.
    <div className="flex flex-col h-screen overflow-hidden" style={{ ...schemeVars(design?.scheme), background: SUNKEN }}>
      <DeliveredHeader
        name={design?.name ?? ''}
        description={design?.description ?? ''}
        round={current}
        tools={(
          <>
            <Button
              size="sm"
              className="shrink-0"
              onClick={() => { void startOver(); }}
              disabled={busy}
              title="Forget what using this tool left behind: what was sent, what it remembers, what the page holds"
            >
              ↺ Start over
            </Button>
            <Button
              size="sm"
              className="shrink-0"
              onClick={() => setShowSettings(true)}
              title="Point this tool at a different AI"
            >
              ⚙ AI Settings
            </Button>
          </>
        )}
        note={clock?.runs_by_itself && (
          <span className="text-xs whitespace-nowrap" style={{ color: DIM }} title="This tool runs by itself; the clock is in the server, so it keeps running with this page closed.">
            {current && !current.done ? '⏱ running…' : clock.next_at
              ? `⏱ next ${new Date(clock.next_at).toLocaleTimeString()}`
              : finishedAt ? `⏱ ran ${new Date(finishedAt).toLocaleTimeString()}` : '⏱'}
          </span>
        )}
      />

      <div className="flex-1 relative overflow-auto">
        {loadError && (
          <div className="m-6 text-sm rounded-lg px-4 py-3" style={{ background: DANGER_FILL, color: DANGER_TEXT }}>
            {loadError}
          </div>
        )}
        {!loadError && !design && (
          <div className="m-6 text-sm" style={{ color: DIM }}>Loading…</div>
        )}

        {/* A call to each start point a call starts, as a script would make it --
            then the page, or, when it has no blocks, what the tool does and
            what its run hands back: the editor's running application draws the same. */}
        {design && (
          <CallForms events={design.events} sent={view?.sent ?? {}} busy={busy} onCall={(event, values) => { void round.run(event, undefined, values); }} />
        )}
        {design && (
          <LivePage design={design} onEvent={fire} />
        )}
        <RequirementsDialog
          requirements={round.requirements}
          onSubmit={round.submit}
          onCancel={round.cancel}
        />
      </div>

      {showSettings && <RuntimeAISettings onClose={() => setShowSettings(false)} />}
    </div>
  );
}
