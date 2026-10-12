// The look of the editor: a short list in the toolbar. White is first, and the other schemes are the ones a tool can be given.

import { SCHEMES } from '../../deployment/gui/kit/ui/scheme';
import { FIELD, TEXT } from '../../deployment/gui/kit/ui/theme';
import { useLook } from '../document/store/look';

/** White first, then the rest in the order the schemes are kept in. */
const ORDER = ['office', ...SCHEMES.map((one) => one.id).filter((id) => id !== 'office')];

export default function LookPicker() {
  const id = useLook((s) => s.id);
  const choose = useLook((s) => s.choose);
  return (
    <select
      aria-label="Look of the editor" title="The colours of this editor, kept in this browser. A tool has its own look, chosen where it is made."
      value={id} onChange={(event) => choose(event.target.value)}
      style={{ ...FIELD, color: TEXT, height: 32, minHeight: 0, padding: '0 8px', fontSize: 13, width: 'auto' }}
    >
      {ORDER.map((one) => <option key={one} value={one}>{one === 'office' ? 'White' : (SCHEMES.find((s) => s.id === one)?.label ?? one).split(' — ')[0]}</option>)}
    </select>
  );
}
