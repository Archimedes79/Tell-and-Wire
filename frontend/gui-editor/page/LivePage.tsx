import { memo } from 'react';
import type { GuiWidget } from '../../app/graph';
import { roundGoing, setEdit, useSession } from '../../app/api/session';
import { GuiSurfacePage } from './GuiPage';
import { pageInUse, roundError, type PageDesign } from './pageInUse';

/**
 * The page in use, for the host that runs rounds: *design* with what the
 * session holds. It listens to the session for itself, and only to what the
 * page shows -- not to every tick of a round, which would draw every chart
 * again ten times a second -- and, memoed, is not drawn again for its host's.
 */
const LivePage = memo(function LivePage({ design, onEvent }: { design: PageDesign; onEvent: (block: GuiWidget) => void }) {
  const view = useSession((s) => s.view);
  const edits = useSession((s) => s.edits);
  const busy = useSession(roundGoing);
  const error = useSession((s) => roundError(s.round));
  return <GuiSurfacePage page={pageInUse(design, { view, edits, busy, error })} onValue={(block, value) => setEdit(block.id, value)} onEvent={onEvent} />;
});

export default LivePage;
