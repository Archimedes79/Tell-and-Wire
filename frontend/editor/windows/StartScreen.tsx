import { useState } from 'react';
import { blankPage } from '../../../gui/editor/windows/edit.ts';
import Button from '../../deployment/gui/kit/ui/Button';
import { ACCENT_FILL, ACCENT_TEXT, DANGER_FILL, DANGER_TEXT, DIM, DIMMER, FIELD, LINE, MUTED, SURFACE, TEXT } from '../../deployment/gui/kit/ui/theme';
import { useNotebook } from './notebookStore';

const IDEAS = [
  'Summarize a text I paste, in one, three or ten sentences.',
  'Summarize every text file of a folder, one entry for each file.',
  'Read a CSV file of populations and plot the countries as bars.',
  'Answer questions about a text I give it.',
];

/**
 * Where a notebook begins: a sentence about what the tool should do, a page with nothing on it, or a
 * project that was kept. The sentence is the quick way; whatever it makes is the same cells a person
 * would have written, so it can be changed by hand afterwards.
 */
export default function StartScreen({ onOpen }: { onOpen: () => void }) {
  const [said, setSaid] = useState('');
  const busy = useNotebook((s) => s.busy);
  const error = useNotebook((s) => s.error);
  const calls = useNotebook((s) => s.calls);
  const describe = useNotebook((s) => s.describe);
  const start = useNotebook((s) => s.start);
  const making = busy === 'describing';

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-2xl px-6 py-14">
        <h1 className="text-2xl font-semibold mb-2" style={{ color: TEXT }}>What should the tool do?</h1>
        <p className="text-sm mb-6" style={{ color: MUTED }}>
          A tool is a page of windows. Each window takes something in, does something with it in a sentence or two, and shows what comes out.
          Say it in a few words and the windows are filled in for you; every cell stays yours to change.
        </p>

        <textarea
          aria-label="What should the tool do?"
          autoFocus
          rows={4}
          value={said}
          disabled={making}
          placeholder="e.g. Summarize a text I paste, and let me choose how long the summary is."
          onChange={(event) => setSaid(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && said.trim() && !making) void describe(said.trim());
          }}
          className="w-full rounded-xl px-4 py-3 text-sm"
          style={{ ...FIELD, resize: 'vertical', lineHeight: 1.5 }}
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {IDEAS.map((idea) => (
            <button
              key={idea} type="button" disabled={making} onClick={() => setSaid(idea)}
              className="text-xs rounded-full px-2.5 py-1 hover-raise" style={{ border: `1px solid ${LINE}`, color: MUTED }}
            >
              {idea}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-5">
          <Button variant="primary" disabled={!said.trim() || making} onClick={() => { void describe(said.trim()); }}>
            {making ? 'Making the windows…' : '✨ Make the windows'}
          </Button>
          <span className="text-xs" style={{ color: DIMMER }}>Ctrl + Enter</span>
        </div>

        {making && (
          <p className="text-xs mt-3" style={{ color: DIM }} role="status">
            {calls.length === 0 ? 'Waiting for the model…' : `${calls.length} request${calls.length === 1 ? '' : 's'} sent to the model…`}
          </p>
        )}
        {error && (
          <div className="mt-4 rounded-lg px-4 py-3 text-sm" role="alert" style={{ background: DANGER_FILL, color: DANGER_TEXT }}>{error}</div>
        )}

        <div className="mt-10 pt-6 flex flex-wrap items-center gap-3" style={{ borderTop: `1px solid ${LINE}` }}>
          <span className="text-sm" style={{ color: MUTED }}>Or</span>
          <Button onClick={() => start(blankPage())} disabled={making}>Start with a window to fill in</Button>
          <Button onClick={onOpen} disabled={making}>📂 Open a project…</Button>
        </div>

        <div className="mt-8 rounded-xl px-4 py-3 text-xs" style={{ background: SURFACE, border: `1px solid ${LINE}`, color: MUTED }}>
          <span className="font-semibold" style={{ color: ACCENT_TEXT, background: ACCENT_FILL, borderRadius: 6, padding: '1px 6px', marginRight: 8 }}>How it reads</span>
          In → starts when → Do → Out. A step takes what its sentence points at with <code>@Name</code>, and nothing else. No wires are drawn.
        </div>
      </div>
    </div>
  );
}
