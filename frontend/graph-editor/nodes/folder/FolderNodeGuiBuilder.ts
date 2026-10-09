import { lazy } from 'react';
import type { GraphNode } from '../../../app/graph';
import { INK, NODE } from '../../../app/ui/theme';
import { NodeGuiBuilder } from '../NodeGuiBuilder';
import { Folder } from 'lucide-react';

const pathOf = (node: GraphNode): string => String(node.config.path ?? '').trim();

/** The files in a folder: a node that works, not a way into the graph -- a folder somebody chooses is a path in a start point's package. */
export class FolderNodeGuiBuilder extends NodeGuiBuilder {
  readonly nodeType = 'folder';

  // ── Build time ────────────────────────────────────────────────────────────

  readonly label = 'Folder';

  readonly hint = 'The files in a folder: their paths, and how many';

  readonly example = 'e.g. The PDF files in the reports folder';

  readonly color = NODE.folder;

  /** Its icon, on its card and in the palette. */
  readonly icon = Folder;

  /** Its colour as ink on a surface: the icon on its card, the chip in the palette (`INK`). */
  readonly ink = INK.folder;

  override readonly paletteGroup = 'Processing';

  override readonly Panel = lazy(() => import('./FolderNodePanel'));

  override readonly AdvancedPanel = lazy(() => import('./FolderNodeAdvancedPanel'));

  /** A folder is a guess until there is one to list: a default path, which is what every node after it is then shown. A fed one takes its path from upstream. */
  override missingExample(node: GraphNode, fed: boolean): boolean {
    return !fed && !pathOf(node);
  }

  override describeOutput(): string {
    return 'port "Files" carries a list of file paths, port "Count" how many there are';
  }

  /** The folder it lists, under its ports. */
  override canvasSummary(node: GraphNode): string | undefined {
    return pathOf(node) || undefined;
  }
}
