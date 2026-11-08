// Independent color-scheme registries for the editor (CodeMirror) and the
// rendered preview pane. The two are picked separately on purpose.

import * as thememirror from "https://esm.sh/thememirror@2.0.1";
// Reuse the exact same module graph editor.js loads ("codemirror" meta
// package) so EditorView/Facet identities match — importing a separately
// resolved @codemirror/view here would risk a second, incompatible copy.
import { EditorView } from "https://esm.sh/codemirror@6.0.1";

const LS_EDITOR = "lumen.editorTheme";
const LS_PREVIEW = "lumen.previewTheme";

// A couple of hand-rolled extras to complement thememirror's set.
const inkLight = EditorView.theme({
  "&": { backgroundColor: "#fdf6e3", color: "#586e75" },
  ".cm-content": { caretColor: "#cb4b16" },
  ".cm-gutters": { backgroundColor: "#eee8d5", color: "#93a1a1", border: "none" },
  ".cm-activeLine": { backgroundColor: "#eee8d540" },
  ".cm-activeLineGutter": { backgroundColor: "#eee8d5" },
  ".cm-selectionBackground": { backgroundColor: "#eee8d5 !important" },
}, { dark: false });

const slate = EditorView.theme({
  "&": { backgroundColor: "#1b1d23", color: "#e7e9ee" },
  ".cm-content": { caretColor: "#6ea8fe" },
  ".cm-gutters": { backgroundColor: "#1b1d23", color: "#555b6b", border: "none" },
  ".cm-activeLine": { backgroundColor: "#262932" },
  ".cm-activeLineGutter": { backgroundColor: "#262932" },
  ".cm-selectionBackground": { backgroundColor: "#2d313c !important" },
}, { dark: true });

export const EDITOR_THEMES = [
  { id: "slate", label: "Slate (default)", ext: slate, dark: true },
  { id: "dracula", label: "Dracula", ext: thememirror.dracula, dark: true },
  { id: "nord", label: "Nord (Bespin)", ext: thememirror.bespin, dark: true },
  { id: "tomorrow", label: "Tomorrow Night", ext: thememirror.tomorrowNightBlue, dark: true },
  { id: "cobalt", label: "Cobalt", ext: thememirror.cobalt, dark: true },
  { id: "solarizedDark", label: "Solarized Dark", ext: thememirror.solarizedDark, dark: true },
  { id: "amy", label: "Amy", ext: thememirror.amy, dark: true },
  { id: "barf", label: "Barf", ext: thememirror.barf, dark: true },
  { id: "birds", label: "Birds of Paradise", ext: thememirror.birdsOfParadise, dark: true },
  { id: "espresso", label: "Espresso (Light)", ext: thememirror.espresso, dark: false },
  { id: "clouds", label: "Clouds (Light)", ext: thememirror.clouds, dark: false },
  { id: "ink-light", label: "Ink (Solarized Light)", ext: inkLight, dark: false },
  { id: "rosePineDawn", label: "Rosé Pine Dawn (Light)", ext: thememirror.rosePineDawn, dark: false },
  { id: "noctisLilac", label: "Noctis Lilac (Light)", ext: thememirror.noctisLilac, dark: false },
];

export const PREVIEW_THEMES = [
  { id: "github-dark", label: "GitHub Dark" },
  { id: "github-light", label: "GitHub Light" },
  { id: "dracula", label: "Dracula" },
  { id: "nord", label: "Nord" },
  { id: "solarized-dark", label: "Solarized Dark" },
  { id: "solarized-light", label: "Solarized Light" },
  { id: "night-owl", label: "Night Owl" },
  { id: "rose-pine", label: "Rosé Pine" },
  { id: "forest", label: "Forest" },
  { id: "sepia", label: "Sepia (reading)" },
];

export function getSavedEditorTheme() {
  return localStorage.getItem(LS_EDITOR) || "slate";
}
export function getSavedPreviewTheme() {
  return localStorage.getItem(LS_PREVIEW) || "github-dark";
}
export function saveEditorTheme(id) { localStorage.setItem(LS_EDITOR, id); }
export function savePreviewTheme(id) { localStorage.setItem(LS_PREVIEW, id); }

export function findEditorTheme(id) {
  return EDITOR_THEMES.find((t) => t.id === id) || EDITOR_THEMES[0];
}
