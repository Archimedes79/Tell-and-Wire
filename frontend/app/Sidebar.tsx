import type { NodeType } from './graph';
import { NODE_BUILDERS } from './elements/registry';
import type { NodeGuiBuilder } from '../graph-editor/nodes/NodeGuiBuilder';
import { ACCENT_TEXT, DIMMER, LINE, SURFACE, TEXT } from './ui/theme';

/**
 * What the palette offers: each kind under the heading it says it goes under
 * (`paletteGroup`), headings and kinds in the order of *builders* -- and
 * not a kind that says none. A table of kinds here was one
 * more place a new kind had to be written into.
 */
export function paletteGroups(builders: NodeGuiBuilder[]): { label: string; types: NodeType[] }[] {
  const groups: { label: string; types: NodeType[] }[] = [];
  for (const builder of builders) {
    const label = builder.paletteGroup;
    if (!label) continue;
    const group = groups.find((one) => one.label === label);
    if (group) group.types.push(builder.nodeType);
    else groups.push({ label, types: [builder.nodeType] });
  }
  return groups;
}

const CATEGORIES = paletteGroups(Object.values(NODE_BUILDERS));

interface SidebarProps {
  onAddNode: (nodeType: NodeType) => void;
}

/**
 * The palette, in the shape of the Page tab's (`DesignerPalette`): a heading per
 * group and a label per kind, each marked with the colour of its pill on the
 * canvas. Click or drag to add.
 */
export default function Sidebar({ onAddNode }: SidebarProps) {
  return (
    <aside
      className="flex flex-col h-full overflow-y-auto"
      style={{ width: 200, background: SURFACE, borderRight: `1px solid ${LINE}`, flexShrink: 0 }}
    >
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: ACCENT_TEXT }}>
          Nodes
        </h2>
        <p className="text-xs mt-1" style={{ color: DIMMER }}>
          Click or drag to add
        </p>
      </div>

      {CATEGORIES.map((cat) => (
        <div key={cat.label} className="py-2">
          <h3 className="px-4 text-xs font-medium uppercase tracking-wider mb-1 select-none" style={{ color: DIMMER }}>
            {cat.label}
          </h3>
          {cat.types.map((type) => (
            <button
              key={type}
              className="w-full flex items-center gap-3 px-4 py-1.5 text-sm text-left transition-colors hover-raise"
              style={{ color: TEXT }}
              onClick={() => onAddNode(type)}
              title={NODE_BUILDERS[type].hint}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/nodeType', type);
                e.dataTransfer.effectAllowed = 'copy';
              }}
            >
              <span className="h-4 w-4 shrink-0 rounded" style={{ background: NODE_BUILDERS[type].color, border: `1px solid ${LINE}` }} aria-hidden="true" />
              <span className="truncate">{NODE_BUILDERS[type].label}</span>
            </button>
          ))}
        </div>
      ))}

      <p className="mt-auto px-4 py-4 text-xs border-t" style={{ color: DIMMER, borderColor: LINE }}>
        Click a node to open it beside the canvas. Connect ports by dragging from dot to dot.
      </p>
    </aside>
  );
}
