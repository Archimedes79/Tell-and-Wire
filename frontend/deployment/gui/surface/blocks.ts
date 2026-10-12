// What a block is, to the gui: the half of a widget that is delivered.
//
// A widget has several faces and they belong in different places. Its
// `WidgetDefinition` is what it is and what it contributes to a *run* -- a
// picker produces its path, a chat its message, a slider its number; a package
// carries it. Its `WidgetDesign` is what building asks of it, and its
// `WidgetGuiBuilder` is what the builder needs: a settings panel, what the
// palette drops. And this is the last: what the person using the finished tool
// looks at and operates.
//
// It is a `View` because it is not the running half of anything: the designer
// draws these same components while the gui is being built, so a
// `SelectWidgetView` is on screen in the builder and in the delivered tool
// alike. It is *how a widget looks*.
//
// Only this one is delivered, so only this one may be reachable from
// `deployment/gui/main.tsx`. The builders' roster carries the panel and the
// generation contract, which a tool handed to someone must not hold:
// `deployment/gui/boundary.test.ts` asserts it is out of reach.

import type { ComponentType } from 'react';
import type { WidgetKind } from '../../../../graph/graph.ts';
import type { GuiWidget } from '../kit/guiWidget';
import type { WidgetViewProps } from '../widgets/WidgetView';
import { textRole } from '../../../../gui/widgets/text/role.ts';
import { textIoRole } from '../../../../gui/widgets/text_io/role.ts';
import { asText } from '../../../../gui/widgets/text_io/text.ts';

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

/** One kind of block, as the gui draws it. */
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
  /**
   * Without a box it is as tall as what is in it and stands in its row on the bottom -- a heading, which is nearer the block under
   * it than the one above -- or in the middle, as a rule between two sections does. Not said: it has the whole height it is given.
   */
  sits?: (widget: GuiWidget) => 'end' | 'center' | undefined;
  /** It shows what a run hands back and nothing has yet: it stands as one line until something does. */
  waits?: (widget: GuiWidget, value: unknown) => boolean;
}

export const BLOCKS: Record<WidgetKind, BlockKind> = {
  text: { View: TextWidgetView, sits: (widget) => (textRole(widget.mode) === 'heading' ? 'end' : undefined) },
  divider: { View: DividerWidgetView, sits: () => 'center' },
  spacer: { View: SpacerWidgetView },
  input_picker: { View: InputPickerWidgetView, labelsControl: true },
  // The box a person types into holds what they typed, which is what a run
  // sends; the reply is shown above it from what arrived. A box that only
  // shows is what arrived.
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
