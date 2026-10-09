import Button from '../../app/ui/Button';
import { ACCENT_FILL, ACCENT_TEXT } from '../../app/ui/theme';
import GenerationTranscript, { useLiveGeneration } from '../authoring/GenerationTranscript';
import LiveGeneration from '../authoring/LiveGeneration';

/**
 * What the model is doing for the node and what it last said: the prompt as it
 * goes out while a file is written, the result in a line, a way to stop
 * waiting, and the whole exchange behind it. Under whichever pane is open --
 * Auto generate is pressed in the column, not in the pane.
 */
export default function WritingStatus({ busy, message, onStop }: { busy: boolean; message: string; onStop: () => void }) {
  const live = useLiveGeneration();
  return (
    <div className="flex flex-col gap-2">
      {busy && live.length > 0 && <LiveGeneration calls={live} minHeight={80} />}
      {message && (
        <div className="flex items-center gap-2 text-xs px-2 py-1.5 rounded" style={{ background: ACCENT_FILL, color: ACCENT_TEXT }} role="status">
          <span className="flex-1 min-w-0">{message}</span>
          {busy && (
            <Button size="sm" className="shrink-0" onClick={onStop} title="The request goes on at the server: what it still sends back is not written">
              Stop waiting
            </Button>
          )}
        </div>
      )}
      <GenerationTranscript />
    </div>
  );
}
