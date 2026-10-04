import { useId } from 'react';
import type { AIProvider } from '../../../app/graph';
import RunOptions from '../../fields/RunOptions';
import RunOncePerItem from '../../fields/RunOncePerItem';
import ProviderModelSelect from '../../../app/fields/ProviderModelSelect';
import Button from '../../../app/ui/Button';
import { DIMMER, FIELD, MUTED } from '../../../app/ui/theme';
import type { NodeAdvancedPanelProps } from '../NodeGuiBuilder';

/**
 * The knobs after its ports: once per item, which model, how freely, which
 * tools, pictures or not, failures. Every one of them has a default that is
 * right for most nodes, which is the reason they are folded away -- eleven
 * controls in a row made a node look like it needed eleven decisions before
 * it would run.
 */
export default function AiNodeAdvancedPanel({ node, setConfig, updateNode }: NodeAdvancedPanelProps) {
  const model = useId();
  const temperature = useId();
  const tools = useId();
  return (
    <>
      <RunOncePerItem node={node} updateNode={updateNode} subject="the model" />

      <div role="group" aria-labelledby={model}>
        <div id={model} className="text-xs font-medium mb-1" style={{ color: MUTED }}>Model for this node</div>
        <ProviderModelSelect
          provider={node.config.ai_provider as AIProvider}
          model={node.config.ai_model}
          onProviderChange={(p) => setConfig('ai_provider', p)}
          onModelChange={(m) => setConfig('ai_model', m)}
          defaultLabel={(now) => `Use the setting in ⚙ Settings (now: ${now})`}
          lendsFromSetting
        />
        <p className="text-xs mt-1" style={{ color: DIMMER }}
          title="A provider and model named here always win, wherever the graph runs.">
          Leave this on the setting unless this node needs a specific model.
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: MUTED }} htmlFor={temperature}>
          Temperature ({node.config.temperature ?? 'the model’s own'}) <span style={{ color: DIMMER }}>— low repeats itself, high surprises</span>
        </label>
        <input
          id={temperature}
          type="range"
          min={0} max={2} step={0.05}
          value={node.config.temperature ?? 1}
          onChange={(e) => setConfig('temperature', parseFloat(e.target.value))}
          className="w-full"
        />
        {/* Unset is sent as nothing: current Claude models refuse any temperature. */}
        {node.config.temperature !== undefined && (
          <Button
            size="sm"
            onClick={() => setConfig('temperature', undefined)}
            title="Send no temperature: the model uses its own. Current Claude models accept no other."
          >
            Use the model’s own
          </Button>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: MUTED }} htmlFor={tools}>
          Tools the model may use <span style={{ color: DIMMER }}>— MCP servers, one per line</span>
        </label>
        <textarea
          id={tools}
          className="w-full rounded-lg px-3 py-2 text-sm font-mono resize-y"
          style={{ ...FIELD, minHeight: 44 }}
          value={String(node.config.mcp_servers ?? '')}
          onChange={(e) => setConfig('mcp_servers', e.target.value)}
          placeholder={'https://example.com/mcp\nfilesystem'}
          spellCheck={false}
        />
        <p className="text-xs mt-1" style={{ color: DIMMER }}
          title="A URL is called directly. A name is looked up under mcp_servers in this machine's ai-settings.json, the only place a command line can come from: a graph someone hands you can ask for a tool by name, but it cannot start a program. While answering, the model calls the tools it needs; what it says afterwards is this node's output.">
          A URL, or a name from <code>mcp_servers</code> in <code>ai-settings.json</code>.
        </p>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm" style={{ color: MUTED }}>
          <input
            type="checkbox"
            checked={!!node.config.send_images}
            onChange={(e) => setConfig('send_images', e.target.checked)}
          />
          Send image and PDF paths as files
        </label>
        <p className="text-xs mt-1" style={{ color: DIMMER }}
          title="An input that names a picture or a PDF is sent to the model as that file instead of as a path in the prompt. An input that reads its file (“Read the file at this path”) sends a picture or a PDF as a file anyway. Needs a model that reads them.">
          A picture or a PDF goes to the model as the file, not as its path.
        </p>
      </div>

      <RunOptions node={node} setConfig={setConfig} subject="this prompt" />
    </>
  );
}
