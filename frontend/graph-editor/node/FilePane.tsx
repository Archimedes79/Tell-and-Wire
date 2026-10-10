import { useState, type ReactNode } from 'react';
import type { GraphNode } from '../../app/graph';
import Button from '../../app/ui/Button';
import { DANGER_SOFT, FIELD, MUTED } from '../../app/ui/theme';
import { ONCE, type NodePanelProps } from '../nodes/NodeGuiBuilder';
import CodeField, { type CodeLanguage } from '../authoring/CodeField';
import { OpenInEditor } from '../authoring/FileChip';
import TryExample, { type useTryExample } from '../authoring/TryExample';
import { useTyped } from '../authoring/useTyped';
import { fieldsFrom, fileOf, hasDefinitions, isWritten, outputsAsDefined, partName, type Part } from '../authoring/generation';
import { PaneHeader } from '../views/NodeViewLayout';
import FilesLine from './FilesLine';

/** What a file's editor is handed, whatever the file is kept as. */
interface EditorProps {
  value: string;
  onChange: (text: string) => void;
  language: CodeLanguage;
  placeholder: string;
  title: string;
  large: boolean;
  onLarge: (open: boolean) => void;
  header: ReactNode;
}

/** The editor of a file: a code box, tall in a pane with room. */
const Editor = (props: EditorProps) => <CodeField {...props} minHeight={260} maxHeight="calc(100vh - 330px)" />;

/**
 * A file the node keeps as JSON -- a data node's fields -- edited as the text it
 * is: what is typed is stored once it parses, as the fields it is (a value that
 * is no object is one field), and what does not parse yet stays as typed, and
 * says so.
 */
function JsonEditor({ node, field, setConfig, ...editor }: Omit<EditorProps, 'value' | 'onChange'> & {
  node: GraphNode; field: string; setConfig: NodePanelProps['setConfig'];
}) {
  const held = (node.config as Record<string, unknown>)[field];
  const shown = held === undefined || held === null ? '' : JSON.stringify(held, null, 2);
  const [typed, type] = useTyped(shown, (text) => {
    try {
      const fields = text.trim() ? fieldsFrom(text) : {};
      setConfig(field, fields);
      return JSON.stringify(fields, null, 2);
    } catch {
      return shown;
    }
  });
  let problem = '';
  try {
    if (typed.trim()) JSON.parse(typed);
  } catch (error) {
    problem = error instanceof Error ? error.message : 'It is not JSON.';
  }
  return (
    <>
      <Editor {...editor} value={typed} onChange={type} />
      {problem && <p className="text-xs" style={{ color: DANGER_SOFT }}>Not JSON yet: {problem}. It is kept once it parses.</p>}
    </>
  );
}

/**
 * One of a node's files, in its own kind of editor -- JavaScript for the
 * definitions and code.js, Markdown for prompt.md, JSON for what a data node
 * holds -- edited here as in the file: what is typed is written as typed.
 * Empty, it shows the file's stub: what the file is. output.js typed by hand
 * names the outputs once the box is left, as the Output chat's does. Under a
 * body that runs, ▶ Try: one call on the example in input.js, held to output.js.
 */
export default function FilePane({ node, write, setConfig, updateNode, flush, trying, busy, onFix }: {
  node: GraphNode;
  write: Part;
  setConfig: NodePanelProps['setConfig'];
  updateNode: NodePanelProps['updateNode'];
  /** Write what the view still holds into the graph: before a project is saved to open one of its files. */
  flush: () => void;
  trying: ReturnType<typeof useTryExample>;
  /** The model is writing: nothing is tried or fixed meanwhile. */
  busy: boolean;
  onFix: () => void;
}) {
  const { field, file, stub, json } = fileOf(node, write);
  const held = (node.config as Record<string, unknown>)[field];
  const [large, setLarge] = useState(false);
  const tried = write === 'body' && hasDefinitions(node);
  const needs = tried && node.inputs.length && !isWritten(node, 'input')
    ? 'Write its input.js first: the example in it is what the code is tried on.' : undefined;
  const editor = {
    language: file.endsWith('.md') ? 'markdown' as const : 'javascript' as const,
    placeholder: stub,
    title: `${node.label || node.id} -- ${file}`,
    large,
    onLarge: setLarge,
    header: <OpenInEditor nodeId={node.id} file={file} before={flush} />,
  };

  return (
    <div className="flex flex-col gap-3">
      <PaneHeader title={`${partName(node, write)}, file`}>
        <code className="text-xs px-2 py-0.5 rounded" style={{ ...FIELD, color: MUTED }}>{file}</code>
        <span className="flex-1" />
        <Button size="sm" onClick={() => setLarge(true)} title={`Edit ${file} across the whole window (Esc to come back)`}>Full screen ⤢</Button>
        <OpenInEditor nodeId={node.id} file={file} before={flush} />
      </PaneHeader>

      {(write === 'input' || write === 'output') && <FilesLine node={node} side={write} setConfig={setConfig} />}

      {json ? (
        <JsonEditor {...editor} node={node} field={field} setConfig={setConfig} />
      ) : (
        <div onBlur={write === 'output' ? () => updateNode(outputsAsDefined, ONCE) : undefined}>
          <Editor {...editor} value={typeof held === 'string' ? held : ''} onChange={(text) => setConfig(field, text)} />
        </div>
      )}

      {tried && (
        <TryExample
          tried={trying.tried}
          running={trying.running}
          onTry={() => void trying.start()}
          whyNot={needs}
          busy={busy}
          onFix={onFix}
        />
      )}
    </div>
  );
}
