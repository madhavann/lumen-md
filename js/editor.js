// NOTE: all @codemirror/* specifiers below deliberately use the same
// "^6.0.0" range esm.sh's build of the "codemirror" meta-package uses
// internally for these exact packages (confirmed by inspecting its bundle).
// Using the same range string makes esm.sh resolve to the identical
// underlying module, which matters a lot here: CodeMirror's Facet/Extension
// identity checks break if two different resolved copies of
// @codemirror/state or @codemirror/view end up loaded side by side.
import { EditorView, basicSetup } from "https://esm.sh/codemirror@6.0.1";
import { EditorState, Compartment } from "https://esm.sh/@codemirror/state@^6.0.0";
import { keymap } from "https://esm.sh/@codemirror/view@^6.0.0";
import { indentWithTab } from "https://esm.sh/@codemirror/commands@^6.0.0";
import { markdown, markdownLanguage } from "https://esm.sh/@codemirror/lang-markdown@^6.0.0";
import { languages } from "https://esm.sh/@codemirror/language-data@^6.0.0";
import { autocompletion } from "https://esm.sh/@codemirror/autocomplete@^6.0.0";

import { buildCompletionSources } from "./intellisense.js";

function wrapSelection(view, before, after = before) {
  const { state } = view;
  const changes = state.changeByRange((range) => {
    const insertBefore = { from: range.from, insert: before };
    const insertAfter = { from: range.to, insert: after };
    return {
      changes: [insertBefore, insertAfter],
      range: range.empty
        ? { anchor: range.from + before.length }
        : { anchor: range.from + before.length, head: range.to + before.length },
    };
  });
  view.dispatch(state.update(changes, { scrollIntoView: true, userEvent: "input" }));
  view.focus();
  return true;
}

function toggleLinePrefix(view, prefix) {
  const { state } = view;
  const changes = [];
  const lines = new Set();
  for (const range of state.selection.ranges) {
    for (let pos = range.from; pos <= range.to; ) {
      const line = state.doc.lineAt(pos);
      if (!lines.has(line.number)) {
        lines.add(line.number);
        if (line.text.startsWith(prefix)) {
          changes.push({ from: line.from, to: line.from + prefix.length, insert: "" });
        } else {
          changes.push({ from: line.from, insert: prefix });
        }
      }
      if (pos === line.to) break;
      pos = line.to + 1;
    }
  }
  view.dispatch(state.update({ changes }, { userEvent: "input" }));
  return true;
}

export function createEditor({ host, initialDoc, themeExtension, getVault, onChange, onCursor }) {
  let currentThemeCompartment = new Compartment();

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged && onChange) onChange(update.state.doc.toString());
    if ((update.docChanged || update.selectionSet) && onCursor) {
      const pos = update.state.selection.main.head;
      const line = update.state.doc.lineAt(pos);
      onCursor({ line: line.number, col: pos - line.from + 1, totalLines: update.state.doc.lines });
    }
  });

  const myKeymap = keymap.of([
    { key: "Mod-b", run: (v) => wrapSelection(v, "**") },
    { key: "Mod-i", run: (v) => wrapSelection(v, "_") },
    { key: "Mod-e", run: (v) => wrapSelection(v, "`") },
    { key: "Mod-k", run: (v) => wrapSelection(v, "[", "](url)") },
    { key: "Mod-Shift-x", run: (v) => wrapSelection(v, "~~") },
    { key: "Mod-Shift-8", run: (v) => toggleLinePrefix(v, "- ") },
    { key: "Mod-Shift-7", run: (v) => toggleLinePrefix(v, "1. ") },
    { key: "Mod-Shift-9", run: (v) => toggleLinePrefix(v, "> ") },
    indentWithTab,
  ]);

  const state = EditorState.create({
    doc: initialDoc,
    extensions: [
      basicSetup,
      markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true }),
      autocompletion({ override: buildCompletionSources(getVault), activateOnTyping: true }),
      myKeymap,
      EditorView.lineWrapping,
      currentThemeCompartment.of(themeExtension),
      updateListener,
    ],
  });

  const view = new EditorView({ state, parent: host });

  return {
    view,
    getDoc: () => view.state.doc.toString(),
    setDoc(text) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    },
    setTheme(ext) {
      view.dispatch({ effects: currentThemeCompartment.reconfigure(ext) });
    },
    setFocusMode(on) {
      host.classList.toggle("focus-mode", on);
    },
    gotoLine(lineNo) {
      const line = view.state.doc.line(Math.min(lineNo, view.state.doc.lines));
      view.dispatch({
        selection: { anchor: line.from },
        effects: EditorView.scrollIntoView(line.from, { y: "center" }),
      });
      view.focus();
    },
    insertText(text) {
      const { from, to } = view.state.selection.main;
      view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
    },
    focus() { view.focus(); },
    destroy() { view.destroy(); },
  };
}
