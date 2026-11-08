import { marked } from "https://esm.sh/marked@13.0.3?bundle";
import { markedHighlight } from "https://esm.sh/marked-highlight@2.1.4?bundle";
import hljs from "https://esm.sh/highlight.js@11.10.0?bundle";
import DOMPurify from "https://esm.sh/dompurify@3.1.6?bundle";

import { slugify, escapeHtml } from "./utils.js";

let katexMod = null;
let mermaidMod = null;
let mermaidThemeMode = null;

export const LIGHT_PREVIEW_THEMES = new Set(["github-light", "solarized-light", "sepia"]);

async function getKatex() {
  if (!katexMod) katexMod = (await import("https://esm.sh/katex@0.16.9?bundle")).default;
  return katexMod;
}
async function getMermaid(dark) {
  if (!mermaidMod) mermaidMod = (await import("https://esm.sh/mermaid@10.9.1?bundle")).default;
  const mode = dark ? "dark" : "light";
  if (mermaidThemeMode !== mode) {
    mermaidThemeMode = mode;
    // htmlLabels:false forces plain SVG <text> labels instead of HTML-in-
    // foreignObject — the latter reliably renders as empty boxes once the
    // SVG string is serialized and re-inserted via innerHTML like we do here.
    mermaidMod.initialize({
      startOnLoad: false,
      theme: dark ? "dark" : "neutral",
      securityLevel: "strict",
      flowchart: { htmlLabels: false },
      sequence: { useMaxWidth: true },
    });
  }
  return mermaidMod;
}

marked.use({ gfm: true, breaks: false });
marked.use(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      if (lang === "mermaid") return escapeHtml(code);
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language }).value;
    },
  })
);

const MATH_BLOCK = /\$\$([\s\S]+?)\$\$/g;
const MATH_INLINE = /(?<!\$)\$([^\n$]+?)\$(?!\$)/g;
const WIKILINK = /\[\[([^\]|#]+?)(?:#([^\]|]+?))?(?:\|([^\]]+?))?\]\]/g;

function extractMath(text) {
  const store = [];
  const withBlocks = text.replace(MATH_BLOCK, (_, expr) => {
    store.push({ display: true, expr });
    return `\u0000MATH${store.length - 1}\u0000`;
  });
  const withInline = withBlocks.replace(MATH_INLINE, (_, expr) => {
    store.push({ display: false, expr });
    return `\u0000MATH${store.length - 1}\u0000`;
  });
  return { text: withInline, store };
}

function preprocessWikilinks(text) {
  return text.replace(WIKILINK, (_, name, heading, alias) => {
    const label = alias || name;
    const target = heading ? `${name}#${heading}` : name;
    return `[${label}](wikilink:${encodeURIComponent(target)})`;
  });
}

export async function renderMarkdown(text, { vault } = {}) {
  const wikiProcessed = preprocessWikilinks(text);
  const { text: mathProcessed, store } = extractMath(wikiProcessed);

  let html = marked.parse(mathProcessed);

  if (store.length) {
    const katex = await getKatex();
    html = html.replace(/\u0000MATH(\d+)\u0000/g, (_, idx) => {
      const { display, expr } = store[Number(idx)];
      try {
        return katex.renderToString(expr, { displayMode: display, throwOnError: false, output: "html" });
      } catch {
        return escapeHtml(display ? `$$${expr}$$` : `$${expr}$`);
      }
    });
  }

  html = DOMPurify.sanitize(html, {
    ADD_ATTR: ["target"],
    // Default DOMPurify strips any href scheme it doesn't recognize, which
    // silently ate our internal "wikilink:" links before we could resolve
    // them. Extend the allowlist instead of disabling the check entirely.
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|wikilink):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;

  // Mermaid fenced blocks: unwrap <pre><code class="...language-mermaid"> back to plain text
  wrapper.querySelectorAll("pre > code.language-mermaid").forEach((code) => {
    const pre = code.parentElement;
    const text = code.textContent;
    pre.className = "mermaid";
    pre.textContent = text;
  });

  // Heading ids + anchor links (marked no longer auto-generates these)
  const usedSlugs = new Map();
  wrapper.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((h) => {
    let slug = slugify(h.textContent);
    const n = usedSlugs.get(slug) || 0;
    usedSlugs.set(slug, n + 1);
    if (n > 0) slug = `${slug}-${n}`;
    h.id = slug;
    const a = document.createElement("a");
    a.className = "heading-anchor";
    a.href = `#${slug}`;
    a.textContent = "#";
    h.appendChild(a);
  });

  // Task list checkboxes -> styled items
  wrapper.querySelectorAll("li > input[type=checkbox]").forEach((input) => {
    input.disabled = true;
    input.closest("li")?.classList.add("task-item");
  });

  // Wiki-links: resolve against the vault, mark broken, wire click target
  wrapper.querySelectorAll('a[href^="wikilink:"]').forEach((a) => {
    const target = decodeURIComponent(a.getAttribute("href").slice("wikilink:".length));
    const [name] = target.split("#");
    const entry = vault?.findByBaseName?.(name);
    a.classList.add("wikilink");
    a.setAttribute("data-wikilink-target", target);
    a.removeAttribute("href");
    if (!entry) a.classList.add("broken");
  });

  const headings = [...wrapper.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => ({
    depth: Number(h.tagName[1]),
    text: h.textContent.replace(/#$/, "").trim(),
    id: h.id,
  }));

  return { html: wrapper.innerHTML, headings, hasMermaid: !!wrapper.querySelector("pre.mermaid") };
}

export async function renderMermaidBlocks(container, { dark = true } = {}) {
  const nodes = container.querySelectorAll("pre.mermaid:not(.rendered)");
  if (!nodes.length) return;
  const mermaid = await getMermaid(dark);
  let i = 0;
  for (const node of nodes) {
    const src = node.textContent;
    try {
      const { svg } = await mermaid.render(`mmd-${Date.now()}-${i++}`, src);
      node.innerHTML = svg;
      node.classList.add("rendered");
    } catch (e) {
      node.textContent = `Mermaid error: ${e.message || e}`;
      node.classList.add("rendered");
    }
  }
}
