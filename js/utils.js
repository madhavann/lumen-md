// Small shared helpers used across modules.

export function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

export function fuzzyScore(query, target) {
  if (!query) return 1;
  query = query.toLowerCase();
  target = target.toLowerCase();
  if (target.includes(query)) return 100 - target.indexOf(query);
  let qi = 0, score = 0;
  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) { score += 2; qi++; }
  }
  return qi === query.length ? score : -1;
}

export function wordStats(text) {
  const stripped = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/[#>*_~\-\[\]()!`]/g, " ");
  const words = stripped.split(/\s+/).filter(Boolean);
  const chars = text.length;
  const headings = (text.match(/^#{1,6}\s+.+$/gm) || []).length;
  const readingMins = Math.max(1, Math.round(words.length / 220));
  return { words: words.length, chars, headings, readingMins };
}

export function formatTimeAgo(ts) {
  const diff = Date.now() - ts;
  const s = Math.round(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function formatClock(ts) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// Minimal LCS-based line diff -> array of {type: 'same'|'add'|'del', text}
export function lineDiff(oldText, newText) {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: "same", text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: "del", text: a[i] }); i++; }
    else { out.push({ type: "add", text: b[j] }); j++; }
  }
  while (i < n) { out.push({ type: "del", text: a[i] }); i++; }
  while (j < m) { out.push({ type: "add", text: b[j] }); j++; }
  return out;
}

export function toast(msg, kind = "") {
  const host = document.getElementById("toast-host");
  if (!host) return;
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

export const EMOJI_MAP = {
  smile: "😄", laughing: "😆", wink: "😉", heart: "❤️", thumbsup: "👍",
  thumbsdown: "👎", fire: "🔥", rocket: "🚀", tada: "🎉", warning: "⚠️",
  bulb: "💡", bug: "🐛", check: "✅", x: "❌", star: "⭐", eyes: "👀",
  memo: "📝", books: "📚", gear: "⚙️", sparkles: "✨", wave: "👋",
  question: "❓", exclamation: "❗", clock: "🕒", pushpin: "📌", lock: "🔒",
};
