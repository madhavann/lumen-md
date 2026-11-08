# Lumen MD

A zero-install, browser-based Markdown editor with a real file explorer, a
CodeMirror-powered editing experience with markdown-flavored intellisense,
live preview (Mermaid diagrams + KaTeX math included), independent color
themes for editing and previewing, and a few features you don't normally get
in a plain editor — local version history, a command palette, and
resolving/clickable `[[wiki-links]]`.

There is **no build step and no server required**. The app is plain
HTML/CSS/JS; its libraries (CodeMirror, marked, KaTeX, Mermaid, DOMPurify,
highlight.js) load at runtime from a CDN. You just open `index.html` in a
browser.

## Installation

1. **Clone the repo:**

   ```bash
   git clone https://github.com/madhavann/lumen-md.git
   cd lumen-md
   ```

2. **Open `index.html` in Chrome or Edge** — double-click it, or drag it
   into the browser window. That's the whole install.

   Chrome/Edge (any recent Chromium-based browser) is required for full
   functionality, because the file explorer is built on the real
   **[File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)**
   — it reads and writes your actual files on disk, in place. Firefox and
   Safari don't yet implement that API; the app still loads there, but
   "Open Vault" falls back to picking individual files into memory, and
   "Save" downloads a copy instead of writing back to disk.

3. **An internet connection is needed the first time** (and whenever your
   browser hasn't cached the CDN libraries) — everything else runs fully
   client-side after that; no account, server, or API key involved.

### Optional: running it behind a local server

Not required, but if you'd rather avoid `file://` quirks in your browser (or
want to open it on a phone/another device on your network), any static file
server works, for example:

```bash
# Python 3
python -m http.server 8080

# Node (no install needed)
npx serve .
```

Then visit `http://localhost:8080` (or whatever port/URL the server prints).

## Features

- **Real file explorer** — open a folder as a "vault"; browse, create,
  rename, and delete files/folders, all backed by the actual filesystem.
- **CodeMirror 6 editor** with Markdown syntax highlighting, line wrapping,
  and formatting shortcuts (bold/italic/code/link, list/quote toggles).
- **Markdown-flavored intellisense:**
  - `/` slash commands for structural snippets (heading, table, mermaid
    diagram, math block, footnote, collapsible details, …)
  - `[[` wiki-link autocomplete across every `.md` file in your vault, with
    `[[File#Heading` drilling into that file's own headings
  - `:` emoji shortcodes
  - `![alt](` image-path completion against every image file in the vault
- **Independent color schemes for editor and preview** — pick each
  separately (14 editor themes, 10 preview themes: GitHub, Dracula, Nord,
  Solarized, Night Owl, Rosé Pine, Sepia, …), persisted across sessions.
- **Wiki-links that resolve and navigate** — click a `[[Note]]` in the
  preview to jump to it, or create it on the spot if it doesn't exist yet.
- **Live outline / table of contents** that tracks your cursor position and
  lets you jump by heading.
- **Local time-travel version history** — every save is snapshotted into
  IndexedDB (independent of normal undo), with a diff view and one-click
  restore, even across browser restarts.
- **Focus / typewriter mode** — dims everything but the current line.
- **Command palette** (`Ctrl+K`) — fuzzy search across every file in the
  vault plus every command/theme/snippet in the app.
- **Math** (`$…$` / `$$…$$` via KaTeX) and **Mermaid diagrams** (fenced
  ` ```mermaid ` blocks), both rendered live in the preview.
- **Paste or drop an image** straight into the editor — it's saved into an
  `assets/` folder next to your notes and linked automatically.
- **Export** to a standalone themed HTML file, or straight to PDF via the
  browser's print dialog.
- Word count, character count, reading time, and autosave (toggle it by
  clicking the status bar).

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+S` | Save |
| `Ctrl+N` | New file |
| `Ctrl+K` | Command palette |
| `Ctrl+H` | Version history |
| `Ctrl+Shift+F` | Focus mode |
| `Ctrl+B` / `I` / `E` | Bold / Italic / Inline code |
| `Ctrl+K` (with a selection) | Wrap selection as a link |
| `Ctrl+Shift+8` / `7` / `9` | Toggle bullet / numbered / quote on selected lines |

## Project structure

```
index.html                 App shell / layout
css/
  app.css                  UI chrome, layout, editor host, modals
  preview-themes.css       The 10 preview color schemes
js/
  main.js                  Wires everything together (the orchestrator)
  editor.js                CodeMirror 6 setup, keymaps, theming hooks
  intellisense.js          Custom completion sources (/, [[, :, image paths)
  preview.js                Markdown → sanitized HTML (marked, KaTeX, Mermaid)
  fileSystem.js             File System Access API vault + in-memory fallback
  fileTree.js                File explorer rendering
  themes.js                 Editor/preview theme registries + persistence
  outline.js                 Table-of-contents panel
  commandPalette.js          Ctrl+K fuzzy palette
  history.js                 Local version-history snapshots (IndexedDB)
  db.js                      Shared IndexedDB connection
  utils.js                    Small shared helpers
```

## Notes

- Everything runs client-side; your notes never leave your machine unless
  you explicitly export/share them.
- Your vault folder's handle is remembered (IndexedDB) so you can reconnect
  next time (the ↺ button) without re-picking the folder — your browser
  will still ask you to reconfirm permission for safety.
