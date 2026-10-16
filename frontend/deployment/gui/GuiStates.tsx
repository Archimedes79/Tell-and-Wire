import { useCallback, useEffect, useState } from 'react';
import Modal from './kit/ui/Modal';
import { call } from './kit/api/client';
import { errorText } from './kit/api/errorText';
import Button from './kit/ui/Button';
import { ACCENT_FILL, ACCENT_TEXT, DIM, FIELD, LINE, MUTED } from './kit/ui/theme';

interface Saved { name: string; saved_at: string }

/**
 * What this tool keeps, saved under a name and brought back: the explicit way to keep a state, the one a person sees.
 *
 * A tool in use writes nothing of what its steps made last; what it keeps for itself is the memory nodes' fields and what the GUI holds
 * and shows (`state.json`). Here a person saves that now, under a name -- a plain file in `states/` beside the tool -- and loads it
 * again, also after the tool was started anew. What a design no longer has a place for is dropped, and said.
 */
export default function GuiStates({ onClose }: { onClose: () => void }) {
  const [saved, setSaved] = useState<Saved[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState('');
  const [failed, setFailed] = useState('');

  const list = useCallback(async () => {
    try {
      setSaved((await call('states')).states);
    } catch (error) {
      setFailed(errorText(error, 'Could not read the saved states.'));
    }
  }, []);
  useEffect(() => { void list(); }, [list]);

  const act = async (work: () => Promise<string>): Promise<void> => {
    setBusy(true);
    setFailed('');
    setSaid('');
    try {
      setSaid(await work());
      await list();
    } catch (error) {
      setFailed(errorText(error, 'That did not work.'));
    } finally {
      setBusy(false);
    }
  };

  const save = (as: string) => act(async () => {
    const done = await call('saveState', { name: as });
    return `Saved as “${done.name}”.`;
  });
  const load = (which: string) => act(async () => {
    const { dropped } = await call('loadState', { name: which });
    return dropped.length ? `Loaded “${which}”. ${dropped.join(' ')}` : `Loaded “${which}”.`;
  });

  return (
    <Modal title="State" onClose={onClose} maxWidth="max-w-xl" footer={<Button onClick={onClose}>Close</Button>}>
      <div className="p-5 space-y-4 text-xs">
        <p style={{ color: DIM }}>
          Save what this tool keeps now -- what it remembers and what its blocks hold and show -- under a name, and load it again later.
          What its steps made last is not part of it.
        </p>
        <div className="flex items-center gap-2">
          <input
            className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm"
            style={FIELD}
            value={name}
            placeholder="Name of the state"
            aria-label="Name of the state"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && name.trim() && !busy) void save(name); }}
          />
          <Button disabled={busy || !name.trim()} onClick={() => { void save(name); }}>Save</Button>
        </div>
        {(said || failed) && (
          <div role="status" className="rounded-lg px-3 py-2" style={failed ? { color: MUTED, border: `1px solid ${LINE}` } : { background: ACCENT_FILL, color: ACCENT_TEXT }}>
            {failed || said}
          </div>
        )}
        <div className="space-y-1">
          {saved?.length === 0 && <p style={{ color: DIM }}>Nothing is saved yet.</p>}
          {saved?.map((one) => (
            <div key={one.name} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ border: `1px solid ${LINE}` }}>
              <span className="flex-1 min-w-0 truncate text-sm">{one.name}</span>
              <span style={{ color: DIM }}>{new Date(one.saved_at).toLocaleString()}</span>
              <Button size="sm" disabled={busy} title="Replace what is kept now by this state" onClick={() => { void load(one.name); }}>Load</Button>
              <Button size="sm" disabled={busy} title="Save what is kept now under this name, replacing it" onClick={() => { void save(one.name); }}>Replace</Button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
