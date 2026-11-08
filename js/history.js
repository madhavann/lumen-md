// "Time-travel" local version history: every save snapshots the file's full
// text into IndexedDB (capped, deduped), independent of the vault's own
// undo stack, so you can diff against and restore an earlier revision even
// after closing the app.

import { openDb } from "./db.js";

const MAX_SNAPSHOTS_PER_FILE = 60;

export async function addSnapshot(path, content) {
  const db = await openDb();
  const existing = await listSnapshots(path);
  if (existing.length && existing[0].content === content) return; // no-op if unchanged
  await new Promise((resolve, reject) => {
    const tx = db.transaction("history", "readwrite");
    tx.objectStore("history").add({ path, content, ts: Date.now() });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  if (existing.length + 1 > MAX_SNAPSHOTS_PER_FILE) {
    const toTrim = existing.slice(MAX_SNAPSHOTS_PER_FILE - 1);
    const db2 = await openDb();
    const tx2 = db2.transaction("history", "readwrite");
    const store = tx2.objectStore("history");
    toTrim.forEach((s) => store.delete(s.id));
  }
}

export async function listSnapshots(path) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("history", "readonly");
    const idx = tx.objectStore("history").index("byPath");
    const out = [];
    const req = idx.openCursor(path);
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) { out.push(cursor.value); cursor.continue(); }
      else resolve(out.sort((a, b) => b.ts - a.ts));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteSnapshotsForPath(path) {
  const db = await openDb();
  const items = await listSnapshots(path);
  const tx = db.transaction("history", "readwrite");
  const store = tx.objectStore("history");
  items.forEach((s) => store.delete(s.id));
}
