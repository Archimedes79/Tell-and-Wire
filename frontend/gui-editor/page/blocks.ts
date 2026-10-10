// What a block is, to the page: the half of a widget that is delivered.
//
// A widget has three roles and they belong in three places. The backend's
// `WidgetRunner` is what it contributes to a *run* -- a picker produces its
// path, a chat its message, a slider its number. `WidgetGuiBuilder` is what
// the builder needs: a settings panel, what the palette drops. And this is the
// third: what the person using the finished tool looks at and operates.
//
// The third one is a `View` and not a third `…Runner`, which is a question the
// other two names invite. A view is not the running half of anything: the
// designer draws these same components while the page is being built, so a
// `SelectWidgetView` is on screen in the builder and in the delivered tool
// alike. It is *how a widget looks*, which neither of the other two names is
// about -- `Runner` is what it does in a run, `GuiBuilder` is how it is edited.
// A widget is the one element with all three; a node has only the first two.
//
// Only this one is delivered, so only this one may be reachable from
// `runtime/main.tsx`. The builders' roster next door carries the panel and the
// generation contract, which a tool handed to someone must not hold:
// `runtime/boundary.test.ts` asserts it is out of reach.

import type { ComponentType } from 'react';
import type { GuiWidget, WidgetKind } from '../../app/graph';
import type { WidgetViewProps } from '../widgets/WidgetView';
import { textIoRole } from '../../../backend/gui-editor/widgets/text_io/role.ts';
import { asText } from '../../../backend/gui-editor/widgets/text_io/text.ts';

import ButtonWidgetView from '../widgets/button/ButtonWidgetView';
import ChatWidgetView from '../widgets/chat/ChatWidgetView';
import DividerWidgetView from '../widgets/divider/DividerWidgetView';
import ImageViewWidgetView from '../widgets/image_view/ImageViewWidgetView';
import InputPickerWidgetView from '../widgets/input_picker/InputPickerWidgetView';
import PlotWindowWidgetView from '../widgets/plot_window/PlotWindowWidgetView';
import SelectWidgetView from '../widgets/select/SelectWidgetView';
import SliderWidgetView from '../widgets/slider/SliderWidgetView';
import SpacerWidgetView from '../widgets/spacer/SpacerWidgetView';
import TableWidgetView from '../widgets/table/TableWidgetView';
import TextWidgetView from '../widgets/text/TextWidgetView';
import TextIoWidgetView from '../widgets/text_io/TextIoWidgetView';

/** One kind of block, as the page draws it. */
interface BlockKind {
  /** The one component. The designer and the delivered tool draw this same one. */
  View: ComponentType<WidgetViewProps>;
  /**
   * What the block shows as its value is its *own* stored value rather than
   * whatever last arrived: a conversation, where the reply that arrived is one
   * line of it; a box someone types into under the reply it shows.
   */
  ownsValue?: (widget: GuiWidget) => boolean;
  /** Its label is what it shows -- a button's caption -- so none is written above it. */
  drawsLabel?: true;
  /** The label above it names the one control in it, which takes the view's `controlId`. */
  labelsControl?: true;
  /** It shows what a run hands back and nothing has yet: it stands as one line until something does. */
  waits?: (widget: GuiWidget, value: unknown) => boolean;
}

export const BLOCKS: Record<WidgetKind, BlockKind> = {
  text: { View: TextWidgetView },
  divider: { View: DividerWidgetView },
  spacer: { View: SpacerWidgetView },
  input_picker: { View: InputPickerWidgetView, labelsControl: true },
  // The box a person types into holds what they typed, which is what a run
  // sends; the reply is shown above it from what arrived. Handed the reply as
  // its value, the box showed one text and ▶ Run sent another. A box that
  // only shows is what arrived.
  text_io: {
    View: TextIoWidgetView,
    labelsControl: true,
    ownsValue: (widget) => textIoRole(widget.mode) !== 'output',
    waits: (widget, value) => textIoRole(widget.mode) === 'output' && asText(value) === '',
  },
  plot_window: { View: PlotWindowWidgetView },
  image_view: { View: ImageViewWidgetView },
  table: { View: TableWidgetView },
  select: { View: SelectWidgetView, labelsControl: true },
  slider: { View: SliderWidgetView, labelsControl: true },
  button: { View: ButtonWidgetView, drawsLabel: true },
  chat: { View: ChatWidgetView, labelsControl: true, ownsValue: () => true },
};
