import type { CSSProperties } from 'react';
import type { NodeType } from './graph';
import { NODE_BUILDERS } from './elements/registry';
import type { NodeGuiBuilder } from '../graph-editor/nodes/NodeGuiBuilder';
import { DIMMER, LINE, SURFACE } from './ui/theme';

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
 * The palette, in the look of the Page tab's (`DesignerPalette`, `.palette-tile`):
 * a slim column, a heading per group, and per kind its icon in its colour and
 * its name. Click or drag to add. The two palettes share a look and no code.
 */
export default function Sidebar({ onAddNode }: SidebarProps) {
  return (
    <aside
      className="flex flex-col h-full overflow-y-auto gap-1.5 px-3 py-3"
      style={{ width: 168, background: SURFACE, borderRight: `1px solid ${LINE}`, flexShrink: 0 }}
    >
      {CATEGORIES.map((cat) => (
        <section key={cat.label} className="flex flex-col gap-1.5">
          <h3 className="px-1 pt-3 text-[11px] font-medium uppercase tracking-wider select-none" style={{ color: DIMMER }}>
            {cat.label}
          </h3>
          {cat.types.map((type) => {
            const { icon: Icon, ink, label, hint } = NODE_BUILDERS[type];
            return (
              <button
                key={type}
                type="button"
                className="palette-tile"
                style={{ '--chip': ink } as CSSProperties}
                onClick={() => onAddNode(type)}
                title={hint}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/nodeType', type);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
              >
                <span className="palette-chip"><Icon size={14} strokeWidth={2} aria-hidden="true" /></span>
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </section>
      ))}

      <p className="mt-auto pt-4 text-[11px] leading-snug" style={{ color: DIMMER }}>
        Click or drag to add. Double-click a node to open it. Connect ports by dragging from dot to dot.
      </p>
    </aside>
  );
}
