import { Vault, MemoryVault, saveLastHandle, loadLastHandle, extractHeadings } from "./fileSystem.js";
import { renderTree } from "./fileTree.js";
import { createEditor } from "./editor.js";
import { renderMarkdown, renderMermaidBlocks, LIGHT_PREVIEW_THEMES } from "./preview.js";
import {
  EDITOR_THEMES, PREVIEW_THEMES, getSavedEditorTheme, getSavedPreviewTheme,
  saveEditorTheme, savePreviewTheme, findEditorTheme,
} from "./themes.js";
import { renderOutline, currentHeadingIndex } from "./outline.js";
import { createCommandPalette } from "./commandPalette.js";
import { addSnapshot, listSnapshots, deleteSnapshotsForPath } from "./history.js";
import { debounce, wordStats, formatTimeAgo, formatClock, lineDiff, toast, escapeHtml } from "./utils.js";

const $ = (id) => document.getElementById(id);

const el = {
  openFolder: $("btn-open-folder"),
  newFile: $("btn-new-file"),
  save: $("btn-save"),
  dirtyDot: $("dirty-indicator"),
  currentPath: $("current-path"),
  viewEdit: $("btn-view-edit"),
  viewSplit: $("btn-view-split"),
  viewPreview: $("btn-view-preview"),
  editorThemeSel: $("select-editor-theme"),
  previewThemeSel: $("select-preview-theme"),
  focus: $("btn-focus"),
  historyBtn: $("btn-history"),
  exportBtn: $("btn-export"),
  paletteBtn: $("btn-palette"),
  reconnect: $("btn-reconnect"),
  fileTree: $("file-tree"),
  panes: $("panes"),
  editorHost: $("editor-host"),
  previewHost: $("preview-host"),
  previewContent: $("preview-content"),
  outlineTree: $("outline-tree"),
  statWords: $("stat-words"),
  statChars: $("stat-chars"),
  statReading: $("stat-reading"),
  statHeadings: $("stat-headings"),
  statAutosave: $("stat-autosave"),
  statSaved: $("stat-saved"),
  statCursor: $("stat-cursor"),
  paletteOverlay: $("palette-overlay"),
  paletteInput: $("palette-input"),
  paletteResults: $("palette-results"),
  historyOverlay: $("history-overlay"),
  historyFileName: $("history-file-name"),
  historyList: $("history-list"),
  historyDiff: $("history-diff"),
  historyClose: $("btn-history-close"),
  promptOverlay: $("prompt-overlay"),
  promptLabel: $("prompt-label"),
  promptInput: $("prompt-input"),
  promptCancel: $("prompt-cancel"),
  promptOk: $("prompt-ok"),
  contextMenu: $("context-menu"),
  resizerLeft: $("resizer-left"),
  resizerRight: $("resizer-right"),
  paneDivider: $("pane-divider"),
  sidebarLeft: $("sidebar-left"),
  sidebarRight: $("sidebar-right"),
  paneEdit: $("pane-edit"),
};

const state = {
  vault: null,
  currentPath: null,
  dirty: false,
  dirtyPaths: new Set(),
  expandedDirs: new Set(),
  autosave: localStorage.getItem("lumen.autosave") === "1",
  focusMode: false,
  lastHeadings: [],
  savedAt: null,
};

// ---------------------------------------------------------------- Themes ---
function populateThemeSelects() {
  for (const t of EDITOR_THEMES) {
    const opt = document.createElement("option");
    opt.value = t.id; opt.textContent = t.label;
    el.editorThemeSel.appendChild(opt);
  }
  for (const t of PREVIEW_THEMES) {
    const opt = document.createElement("option");
    opt.value = t.id; opt.textContent = t.label;
    el.previewThemeSel.appendChild(opt);
  }
  el.editorThemeSel.value = getSavedEditorTheme();
  el.previewThemeSel.value = getSavedPreviewTheme();
}

// ---------------------------------------------------------------- Editor ---
const editor = createEditor({
  host: el.editorHost,
  initialDoc: `# Welcome to Lumen MD\n\nOpen a vault folder (📂 Open Vault) to browse, edit and save real Markdown files on your computer.\n\n- Type \`/\` for block snippets (heading, table, mermaid, math…)\n- Type \`[[\` to link to another note in your vault\n- Type \`:\` for an emoji\n- Try the command palette with **Ctrl+K**\n\n\`\`\`mermaid\ngraph TD\n  A[Write] --> B[Preview]\n  B --> C[Save]\n\`\`\`\n`,
  themeExtension: findEditorTheme(getSavedEditorTheme()).ext,
  getVault: () => state.vault,
  onChange: handleDocChanged,
  onCursor: handleCursor,
});

const scheduleRender = debounce(() => renderPreview(editor.getDoc()), 180);
const scheduleHeadingsIndex = debounce(() => {
  if (state.vault && state.currentPath && !state.vault.isMemory) {
    const entry = state.vault.files.get(state.currentPath);
    if (entry) entry.headings = extractHeadings(editor.getDoc());
  }
}, 400);

function handleDocChanged(text) {
  markDirty(true);
  scheduleRender();
  scheduleHeadingsIndex();
  updateStats(text);
  if (state.autosave) scheduleAutosave();
}

const scheduleAutosave = debounce(() => saveCurrentFile(true), 1200);

function handleCursor({ line, col }) {
  el.statCursor.textContent = `Ln ${line}, Col ${col}`;
  const idx = currentHeadingIndex(state.lastHeadings, line - 1);
  renderOutline(el.outlineTree, state.lastHeadings, { onJump, currentIndex: idx });
}

function onJump(heading, index) {
  editor.gotoLine(heading.line + 1);
  const target = el.previewContent.querySelectorAll("h1,h2,h3,h4,h5,h6")[index];
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// --------------------------------------------------------------- Preview ---
async function renderPreview(text) {
  const { html, headings } = await renderMarkdown(text, { vault: state.vault });
  el.previewContent.innerHTML = html;
  state.lastHeadings = extractHeadings(text);
  renderOutline(el.outlineTree, state.lastHeadings, { onJump });
  const dark = !LIGHT_PREVIEW_THEMES.has(el.previewHost.dataset.previewTheme);
  await renderMermaidBlocks(el.previewContent, { dark });
}

el.previewContent.addEventListener("click", async (e) => {
  const a = e.target.closest("a.wikilink");
  if (!a) {
    const anchor = e.target.closest("a.heading-anchor");
    return;
  }
  e.preventDefault();
  const target = a.getAttribute("data-wikilink-target");
  const [name, heading] = target.split("#");
  await openWikiTarget(name, heading);
});

async function openWikiTarget(name, heading) {
  if (!state.vault) { toast("Open a vault first.", "err"); return; }
  let entry = state.vault.findByBaseName(name);
  if (!entry) {
    const ok = await promptConfirmCreate(name);
    if (!ok) return;
    const path = /\.(md|markdown)$/i.test(name) ? name : `${name}.md`;
    await state.vault.createFile(path, `# ${name}\n\n`);
    await refreshTree();
    entry = state.vault.files.get(path);
  }
  await openFile(entry.path);
  if (heading) {
    const idx = (entry.headings || []).findIndex((h) => h.text.toLowerCase() === heading.toLowerCase());
    if (idx >= 0) onJump(entry.headings[idx], idx);
  }
}

function promptConfirmCreate(name) {
  return new Promise((resolve) => resolve(window.confirm(`"${name}" doesn't exist yet. Create it?`)));
}

// --------------------------------------------------------- Stats / dirty ---
function updateStats(text) {
  const s = wordStats(text);
  el.statWords.textContent = `${s.words} words`;
  el.statChars.textContent = `${s.chars} chars`;
  el.statReading.textContent = `${s.readingMins} min read`;
  el.statHeadings.textContent = `${s.headings} headings`;
}

function markDirty(on) {
  state.dirty = on;
  el.dirtyDot.hidden = !on;
  el.save.disabled = !on || !state.currentPath;
  if (state.currentPath) {
    if (on) state.dirtyPaths.add(state.currentPath); else state.dirtyPaths.delete(state.currentPath);
  }
  refreshTreeDirtyMarks();
}

function refreshTreeDirtyMarks() {
  el.fileTree.querySelectorAll(".tree-row").forEach((row) => {
    const mark = row.querySelector(".dirty-mark");
    if (!mark) return;
    mark.style.display = state.dirtyPaths.has(row.dataset.path) ? "" : "none";
  });
}

// ------------------------------------------------------------- Vault I/O ---
async function openVaultPicker() {
  if (!Vault.supported()) {
    openMemoryFilePicker();
    return;
  }
  try {
    const handle = await window.showDirectoryPicker();
    await loadVaultFromHandle(handle);
    await saveLastHandle(handle);
  } catch (e) {
    if (e.name !== "AbortError") toast(`Could not open folder: ${e.message}`, "err");
  }
}

async function loadVaultFromHandle(handle) {
  const vault = new Vault(handle);
  const granted = await vault.ensurePermission("readwrite");
  if (!granted) { toast("Permission to the folder was denied.", "err"); return; }
  await vault.rebuildIndex();
  state.vault = vault;
  state.currentPath = null;
  state.dirtyPaths.clear();
  el.currentPath.textContent = handle.name + " (vault)";
  await refreshTree();
  toast(`Opened "${handle.name}"`, "ok");
}

function openMemoryFilePicker() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".md,.markdown,.txt";
  input.multiple = true;
  input.addEventListener("change", async () => {
    const vault = state.vault instanceof MemoryVault ? state.vault : new MemoryVault();
    for (const file of input.files) {
      const text = await file.text();
      vault.addFile(file.name, text);
    }
    state.vault = vault;
    el.currentPath.textContent = "In-memory files (this browser lacks folder access — saving downloads a copy)";
    await refreshTree();
    toast("Loaded files in memory mode.", "ok");
  });
  input.click();
}

async function refreshTree() {
  if (!state.vault) return;
  const tree = await state.vault.buildTree();
  renderTreeUI(tree);
}

function renderTreeUI(tree) {
  renderTree(el.fileTree, tree, {
    activePath: state.currentPath,
    expanded: state.expandedDirs,
    dirtyPaths: state.dirtyPaths,
    onOpenFile: openFile,
    onToggleDir: (path) => {
      state.expandedDirs.has(path) ? state.expandedDirs.delete(path) : state.expandedDirs.add(path);
      refreshTree();
    },
    onContext: openContextMenu,
  });
}

async function openFile(path) {
  if (state.dirty && state.currentPath && state.currentPath !== path) {
    const proceed = window.confirm("You have unsaved changes. Discard them and open the new file?");
    if (!proceed) return;
  }
  try {
    const text = await state.vault.readFile(path);
    state.currentPath = path;
    editor.setDoc(text);
    markDirty(false);
    el.currentPath.textContent = path;
    el.save.disabled = true;
    updateStats(text);
    await renderPreview(text);
    refreshTree();
  } catch (e) {
    toast(`Could not open "${path}": ${e.message}`, "err");
  }
}

async function saveCurrentFile(silent = false) {
  if (!state.vault || !state.currentPath) {
    if (!silent) toast("No file open to save.", "err");
    return;
  }
  const text = editor.getDoc();
  try {
    if (state.vault.isMemory) {
      await state.vault.writeFile(state.currentPath, text);
      state.vault.downloadFile(state.currentPath, text);
    } else {
      await state.vault.writeFile(state.currentPath, text);
    }
    await addSnapshot(state.currentPath, text);
    markDirty(false);
    state.savedAt = Date.now();
    el.statSaved.textContent = `saved ${formatTimeAgo(state.savedAt)}`;
    if (!silent) toast("Saved.", "ok");
    refreshTree();
  } catch (e) {
    toast(`Save failed: ${e.message}`, "err");
  }
}

setInterval(() => {
  if (state.savedAt) el.statSaved.textContent = `saved ${formatTimeAgo(state.savedAt)}`;
}, 15000);

async function createNewFile() {
  if (!state.vault) { toast("Open a vault first.", "err"); return; }
  const name = await promptText("New file name", "untitled.md");
  if (!name) return;
  const path = /\.(md|markdown)$/i.test(name) ? name : `${name}.md`;
  try {
    await state.vault.createFile(path, `# ${path.replace(/\.(md|markdown)$/i, "")}\n\n`);
    await refreshTree();
    await openFile(path);
  } catch (e) {
    toast(`Could not create file: ${e.message}`, "err");
  }
}

// -------------------------------------------------------- Context menu  ---
function openContextMenu(node, x, y) {
  const items = [];
  if (node.kind === "dir") {
    items.push({ label: "New file here", action: () => createFileIn(node.path) });
    items.push({ label: "New folder here", action: () => createFolderIn(node.path) });
  }
  items.push({ label: "Rename", action: () => renameNode(node) });
  items.push({ label: "Delete", danger: true, action: () => deleteNode(node) });

  el.contextMenu.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item.label;
    if (item.danger) li.classList.add("danger");
    li.addEventListener("click", () => { closeContextMenu(); item.action(); });
    el.contextMenu.appendChild(li);
  }
  el.contextMenu.style.left = `${x}px`;
  el.contextMenu.style.top = `${y}px`;
  el.contextMenu.hidden = false;
}
function closeContextMenu() { el.contextMenu.hidden = true; }
document.addEventListener("click", (e) => { if (!el.contextMenu.contains(e.target)) closeContextMenu(); });
document.addEventListener("scroll", closeContextMenu, true);

async function createFileIn(dirPath) {
  const name = await promptText("New file name", "untitled.md");
  if (!name) return;
  const fname = /\.(md|markdown)$/i.test(name) ? name : `${name}.md`;
  const path = `${dirPath}/${fname}`;
  await state.vault.createFile(path, `# ${fname.replace(/\.(md|markdown)$/i, "")}\n\n`);
  await refreshTree();
  await openFile(path);
}
async function createFolderIn(dirPath) {
  const name = await promptText("New folder name", "folder");
  if (!name) return;
  await state.vault.createFolder(`${dirPath}/${name}`);
  state.expandedDirs.add(dirPath);
  await refreshTree();
}
async function renameNode(node) {
  const name = await promptText("Rename to", node.name);
  if (!name || name === node.name) return;
  try {
    const newPath = await state.vault.renamePath(node.path, name);
    if (state.currentPath === node.path) state.currentPath = newPath;
    await refreshTree();
  } catch (e) {
    toast(`Rename failed: ${e.message}`, "err");
  }
}
async function deleteNode(node) {
  if (!window.confirm(`Delete "${node.name}"? This moves it to the folder's trash via your OS if undo isn't possible.`)) return;
  try {
    await state.vault.deletePath(node.path);
    await deleteSnapshotsForPath(node.path);
    if (state.currentPath === node.path) {
      state.currentPath = null;
      editor.setDoc("");
      el.currentPath.textContent = "No file open";
    }
    await refreshTree();
  } catch (e) {
    toast(`Delete failed: ${e.message}`, "err");
  }
}

// --------------------------------------------------------- Prompt modal ---
function promptText(label, defaultValue = "") {
  return new Promise((resolve) => {
    el.promptLabel.textContent = label;
    el.promptInput.value = defaultValue;
    el.promptOverlay.hidden = false;
    setTimeout(() => { el.promptInput.focus(); el.promptInput.select(); }, 0);

    function cleanup(result) {
      el.promptOverlay.hidden = true;
      el.promptOk.removeEventListener("click", onOk);
      el.promptCancel.removeEventListener("click", onCancel);
      el.promptInput.removeEventListener("keydown", onKey);
      resolve(result);
    }
    function onOk() { cleanup(el.promptInput.value.trim() || null); }
    function onCancel() { cleanup(null); }
    function onKey(e) {
      if (e.key === "Enter") onOk();
      if (e.key === "Escape") onCancel();
    }
    el.promptOk.addEventListener("click", onOk);
    el.promptCancel.addEventListener("click", onCancel);
    el.promptInput.addEventListener("keydown", onKey);
  });
}

// ----------------------------------------------------------- View modes ---
function setViewMode(mode) {
  el.panes.dataset.view = mode;
  [el.viewEdit, el.viewSplit, el.viewPreview].forEach((b) => b.classList.remove("active"));
  ({ edit: el.viewEdit, split: el.viewSplit, preview: el.viewPreview }[mode]).classList.add("active");
  localStorage.setItem("lumen.viewMode", mode);
}

// -------------------------------------------------------------- Themes  ---
el.editorThemeSel.addEventListener("change", () => {
  const t = findEditorTheme(el.editorThemeSel.value);
  editor.setTheme(t.ext);
  saveEditorTheme(t.id);
});
el.previewThemeSel.addEventListener("change", () => {
  el.previewHost.dataset.previewTheme = el.previewThemeSel.value;
  savePreviewTheme(el.previewThemeSel.value);
  renderPreview(editor.getDoc()); // re-render so any mermaid diagrams pick up the new palette
});

// --------------------------------------------------------- Focus mode  ---
el.focus.addEventListener("click", () => {
  state.focusMode = !state.focusMode;
  editor.setFocusMode(state.focusMode);
  el.focus.classList.toggle("active", state.focusMode);
});

// ------------------------------------------------------------- Export  ---
async function exportHtml() {
  const text = editor.getDoc();
  const { html } = await renderMarkdown(text, { vault: state.vault });
  const theme = el.previewHost.dataset.previewTheme;
  const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(state.currentPath || "Export")}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<style>body{margin:0}</style>
<style>${await fetch("css/preview-themes.css").then((r) => r.text()).catch(() => "")}</style>
</head><body><div class="preview-host" data-preview-theme="${theme}"><div class="preview markdown-body">${html}</div></div></body></html>`;
  const blob = new Blob([doc], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (state.currentPath || "export").replace(/\.(md|markdown)$/i, "") + ".html";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

el.exportBtn.addEventListener("click", async () => {
  const choice = window.confirm("Export as standalone HTML? (Cancel = Print / Save as PDF instead)");
  if (choice) await exportHtml();
  else window.print();
});

// ------------------------------------------------------- Command palette --
const palette = createCommandPalette({
  overlay: el.paletteOverlay,
  input: el.paletteInput,
  resultsEl: el.paletteResults,
  getItems: buildPaletteItems,
});

function buildPaletteItems() {
  const items = [];
  if (state.vault) {
    for (const f of state.vault.files.values()) {
      items.push({ label: f.name, hint: f.path, kind: "file", run: () => openFile(f.path) });
    }
  }
  items.push(
    { label: "Open Vault…", kind: "cmd", run: openVaultPicker },
    { label: "New File", kind: "cmd", run: createNewFile },
    { label: "Save", kind: "cmd", run: () => saveCurrentFile() },
    { label: "Toggle Focus Mode", kind: "cmd", run: () => el.focus.click() },
    { label: "Toggle Autosave", kind: "cmd", run: toggleAutosave },
    { label: "View: Edit only", kind: "cmd", run: () => setViewMode("edit") },
    { label: "View: Split", kind: "cmd", run: () => setViewMode("split") },
    { label: "View: Preview only", kind: "cmd", run: () => setViewMode("preview") },
    { label: "Export: Standalone HTML", kind: "cmd", run: exportHtml },
    { label: "Export: Print / Save as PDF", kind: "cmd", run: () => window.print() },
    { label: "Insert: Table", kind: "snippet", run: () => editor.insertText("| Col A | Col B | Col C |\n| --- | --- | --- |\n| | | |") },
    { label: "Insert: Mermaid diagram", kind: "snippet", run: () => editor.insertText("```mermaid\ngraph TD\n  A --> B\n```") },
    { label: "Insert: Math block", kind: "snippet", run: () => editor.insertText("$$\n\n$$") },
    { label: "Open Version History", kind: "cmd", run: openHistoryPanel },
  );
  for (const t of EDITOR_THEMES) {
    items.push({ label: `Editor theme: ${t.label}`, kind: "theme", run: () => { el.editorThemeSel.value = t.id; el.editorThemeSel.dispatchEvent(new Event("change")); } });
  }
  for (const t of PREVIEW_THEMES) {
    items.push({ label: `Preview theme: ${t.label}`, kind: "theme", run: () => { el.previewThemeSel.value = t.id; el.previewThemeSel.dispatchEvent(new Event("change")); } });
  }
  return items;
}

el.paletteBtn.addEventListener("click", () => palette.open());

function toggleAutosave() {
  state.autosave = !state.autosave;
  localStorage.setItem("lumen.autosave", state.autosave ? "1" : "0");
  el.statAutosave.textContent = `autosave: ${state.autosave ? "on" : "off"}`;
  toast(`Autosave ${state.autosave ? "enabled" : "disabled"}.`);
}
el.statAutosave.style.cursor = "pointer";
el.statAutosave.title = "Click to toggle autosave";
el.statAutosave.addEventListener("click", toggleAutosave);

// --------------------------------------------------------------- History --
async function openHistoryPanel() {
  if (!state.currentPath) { toast("Open a file first.", "err"); return; }
  el.historyFileName.textContent = state.currentPath;
  const snaps = await listSnapshots(state.currentPath);
  el.historyList.innerHTML = "";
  el.historyDiff.innerHTML = '<p class="empty-hint">Select a snapshot to see what changed.</p>';
  if (!snaps.length) {
    el.historyList.innerHTML = '<p class="empty-hint">No saved snapshots yet. Save the file to start building history.</p>';
  }
  snaps.forEach((snap, i) => {
    const li = document.createElement("li");
    li.textContent = `${formatClock(snap.ts)}${i === 0 ? " (latest)" : ""}`;
    li.addEventListener("click", () => {
      [...el.historyList.children].forEach((c) => c.classList.remove("selected"));
      li.classList.add("selected");
      showDiff(snap);
    });
    el.historyList.appendChild(li);
  });
  el.historyOverlay.hidden = false;
}

function showDiff(snap) {
  const current = editor.getDoc();
  const diff = lineDiff(snap.content, current);
  el.historyDiff.innerHTML = "";
  const restoreBtn = document.createElement("button");
  restoreBtn.className = "btn primary";
  restoreBtn.textContent = "Restore this version into editor";
  restoreBtn.style.marginBottom = "10px";
  restoreBtn.addEventListener("click", () => {
    editor.setDoc(snap.content);
    markDirty(true);
    el.historyOverlay.hidden = true;
    toast("Restored into editor — Save to write it to disk.", "ok");
  });
  el.historyDiff.appendChild(restoreBtn);
  const pre = document.createElement("div");
  diff.forEach((d) => {
    const line = document.createElement("div");
    line.className = "diff-line " + (d.type === "add" ? "diff-add" : d.type === "del" ? "diff-del" : "");
    line.textContent = (d.type === "add" ? "+ " : d.type === "del" ? "- " : "  ") + d.text;
    pre.appendChild(line);
  });
  el.historyDiff.appendChild(pre);
}

el.historyBtn.addEventListener("click", openHistoryPanel);
el.historyClose.addEventListener("click", () => (el.historyOverlay.hidden = true));
el.historyOverlay.addEventListener("mousedown", (e) => { if (e.target === el.historyOverlay) el.historyOverlay.hidden = true; });

// -------------------------------------------------------- Image paste  ---
async function handleImageFiles(files) {
  if (!state.vault) { toast("Open a vault first to attach images.", "err"); return; }
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const name = file.name || `pasted-${Date.now()}.png`;
    if (state.vault.isMemory) {
      const dataUrl = await state.vault.saveImageBlob(file);
      editor.insertText(`![${name}](${dataUrl})`);
    } else {
      const path = await state.vault.saveImageBlob(file, name);
      editor.insertText(`![${name}](${path})`);
      refreshTree();
    }
  }
}
el.editorHost.addEventListener("paste", (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) { e.preventDefault(); handleImageFiles(files); }
});
el.editorHost.addEventListener("dragover", (e) => e.preventDefault());
el.editorHost.addEventListener("drop", (e) => {
  const files = [...(e.dataTransfer?.files || [])];
  if (files.length) { e.preventDefault(); handleImageFiles(files); }
});

// -------------------------------------------------------------- Resizers --
function makeResizer(handleEl, targetEl, side) {
  handleEl.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = targetEl.getBoundingClientRect().width;
    function onMove(ev) {
      const delta = side === "left" ? ev.clientX - startX : startX - ev.clientX;
      targetEl.style.width = `${Math.max(160, startWidth + delta)}px`;
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}
makeResizer(el.resizerLeft, el.sidebarLeft, "left");
makeResizer(el.resizerRight, el.sidebarRight, "right");

el.paneDivider.addEventListener("mousedown", (e) => {
  e.preventDefault();
  function onMove(ev) {
    const rect = el.panes.getBoundingClientRect();
    const pct = Math.min(85, Math.max(15, ((ev.clientX - rect.left) / rect.width) * 100));
    el.paneEdit.style.flex = `0 0 ${pct}%`;
  }
  function onUp() {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  }
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
});

// --------------------------------------------------------- Scroll sync  ---
let syncingScroll = false;
editor.view.scrollDOM.addEventListener("scroll", debounce(() => {
  if (syncingScroll) return;
  syncingScroll = true;
  const src = editor.view.scrollDOM;
  const ratio = src.scrollTop / Math.max(1, src.scrollHeight - src.clientHeight);
  el.previewHost.scrollTop = ratio * (el.previewHost.scrollHeight - el.previewHost.clientHeight);
  requestAnimationFrame(() => (syncingScroll = false));
}, 30));

// ------------------------------------------------------------ Shortcuts  --
document.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); saveCurrentFile(); }
  else if (mod && e.key.toLowerCase() === "n") { e.preventDefault(); createNewFile(); }
  else if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); palette.open(); }
  else if (mod && e.key.toLowerCase() === "h") { e.preventDefault(); openHistoryPanel(); }
  else if (mod && e.shiftKey && e.key.toLowerCase() === "f") { e.preventDefault(); el.focus.click(); }
});

window.addEventListener("beforeunload", (e) => {
  if (state.dirty) { e.preventDefault(); e.returnValue = ""; }
});

// ----------------------------------------------------------- Toolbar btns -
el.openFolder.addEventListener("click", openVaultPicker);
el.newFile.addEventListener("click", createNewFile);
el.save.addEventListener("click", () => saveCurrentFile());
el.viewEdit.addEventListener("click", () => setViewMode("edit"));
el.viewSplit.addEventListener("click", () => setViewMode("split"));
el.viewPreview.addEventListener("click", () => setViewMode("preview"));

el.reconnect.addEventListener("click", async () => {
  const handle = await loadLastHandle();
  if (!handle) { toast("No previous vault remembered yet.", "err"); return; }
  await loadVaultFromHandle(handle);
});

// -------------------------------------------------------------------- Init
(function init() {
  populateThemeSelects();
  el.previewHost.dataset.previewTheme = getSavedPreviewTheme();
  el.statAutosave.textContent = `autosave: ${state.autosave ? "on" : "off"}`;
  setViewMode(localStorage.getItem("lumen.viewMode") || "split");
  updateStats(editor.getDoc());
  renderPreview(editor.getDoc());
  if (!Vault.supported()) {
    toast("This browser has no folder access API — open individual files; saving will download a copy. Use Chrome or Edge for full vault editing.", "");
  }
})();
