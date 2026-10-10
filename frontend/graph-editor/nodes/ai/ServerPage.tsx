import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import FileBrowserDialog from '../../../app/dialogs/FileBrowserDialog';
import { pageDocument } from './pageDocument';

/**
 * The interface a tool server brings for itself: its `settings.html`, in a
 * frame that is sandboxed and has no network (`pageDocument.ts`), so the editor
 * does not know what a server's settings are -- a page for a server that
 * wants a folder, another for one that wants a key, and none the editor has
 * to be changed for.
 *
 * The page and the editor speak in environment variables, as text: the page
 * is handed what is saved, says what it holds as it changes, and may ask for
 * the folder browser. Nothing else gets through.
 */
export default function ServerPage({ html, values, delimiter, onChange }: {
  html: string;
  values: Record<string, string>;
  delimiter: string;
  onChange: (values: Record<string, string>, valid: boolean) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);
  const [browsing, setBrowsing] = useState<{ id: string; from: string } | null>(null);
  const document_ = useMemo(() => pageDocument(html), [html]);
  /** What the page is told when it asks, and who is told what it says: the latest of them, whatever render a message lands in. */
  const now = useRef({ values, delimiter, onChange });
  useLayoutEffect(() => { now.current = { values, delimiter, onChange }; });

  const send = useCallback((message: object) => frame.current?.contentWindow?.postMessage(message, '*'), []);

  // Before the frame is loaded, not after: a page that asks at once must find someone listening.
  useLayoutEffect(() => {
    const heard = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const message = (event.data ?? {}) as { tw?: string; values?: Record<string, unknown>; valid?: boolean; height?: number; id?: string; from?: string };
      if (message.tw === 'ready') {
        send({ tw: 'init', values: now.current.values, host: { delimiter: now.current.delimiter } });
      } else if (message.tw === 'changed') {
        now.current.onChange(Object.fromEntries(Object.entries(message.values ?? {}).map(([key, value]) => [key, String(value ?? '')])), message.valid !== false);
      } else if (message.tw === 'size' && typeof message.height === 'number') {
        setHeight(Math.min(520, Math.max(40, Math.ceil(message.height))));
      } else if (message.tw === 'browse' && typeof message.id === 'string') {
        setBrowsing({ id: message.id, from: String(message.from ?? '') });
      }
    };
    window.addEventListener('message', heard);
    return () => window.removeEventListener('message', heard);
  }, [send]);

  const answer = (path: string | null) => {
    if (browsing) send({ tw: 'browsed', id: browsing.id, path });
    setBrowsing(null);
  };

  return (
    <>
      <iframe
        ref={frame}
        title="Settings"
        sandbox="allow-scripts"
        srcDoc={document_}
        style={{ width: '100%', height, border: 0 }}
      />
      {browsing && (
        <FileBrowserDialog mode="directory" initialPath={browsing.from} onPick={(path) => answer(path)} onClose={() => answer(null)} />
      )}
    </>
  );
}
