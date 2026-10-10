import { DIMMER, LINE, MUTED, SUNKEN, SURFACE, TEXT } from '../../../app/ui/theme';

/**
 * What a page a tool server brings stands on: the editor's colours and form
 * controls, so that the page is only its fields. The editor sets no scheme of
 * its own, so these are the same `var()`s with their Night literals that the
 * editor's own fields use.
 */
const STYLE = `
html { color-scheme: dark; background: ${SURFACE}; }
body { margin: 0; font: 14px/1.4 system-ui, sans-serif; color: ${TEXT}; }
label { display: block; margin: 14px 0 4px; font-size: 12px; font-weight: 500; color: ${MUTED}; }
label:first-child { margin-top: 0; }
label input[type=checkbox] { margin-right: 8px; }
.dim { color: ${DIMMER}; font-weight: 400; }
.help { margin: 4px 0 0; font-size: 12px; color: ${DIMMER}; }
.row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
input[type=text], input[type=number] { box-sizing: border-box; padding: 6px 10px; border-radius: 8px; border: 1px solid ${LINE}; background: ${SUNKEN}; color: ${TEXT}; font: inherit; }
input[type=number] { width: 8em; }
button { padding: 4px 10px; border-radius: 8px; border: 0; background: ${LINE}; color: ${TEXT}; font: inherit; font-size: 12px; font-weight: 500; cursor: pointer; }
`;

/**
 * What a page may say to the editor, and all it may say: the page runs in a
 * sandbox with no network and no access to the editor, and `tw` is its one door.
 *
 *   tw.init((values, host) => ...)   the values saved for the server, by environment
 *                                    variable, once the page has asked for them; `host.delimiter`
 *                                    is what separates a list of folders in one
 *   tw.changed(values, valid)        what the page now holds, and whether the server could be
 *                                    started with it (`valid` false keeps the Add button off)
 *   tw.browse(from)                  the editor's folder browser: the folder picked, or null
 */
const SDK = `
const asked = new Map();
let start;
window.tw = {
  init(callback) { start = callback; parent.postMessage({ tw: 'ready' }, '*'); },
  changed(values, valid = true) { parent.postMessage({ tw: 'changed', values, valid }, '*'); },
  browse(from = '') {
    return new Promise((done) => {
      const id = String(Math.random());
      asked.set(id, done);
      parent.postMessage({ tw: 'browse', id, from }, '*');
    });
  },
};
addEventListener('message', (event) => {
  const message = event.data || {};
  if (message.tw === 'init' && start) start(message.values || {}, message.host || {});
  if (message.tw === 'browsed') { asked.get(message.id)?.(message.path); asked.delete(message.id); }
});
addEventListener('DOMContentLoaded', () => {
  new ResizeObserver(() => parent.postMessage({ tw: 'size', height: document.body.scrollHeight }, '*')).observe(document.body);
});
`;

/** A server's `settings.html` as the document the editor shows it in: no network, whatever the page contains. */
export function pageDocument(html: string): string {
  return `<!doctype html><meta charset="utf-8">`
    + `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">`
    + `<style>${STYLE}</style><script>${SDK}</script><body>${html}</body>`;
}
