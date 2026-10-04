import { WidgetRunner } from '../WidgetRunner.ts';

/**
 * A widget that is part of the page rather than part of the graph: a heading, a
 * rule, a gap. It sends nothing, fires nothing and shows nothing.
 *
 * An interface built only from inputs and outputs cannot be laid out — there
 * was no way to write a title. These are what make a page a document rather
 * than a stack of labelled boxes.
 */
export abstract class StaticWidgetRunner extends WidgetRunner {}
