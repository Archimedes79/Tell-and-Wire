import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import PlotChart, { asDrawing, drawsSomething } from './PlotChart';
import type { WidgetViewProps } from '../WidgetView';
import SaveButton from '../SaveButton';
import { drawnSvg, fileName, saveFile } from '../download';

/**
 * A chart: draws what its end point handed back -- points,
 * a figure or a string of SVG -- at the size the block really is on screen, so
 * a resize redraws it with no run. What is drawn can be saved as it is drawn,
 * an SVG file of that size in the GUI's colours.
 */
export default function PlotWindowWidgetView({ widget, value, incoming }: WidgetViewProps) {
  const data = incoming !== undefined ? incoming : value;
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 320, height: 180 });

  /**
   * Measure before the first paint, and again whenever the box changes: a
   * ResizeObserver alone can report a size from before the page laid out.
   * `getBoundingClientRect` in a layout effect reads the size that is actually
   * on screen.
   */
  const measure = () => {
    const el = containerRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return;
    setSize((was) => (Math.round(box.width) === was.width && Math.round(box.height) === was.height
      ? was
      : { width: Math.round(box.width), height: Math.round(box.height) }));
  };
  useLayoutEffect(() => {
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // A block that was hidden when it first rendered -- a GUI tab not yet
  // shown -- has no size until it appears, and new data is the moment it
  // usually has.
  useEffect(measure, [data]);

  const save = () => {
    // A finished drawing is saved as it arrived; a figure as it is drawn.
    const drawing = asDrawing(data);
    if (drawing) return saveFile(fileName(widget.label, 'chart', 'svg'), drawing, 'image/svg+xml');
    const svg = containerRef.current?.querySelector('svg');
    if (svg) saveFile(fileName(widget.label, 'chart', 'svg'), drawnSvg(svg), 'image/svg+xml');
  };

  // The chart is drawn at the box's size, so it must not size the box: out of the flow, the block is as
  // large as its cells say -- and can be made smaller again, which a chart in the flow, held open by the
  // size it was last drawn at, could not.
  return (
    <div ref={containerRef} className="relative group w-full h-full" style={{ minHeight: 60 }}>
      <div className="absolute inset-0 flex items-center justify-center">
        <PlotChart data={data} width={size.width} height={size.height} />
      </div>
      {drawsSomething(data) && <SaveButton title="Save this chart as an SVG file" onSave={save} />}
    </div>
  );
}
