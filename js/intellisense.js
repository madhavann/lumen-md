// Custom "intellisense" completion sources for the markdown editor:
// slash-commands for structure, [[wiki-links]] to other vault files
// (with #heading drill-down), :emoji: shortcodes, and image path completion
// inside ![]() — none of which a plain CodeMirror markdown mode gives you.

import { EMOJI_MAP, fuzzyScore } from "./utils.js";

const SNIPPETS = [
  { label: "/h1", detail: "Heading 1", apply: "# " },
  { label: "/h2", detail: "Heading 2", apply: "## " },
  { label: "/h3", detail: "Heading 3", apply: "### " },
  { label: "/bullet", detail: "Bullet list", apply: "- " },
  { label: "/numbered", detail: "Numbered list", apply: "1. " },
  { label: "/todo", detail: "Checklist item", apply: "- [ ] " },
  { label: "/quote", detail: "Blockquote", apply: "> " },
  { label: "/hr", detail: "Horizontal rule", apply: "\n---\n" },
  { label: "/code", detail: "Code block", apply: "```\n\n```", cursorOffset: 4 },
  { label: "/table", detail: "Table (3 cols)", apply: "| Col A | Col B | Col C |\n| --- | --- | --- |\n| | | |" },
  { label: "/link", detail: "Link", apply: "[](url)", cursorOffset: 1 },
  { label: "/image", detail: "Image", apply: "![](path)", cursorOffset: 2 },
  { label: "/math", detail: "Math block ($$)", apply: "$$\n\n$$", cursorOffset: 3 },
  { label: "/mermaid", detail: "Mermaid diagram", apply: "```mermaid\ngraph TD\n  A --> B\n```" },
  { label: "/details", detail: "Collapsible details", apply: "<details>\n<summary>Summary</summary>\n\nContent\n\n</details>" },
  { label: "/footnote", detail: "Footnote", apply: "[^1]\n\n[^1]: " },
];

function slashCompletions(context) {
  const word = context.matchBefore(/\/[a-z]*$/i);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return {
    from: word.from,
    options: SNIPPETS.map((s) => ({
      label: s.label,
      detail: s.detail,
      type: "keyword",
      apply(view, completion, from, to) {
        const text = s.apply;
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + (s.cursorOffset ?? text.length) },
        });
      },
    })),
    validFor: /^\/[a-z]*$/i,
  };
}

function emojiCompletions(context) {
  const word = context.matchBefore(/:[a-z0-9_+-]*$/i);
  if (!word || word.from === word.to) return null;
  const query = word.text.slice(1);
  const options = Object.entries(EMOJI_MAP)
    .filter(([k]) => k.includes(query.toLowerCase()))
    .map(([k, v]) => ({ label: `:${k}:`, detail: v, type: "constant", apply: v }));
  if (!options.length) return null;
  return { from: word.from, options, validFor: /^:[a-z0-9_+-]*$/i };
}

function wikiLinkCompletions(context, getVault) {
  const vault = getVault();
  if (!vault) return null;

  // [[File#Heading
  const headingMatch = context.matchBefore(/\[\[([^\]#|]+)#([^\]|]*)$/);
  if (headingMatch) {
    const m = /\[\[([^\]#|]+)#([^\]|]*)$/.exec(headingMatch.text);
    const fileName = m[1];
    const query = m[2];
    const entry = vault.findByBaseName(fileName);
    if (!entry) return null;
    const hashIdx = headingMatch.text.lastIndexOf("#") + headingMatch.from + 1;
    const options = entry.headings
      .map((h) => ({ label: h.text, type: "text", detail: `H${h.depth}` }))
      .filter((o) => fuzzyScore(query, o.label) >= 0);
    return { from: hashIdx, options, validFor: /^[^\]|]*$/ };
  }

  // [[File
  const fileMatch = context.matchBefore(/\[\[([^\]#|]*)$/);
  if (fileMatch) {
    const query = /\[\[([^\]#|]*)$/.exec(fileMatch.text)[1];
    const from = fileMatch.from + 2;
    const options = [...vault.files.values()]
      .map((f) => ({ f, score: fuzzyScore(query, f.name.replace(/\.(md|markdown)$/i, "")) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map(({ f }) => ({
        label: f.name.replace(/\.(md|markdown)$/i, ""),
        detail: f.path,
        type: "class",
        apply(view, completion, from2, to2) {
          view.dispatch({ changes: { from: from2, to: to2, insert: completion.label + "]]" } });
        },
      }));
    return { from, options, validFor: /^[^\]#|]*$/ };
  }
  return null;
}

function imagePathCompletions(context, getVault) {
  const vault = getVault();
  if (!vault) return null;
  const m = context.matchBefore(/!\[[^\]]*\]\(([^)]*)$/);
  if (!m) return null;
  const query = /\(([^)]*)$/.exec(m.text)[1];
  const from = m.from + m.text.lastIndexOf("(") + 1;
  const options = [...vault.images.values()]
    .map((img) => ({ img, score: fuzzyScore(query, img.path) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map(({ img }) => ({ label: img.path, type: "variable" }));
  if (!options.length) return null;
  return { from, options, validFor: /^[^)]*$/ };
}

export function buildCompletionSources(getVault) {
  return [
    slashCompletions,
    emojiCompletions,
    (ctx) => wikiLinkCompletions(ctx, getVault),
    (ctx) => imagePathCompletions(ctx, getVault),
  ];
}
