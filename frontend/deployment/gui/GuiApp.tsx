import { useCallback, useEffect, useRef, useState } from 'react';
import type { GuiWidget } from './kit/guiWidget';
import LiveGui from './surface/LiveGui';
import LiveWindows, { useWindowFire } from '../windows/LiveWindows';
import { isWindows, pageNotes } from '../windows/windowsInUse';
import { useRound } from './surface/useRound';
import CallForms from './surface/CallForms';
import type { InterfaceEntry } from '../../../graph/interface.ts';
import { connectionsOf, type GuiDesign } from './surface/guiInUse';
import RequirementsDialog from './kit/dialogs/RequirementsDialog';
import DeliveredHeader from './surface/DeliveredHeader';
import GuiAISettings from './GuiAISettings';
import { call } from './kit/api/client';
import { roundGoing, startOver, useSession, watchSession } from './kit/api/session';
import { errorText } from './kit/api/errorText';
import Button from './kit/ui/Button';
import { schemeVars } from './kit/ui/scheme';
import { DANGER_FILL, DANGER_TEXT, DIM, SUNKEN } from './kit/ui/theme';

/** The blocks of a tool whose design is not loaded yet. */
const NO_BLOCKS = { blocks: [] as GuiWidget[] };

/** Which design of which session: what a drawn gui was drawn from. */
const designOf = (session: string, revision: number): string => `${session}#${revision}`;

/**
 * The deployed graph's front-end.
 *
 * It knows the graph only as the runtime API says it: the gui as it was
 * designed (`gui`), what the graph offers by name (`interface`) -- which
 * block fires which start point, what it hands back -- and the session, which
 * the server tells as it changes (`stream`): what each block holds and shows,
 * what each output showed, the round going or gone. A block used sets what
 * it holds by its id; one that fires a start point starts a round there. What using it leaves behind is the server's, so a page reloaded, or
 * opened in a second window, shows what the first one did. The design is
 * loaded again whenever the server holds another one -- the editor's
 * document, edited while the tool is open beside it.
 *
 * Every block is drawn through the component the editor used -- `GuiSurface`,
 * each widget's `View` -- so a deployed tool cannot look or behave
 * differently from what was designed.
 *
 * Served by the bundle's `backend/deployment/host/serve.ts` at `gui.html`.
 */
export default function GuiApp() {
  const [design, setDesign] = useState<(GuiDesign & { scheme: string; startsWhole: boolean; drawn: string; events: InterfaceEntry[] }) | null>(null);
  const [loadError, setLoadError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const view = useSession((s) => s.view);
  const current = useSession((s) => s.round);
  const busy = useSession(roundGoing);

  const load = useCallback(() => {
    Promise.all([call('gui'), call('interface')])
      .then(([gui, offered]) => setDesign({
        name: gui.name,
        description: gui.description,
        scheme: gui.scheme,
        blocks: gui.blocks as unknown as GuiWidget[],
        ...connectionsOf(offered.events),
        outputs: offered.outputs.map(({ name, label }) => ({ name, label })),
        startsWhole: gui.starts_whole,
        drawn: designOf(gui.session, gui.design_revision),
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

  // What the gui still needs before a round it starts can run -- a file
  // nobody chose on a picker -- is asked for in the same window the editor
  // uses (`useRound`).
  const round = useRound();

  // Opened, a tool that nothing on its gui and no start point of its own starts runs
  // whole once, as ▶ Run starts it in the editor and a program runs when it is
  // started. Its start points that start themselves are the server's: they run on its clock
  // whether or not a gui is open.
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
  // A tool made of windows runs the one used, and the ones before it that are not current, in order.
  const fireWindow = useWindowFire(design ?? NO_BLOCKS, round);
  // A page that has words of its own says what the tool is itself; its name and description are not said twice above it.
  const worded = !!design && pageNotes(design.blocks).length > 0;

  return (
    // A deployed tool looks like the thing that was designed, scheme included.
    <div className="flex flex-col h-screen overflow-hidden" style={{ ...schemeVars(design?.scheme), background: SUNKEN }}>
      <DeliveredHeader
        name={worded ? '' : design?.name ?? ''}
        description={worded ? '' : design?.description ?? ''}
        round={current}
        tools={(
          <>
            <Button
              size="sm"
              className="shrink-0"
              onClick={() => { void startOver(); }}
              disabled={busy}
              title="Forget what using this tool left behind: what was sent, what it remembers, what the gui holds"
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
          <span className="text-xs whitespace-nowrap" style={{ color: DIM }} title="This tool runs by itself; the clock is in the server, so it keeps running with this gui closed.">
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
            then the gui, or, when it has no blocks, what the tool does and
            what its run hands back: the editor's running application draws the same. */}
        {design && (
          <CallForms events={design.events} sent={view?.sent ?? {}} busy={busy} onCall={(event, values) => { void round.run(event, undefined, values); }} />
        )}
        {design && (isWindows(design.blocks)
          ? <LiveWindows design={design} onEvent={fireWindow} />
          : <LiveGui design={design} onEvent={fire} />)}
        <RequirementsDialog
          requirements={round.requirements}
          onSubmit={round.submit}
          onCancel={round.cancel}
        />
      </div>

      {showSettings && <GuiAISettings onClose={() => setShowSettings(false)} />}
    </div>
  );
}
