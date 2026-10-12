import { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { keymap, placeholder as placeholderExtension } from '@codemirror/view';
import { indentWithTab, redo } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { markdown } from '@codemirror/lang-markdown';
import { oneDarkTheme } from '@codemirror/theme-one-dark';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { ACCENT, ACCENT_FILL, DIM, HOVER, LINE, SUNKEN, SURFACE, TEXT } from '../../../deployment/gui/kit/ui/theme';
import { scheme } from '../../../deployment/gui/kit/ui/scheme';
import { useLook } from '../../document/store/look';
import type { CodeLanguage } from './CodeField';

// CodeMirror, and nothing else: this is the one module that imports it, and it
// is only ever reached through `React.lazy` in CodeField. So a code editor is
// a chunk of its own, fetched when the first box is drawn and not with the
// editor's first page -- the import graph decides what loads, and this file is
// where that graph is cut.

/**
 * The token colours of a light box. Each reads at 4.5:1 on the lightest and the darkest of the light looks' recessed grounds (the setup's own
 * regular-expression red does not), and the dark looks keep One Dark's.
 */
const LIGHT_TOKENS = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword], color: '#7a2e9c' },
  { tag: [t.string, t.special(t.string)], color: '#0b6b2e' },
  { tag: [t.number, t.bool, t.null, t.atom], color: '#a14400' },
  { tag: [t.regexp, t.escape, t.invalid], color: '#b4232a' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.quote], color: '#5b6470', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.definition(t.variableName), t.link, t.url], color: '#0a56c4' },
  { tag: [t.typeName, t.className, t.monospace], color: '#8a4b00' },
  { tag: [t.operator, t.punctuation, t.meta], color: '#4a515c' },
  { tag: t.heading, color: '#0a56c4', fontWeight: 'bold' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
]);

/** One Dark's token colours with its comment grey a step lighter: it read at 3.6 to 4.4 on the dark looks' grounds. */
const DARK_TOKENS = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword], color: '#c678dd' },
  { tag: [t.string, t.special(t.string)], color: '#98c379' },
  { tag: [t.number, t.bool, t.null, t.atom], color: '#d19a66' },
  { tag: [t.regexp, t.escape, t.operator, t.link, t.url], color: '#56b6c2' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.quote], color: '#a3adbd', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.definition(t.variableName), t.propertyName], color: '#61afef' },
  { tag: [t.typeName, t.className, t.monospace], color: '#e5c07b' },
  { tag: [t.variableName, t.invalid], color: '#e06c75' },
  { tag: t.heading, color: '#61afef', fontWeight: 'bold' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
]);

/**
 * The colours of the box, from the editor's look (ui/theme.ts: variables on the page), so a light look has a light box and a dark one a dark
 * box. A dark look also takes One Dark's token colours; a light one the setup's own, which are made for a light ground.
 */
const lookTheme = (id: string) => {
  const dark = !scheme(id).light;
  return [
    // The first of the themes wins where two say the same thing: ours, over One Dark's grounds.
    EditorView.theme({
      '&': { backgroundColor: SUNKEN, color: TEXT },
      '.cm-content': { caretColor: TEXT },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: TEXT },
      '.cm-gutters': { backgroundColor: SURFACE, color: DIM, border: 'none', borderRight: `1px solid ${LINE}` },
      '.cm-activeLine': { backgroundColor: HOVER },
      '.cm-activeLineGutter': { backgroundColor: HOVER, color: TEXT },
      '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: ACCENT_FILL },
      '.cm-placeholder': { color: DIM },
    }, { dark }),
    ...(dark ? [oneDarkTheme, syntaxHighlighting(DARK_TOKENS)] : [syntaxHighlighting(LIGHT_TOKENS)]),
  ];
};

const FONT = {
  '&': { fontSize: '12.5px', borderRadius: '8px', border: `1px solid ${LINE}`, overflow: 'hidden' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', lineHeight: '1.5' },
  '&.cm-focused': { outline: 'none', borderColor: ACCENT },
  // A prompt is prose: a line longer than the box wraps, it does not scroll away.
  '.cm-content': { paddingBottom: '8px' },
};

/**
 * One editor instance. Uncontrolled inside -- CodeMirror owns the document --
 * with the two directions handled separately: typing calls `onChange`, and a
 * `value` that changed for any *other* reason (✨ wrote a new file, a file
 * was reloaded from disk) replaces the document. Comparing against the
 * editor's own text is what stops the second from fighting the first.
 *
 * *tabIndents*: Tab indents, for the editor across the window. In a box in
 * the panel Tab moves on, as from any field there.
 */
export default function CodeSurface({ value, onChange, language, placeholder, height, autoFocus, tabIndents }: {
  value: string;
  onChange: (value: string) => void;
  language: CodeLanguage;
  placeholder?: string;
  height: { min: number; max?: string; fill?: boolean };
  autoFocus?: boolean;
  tabIndents?: boolean;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const changed = useRef(onChange);
  changed.current = onChange;
  const languageSlot = useRef(new Compartment());
  const lookSlot = useRef(new Compartment());
  const look = useLook((state) => state.id);

  useEffect(() => {
    if (!host.current) return undefined;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          // Ctrl+Shift+Z redoes here as in every other field and the header's
          // Redo; CodeMirror's own key for it on Windows is Ctrl+Y alone.
          keymap.of([{ key: 'Mod-Shift-z', run: redo, preventDefault: true }, ...(tabIndents ? [indentWithTab] : [])]),
          languageSlot.current.of(language === 'javascript' ? javascript() : markdown()),
          lookSlot.current.of(lookTheme(look)),
          EditorView.lineWrapping,
          EditorView.theme({
            ...FONT,
            '&': { ...FONT['&'], ...(height.fill ? { height: '100%' } : {}) },
            '.cm-scroller': { ...FONT['.cm-scroller'], minHeight: `${height.min}px`, ...(height.max ? { maxHeight: height.max } : {}) },
          }),
          ...(placeholder ? [placeholderExtension(placeholder)] : []),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) changed.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    if (autoFocus) editor.focus();
    return () => { editor.destroy(); view.current = null; };
    // Built once. Value and language are followed by the effects below; the
    // rest never changes for the life of one field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === value) return;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: lookSlot.current.reconfigure(lookTheme(look)) });
  }, [look]);

  useEffect(() => {
    view.current?.dispatch({
      effects: languageSlot.current.reconfigure(language === 'javascript' ? javascript() : markdown()),
    });
  }, [language]);

  return <div ref={host} style={height.fill ? { height: '100%' } : undefined} />;
}

