// File System Access API wrapper: open a folder as a "vault", walk its tree,
// read/write/create/rename/delete real files on disk, and keep a lightweight
// index of markdown files + their headings for wiki-link / palette lookups.

import { openDb } from "./db.js";

const STORE = "handles";
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;
const MD_EXT = /\.(md|markdown)$/i;

export async function saveLastHandle(handle) {
  const db = await openDb();
  await new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(handle, "lastVault");
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}

export async function loadLastHandle() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get("lastVault");
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export class Vault {
  constructor(rootHandle) {
    this.root = rootHandle;
    /** @type {Map<string, {handle: FileSystemFileHandle, dirHandle: FileSystemDirectoryHandle, name: string, path: string, headings: {text:string, depth:number, line:number}[]}>} */
    this.files = new Map(); // path -> entry (markdown files only, for linking/search)
    this.images = new Map(); // path -> handle
  }

  static supported() {
    return typeof window.showDirectoryPicker === "function";
  }

  async ensurePermission(mode = "read") {
    if ((await this.root.queryPermission({ mode })) === "granted") return true;
    const res = await this.root.requestPermission({ mode });
    return res === "granted";
  }

  async rebuildIndex() {
    this.files.clear();
    this.images.clear();
    await this._walk(this.root, "");
  }

  async _walk(dirHandle, prefix) {
    for await (const [name, handle] of dirHandle.entries()) {
      if (name.startsWith(".") || name === "node_modules") continue;
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === "directory") {
        await this._walk(handle, path);
      } else if (MD_EXT.test(name)) {
        let headings = [];
        try {
          const file = await handle.getFile();
          const text = await file.text();
          headings = extractHeadings(text);
        } catch { /* unreadable, skip headings */ }
        this.files.set(path, { handle, dirHandle, name, path, headings });
      } else if (IMAGE_EXT.test(name)) {
        this.images.set(path, { handle, dirHandle, name, path });
      }
    }
  }

  async buildTree() {
    return this._buildTreeNode(this.root, "");
  }

  async _buildTreeNode(dirHandle, prefix) {
    const dirs = [];
    const files = [];
    for await (const [name, handle] of dirHandle.entries()) {
      if (name.startsWith(".")) continue;
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === "directory") {
        dirs.push({ kind: "dir", name, path, handle, children: await this._buildTreeNode(handle, path) });
      } else {
        files.push({ kind: "file", name, path, handle });
      }
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return [...dirs, ...files];
  }

  async readFile(path) {
    const entry = this.files.get(path) || (await this._resolve(path));
    const file = await entry.handle.getFile();
    return await file.text();
  }

  async writeFile(path, content) {
    let entry = this.files.get(path);
    if (!entry) entry = await this._resolve(path);
    const writable = await entry.handle.createWritable();
    await writable.write(content);
    await writable.close();
    entry.headings = extractHeadings(content);
    this.files.set(path, entry);
  }

  async _resolve(path) {
    const parts = path.split("/");
    let dir = this.root;
    for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i]);
    const handle = await dir.getFileHandle(parts[parts.length - 1]);
    return { handle, dirHandle: dir, name: parts[parts.length - 1], path, headings: [] };
  }

  async createFile(path, content = "") {
    const parts = path.split("/");
    let dir = this.root;
    for (let i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i], { create: true });
    }
    const handle = await dir.getFileHandle(parts[parts.length - 1], { create: true });
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
    const entry = { handle, dirHandle: dir, name: parts[parts.length - 1], path, headings: extractHeadings(content) };
    if (MD_EXT.test(path)) this.files.set(path, entry);
    return entry;
  }

  async createFolder(path) {
    const parts = path.split("/");
    let dir = this.root;
    for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
    return dir;
  }

  async deletePath(path) {
    const parts = path.split("/");
    let dir = this.root;
    for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i]);
    await dir.removeEntry(parts[parts.length - 1], { recursive: true });
    this.files.delete(path);
    this.images.delete(path);
  }

  async renamePath(oldPath, newName) {
    // File System Access API has no atomic rename; emulate via copy+delete for files.
    const parts = oldPath.split("/");
    parts[parts.length - 1] = newName;
    const newPath = parts.join("/");
    const isMd = MD_EXT.test(oldPath);
    if (isMd || !oldPath.includes(".") === false) {
      const content = await this.readFile(oldPath).catch(() => null);
      if (content !== null) {
        await this.createFile(newPath, content);
        await this.deletePath(oldPath);
        return newPath;
      }
    }
    throw new Error("Rename only supported for readable files right now.");
  }

  // Find (or create) a markdown file matching a wiki-link target name, case-insensitive.
  findByBaseName(name) {
    const target = name.toLowerCase().replace(MD_EXT, "");
    for (const entry of this.files.values()) {
      const base = entry.name.toLowerCase().replace(MD_EXT, "");
      if (base === target) return entry;
    }
    return null;
  }

  async saveImageBlob(blob, suggestedName) {
    const assetsDir = await this.createFolder("assets");
    let name = suggestedName;
    let i = 1;
    while (await exists(assetsDir, name)) {
      const dot = suggestedName.lastIndexOf(".");
      name = dot === -1 ? `${suggestedName}-${i}` : `${suggestedName.slice(0, dot)}-${i}${suggestedName.slice(dot)}`;
      i++;
    }
    const handle = await assetsDir.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    const path = `assets/${name}`;
    this.images.set(path, { handle, dirHandle: assetsDir, name, path });
    return path;
  }
}

async function exists(dirHandle, name) {
  try { await dirHandle.getFileHandle(name); return true; } catch { return false; }
}

// Fallback for browsers without the File System Access API (Firefox, Safari):
// files live in memory only, opened via <input type=file>, and "saving"
// triggers a browser download instead of writing back to disk in place.
export class MemoryVault {
  constructor() {
    this.files = new Map();
    this.images = new Map();
    this.isMemory = true;
  }
  static supported() { return true; }
  async ensurePermission() { return true; }
  async rebuildIndex() {}
  async buildTree() {
    return [...this.files.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((f) => ({ kind: "file", name: f.name, path: f.path }));
  }
  addFile(name, content) {
    const path = name;
    this.files.set(path, { name, path, content, headings: extractHeadings(content) });
    return path;
  }
  async readFile(path) {
    return this.files.get(path)?.content ?? "";
  }
  async writeFile(path, content) {
    const entry = this.files.get(path) || { name: path, path };
    entry.content = content;
    entry.headings = extractHeadings(content);
    this.files.set(path, entry);
  }
  async createFile(path, content = "") {
    this.writeFile(path, content);
    return this.files.get(path);
  }
  async createFolder() { /* no real folders in memory mode */ }
  async deletePath(path) { this.files.delete(path); this.images.delete(path); }
  async renamePath(oldPath, newName) {
    const entry = this.files.get(oldPath);
    if (!entry) throw new Error("Not found");
    this.files.delete(oldPath);
    entry.name = newName;
    entry.path = newName;
    this.files.set(newName, entry);
    return newName;
  }
  findByBaseName(name) {
    const target = name.toLowerCase().replace(MD_EXT, "");
    for (const entry of this.files.values()) {
      if (entry.name.toLowerCase().replace(MD_EXT, "") === target) return entry;
    }
    return null;
  }
  async saveImageBlob(blob) {
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result); // data: URI, embedded directly
      reader.readAsDataURL(blob);
    });
  }
  downloadFile(path, content) {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = path;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

export function extractHeadings(text) {
  const lines = text.split("\n");
  const out = [];
  let inFence = false;
  lines.forEach((line, i) => {
    if (/^```/.test(line.trim())) { inFence = !inFence; return; }
    if (inFence) return;
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (m) out.push({ depth: m[1].length, text: m[2].replace(/#+$/, "").trim(), line: i });
  });
  return out;
}
