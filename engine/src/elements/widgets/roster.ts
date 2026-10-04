// The blocks a page is built from.
//
// Each is an element like any other: it owns its settings and says what it can
// do with the graph -- what it sends, what event it fires, whether it shows an
// end point -- and the page connects it by name (`page.ts`). The executor
// never sees one: what a block sends arrives in a start point's package.
//
// This file is the roster — the only place that knows the whole set, which is
// the role `registry.ts` plays for the nodes.

import { TextWidgetRunner } from './text/TextWidgetRunner.ts';
import { DividerWidgetRunner } from './divider/DividerWidgetRunner.ts';
import { SpacerWidgetRunner } from './spacer/SpacerWidgetRunner.ts';
import { InputPickerWidgetRunner } from './input_picker/InputPickerWidgetRunner.ts';
import { TextIoWidgetRunner } from './text_io/TextIoWidgetRunner.ts';
import { PlotWindowWidgetRunner } from './plot_window/PlotWindowWidgetRunner.ts';
import { ImageViewWidgetRunner } from './image_view/ImageViewWidgetRunner.ts';
import { TableWidgetRunner } from './table/TableWidgetRunner.ts';
import { SelectWidgetRunner } from './select/SelectWidgetRunner.ts';
import { SliderWidgetRunner } from './slider/SliderWidgetRunner.ts';
import { ButtonWidgetRunner } from './button/ButtonWidgetRunner.ts';
import { ChatWidgetRunner } from './chat/ChatWidgetRunner.ts';

export const WIDGETS = [
  new TextWidgetRunner(),
  new DividerWidgetRunner(),
  new SpacerWidgetRunner(),
  new InputPickerWidgetRunner(),
  new TextIoWidgetRunner(),
  new PlotWindowWidgetRunner(),
  new ImageViewWidgetRunner(),
  new TableWidgetRunner(),
  new SelectWidgetRunner(),
  new SliderWidgetRunner(),
  new ButtonWidgetRunner(),
  new ChatWidgetRunner(),
];
