import { useCallback, useEffect, useState } from 'react';
import { call, type McpServerView, type McpServersView } from '../../../app/api/client';
import { errorText } from '../../../app/api/errorText';
import Button from '../../../app/ui/Button';
import { DIMMER, LINE, SUNKEN, TEXT, WARNING_TEXT } from '../../../app/ui/theme';
import { AddServerDialog, ServerDialog } from './ToolServerDialogs';

/** What a name on the node comes to on this machine: how to call it, one line on how it stands, and whether that is a problem. */
function standing(name: string, view: McpServersView | null): { title: string; note: string; trouble: boolean; server?: McpServerView } {
  if (!view) return { title: name, note: '', trouble: false };
  const server = view.servers.find((one) => one.name === name);
  if (server) {
    const title = server.title || name;
    if (server.problem) return { title, note: server.problem, trouble: true, server };
    if (server.by_hand) return { title, note: "set up by hand in this machine's settings", trouble: false };
    if (server.values === null) return { title, note: 'not set up on this machine yet', trouble: true, server };
    if (!server.installed) return { title, note: 'its packages are not installed yet', trouble: true, server };
    return { title, note: 'set up on this machine', trouble: false, server };
  }
  return view.configured.includes(name)
    ? { title: name, note: "set up by hand in this machine's settings", trouble: false }
    : { title: name, note: "this machine's settings have no such server", trouble: true };
}

/**
 * The tools an AI node's model may use: the servers on this node, each with the
 * way to change its settings and to take it off, and one button to add another.
 *
 * The node keeps only the names (a graph can name a server, never say what
 * starts it). What a server needs -- a folder, a limit -- is this machine's: set
 * in the dialog, saved in the machine's settings file, read by every graph that names
 * the server here. Taking a server off a node leaves that as it is.
 */
export default function ToolServers({ names, onChange }: { names: string[]; onChange: (names: string[]) => void }) {
  const [view, setView] = useState<McpServersView | null>(null);
  const [failure, setFailure] = useState('');
  const [dialog, setDialog] = useState<{ add: true } | { edit: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setView(await call('mcpServers'));
      setFailure('');
    } catch (error) {
      setFailure(errorText(error, 'This machine could not be asked which servers it has.'));
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const editing = dialog && 'edit' in dialog ? view?.servers.find((one) => one.name === dialog.edit) : undefined;

  return (
    <div className="space-y-2">
      {names.length === 0 && (
        <p className="text-xs" style={{ color: DIMMER }}>None: the model answers from what it is given.</p>
      )}
      {names.map((name) => {
        const { title, note, trouble, server } = standing(name, view);
        return (
          <div key={name} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={{ background: SUNKEN, border: `1px solid ${LINE}` }}>
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate" style={{ color: TEXT }} title={name}>{title}</div>
              {note && <div className="text-xs" style={{ color: trouble ? WARNING_TEXT : DIMMER }}>{note}</div>}
            </div>
            {server && !server.by_hand && !server.problem && (
              <Button size="sm" className="shrink-0" onClick={() => setDialog({ edit: name })}
                title={server.values === null ? 'Say what it needs, and set it up on this machine' : 'Change its settings on this machine: every graph that uses it here reads them'}>
                {server.values === null ? 'Set up' : 'Edit config'}
              </Button>
            )}
            <Button size="sm" variant="danger" className="shrink-0" onClick={() => onChange(names.filter((one) => one !== name))}
              title="Take it off this node. Its settings stay on this machine.">
              Remove
            </Button>
          </div>
        );
      })}

      <Button size="sm" onClick={() => setDialog({ add: true })}>+ Add MCP server</Button>

      {dialog && 'add' in dialog && (
        <AddServerDialog
          view={view}
          failure={failure}
          taken={names}
          refresh={refresh}
          onAdd={(name) => { onChange([...names, name]); setDialog(null); }}
          onClose={() => setDialog(null)}
        />
      )}
      {editing && (
        <ServerDialog server={editing} delimiter={view?.delimiter ?? ';'} mode="edit" refresh={refresh} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
