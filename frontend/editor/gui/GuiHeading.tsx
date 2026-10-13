import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { GraphMetadata } from '../document/graph';
import { call } from '../api/client';
import { useGraphStore } from '../document/store/graphStore';
import { say } from '../document/store/noticeBoard';
import { errorText } from '../../deployment/gui/kit/api/errorText';
import Button from '../../deployment/gui/kit/ui/Button';
import { FIELD_ON_SURFACE, LINE, MUTED, SURFACE } from '../../deployment/gui/kit/ui/theme';

/** A change to what the tool is called, or to what it does. */
type ToolWords = Partial<Pick<GraphMetadata, 'name' | 'description'>>;

/** What ✨ is asked: the one sentence under the name, in the words of the person who uses the tool. */
const WRITE_FOR_USERS = 'Change only the tool\'s description: one sentence, written for the person who will use the tool, saying in their words '
  + 'what it does for them. Do not mention nodes, start points, ports, wires, blocks or files. Change nothing else.';

/**
 * Above the GUI being built: the tool's name and what it does -- the graph's
 * own, which the delivered tool shows in its header, above the same GUI. A
 * graph has one GUI, so the GUI is called what the graph is called.
 *
 * The description is for the people who use the tool, who never saw the graph; ✨ writes it that way.
 */
export default function GuiHeading({ name, description, onChange }: {
  name: string;
  description: string;
  onChange: (words: ToolWords) => void;
}) {
  const [writing, setWriting] = useState(false);

  const write = async () => {
    setWriting(true);
    try {
      const result = await call('generateGraph', { description: WRITE_FOR_USERS, graph: useGraphStore.getState().exportGraph() });
      const written = result.graph.metadata?.description?.trim();
      if (written) onChange({ description: written });
      else say('description', 'The AI did not write a description. Try again.', { level: 'warning' });
    } catch (error) {
      say('description', errorText(error, 'The description could not be written.'), { level: 'error' });
    } finally {
      setWriting(false);
    }
  };

  return (
    <header
      className="px-8 py-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 shrink-0"
      style={{ background: SURFACE, borderBottom: `1px solid ${LINE}` }}
    >
      <input
        className="rounded px-2 py-1 text-sm font-semibold"
        style={{ ...FIELD_ON_SURFACE, width: '16rem' }}
        value={name}
        aria-label="Name of the tool"
        placeholder="Name of the tool"
        title="What this tool is called: in the header of the GUI, here and for whoever gets it"
        onChange={(e) => onChange({ name: e.target.value })}
      />
      {/* Two lines, wrapped: a sentence that is longer scrolls in its box, and does not run out of it. */}
      <textarea
        rows={2}
        className="flex-1 min-w-0 rounded px-2 py-1 text-xs resize-none leading-snug"
        style={{ ...FIELD_ON_SURFACE, minWidth: '16rem', color: MUTED }}
        value={description}
        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
        aria-label="What the tool does"
        placeholder="What this tool does for the people who use it, in a sentence — shown under its name"
        title="The tool's description: shown under its name, here and for whoever gets it. Write it for the people who use the tool."
        onChange={(e) => onChange({ description: e.target.value })}
      />
      <Button
        variant="ai"
        size="sm"
        className="shrink-0 inline-flex items-center gap-1.5"
        onClick={() => { void write(); }}
        disabled={writing}
        title="Let the AI write the description for the people who use the tool, from what the graph does"
      >
        <Sparkles size={13} aria-hidden="true" /> {writing ? 'Writing…' : 'Write it'}
      </Button>
    </header>
  );
}
