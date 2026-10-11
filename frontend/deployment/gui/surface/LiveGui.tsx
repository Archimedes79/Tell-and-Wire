import { memo } from 'react';
import type { GuiWidget } from '../../../editor/document/graph';
import { roundGoing, setEdit, useSession } from '../kit/api/session';
import { GuiSurface } from './GuiSurface';
import { guiInUse, roundError, type GuiDesign } from './guiInUse';

/**
 * The gui in use, for the host that runs rounds: *design* with what the
 * session holds. It listens to the session for itself, and only to what the
 * gui shows -- not to every tick of a round, which would draw every chart
 * again ten times a second -- and, memoed, is not drawn again for its host's.
 */
const LiveGui = memo(function LiveGui({ design, onEvent }: { design: GuiDesign; onEvent: (block: GuiWidget) => void }) {
  const view = useSession((s) => s.view);
  const edits = useSession((s) => s.edits);
  const busy = useSession(roundGoing);
  const error = useSession((s) => roundError(s.round));
  return <GuiSurface gui={guiInUse(design, { view, edits, busy, error })} onValue={(block, value) => setEdit(block.id, value)} onEvent={onEvent} />;
});

export default LiveGui;
