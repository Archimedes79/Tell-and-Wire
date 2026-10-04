// The mirror of `backend/gui-editor/widgets/DisplayWidgetRunner.ts`: a block
// that only shows what the end point it shows hands back -- a chart, a table,
// an image.
//
// Nothing to write and nothing to choose: its panel says, in one sentence, what
// it shows, in the words the runner half tells the node wired into that end
// point. Sending nothing and firing nothing, its settings offer it only "It shows".

import { lazy } from 'react';
import type { ComponentType } from 'react';
import type { DisplayWidgetRunner } from '../../../backend/gui-editor/widgets/DisplayWidgetRunner.ts';
import { WidgetGuiBuilder, type WidgetPanelProps } from './WidgetGuiBuilder';

export abstract class DisplayWidgetGuiBuilder extends WidgetGuiBuilder {
  override readonly Panel: ComponentType<WidgetPanelProps> = lazy(() => import('./DisplayWidgetPanel'));

  /** The kind's runner half, which says what it draws (`draws`). */
  abstract readonly runner: DisplayWidgetRunner;
}
