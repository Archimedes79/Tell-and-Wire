// The blocks a GUI is built from.
//
// Each is the definition of a kind of block: it owns its settings and says what
// it can do with the graph -- what it sends, what event it fires, whether it
// shows an end point -- and the GUI connects it by name (`gui.ts`). The executor
// never sees one: what a block sends arrives in a start point's package.
//
// This file is the roster — the only place that knows the whole set, which is
// the role `registry.ts` plays for the nodes. The editor's roster of what only
// building asks of them is `gui/editor/widgets/roster.ts`.

import { TextWidgetDefinition } from './text/TextWidgetDefinition.ts';
import { DividerWidgetDefinition } from './divider/DividerWidgetDefinition.ts';
import { SpacerWidgetDefinition } from './spacer/SpacerWidgetDefinition.ts';
import { InputPickerWidgetDefinition } from './input_picker/InputPickerWidgetDefinition.ts';
import { TextIoWidgetDefinition } from './text_io/TextIoWidgetDefinition.ts';
import { PlotWindowWidgetDefinition } from './plot_window/PlotWindowWidgetDefinition.ts';
import { ImageViewWidgetDefinition } from './image_view/ImageViewWidgetDefinition.ts';
import { TableWidgetDefinition } from './table/TableWidgetDefinition.ts';
import { SelectWidgetDefinition } from './select/SelectWidgetDefinition.ts';
import { SliderWidgetDefinition } from './slider/SliderWidgetDefinition.ts';
import { ButtonWidgetDefinition } from './button/ButtonWidgetDefinition.ts';
import { ChatWidgetDefinition } from './chat/ChatWidgetDefinition.ts';

export const WIDGETS = [
  new TextWidgetDefinition(),
  new DividerWidgetDefinition(),
  new SpacerWidgetDefinition(),
  new InputPickerWidgetDefinition(),
  new TextIoWidgetDefinition(),
  new PlotWindowWidgetDefinition(),
  new ImageViewWidgetDefinition(),
  new TableWidgetDefinition(),
  new SelectWidgetDefinition(),
  new SliderWidgetDefinition(),
  new ButtonWidgetDefinition(),
  new ChatWidgetDefinition(),
];
