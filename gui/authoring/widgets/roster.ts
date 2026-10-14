// The design of each kind of block: what only building the GUI asks of it. The
// kinds themselves are listed in `gui/widgets/roster.ts`; a kind with nothing of
// its own to say here (a divider, a spacer) is designed by the default.

import { WIDGETS } from '../../widgets/roster.ts';
import { WidgetDesign } from './WidgetDesign.ts';
import { ButtonWidgetDesign } from './button/ButtonWidgetDesign.ts';
import { ChatWidgetDesign } from './chat/ChatWidgetDesign.ts';
import { ImageViewWidgetDesign } from './image_view/ImageViewWidgetDesign.ts';
import { InputPickerWidgetDesign } from './input_picker/InputPickerWidgetDesign.ts';
import { PlotWindowWidgetDesign } from './plot_window/PlotWindowWidgetDesign.ts';
import { SelectWidgetDesign } from './select/SelectWidgetDesign.ts';
import { SliderWidgetDesign } from './slider/SliderWidgetDesign.ts';
import { TableWidgetDesign } from './table/TableWidgetDesign.ts';
import { TextWidgetDesign } from './text/TextWidgetDesign.ts';
import { TextIoWidgetDesign } from './text_io/TextIoWidgetDesign.ts';

function designOf(definition: (typeof WIDGETS)[number]): WidgetDesign {
  switch (definition.widgetKind) {
    case 'button': return new ButtonWidgetDesign(definition);
    case 'chat': return new ChatWidgetDesign(definition);
    case 'image_view': return new ImageViewWidgetDesign(definition);
    case 'input_picker': return new InputPickerWidgetDesign(definition);
    case 'plot_window': return new PlotWindowWidgetDesign(definition);
    case 'select': return new SelectWidgetDesign(definition);
    case 'slider': return new SliderWidgetDesign(definition);
    case 'table': return new TableWidgetDesign(definition);
    case 'text': return new TextWidgetDesign(definition);
    case 'text_io': return new TextIoWidgetDesign(definition);
    default: return new WidgetDesign(definition);
  }
}

const DESIGNS = new Map<string, WidgetDesign>(WIDGETS.map((definition) => [definition.widgetKind, designOf(definition)]));

/** The design of a block of *kind*, or none for a kind nobody knows. */
export function widgetDesign(kind: string): WidgetDesign | undefined {
  return DESIGNS.get(kind);
}
