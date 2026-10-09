import { useState } from 'react';
import type { AICall } from '../../app/api/client';
import { errorText } from '../../app/api/errorText';
import type { GraphNode } from '../../app/graph';
import Button from '../../app/ui/Button';
import { MUTED } from '../../app/ui/theme';
import { partExchanges } from '../../../graph/authoring/history.ts';
import { SENT_WITH } from '../../../graph/authoring/prompts.ts';
import { Part } from '../authoring/GenerationTranscript';
import { whatCameOf, type useTryExample } from '../authoring/TryExample';
import { bodyOf, fileOf, isWritten, partName, type Write } from '../authoring/generation';
import ChatPane, { type ChatLine } from '../views/ChatPane';
import { PaneHeader } from '../views/NodeViewLayout';
import type { usePartGenerate } from './usePartGenerate';

/** What a chat invites to be said, by the file it writes. */
function inviting(node: GraphNode, write: Write): string {
  if (write === 'output') return 'Say what should come out';
  const kind = bodyOf(node)?.kind;
  return kind === 'prompt' ? 'Say what the model should do' : kind === 'data' ? 'Say what it should hold' : 'Say what the code should do';
}

/**
 * The chat of one file: what was said to it and what came of that, from the
 * node's history.md, and the line to say more in. The first words write the
 * file from the node's text and from them; every message after that changes
 * the file as said -- a body with what its last try showed. What goes with the
 * words is the same for every file of every kind of node (`SENT_WITH`).
 */
export default function PartChat({ node, write, writing, trying, draft, onDraft }: {
  node: GraphNode;
  write: Write;
  writing: ReturnType<typeof usePartGenerate>;
  trying: ReturnType<typeof useTryExample>;
  /** The words typed to this chat and not sent: kept by the view, so a look at the file does not lose them. */
  draft: string;
  onDraft: (text: string) => void;
}) {
  const { file } = fileOf(node, write);
  const lines: ChatLine[] = partExchanges(String(node.config.history ?? ''), partName(node, write)).map((one, index) => ({
    key: `${one.at}-${index}`,
    said: one.said,
    failed: one.failed,
    note: one.failed ? `${file} was not written` : one.fix ? `${file} repaired` : `${file} written`,
  }));
  const [sent, setSent] = useState<AICall[] | null>(null);
  const [problem, setProblem] = useState('');

  const send = (text: string) => writing.press(write, isWritten(node, write)
    ? { refine: { change: text, ...(write === 'body' ? whatCameOf(trying.tried) : {}) } }
    : { ask: text });

  const showSent = async () => {
    if (sent) { setSent(null); return; }
    try {
      setSent(await writing.preview(write));
      setProblem('');
    } catch (error) {
      setProblem(errorText(error, 'Could not build the request.'));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <PaneHeader title={`${partName(node, write)}, chat`} />
      <ChatPane
        lines={lines}
        sentWith={Object.values(SENT_WITH)}
        placeholder={inviting(node, write)}
        empty={isWritten(node, write)
          ? `${file} is written. What you say changes it as said.`
          : `Say what you want and ${file} is written. What you say after that changes it as said.`}
        busy={writing.generate.busy}
        text={draft}
        onText={onDraft}
        onSend={send}
      >
        <div className="text-xs flex flex-col gap-2" style={{ color: MUTED }}>
          <div>
            <Button size="sm" variant="quiet" onClick={() => void showSent()} title="The request as it would go out now, filled in, without sending it">
              {sent ? 'Hide what is sent' : 'Show what is sent'}
            </Button>
          </div>
          {problem && <p>{problem}</p>}
          {sent?.[0] && (
            <div className="space-y-1" aria-label="What is sent">
              <Part label="System" text={sent[0].system} />
              <Part label="Prompt" text={sent[0].prompt} />
              <p>Your words are added to it.</p>
            </div>
          )}
        </div>
      </ChatPane>
    </div>
  );
}
