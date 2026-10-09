import { useEffect, useId, useRef, useState } from 'react';
import { SlidersHorizontal, Sparkles } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useGraphStore } from '../../app/store/graphStore';
import ErrorBoundary from '../../app/ui/ErrorBoundary';
import { NODE_BUILDERS } from '../../app/elements/registry';
import { derivedNodePorts } from '../../app/document/ports';
import { neighbours } from '../../app/document/wires';
import { blocksAt } from '../../app/document/page';
import { headingFromText, isNumberedHeading } from '../../app/document/heading';
import type { GraphNode } from '../../app/graph';
import Button from '../../app/ui/Button';
import { DIMMER, FIELD, LINE, MUTED, TEXT } from '../../app/ui/theme';
import { ONCE, type NodeGuiBuilder } from '../nodes/NodeGuiBuilder';
import HeadingField from '../authoring/HeadingField';
import { GenerationReport } from '../authoring/GenerationTranscript';
import { useTryExample, whatCameOf } from '../authoring/TryExample';
import { modelsBefore, pullable } from '../authoring/pull';
import { fileOf, isWritten, partName, partsOf, writesFor, type Write } from '../authoring/generation';
import NodeHeader from '../views/NodeHeader';
import NodeViewLayout from '../views/NodeViewLayout';
import RowList, { at, type RowAction, type RowView } from '../views/RowList';
import FilePane from './FilePane';
import LastRun from './LastRun';
import PartChat from './PartChat';
import SettingsPane from './SettingsPane';
import WritingStatus from './WritingStatus';
import { freshPort } from './PortsEditor';
import { withPorts } from './nodeDraft';
import { useNodePanel } from './nodePanel';
import { usePartGenerate } from './usePartGenerate';

/** What the right of the view shows: a file or its chat, or the node's settings. */
type Open = { part: Write; how: 'chat' | 'file' } | { part: 'settings' };
const SETTINGS: Open = { part: 'settings' };

/** What a node opens on: the first file nothing is written in yet, in the way it is written -- else its body, to read. */
function firstOpen(node: GraphNode, parts: Write[]): Open {
  if (!parts.length) return SETTINGS;
  const next = parts.find((write) => !isWritten(node, write));
  if (next === 'input') return { part: 'input', how: 'file' };
  return { part: next ?? 'body', how: next ? 'chat' : 'file' };
}

/** The view fills the place of the canvas; it is what Esc is heard in (`viewHearsEscape`). */
const FRAME = 'flex flex-col flex-1 min-w-0 min-h-0';

/** "a", "a and b", "a, b and c". */
const listed = (items: string[]): string => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/**
 * Whether Escape is the view's to act on: only while it is on screen, and
 * while no dialog or menu is open, which hears it first -- a file browser
 * opened from the view, say. Nor one pressed in a file box (*from*, inside a
 * CodeMirror editor): it closed the view from under what was being typed. Nor
 * one pressed in a field outside it.
 */
function viewHearsEscape(
  view: Pick<HTMLElement, 'offsetParent' | 'contains'> | null,
  page: Pick<Document, 'querySelector'>,
  from?: EventTarget | null,
): boolean {
  const near = from as Partial<Element> | null | undefined;
  const inBox = near?.closest?.('.cm-editor') != null;
  const field = near?.closest?.('input, textarea, select');
  const elsewhere = field != null && !view?.contains(field);
  return view !== null && view.offsetParent !== null && !inBox && !elsewhere
    && page.querySelector('[role="dialog"], [role="menu"]') === null;
}

/**
 * One node, opened where the graph was: its text and what it is made of on the
 * left -- the files it keeps, each with a chat that writes it and the file
 * itself --, and the one chosen on the right. Auto generate does what the rows
 * do, in order. What is changed here is in the graph a moment later and Undo
 * takes it back (`nodePanel.ts`); there is no Save and no Cancel. Esc or the
 * way back closes it with nothing lost.
 *
 * What a node is made of is not decided here: the node's runner says which
 * files it keeps (`partsOf`), its builder what else is set.
 */
export default function NodeView({ nodeId, onClose, onOpenPage }: { nodeId: string; onClose: () => void; onOpenPage: () => void }) {
  const panel = useNodePanel(nodeId);
  const node = panel.node();
  return node ? <Opened node={node} panel={panel} onClose={onClose} onOpenPage={onOpenPage} /> : null;
}

function Opened({ node, panel, onClose, onOpenPage }: {
  node: GraphNode;
  panel: ReturnType<typeof useNodePanel>;
  onClose: () => void;
  onOpenPage: () => void;
}) {
  const builder: NodeGuiBuilder | undefined = NODE_BUILDERS[node.node_type];
  const writing = usePartGenerate(node.id, panel);
  const trying = useTryExample(node, writing.graph);
  const parts = partsOf(node);
  const [open, setOpen] = useState<Open>(() => firstOpen(node, parts));
  // What was typed to each chat and not sent: a look at the file and back keeps it.
  const [drafts, setDrafts] = useState<Partial<Record<Write, string>>>({});
  const isProject = useGraphStore((s) => s.isProject);
  const page = useGraphStore((s) => s.page);
  const wires = useGraphStore((s) => s.rfEdges);
  const near = neighbours(node.id, wires);
  const graphNodes = useGraphStore(useShallow((s) => s.rfNodes.map((item) => item.data.graphNode)));
  const labels = Object.fromEntries(graphNodes.map((item) => [item.id, item.label || item.id]));
  const view = useRef<HTMLDivElement>(null);
  const describing = useId();
  const text = useRef<HTMLTextAreaElement>(null);

  // A node just made has nothing yet but its text to write: the keys go there.
  useEffect(() => { if (!text.current?.value.trim()) text.current?.focus(); }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // One an editor inside took for itself -- closing its search, say -- is not this one's.
      if (event.key !== 'Escape' || event.defaultPrevented || !viewHearsEscape(view.current, document, event.target)) return;
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Closed under the focus -- Esc, the way back -- the keyboard goes back to
  // the node's card, and goes on from there.
  useEffect(() => () => {
    if (document.activeElement === document.body) {
      document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(node.id)}"]`)?.focus();
    }
  }, [node.id]);

  // A type this editor does not know is kept as it came (`normalizeGraphNode`): nothing here to change.
  if (!builder) {
    return (
      <div ref={view} className={FRAME}>
        <NodeViewLayout header={<Button variant="quiet" size="sm" onClick={onClose}>← Graph</Button>} left={<p className="text-sm" style={{ color: TEXT }}>{node.label}</p>}>
          <p className="text-sm" style={{ color: MUTED }}>
            This editor does not know nodes of type "{node.node_type}". The node is kept, and saved, as it came.
          </p>
        </NodeViewLayout>
      </div>
    );
  }

  const setDescription = (value: string) => panel.change((current) => ({ ...current, description: value }), { field: 'description' });
  /** A node ✨ writes for, while its heading is still the numbered one it was given, is headed from its text. */
  const headingFromTheText = () => {
    if (!isNumberedHeading(node.label)) return;
    const heading = headingFromText(node.description);
    if (heading) panel.change((current) => ({ ...current, label: heading }), ONCE);
  };

  const ownPorts = derivedNodePorts(node) === null;
  const addPort = (side: 'inputs' | 'outputs') => {
    panel.change((current) => withPorts(current, {
      inputs: current.inputs,
      outputs: current.outputs,
      [side]: [...current[side], freshPort(side === 'inputs' ? 'input' : 'output', new Set(current[side].map((port) => port.id)))],
    }), ONCE);
    setOpen(SETTINGS);
  };

  // The input is pulled, not chatted: what feeds it says what it is.
  const asking = modelsBefore(node, graphNodes, wires).map((one) => labels[one.id]);
  const pulls: RowAction = pullable(node, wires)
    ? {
      id: 'pull',
      label: 'Pull input',
      title: `Write input.js from the nodes before it: what they hand on, and an example from running them${asking.length ? `. That asks the model of ${listed(asking)}` : ''}`,
      disabled: writing.generate.busy,
    }
    : { id: 'pull', label: 'Pull input', title: 'Nothing is wired to its inputs yet: wire a node to it, and input.js is pulled from there', disabled: true };

  const rows: RowView[] = parts.map((write) => {
    const { file } = fileOf(node, write);
    const side = write === 'input' ? 'inputs' : write === 'output' ? 'outputs' : null;
    return {
      id: write,
      label: partName(node, write),
      actions: [
        write === 'input' ? pulls : { id: 'chat', label: 'Chat', title: `Say what ${file} should hold: it is written, and changed as you say` },
        { id: 'file', label: 'File', title: `${file}: read it and edit it here`, written: isWritten(node, write) },
      ],
      add: side && ownPorts && builder.portEditing[side] === 'edit'
        ? { title: `Add ${side === 'inputs' ? 'an input' : 'an output'}`, onClick: () => addPort(side) }
        : undefined,
    };
  });

  const shown: Open = open.part === 'settings' || parts.includes(open.part) ? open : firstOpen(node, parts);
  const active = shown.part === 'settings' ? null : at(shown.part, shown.how);
  const used = blocksAt(page, node.id);
  // A block that fires a start point and sends to it too is one block.
  const usedBy = [...new Set([...used.fire, ...used.send, ...used.show])].map((block) => block.label || block.id);
  const writes = writesFor(node, 'all').map((write) => fileOf(node, write).file);
  const step = (id: string | undefined) => (id ? { label: labels[id] ?? id, onClick: () => useGraphStore.getState().setEditingNode(id) } : undefined);

  const left = (
    <>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 text-xl"><HeadingField heading={node.label} onChange={(label) => panel.change((current) => ({ ...current, label }))} /></div>
        {parts.length > 0 && (
          <Button
            variant={shown.part === 'settings' ? 'primary' : 'quiet'}
            size="sm"
            aria-pressed={shown.part === 'settings'}
            onClick={() => setOpen(SETTINGS)}
            title="Settings of this node: ports, once per item, failures, the model"
            aria-label="Node settings"
          >
            <SlidersHorizontal size={15} strokeWidth={2} aria-hidden="true" />
          </Button>
        )}
      </div>

      {/* The node's text: what it should do, in words. Every kind has one; the
          chats write from it, and so do the nodes wired to this one (`wantsOn`). */}
      <div>
        <label htmlFor={describing} className="block text-xs font-medium mb-1" style={{ color: MUTED }}>What it does</label>
        <textarea
          id={describing}
          ref={text}
          className="w-full rounded-lg px-3 py-2 text-sm resize-y"
          style={{ ...FIELD, minHeight: 112 }}
          value={node.description}
          onChange={(event) => setDescription(event.target.value)}
          onBlur={parts.length ? headingFromTheText : undefined}
          placeholder={builder.example}
        />
      </div>

      {usedBy.length > 0 && (
        <div className="text-xs flex items-center gap-2 flex-wrap" style={{ color: DIMMER }}>
          <span className="min-w-0">On the page: {usedBy.map((name) => `“${name}”`).join(', ')}</span>
          <Button size="sm" onClick={onOpenPage} title="Show it on the Page tab">Edit the page</Button>
        </div>
      )}

      {parts.length > 0 && (
        <>
          <div>
            <Button
              variant="primary"
              className="w-full"
              onClick={() => void writing.press('all')}
              disabled={writing.generate.busy}
              title={writing.generate.busy ? 'The model is still writing: wait for it, or stop waiting below' : `Write ${listed(writes)} from the text`}
            >
              <span className="inline-flex items-center justify-center gap-2"><Sparkles size={14} strokeWidth={2} aria-hidden="true" /> Auto generate</span>
            </Button>
            <p className="text-xs mt-1.5" style={{ color: DIMMER }}>Writes {listed(writes)} from the text above, in order.</p>
            {!isProject && (
              <p className="text-xs mt-1" style={{ color: DIMMER }}>
                Its files are kept in the tool until it is saved to a folder (File ▸ Save as, a name without .json): then each is a file of its own.
              </p>
            )}
          </div>
          <div className="pt-4" style={{ borderTop: `1px solid ${LINE}` }}>
            <RowList
              rows={rows}
              active={active}
              onAction={(row, action) => {
                // Pulled, the input is shown where it was written.
                if (action.id === 'pull') void writing.pull();
                setOpen({ part: row.id as Write, how: action.id === 'chat' ? 'chat' : 'file' });
              }}
            />
          </div>
        </>
      )}
    </>
  );

  return (
    <div ref={view} className={FRAME}>
      <NodeViewLayout
        header={<NodeHeader kind={builder.label} icon={builder.icon} ink={builder.ink} id={node.id} onBack={onClose} previous={step(near.before)} next={step(near.after)} />}
        left={left}
      >
        <GenerationReport calls={writing.generate.transcript} live={writing.generate.live}>
          {/* Keyed by the pane: each file gets an editor and a chat of its own -- one kept
              showed the last file's placeholder, words and undo history -- and a pane that
              broke (a chunk gone stale) is tried again once another is chosen. */}
          <ErrorBoundary inline key={shown.part === 'settings' ? 'settings' : `${shown.part}:${shown.how}`}>
            {shown.part === 'settings' ? (
              <SettingsPane node={node} builder={builder} panel={panel} />
            ) : shown.how === 'chat' ? (
              <PartChat
                node={node}
                write={shown.part}
                writing={writing}
                trying={trying}
                draft={drafts[shown.part] ?? ''}
                onDraft={(words) => setDrafts((all) => ({ ...all, [shown.part]: words }))}
              />
            ) : (
              <FilePane
                node={node}
                write={shown.part}
                setConfig={(key, value, how) => panel.setConfig(key, value, how)}
                updateNode={(change, how) => panel.change(change, how)}
                flush={() => panel.write()}
                trying={trying}
                busy={writing.generate.busy}
                onFix={() => void writing.press('body', { refine: whatCameOf(trying.tried) ?? {} })}
              />
            )}
          </ErrorBoundary>
          <WritingStatus busy={writing.generate.busy} message={writing.generate.message} onStop={writing.generate.stop} />
          <LastRun nodeId={node.id} />
        </GenerationReport>
      </NodeViewLayout>
    </div>
  );
}
